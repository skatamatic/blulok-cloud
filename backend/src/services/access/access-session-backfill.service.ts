/**
 * Correlate historical activity_logs into access_sessions (last N days).
 * Used by CLI script and DEV_ADMIN Developer Tools UI.
 *
 * Production guarantees:
 * - Single-flight via MySQL GET_LOCK (non-blocking; skipped for dry-run)
 * - Per-session DB transactions (insert/update + activity links atomic)
 * - Unique remote_command_id races → attach to existing instead of failing
 * - Never downgrade live pending/open from grant-only historical rows
 * - Dry-run lock accounting mirrors real host-attach / synthesize paths
 * - Per-item errors are logged and skipped; FK orphans null facility/unit and retry
 * - HTTP-safe time/row budgets with resumable cursor (Cloud Run won't kill mid-response)
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import {
  BACKFILL_ADVISORY_LOCK_KEY,
  BACKFILL_ADVISORY_LOCK_TIMEOUT_SEC,
  BACKFILL_CHUNK_MAX_ROWS,
  BACKFILL_LOAD_BATCH_SIZE,
  BACKFILL_PROGRESS_LOG_EVERY,
  asDate,
  clampBackfillDays,
  computeOpenDurationSec,
  cursorFromActivity,
  findLockInWindowIndexed,
  indexLocksByDevice,
  isDuplicateKeyError,
  isForeignKeyError,
  parseActivityMeta,
  parseBackfillCursor,
  pickBestHostSession,
  remoteCommandIdFromMeta,
  resolveRemoteBackfillState,
  shouldAdvanceExistingSession,
  type AccessSessionBackfillCursor,
  type HostSessionLike,
} from './access-session-backfill.utils';

export type { AccessSessionBackfillCursor };

export type AccessSessionBackfillOptions = {
  days?: number;
  dryRun?: boolean;
  /** Skip advisory lock (tests / dry-run). */
  skipAdvisoryLock?: boolean;
  /** Wall-clock budget for this invocation; omit for unlimited (CLI). */
  maxRuntimeMs?: number;
  /** Resume after a previous chunk. */
  cursor?: AccessSessionBackfillCursor | null;
};

export type AccessSessionBackfillResult = {
  days: number;
  dryRun: boolean;
  unlinkedActivityRows: number;
  sessionsCreated: number;
  sessionsUpdated: number;
  activityLinks: number;
  locksAttached: number;
  locksSynthesized: number;
  skippedNoDevice: number;
  skippedErrors: number;
  skippedBusy: boolean;
  /** False when more unlinked rows remain (caller should continue with cursor). */
  done: boolean;
  cursor: AccessSessionBackfillCursor | null;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  facility_id: string | null;
  unit_id: string | null;
  device_id: string | null;
  actor_type: string | null;
  actor_id: string | null;
  actor_name: string | null;
  result: string;
  result_message: string | null;
  occurred_at: Date;
  metadata: unknown;
  access_session_id: string | null;
};

type KnexLike = {
  (table: string): any;
  transaction: <T>(fn: (trx: any) => Promise<T>) => Promise<T>;
  raw: (sql: string, bindings?: unknown[]) => Promise<unknown>;
};

type VirtualSession = HostSessionLike & {
  remote_command_id?: string | null;
  opened_at?: Date | null;
  closed_at?: Date | null;
  open_duration_sec?: number | null;
  settled_at?: Date | string | null;
};

type ProcessContext = {
  knex: KnexLike;
  dryRun: boolean;
  claimed: Set<string>;
  virtualSessions: VirtualSession[];
  hostsByDevice: Map<string, VirtualSession[]>;
  dbHostCache: Map<string, VirtualSession | null>;
  remoteSessionCache: Map<string, VirtualSession | null>;
  locksByDevice: Map<string, ActivityRow[]>;
  deadlineMs: number | null;
  startedAtMs: number;
  unitsProcessed: number;
};

export class AccessSessionBackfillService {
  private static instance: AccessSessionBackfillService;
  private readonly db = DatabaseService.getInstance();

  public static getInstance(): AccessSessionBackfillService {
    if (!AccessSessionBackfillService.instance) {
      AccessSessionBackfillService.instance = new AccessSessionBackfillService();
    }
    return AccessSessionBackfillService.instance;
  }

  /** Test helper — clear singleton between suites. */
  public static resetInstanceForTests(): void {
    AccessSessionBackfillService.instance = undefined as unknown as AccessSessionBackfillService;
  }

