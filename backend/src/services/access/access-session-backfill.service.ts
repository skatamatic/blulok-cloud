/**
 * Correlate historical activity_logs into access_sessions (last N days).
 * Used by CLI script and DEV_ADMIN Developer Tools UI.
 *
 * Production guarantees:
 * - Single-flight via MySQL GET_LOCK (non-blocking)
 * - Per-session DB transactions (insert/update + activity links atomic)
 * - Unique remote_command_id races → attach to existing instead of failing
 * - Never downgrade live pending/open from grant-only historical rows
 * - Dry-run lock accounting mirrors real host-attach / synthesize paths
 * - Per-item errors are logged and skipped; FK orphans null facility/unit and retry
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import {
  BACKFILL_ADVISORY_LOCK_KEY,
  BACKFILL_ADVISORY_LOCK_TIMEOUT_SEC,
  BACKFILL_LOAD_BATCH_SIZE,
  asDate,
  clampBackfillDays,
  computeOpenDurationSec,
  findLockInWindow,
  isDuplicateKeyError,
  isForeignKeyError,
  parseActivityMeta,
  pickBestHostSession,
  remoteCommandIdFromMeta,
  resolveRemoteBackfillState,
  shouldAdvanceExistingSession,
  type HostSessionLike,
} from './access-session-backfill.utils';

export type AccessSessionBackfillOptions = {
  days?: number;
  dryRun?: boolean;
  /** Skip advisory lock (tests only). */
  skipAdvisoryLock?: boolean;
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
      ...extra,
    });

    logger.info('Access session backfill starting', { days, dryRun, cutoff: cutoff.toISOString() });

    if (!options.skipAdvisoryLock) {
      const acquired = await this.tryAcquireAdvisoryLock(knex);
      if (!acquired) {
        logger.warn('Access session backfill skipped — already running');
        return empty({ skippedBusy: true });
      }
    }

    try {
      const rows = await this.loadUnlinkedActivities(knex, cutoff);
      return await this.processRows(knex, rows, { days, dryRun });
    } finally {
      if (!options.skipAdvisoryLock) {
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

  private async loadUnlinkedActivities(knex: KnexLike, cutoff: Date): Promise<ActivityRow[]> {
    const rows: ActivityRow[] = [];
    let lastOccurredAt: Date | null = null;
    let lastId: string | null = null;

    for (;;) {
      let query = knex('activity_logs')
        .whereIn('activity_type', ['access_attempt', 'lock', 'unlock'])
        .where('occurred_at', '>=', cutoff)
        .whereNull('access_session_id')
        .orderBy('occurred_at', 'asc')
        .orderBy('id', 'asc')
        .limit(BACKFILL_LOAD_BATCH_SIZE);

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
      if (batch.length < BACKFILL_LOAD_BATCH_SIZE) break;
    }

    return rows;
  }

  private async processRows(
    knex: KnexLike,
    rows: ActivityRow[],
    opts: { days: number; dryRun: boolean },
  ): Promise<AccessSessionBackfillResult> {
    const claimed = new Set<string>();
    const virtualSessions: VirtualSession[] = [];
    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let linked = 0;
    let locksAttached = 0;
    let locksSynthesized = 0;
    let skippedNoDevice = 0;
    let skippedErrors = 0;

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

    for (const [commandId, pair] of byCommand.entries()) {
      if (!pair.grant && !pair.unlock) continue;
      try {
        const result = await this.processRemoteCommand({
          knex,
          commandId,
          pair,
          rows,
          claimed,
          virtualSessions,
          dryRun: opts.dryRun,
        });
        if (result.skippedNoDevice) skippedNoDevice += 1;
        sessionsCreated += result.sessionsCreated;
        sessionsUpdated += result.sessionsUpdated;
        linked += result.linked;
      } catch (err) {
        skippedErrors += 1;
        logger.error('Access session backfill remote-command unit failed', { commandId, err });
      }
    }

    for (const row of rows) {
      if (claimed.has(row.id)) continue;
      if (!row.device_id) {
        skippedNoDevice += 1;
        continue;
      }
      try {
        const result = await this.processStandaloneRow({
          knex,
          row,
          claimed,
          virtualSessions,
          dryRun: opts.dryRun,
        });
        sessionsCreated += result.sessionsCreated;
        sessionsUpdated += result.sessionsUpdated;
        linked += result.linked;
        locksAttached += result.locksAttached;
        locksSynthesized += result.locksSynthesized;
      } catch (err) {
        skippedErrors += 1;
        logger.error('Access session backfill standalone row failed', { activityId: row.id, err });
      }
    }

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
    };
    logger.info('Access session backfill complete', result);
    return result;
  }

  private async processRemoteCommand(input: {
    knex: KnexLike;
    commandId: string;
    pair: { grant?: ActivityRow; unlock?: ActivityRow };
    rows: ActivityRow[];
    claimed: Set<string>;
    virtualSessions: VirtualSession[];
    dryRun: boolean;
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    skippedNoDevice: boolean;
  }> {
    const { knex, commandId, pair, rows, claimed, virtualSessions, dryRun } = input;
    const grant = pair.grant;
    const unlock = pair.unlock;
    const deviceId = (unlock || grant)?.device_id;
    if (!deviceId) {
      return { sessionsCreated: 0, sessionsUpdated: 0, linked: 0, skippedNoDevice: true };
    }

    let lockRow: ActivityRow | undefined;
    if (unlock) {
      lockRow = findLockInWindow(rows, deviceId, asDate(unlock.occurred_at), claimed);
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

    const existing = await this.findSessionByRemoteCommand(knex, commandId, virtualSessions);
    const sessionId = existing?.id || uuidv4();
    let sessionsCreated = 0;
    let sessionsUpdated = 0;

    const advance = existing
      ? shouldAdvanceExistingSession(existing.state, { state, openedAt, closedAt })
      : true;

    if (dryRun) {
      if (!existing) {
        sessionsCreated = 1;
        virtualSessions.push({
          id: sessionId,
          device_id: deviceId,
          kind: 'access',
          state,
          started_at: startedAt,
          opened_at: openedAt,
          closed_at: closedAt,
          open_duration_sec: openDurationSec,
          remote_command_id: commandId,
        });
      } else if (advance) {
        sessionsUpdated = 1;
        existing.state = state;
        if (openedAt) existing.opened_at = openedAt;
        if (closedAt) existing.closed_at = closedAt;
        if (openDurationSec != null) existing.open_duration_sec = openDurationSec;
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
      }

      await this.linkMembers(trx, sessionId, members, claimed);
    });

    if (sessionsCreated) {
      virtualSessions.push({
        id: sessionId,
        device_id: deviceId,
        kind: 'access',
        state,
        started_at: startedAt,
        opened_at: openedAt,
        closed_at: closedAt,
        open_duration_sec: openDurationSec,
        remote_command_id: commandId,
      });
    }

    return {
      sessionsCreated,
      sessionsUpdated,
      linked: linkedCount,
      skippedNoDevice: false,
    };
  }

  private async processStandaloneRow(input: {
    knex: KnexLike;
    row: ActivityRow;
    claimed: Set<string>;
    virtualSessions: VirtualSession[];
    dryRun: boolean;
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    locksAttached: number;
    locksSynthesized: number;
  }> {
    const { knex, row, claimed, virtualSessions, dryRun } = input;
    const meta = parseActivityMeta(row.metadata);
    const deviceId = row.device_id!;

    if (row.activity_type === 'lock') {
      return this.processLockRow({ knex, row, deviceId, claimed, virtualSessions, dryRun });
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
      const existing = await this.findSessionByRemoteCommand(knex, remoteCommandId, virtualSessions);
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
          await trx('activity_logs').where('id', row.id).update({ access_session_id: existing.id });
        });
        claimed.add(row.id);
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
      virtualSessions.push({
        id: sessionId,
        device_id: deviceId,
        kind,
        state,
        started_at: occurredAt,
        opened_at: payload.opened_at,
        closed_at: payload.closed_at,
        open_duration_sec: payload.open_duration_sec,
        remote_command_id: remoteCommandId,
      });
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
          await trx('activity_logs').where('id', row.id).update({ access_session_id: raced.id });
          claimed.add(row.id);
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
          await trx('activity_logs').where('id', row.id).update({ access_session_id: raced.id });
          claimed.add(row.id);
          linkedOnly = true;
          return;
        }
        throw err;
      }
      await trx('activity_logs').where('id', row.id).update({ access_session_id: sessionId });
      claimed.add(row.id);
    });

    if (created) {
      virtualSessions.push({
        id: sessionId,
        device_id: deviceId,
        kind,
        state,
        started_at: occurredAt,
        opened_at: payload.opened_at,
        closed_at: payload.closed_at,
        open_duration_sec: payload.open_duration_sec,
        remote_command_id: remoteCommandId,
      });
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
    knex: KnexLike;
    row: ActivityRow;
    deviceId: string;
    claimed: Set<string>;
    virtualSessions: VirtualSession[];
    dryRun: boolean;
  }): Promise<{
    sessionsCreated: number;
    sessionsUpdated: number;
    linked: number;
    locksAttached: number;
    locksSynthesized: number;
  }> {
    const { knex, row, deviceId, claimed, virtualSessions, dryRun } = input;
    const host = await this.findHostForLock(knex, deviceId, virtualSessions);

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
        await trx('activity_logs').where('id', row.id).update({ access_session_id: host.id });
      });
      claimed.add(row.id);
      host.state = 'closed';
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
      virtualSessions.push({
        id: sessionId,
        device_id: deviceId,
        kind: 'access',
        state: 'closed',
        started_at: lockAt,
        opened_at: lockAt,
        closed_at: lockAt,
        open_duration_sec: 0,
      });
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
      await trx('activity_logs').where('id', row.id).update({ access_session_id: sessionId });
    });
    claimed.add(row.id);
    virtualSessions.push({
      id: sessionId,
      device_id: deviceId,
      kind: 'access',
      state: 'closed',
      started_at: lockAt,
      opened_at: lockAt,
      closed_at: lockAt,
      open_duration_sec: 0,
    });
    return {
      sessionsCreated: 1,
      sessionsUpdated: 0,
      linked: 1,
      locksAttached: 0,
      locksSynthesized: 1,
    };
  }

  private async findSessionByRemoteCommand(
    knex: KnexLike,
    commandId: string,
    virtualSessions: VirtualSession[],
  ): Promise<VirtualSession | null> {
    const virtual = virtualSessions.find((s) => s.remote_command_id === commandId);
    if (virtual) return virtual;
    const row = await knex('access_sessions').where('remote_command_id', commandId).first();
    if (!row) return null;
    return {
      id: row.id,
      device_id: row.device_id,
      kind: row.kind || 'access',
      state: row.state,
      started_at: row.started_at,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      open_duration_sec: row.open_duration_sec,
      remote_command_id: row.remote_command_id,
    };
  }

  private async findHostForLock(
    knex: KnexLike,
    deviceId: string,
    virtualSessions: VirtualSession[],
  ): Promise<VirtualSession | null> {
    const virtualHosts = virtualSessions.filter(
      (s) => s.device_id === deviceId && s.kind === 'access' && s.state !== 'denied',
    );

    let dbRows: VirtualSession[] = [];
    try {
      dbRows = await knex('access_sessions')
        .where({ device_id: deviceId, kind: 'access' })
        .whereNotIn('state', ['denied'])
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
        );
      if (!Array.isArray(dbRows)) dbRows = [];
    } catch (err) {
      logger.warn('Access session backfill host lookup failed; using in-run sessions only', {
        deviceId,
        err,
      });
      dbRows = [];
    }

    const merged = [...virtualHosts];
    for (const row of dbRows) {
      if (row && !merged.some((m) => m.id === row.id)) merged.push(row);
    }
    return pickBestHostSession(merged) || null;
  }

  private async linkMembers(
    trx: any,
    sessionId: string,
    members: ActivityRow[],
    claimed: Set<string>,
  ): Promise<void> {
    for (const m of members) {
      await trx('activity_logs').where('id', m.id).update({ access_session_id: sessionId });
      claimed.add(m.id);
    }
  }

  private async insertSession(trx: any, payload: Record<string, unknown>): Promise<void> {
    const now = new Date();
    const row = { ...payload, created_at: now, updated_at: now };
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