  public async run(options: AccessSessionBackfillOptions = {}): Promise<AccessSessionBackfillResult> {
    const days = clampBackfillDays(options.days);
    const dryRun = Boolean(options.dryRun);
    const knex = this.db.connection as KnexLike;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const parsedCursor = parseBackfillCursor(options.cursor ?? null);
    // Dry-run is read-only accounting — never hold the write lock.
    const useAdvisoryLock = !dryRun && !options.skipAdvisoryLock;

    const empty = (extra: Partial<AccessSessionBackfillResult> = {}): AccessSessionBackfillResult => ({
      days,
      dryRun,
      unlinkedActivityRows: 0,
      sessionsCreated: 0,
      sessionsUpdated: 0,
      activityLinks: 0,
      locksAttached: 0,
      locksSynthesized: 0,
      skippedNoDevice: 0,
      skippedErrors: 0,
      skippedBusy: false,
      done: true,
      cursor: null,
      ...extra,
    });

    logger.info('Access session backfill starting', {
      days,
      dryRun,
      cutoff: cutoff.toISOString(),
      maxRuntimeMs: options.maxRuntimeMs ?? null,
      cursor: parsedCursor
        ? { afterOccurredAt: parsedCursor.afterOccurredAt.toISOString(), afterId: parsedCursor.afterId }
        : null,
    });

    if (useAdvisoryLock) {
      const acquired = await this.tryAcquireAdvisoryLock(knex);
      if (!acquired) {
        logger.warn('Access session backfill skipped — already running');
        return empty({ skippedBusy: true, done: false });
      }
    }

    try {
      const rows = await this.loadUnlinkedActivities(knex, cutoff, parsedCursor, BACKFILL_CHUNK_MAX_ROWS);
      return await this.processRows(knex, rows, {
        days,
        dryRun,
        maxRuntimeMs: options.maxRuntimeMs,
        hitRowCap: rows.length >= BACKFILL_CHUNK_MAX_ROWS,
        requestCursor: options.cursor ?? null,
      });
    } finally {
      if (useAdvisoryLock) {
        await this.releaseAdvisoryLock(knex);
      }
    }
  }

  private async tryAcquireAdvisoryLock(knex: KnexLike): Promise<boolean> {
    if (typeof knex.raw !== 'function') return true;
    try {
      const result = (await knex.raw('SELECT GET_LOCK(?, ?) AS lock_acquired', [
        BACKFILL_ADVISORY_LOCK_KEY,
        BACKFILL_ADVISORY_LOCK_TIMEOUT_SEC,
      ])) as any;
      const acquired = result?.[0]?.[0]?.lock_acquired ?? result?.[0]?.lock_acquired;
      return Number(acquired) === 1;
    } catch (err) {
      logger.warn('Access session backfill advisory lock unavailable; proceeding', { err });
      return true;
    }
  }

  private async releaseAdvisoryLock(knex: KnexLike): Promise<void> {
    if (typeof knex.raw !== 'function') return;
    try {
      await knex.raw('SELECT RELEASE_LOCK(?)', [BACKFILL_ADVISORY_LOCK_KEY]);
    } catch {
      // ignore
    }
  }

  private async loadUnlinkedActivities(
    knex: KnexLike,
    cutoff: Date,
    cursor: { afterOccurredAt: Date; afterId: string } | null,
    maxRows: number,
  ): Promise<ActivityRow[]> {
    const rows: ActivityRow[] = [];
    let lastOccurredAt: Date | null = cursor?.afterOccurredAt ?? null;
    let lastId: string | null = cursor?.afterId ?? null;

    for (;;) {
      const remaining = maxRows - rows.length;
      if (remaining <= 0) break;

      let query = knex('activity_logs')
        .whereIn('activity_type', ['access_attempt', 'lock', 'unlock'])
        .where('occurred_at', '>=', cutoff)
        .whereNull('access_session_id')
        .orderBy('occurred_at', 'asc')
        .orderBy('id', 'asc')
        .limit(Math.min(BACKFILL_LOAD_BATCH_SIZE, remaining));

      if (lastOccurredAt && lastId) {
        const cursorAt = lastOccurredAt;
        const cursorId = lastId;
        query = query.andWhere(function (this: any) {
          this.where('occurred_at', '>', cursorAt).orWhere(function (this: any) {
            this.where('occurred_at', cursorAt).andWhere('id', '>', cursorId);
          });
        });
      }

      const batch: ActivityRow[] = await query;
      if (!batch.length) break;
      rows.push(...batch);
      const last = batch[batch.length - 1];
      lastOccurredAt = asDate(last.occurred_at);
      lastId = last.id;
      if (batch.length < Math.min(BACKFILL_LOAD_BATCH_SIZE, remaining)) break;
    }

    return rows;
  }

  private budgetExceeded(ctx: ProcessContext): boolean {
    if (ctx.deadlineMs == null) return false;
    return Date.now() >= ctx.deadlineMs;
  }

  private maybeLogProgress(ctx: ProcessContext, phase: string): void {
    ctx.unitsProcessed += 1;
    if (ctx.unitsProcessed % BACKFILL_PROGRESS_LOG_EVERY !== 0) return;
    logger.info('Access session backfill progress', {
      phase,
      unitsProcessed: ctx.unitsProcessed,
      elapsedMs: Date.now() - ctx.startedAtMs,
      claimed: ctx.claimed.size,
      sessionsInRun: ctx.virtualSessions.length,
    });
  }

  private registerHost(ctx: ProcessContext, session: VirtualSession): void {
    const list = ctx.hostsByDevice.get(session.device_id) || [];
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) list[idx] = session;
    else list.push(session);
    ctx.hostsByDevice.set(session.device_id, list);
    if (session.remote_command_id) {
      ctx.remoteSessionCache.set(session.remote_command_id, session);
    }
  }

  private async processRows(
    knex: KnexLike,
    rows: ActivityRow[],
    opts: {
      days: number;
      dryRun: boolean;
      maxRuntimeMs?: number;
      hitRowCap: boolean;
      requestCursor: AccessSessionBackfillCursor | null;
    },
  ): Promise<AccessSessionBackfillResult> {
    const startedAtMs = Date.now();
    const ctx: ProcessContext = {
      knex,
      dryRun: opts.dryRun,
      claimed: new Set<string>(),
      virtualSessions: [],
      hostsByDevice: new Map(),
      dbHostCache: new Map(),
      remoteSessionCache: new Map(),
      locksByDevice: indexLocksByDevice(rows),
      deadlineMs:
        opts.maxRuntimeMs != null && opts.maxRuntimeMs > 0
          ? startedAtMs + opts.maxRuntimeMs
          : null,
      startedAtMs,
      unitsProcessed: 0,
    };

    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let linked = 0;
    let locksAttached = 0;
    let locksSynthesized = 0;
    let skippedNoDevice = 0;
    let skippedErrors = 0;
    let stoppedEarly = false;

    const byCommand = new Map<string, { grant?: ActivityRow; unlock?: ActivityRow }>();
    for (const row of rows) {
      const meta = parseActivityMeta(row.metadata);
      const commandId = remoteCommandIdFromMeta(meta);
      if (!commandId) continue;
      const bucket = byCommand.get(commandId) || {};
      if (row.activity_type === 'access_attempt' && meta.action === 'remote_access_granted') {
        bucket.grant = row;
      }
      if (row.activity_type === 'unlock' && (meta.correlated_remote === true || meta.remote_command_id)) {
        bucket.unlock = row;
      }
      byCommand.set(commandId, bucket);
    }

    const processedCommands = new Set<string>();

    for (const row of rows) {
      if (ctx.claimed.has(row.id)) continue;
      if (ctx.unitsProcessed > 0 && this.budgetExceeded(ctx)) {
        stoppedEarly = true;
        break;
      }
      if (!row.device_id) {
        skippedNoDevice += 1;
        continue;
      }

      const meta = parseActivityMeta(row.metadata);
      const commandId = remoteCommandIdFromMeta(meta);
      const pair = commandId ? byCommand.get(commandId) : undefined;
      const isRemoteUnit =
        Boolean(commandId)
        && pair
        && (pair.grant || pair.unlock)
        && !processedCommands.has(commandId!)
        && (row.id === pair.grant?.id || row.id === pair.unlock?.id);

      try {
        if (isRemoteUnit && commandId && pair) {
          processedCommands.add(commandId);
          const result = await this.processRemoteCommand({
            ctx,
            commandId,
            pair,
          });
          if (result.skippedNoDevice) skippedNoDevice += 1;
          sessionsCreated += result.sessionsCreated;
          sessionsUpdated += result.sessionsUpdated;
          linked += result.linked;
          this.maybeLogProgress(ctx, 'remote');
        } else if (!ctx.claimed.has(row.id)) {
          const result = await this.processStandaloneRow({
            ctx,
            row,
          });
          sessionsCreated += result.sessionsCreated;
          sessionsUpdated += result.sessionsUpdated;
          linked += result.linked;
          locksAttached += result.locksAttached;
          locksSynthesized += result.locksSynthesized;
          this.maybeLogProgress(ctx, 'standalone');
        }
      } catch (err) {
        skippedErrors += 1;
        logger.error('Access session backfill unit failed', {
          activityId: row.id,
          commandId: commandId || undefined,
          err,
        });
      }
    }

    const firstUnclaimedIdx = rows.findIndex(
      (r) => !ctx.claimed.has(r.id) && Boolean(r.device_id),
    );
    // Resume just before the first still-unclaimed work row.
    let cursor: AccessSessionBackfillCursor | null = null;
    if (firstUnclaimedIdx > 0) {
      cursor = cursorFromActivity(rows[firstUnclaimedIdx - 1]);
    } else if (firstUnclaimedIdx === 0) {
      // Still have work at the start of this page — do not advance (avoid skipping).
      cursor = opts.requestCursor;
    } else if (opts.hitRowCap && rows.length) {
      cursor = cursorFromActivity(rows[rows.length - 1]);
    }

    const done = firstUnclaimedIdx < 0 && !opts.hitRowCap;

    const result: AccessSessionBackfillResult = {
      days: opts.days,
      dryRun: opts.dryRun,
      unlinkedActivityRows: rows.length,
      sessionsCreated,
      sessionsUpdated,
      activityLinks: linked,
      locksAttached,
      locksSynthesized,
      skippedNoDevice,
      skippedErrors,
      skippedBusy: false,
      done,
      cursor: done ? null : cursor,
    };
    logger.info('Access session backfill chunk complete', {
      ...result,
      elapsedMs: Date.now() - startedAtMs,
      stoppedEarly,
      hitRowCap: opts.hitRowCap,
      firstUnclaimedIdx,
    });
    return result;
  }

  private async processRemoteCommand(input: {
    ctx: ProcessContext;
    commandId: string;
    pair: { grant?: ActivityRow; unlock?: ActivityRow };
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    skippedNoDevice: boolean;
  }> {
    const { ctx, commandId, pair } = input;
    const { knex, claimed, dryRun } = ctx;
    const grant = pair.grant;
    const unlock = pair.unlock;
    const deviceId = (unlock || grant)?.device_id;
    if (!deviceId) {
      return { sessionsCreated: 0, sessionsUpdated: 0, linked: 0, skippedNoDevice: true };
    }

    let lockRow: ActivityRow | undefined;
    if (unlock) {
      lockRow = findLockInWindowIndexed(
        ctx.locksByDevice,
        deviceId,
        asDate(unlock.occurred_at),
        claimed,
      );
    }

    const members = [grant, unlock, lockRow].filter(Boolean) as ActivityRow[];
    if (members.some((m) => claimed.has(m.id))) {
      return { sessionsCreated: 0, sessionsUpdated: 0, linked: 0, skippedNoDevice: false };
    }

    const startedAt = asDate((grant || unlock)!.occurred_at);
    const openedAt = unlock ? asDate(unlock.occurred_at) : null;
    const closedAt = lockRow ? asDate(lockRow.occurred_at) : null;
    const grantMeta = parseActivityMeta((grant || unlock)!.metadata);
    const { state, outcome } = resolveRemoteBackfillState({
      hasUnlock: Boolean(unlock),
      hasLock: Boolean(lockRow),
      grantResult: grant?.result,
      grantMeta,
    });
    const openDurationSec =
      openedAt && closedAt ? computeOpenDurationSec(openedAt, closedAt, null) : null;
    const method = String(grantMeta.method || 'admin_remote');

    const existing = await this.findSessionByRemoteCommand(ctx, commandId);
    const sessionId = existing?.id || uuidv4();
    let sessionsCreated = 0;
    let sessionsUpdated = 0;

    const advance = existing
      ? shouldAdvanceExistingSession(existing.state, { state, openedAt, closedAt })
      : true;

    if (dryRun) {
      if (!existing) {
        sessionsCreated = 1;
        const created: VirtualSession = {
          id: sessionId,
          device_id: deviceId,
          kind: 'access',
          state,
          started_at: startedAt,
          opened_at: openedAt,
          closed_at: closedAt,
          open_duration_sec: openDurationSec,
          remote_command_id: commandId,
        };
        ctx.virtualSessions.push(created);
        this.registerHost(ctx, created);
      } else if (advance) {
        sessionsUpdated = 1;
        existing.state = state;
        if (openedAt) existing.opened_at = openedAt;
        if (closedAt) existing.closed_at = closedAt;
        if (openDurationSec != null) existing.open_duration_sec = openDurationSec;
        this.registerHost(ctx, existing);
      }
      for (const m of members) claimed.add(m.id);
      return { sessionsCreated, sessionsUpdated, linked: members.length, skippedNoDevice: false };
    }

    let linkedCount = members.length;

    await knex.transaction(async (trx: any) => {
      if (!existing) {
        try {
          await this.insertSession(trx, {
            id: sessionId,
            facility_id: (grant || unlock)!.facility_id,
            unit_id: (grant || unlock)!.unit_id,
            device_id: deviceId,
            device_type: grantMeta.device_type === 'access_control' ? 'access_control' : 'blulok',
            gateway_id: typeof grantMeta.gateway_id === 'string' ? grantMeta.gateway_id : null,
            kind: 'access',
            origin: 'cloud_remote',
            method,
            outcome,
            state,
            actor_type: (grant || unlock)!.actor_type || 'user',
            actor_id: (grant || unlock)!.actor_id,
            actor_name: (grant || unlock)!.actor_name,
            actor_role: (grantMeta.initiated_by as { role?: string } | undefined)?.role || null,
            denial_reason: typeof grantMeta.denial_reason === 'string' ? grantMeta.denial_reason : null,
            reason_message: (grant || unlock)!.result_message,
            started_at: startedAt,
            opened_at: openedAt,
            closed_at: closedAt,
            settled_at: closedAt || openedAt || startedAt,
            open_duration_sec: openDurationSec,
            attempt_count: 1,
            remote_command_id: commandId,
            metadata: JSON.stringify(grantMeta),
          });
          sessionsCreated = 1;
        } catch (err) {
          if (!isDuplicateKeyError(err)) throw err;
          const raced = await trx('access_sessions').where('remote_command_id', commandId).first();
          if (!raced) throw err;
          await this.linkMembers(trx, raced.id, members, claimed);
          if (shouldAdvanceExistingSession(raced.state, { state, openedAt, closedAt })) {
            await trx('access_sessions').where('id', raced.id).update({
              state,
              opened_at: openedAt || raced.opened_at,
              closed_at: closedAt || raced.closed_at,
              open_duration_sec: openDurationSec ?? raced.open_duration_sec,
              settled_at: closedAt || openedAt || raced.settled_at,
              updated_at: new Date(),
            });
            sessionsUpdated = 1;
          }
          const racedSession: VirtualSession = {
            id: raced.id,
            device_id: raced.device_id || deviceId,
            kind: raced.kind || 'access',
            state: sessionsUpdated ? state : raced.state,
            started_at: raced.started_at,
            opened_at: openedAt || raced.opened_at,
            closed_at: closedAt || raced.closed_at,
            open_duration_sec: openDurationSec ?? raced.open_duration_sec,
            remote_command_id: commandId,
          };
          this.registerHost(ctx, racedSession);
          return;
        }
      } else if (advance) {
        await trx('access_sessions').where('id', sessionId).update({
          state,
          opened_at: openedAt || existing.opened_at,
          closed_at: closedAt || existing.closed_at,
          open_duration_sec: openDurationSec ?? existing.open_duration_sec,
          settled_at: closedAt || openedAt || existing.settled_at,
          updated_at: new Date(),
        });
        sessionsUpdated = 1;
        existing.state = state;
        if (openedAt) existing.opened_at = openedAt;
        if (closedAt) existing.closed_at = closedAt;
        if (openDurationSec != null) existing.open_duration_sec = openDurationSec;
        this.registerHost(ctx, existing);
      }

      await this.linkMembers(trx, sessionId, members, claimed);
    });

    if (sessionsCreated) {
      const created: VirtualSession = {
        id: sessionId,
        device_id: deviceId,
        kind: 'access',
        state,
        started_at: startedAt,
        opened_at: openedAt,
        closed_at: closedAt,
        open_duration_sec: openDurationSec,
        remote_command_id: commandId,
      };
      ctx.virtualSessions.push(created);
      this.registerHost(ctx, created);
    }

    return {
      sessionsCreated,
      sessionsUpdated,
      linked: linkedCount,
      skippedNoDevice: false,
    };
  }

  private async processStandaloneRow(input: {
    ctx: ProcessContext;
    row: ActivityRow;
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    locksAttached: number;
    locksSynthesized: number;
  }> {
    const { ctx, row } = input;
    const { knex, claimed, dryRun } = ctx;
    const meta = parseActivityMeta(row.metadata);
    const deviceId = row.device_id!;

    if (row.activity_type === 'lock') {
      return this.processLockRow({ ctx, row, deviceId });
    }

    let state = 'closed';
    let outcome: string | null = 'granted';
    let kind = 'access';
    let origin = 'on_site';
    let method = String(meta.method || 'unknown');

    if (row.activity_type === 'unlock') {
      origin = meta.correlated_remote ? 'cloud_remote' : 'local';
      method = String(meta.method || 'local_device');
      // Historical unlock without a later lock in the load window: store closed so
      // Needs attention is not flooded with stale opens. Live path keeps open.
      state = 'closed';
    } else if (row.result === 'failure') {
      state =
        typeof meta.denial_reason === 'string' && meta.denial_reason === 'timeout'
          ? 'timed_out'
          : meta.action === 'unlock_attempt' || meta.action === 'lock_attempt'
            ? 'failed'
            : 'denied';
      outcome = state === 'denied' ? 'denied' : 'failed';
    } else if (meta.action === 'remote_access_granted') {
      origin = 'cloud_remote';
      state = 'closed';
    }

    const remoteCommandId = remoteCommandIdFromMeta(meta);
    if (remoteCommandId) {
      const existing = await this.findSessionByRemoteCommand(ctx, remoteCommandId);
      if (existing) {
        if (dryRun) {
          claimed.add(row.id);
          return {
            sessionsCreated: 0,
            sessionsUpdated: 0,
            linked: 1,
            locksAttached: 0,
            locksSynthesized: 0,
          };
        }
        await knex.transaction(async (trx: any) => {
          await this.linkMembers(trx, existing.id, [row], claimed);
        });
        return {
          sessionsCreated: 0,
          sessionsUpdated: 0,
          linked: 1,
          locksAttached: 0,
          locksSynthesized: 0,
        };
      }
    }

    const sessionId = uuidv4();
    const occurredAt = asDate(row.occurred_at);
    const payload = {
      id: sessionId,
      facility_id: row.facility_id,
      unit_id: row.unit_id,
      device_id: deviceId,
      device_type: meta.device_type === 'access_control' ? 'access_control' : 'blulok',
      gateway_id: typeof meta.gateway_id === 'string' ? meta.gateway_id : null,
      kind,
      origin,
      method,
      outcome,
      state,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      actor_name: row.actor_name,
      actor_role: (meta.actor_role as string) || null,
      denial_reason: typeof meta.denial_reason === 'string' ? meta.denial_reason : null,
      reason_message: row.result_message,
      started_at: occurredAt,
      opened_at:
        row.activity_type === 'unlock' || row.activity_type === 'lock' ? occurredAt : null,
      closed_at: state === 'closed' ? occurredAt : null,
      settled_at: occurredAt,
      open_duration_sec: row.activity_type === 'lock' ? 0 : null,
      attempt_count: 1,
      remote_command_id: remoteCommandId,
      correlation_id: typeof meta.correlation_id === 'string' ? meta.correlation_id : null,
      metadata: JSON.stringify(meta),
    };

    if (dryRun) {
      claimed.add(row.id);
      const created: VirtualSession = {
        id: sessionId,
        device_id: deviceId,
        kind,
        state,
        started_at: occurredAt,
        opened_at: payload.opened_at,
        closed_at: payload.closed_at,
        open_duration_sec: payload.open_duration_sec,
        remote_command_id: remoteCommandId,
      };
      ctx.virtualSessions.push(created);
      this.registerHost(ctx, created);
      return {
        sessionsCreated: 1,
        sessionsUpdated: 0,
        linked: 1,
        locksAttached: 0,
        locksSynthesized: 0,
      };
    }

    let created = false;
    let linkedOnly = false;

    await knex.transaction(async (trx: any) => {
      if (remoteCommandId) {
        const raced = await trx('access_sessions').where('remote_command_id', remoteCommandId).first();
        if (raced) {
          await this.linkMembers(trx, raced.id, [row], claimed);
          linkedOnly = true;
          return;
        }
      }
      try {
        await this.insertSession(trx, payload);
        created = true;
      } catch (err) {
        if (isDuplicateKeyError(err) && remoteCommandId) {
          const raced = await trx('access_sessions').where('remote_command_id', remoteCommandId).first();
          if (!raced) throw err;
          await this.linkMembers(trx, raced.id, [row], claimed);
          linkedOnly = true;
          return;
        }
        throw err;
      }
      await this.linkMembers(trx, sessionId, [row], claimed);
    });

    if (created) {
      const session: VirtualSession = {
        id: sessionId,
        device_id: deviceId,
        kind,
        state,
        started_at: occurredAt,
        opened_at: payload.opened_at,
        closed_at: payload.closed_at,
        open_duration_sec: payload.open_duration_sec,
        remote_command_id: remoteCommandId,
      };
      ctx.virtualSessions.push(session);
      this.registerHost(ctx, session);
    }

    return {
      sessionsCreated: created ? 1 : 0,
      sessionsUpdated: 0,
      linked: created || linkedOnly ? 1 : 0,
      locksAttached: 0,
      locksSynthesized: 0,
    };
  }

  private async processLockRow(input: {
    ctx: ProcessContext;
    row: ActivityRow;
    deviceId: string;
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    locksAttached: number;
    locksSynthesized: number;
  }> {
    const { ctx, row, deviceId } = input;
    const { knex, claimed, dryRun } = ctx;
    const host = await this.findHostForLock(ctx, deviceId);

    if (host) {
      const lockAt = asDate(row.occurred_at);
      const openedAt = host.opened_at ? asDate(host.opened_at) : asDate(host.started_at);
      const openDuration =
        host.opened_at || host.state === 'open'
          ? computeOpenDurationSec(openedAt, lockAt, host.open_duration_sec)
          : host.open_duration_sec ?? null;

      if (dryRun) {
        claimed.add(row.id);
        host.state = 'closed';
        host.closed_at = lockAt;
        host.open_duration_sec = openDuration;
        this.registerHost(ctx, host);
        return {
          sessionsCreated: 0,
          sessionsUpdated: 1,
          linked: 1,
          locksAttached: 1,
          locksSynthesized: 0,
        };
      }

      await knex.transaction(async (trx: any) => {
        await trx('access_sessions').where('id', host.id).update({
          state: 'closed',
          closed_at: lockAt,
          settled_at: lockAt,
          open_duration_sec: openDuration,
          expires_at: null,
          updated_at: new Date(),
        });
        await this.linkMembers(trx, host.id, [row], claimed);
      });
      host.state = 'closed';
      host.closed_at = lockAt;
      host.open_duration_sec = openDuration;
      this.registerHost(ctx, host);
      // Invalidate stale DB cache entry for this device so later locks re-query if needed.
      ctx.dbHostCache.delete(deviceId);
      return {
        sessionsCreated: 0,
        sessionsUpdated: 1,
        linked: 1,
        locksAttached: 1,
        locksSynthesized: 0,
      };
    }

    // No host: synthesize local closed access (opened + locked together).
    const meta = parseActivityMeta(row.metadata);
    const sessionId = uuidv4();
    const lockAt = asDate(row.occurred_at);
    const payload = {
      id: sessionId,
      facility_id: row.facility_id,
      unit_id: row.unit_id,
      device_id: deviceId,
      device_type: meta.device_type === 'access_control' ? 'access_control' : 'blulok',
      gateway_id: typeof meta.gateway_id === 'string' ? meta.gateway_id : null,
      kind: 'access',
      origin: 'local',
      method: 'local_device',
      outcome: 'granted' as string | null,
      state: 'closed',
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      actor_name: row.actor_name,
      actor_role: (meta.actor_role as string) || null,
      denial_reason: typeof meta.denial_reason === 'string' ? meta.denial_reason : null,
      reason_message: row.result_message,
      started_at: lockAt,
      opened_at: lockAt,
      closed_at: lockAt,
      settled_at: lockAt,
      open_duration_sec: 0,
      attempt_count: 1,
      remote_command_id: null as string | null,
      correlation_id: typeof meta.correlation_id === 'string' ? meta.correlation_id : null,
      metadata: JSON.stringify(meta),
    };

    if (dryRun) {
      claimed.add(row.id);
      const created: VirtualSession = {
        id: sessionId,
        device_id: deviceId,
        kind: 'access',
        state: 'closed',
        started_at: lockAt,
        opened_at: lockAt,
        closed_at: lockAt,
        open_duration_sec: 0,
      };
      ctx.virtualSessions.push(created);
      this.registerHost(ctx, created);
      return {
        sessionsCreated: 1,
        sessionsUpdated: 0,
        linked: 1,
        locksAttached: 0,
        locksSynthesized: 1,
      };
    }

    await knex.transaction(async (trx: any) => {
      await this.insertSession(trx, payload);
      await this.linkMembers(trx, sessionId, [row], claimed);
    });
    const created: VirtualSession = {
      id: sessionId,
      device_id: deviceId,
      kind: 'access',
      state: 'closed',
      started_at: lockAt,
      opened_at: lockAt,
      closed_at: lockAt,
      open_duration_sec: 0,
    };
    ctx.virtualSessions.push(created);
    this.registerHost(ctx, created);
    return {
      sessionsCreated: 1,
      sessionsUpdated: 0,
      linked: 1,
      locksAttached: 0,
      locksSynthesized: 1,
    };
  }

  private async findSessionByRemoteCommand(
    ctx: ProcessContext,
    commandId: string,
  ): Promise<VirtualSession | null> {
    if (ctx.remoteSessionCache.has(commandId)) {
      return ctx.remoteSessionCache.get(commandId) ?? null;
    }
    const virtual = ctx.virtualSessions.find((s) => s.remote_command_id === commandId);
    if (virtual) {
      ctx.remoteSessionCache.set(commandId, virtual);
      return virtual;
    }
    const row = await ctx.knex('access_sessions').where('remote_command_id', commandId).first();
    if (!row) {
      ctx.remoteSessionCache.set(commandId, null);
      return null;
    }
    const session: VirtualSession = {
      id: row.id,
      device_id: row.device_id,
      kind: row.kind || 'access',
      state: row.state,
      started_at: row.started_at,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      open_duration_sec: row.open_duration_sec,
      settled_at: row.settled_at,
      remote_command_id: row.remote_command_id,
    };
    ctx.remoteSessionCache.set(commandId, session);
    this.registerHost(ctx, session);
    return session;
  }

  private async findHostForLock(
    ctx: ProcessContext,
    deviceId: string,
  ): Promise<VirtualSession | null> {
    const inRun = (ctx.hostsByDevice.get(deviceId) || []).filter(
      (s) => s.kind === 'access' && s.state !== 'denied',
    );
    const bestInRun = pickBestHostSession(inRun);
    // Prefer live open/pending hosts from this run before hitting the DB.
    if (bestInRun && (bestInRun.state === 'open' || bestInRun.state === 'pending')) {
      return bestInRun;
    }

    let dbHost: VirtualSession | null | undefined;
    if (ctx.dbHostCache.has(deviceId)) {
      dbHost = ctx.dbHostCache.get(deviceId) ?? null;
    } else {
      dbHost = await this.lookupDbHost(ctx.knex, deviceId);
      ctx.dbHostCache.set(deviceId, dbHost);
      if (dbHost) this.registerHost(ctx, dbHost);
    }

    const merged = [...inRun];
    if (dbHost && !merged.some((m) => m.id === dbHost!.id)) merged.push(dbHost);
    return pickBestHostSession(merged) || null;
  }

  private async lookupDbHost(knex: KnexLike, deviceId: string): Promise<VirtualSession | null> {
    try {
      const live = await knex('access_sessions')
        .where({ device_id: deviceId, kind: 'access' })
        .whereIn('state', ['open', 'pending'])
        .orderBy('started_at', 'desc')
        .select(
          'id',
          'device_id',
          'kind',
          'state',
          'started_at',
          'opened_at',
          'closed_at',
          'open_duration_sec',
          'remote_command_id',
          'settled_at',
        )
        .first();
      if (live) return live as VirtualSession;

      const latest = await knex('access_sessions')
        .where({ device_id: deviceId, kind: 'access' })
        .whereNotIn('state', ['denied'])
        .orderBy('started_at', 'desc')
        .select(
          'id',
          'device_id',
          'kind',
          'state',
          'started_at',
          'opened_at',
          'closed_at',
          'open_duration_sec',
          'remote_command_id',
          'settled_at',
        )
        .first();
      return (latest as VirtualSession) || null;
    } catch (err) {
      logger.warn('Access session backfill host lookup failed; using in-run sessions only', {
        deviceId,
        err,
      });
      return null;
    }
  }

  private async linkMembers(
    trx: any,
    sessionId: string,
    members: ActivityRow[],
    claimed: Set<string>,
  ): Promise<void> {
    const ids = members.map((m) => m.id).filter((id) => !claimed.has(id));
    if (!ids.length) return;
    await trx('activity_logs').whereIn('id', ids).update({ access_session_id: sessionId });
    for (const id of ids) claimed.add(id);
  }

  private async insertSession(trx: any, payload: Record<string, unknown>): Promise<void> {
    const now = new Date();
    const row: Record<string, unknown> = { ...payload, created_at: now, updated_at: now };
    try {
      await trx('access_sessions').insert(row);
    } catch (err) {
      if (isForeignKeyError(err) && (row.facility_id != null || row.unit_id != null)) {
        logger.warn('Access session backfill FK miss — nulling facility/unit and retrying', {
          sessionId: row.id,
          facility_id: row.facility_id,
          unit_id: row.unit_id,
        });
        await trx('access_sessions').insert({
          ...row,
          facility_id: null,
          unit_id: null,
        });
        return;
      }
      throw err;
    }
  }
}
