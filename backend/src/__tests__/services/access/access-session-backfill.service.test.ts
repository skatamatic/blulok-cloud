/**
 * AccessSessionBackfillService integration tests against an in-memory knex stand-in.
 */

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { DatabaseService } from '@/services/database.service';
import { AccessSessionBackfillService } from '@/services/access/access-session-backfill.service';

type ActivitySeed = {
  id: string;
  activity_type: 'access_attempt' | 'lock' | 'unlock';
  facility_id?: string | null;
  unit_id?: string | null;
  device_id?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  result?: string;
  result_message?: string | null;
  occurred_at: Date;
  metadata?: Record<string, unknown> | string;
  access_session_id?: string | null;
};

type SessionSeed = {
  id: string;
  facility_id?: string | null;
  unit_id?: string | null;
  device_id: string;
  device_type?: string;
  kind?: string;
  origin?: string;
  method?: string;
  outcome?: string | null;
  state: string;
  started_at: Date;
  opened_at?: Date | null;
  closed_at?: Date | null;
  settled_at?: Date | null;
  open_duration_sec?: number | null;
  attempt_count?: number;
  remote_command_id?: string | null;
  metadata?: string | null;
};

type Store = {
  activity_logs: any[];
  access_sessions: any[];
  lockAcquired: number;
};

function matchesWhere(row: any, key: string, value: unknown): boolean {
  if (value === null) return row[key] == null;
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
    // object form used by .where({ a: 1, b: 2 })
    return Object.entries(value as Record<string, unknown>).every(([k, v]) => matchesWhere(row, k, v));
  }
  if (value instanceof Date) {
    return new Date(row[key]).getTime() === value.getTime();
  }
  return row[key] === value;
}

function createMemoryKnex(store: Store) {
  const buildQuery = (table: string, trxStore: Store = store) => {
    const state: {
      filters: Array<(row: any) => boolean>;
      orders: Array<{ col: string; dir: 'asc' | 'desc' }>;
      limitN?: number;
      selectCols?: string[];
    } = { filters: [], orders: [] };

    const apply = () => {
      let rows = [...(trxStore as any)[table]];
      for (const f of state.filters) rows = rows.filter(f);
      if (state.orders.length) {
        rows.sort((a, b) => {
          for (const ord of state.orders) {
            const av = a[ord.col];
            const bv = b[ord.col];
            const aVal = av instanceof Date ? av.getTime() : av;
            const bVal = bv instanceof Date ? bv.getTime() : bv;
            if (aVal === bVal) continue;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            const cmp = aVal < bVal ? -1 : 1;
            return ord.dir === 'asc' ? cmp : -cmp;
          }
          return 0;
        });
      }
      if (state.limitN != null) rows = rows.slice(0, state.limitN);
      if (state.selectCols) {
        rows = rows.map((r) => {
          const out: any = {};
          for (const c of state.selectCols!) out[c] = r[c];
          return out;
        });
      }
      return rows;
    };

    const api: any = {
      whereIn(col: string, values: unknown[]) {
        state.filters.push((row) => values.includes(row[col]));
        return api;
      },
      whereNotIn(col: string, values: unknown[]) {
        state.filters.push((row) => !values.includes(row[col]));
        return api;
      },
      whereNull(col: string) {
        state.filters.push((row) => row[col] == null);
        return api;
      },
      where(colOrObj: any, opOrVal?: any, maybeVal?: any) {
        if (typeof colOrObj === 'function') {
          // Nested builder for andWhere cursor — collect OR groups simply
          const nestedFilters: Array<(row: any) => boolean> = [];
          const nested: any = {
            where(c: string, op: any, v?: any) {
              if (v === undefined) {
                nestedFilters.push((row) => matchesWhere(row, c, op));
              } else if (op === '>') {
                nestedFilters.push((row) => new Date(row[c]).getTime() > new Date(v).getTime());
              } else {
                nestedFilters.push((row) => matchesWhere(row, c, v));
              }
              return nested;
            },
            andWhere(c: string, op: any, v?: any) {
              return nested.where(c, op, v);
            },
            orWhere(fn: any) {
              const orFilters: Array<(row: any) => boolean> = [];
              const orApi: any = {
                where(c: string, op: any, v?: any) {
                  if (v === undefined) orFilters.push((row) => matchesWhere(row, c, op));
                  else if (op === '>') orFilters.push((row) => new Date(row[c]).getTime() > new Date(v).getTime());
                  else orFilters.push((row) => matchesWhere(row, c, v));
                  return orApi;
                },
                andWhere(c: string, op: any, v?: any) {
                  return orApi.where(c, op, v);
                },
              };
              fn.call(orApi);
              nestedFilters.push((row) => orFilters.every((f) => f(row)) || orFilters.length === 0);
              // Fix: orWhere should OR the whole nested group
              const group = orFilters.slice();
              nestedFilters.pop();
              nestedFilters.push((row) => group.every((f) => f(row)));
              return nested;
            },
          };
          colOrObj.call(nested);
          // Interpret as: first where AND (orWhere group) — our cursor uses where > OR (where = AND id >)
          // Rebuild properly:
          state.filters.push((row) => {
            // The nested builder above is imperfect for OR; handle cursor in andWhere below instead.
            return nestedFilters.every((f) => f(row));
          });
          return api;
        }
        if (typeof colOrObj === 'object') {
          state.filters.push((row) =>
            Object.entries(colOrObj).every(([k, v]) => matchesWhere(row, k, v)),
          );
          return api;
        }
        if (maybeVal === undefined) {
          state.filters.push((row) => matchesWhere(row, colOrObj, opOrVal));
        } else if (opOrVal === '>=') {
          state.filters.push(
            (row) => new Date(row[colOrObj]).getTime() >= new Date(maybeVal).getTime(),
          );
        } else if (opOrVal === '>') {
          state.filters.push(
            (row) => new Date(row[colOrObj]).getTime() > new Date(maybeVal).getTime(),
          );
        } else {
          state.filters.push((row) => matchesWhere(row, colOrObj, maybeVal));
        }
        return api;
      },
      andWhere(colOrFn: any, op?: any, val?: any) {
        if (typeof colOrFn === 'function') {
          // Cursor: occurred_at > X OR (occurred_at = X AND id > Y)
          const parts: Array<(row: any) => boolean> = [];
          const nest: any = {
            where(c: string, op2: any, v?: any) {
              if (v === undefined) {
                parts.push((row) => matchesWhere(row, c, op2));
              } else if (op2 === '>') {
                parts.push((row) => {
                  const rv = row[c];
                  const rt = rv instanceof Date ? rv.getTime() : new Date(rv).getTime();
                  return rt > new Date(v).getTime();
                });
              } else {
                parts.push((row) => matchesWhere(row, c, v));
              }
              return nest;
            },
            orWhere(fn: any) {
              const orParts: Array<(row: any) => boolean> = [];
              const orNest: any = {
                where(c: string, op2: any, v?: any) {
                  if (v === undefined) orParts.push((row) => matchesWhere(row, c, op2));
                  else if (op2 === '>') {
                    orParts.push((row) => {
                      const rv = row[c];
                      const rt = rv instanceof Date ? rv.getTime() : new Date(rv).getTime();
                      return rt > new Date(v).getTime();
                    });
                  } else orParts.push((row) => matchesWhere(row, c, v));
                  return orNest;
                },
                andWhere(c: string, op2: any, v?: any) {
                  return orNest.where(c, op2, v);
                },
              };
              fn.call(orNest);
              parts.push((row) => orParts.every((f) => f(row)));
              return nest;
            },
          };
          colOrFn.call(nest);
          state.filters.push((row) => parts.some((f) => f(row)));
          return api;
        }
        return api.where(colOrFn, op, val);
      },
      orderBy(col: string, dir: 'asc' | 'desc' = 'asc') {
        state.orders.push({ col, dir });
        return api;
      },
      orderByRaw() {
        return api;
      },
      limit(n: number) {
        state.limitN = n;
        return api;
      },
      select(...cols: string[]) {
        state.selectCols = cols.length === 1 && Array.isArray(cols[0]) ? (cols[0] as string[]) : cols;
        return api;
      },
      first() {
        return Promise.resolve(apply()[0] || null);
      },
      insert(data: any) {
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) {
          if (
            table === 'access_sessions'
            && row.remote_command_id
            && trxStore.access_sessions.some((s) => s.remote_command_id === row.remote_command_id)
          ) {
            const err: any = new Error('Duplicate');
            err.code = 'ER_DUP_ENTRY';
            err.errno = 1062;
            return Promise.reject(err);
          }
          trxStore[table as 'activity_logs' | 'access_sessions'].push({ ...row });
        }
        return Promise.resolve([rows.length]);
      },
      update(patch: any) {
        const rows = apply();
        // Re-filter against full table without select/limit for update targets
        let targets = [...(trxStore as any)[table]];
        // Rebuild without select/limit — use filters only
        const filtered = targets.filter((row) => state.filters.every((f) => f(row)));
        for (const row of filtered) {
          Object.assign(row, patch);
        }
        return Promise.resolve(filtered.length);
      },
      then(resolve: any, reject?: any) {
        return Promise.resolve(apply()).then(resolve, reject);
      },
      catch(reject: any) {
        return Promise.resolve(apply()).catch(reject);
      },
      // Make `await query` always produce a real Promise (not only a thenable).
      [Symbol.toStringTag]: 'Promise',
    };
    // Ensure Promise.resolve(api) adopts the thenable
    return api;
  };

  const knex: any = (table: string) => buildQuery(table, store);
  knex.transaction = async (fn: (trx: any) => Promise<any>) => {
    const trx: any = (table: string) => buildQuery(table, store);
    trx.raw = knex.raw;
    return fn(trx);
  };
  knex.raw = async (sql: string) => {
    if (sql.includes('GET_LOCK')) {
      return [[{ lock_acquired: store.lockAcquired }]];
    }
    if (sql.includes('RELEASE_LOCK')) {
      return [[{}]];
    }
    return [[{}]];
  };
  return knex;
}

function seedActivity(partial: ActivitySeed) {
  return {
    facility_id: 'fac-1',
    unit_id: 'unit-1',
    device_id: 'dev-1',
    actor_type: 'user',
    actor_id: 'user-1',
    actor_name: 'Ada',
    result: 'success',
    result_message: null,
    access_session_id: null,
    metadata: {},
    ...partial,
  };
}

describe('AccessSessionBackfillService', () => {
  let store: Store;

  beforeEach(() => {
    AccessSessionBackfillService.resetInstanceForTests();
    store = {
      activity_logs: [],
      access_sessions: [],
      lockAcquired: 1,
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: createMemoryKnex(store),
    });
  });

  const run = (opts: { days?: number; dryRun?: boolean; skipAdvisoryLock?: boolean } = {}) =>
    AccessSessionBackfillService.getInstance().run({
      days: 90,
      skipAdvisoryLock: true,
      ...opts,
    });

  it('correlates remote grant + unlock + lock into one closed session', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.activity_logs = [
      seedActivity({
        id: 'a-grant',
        activity_type: 'access_attempt',
        occurred_at: t0,
        metadata: {
          action: 'remote_access_granted',
          remote_command_id: 'cmd-1',
          method: 'admin_remote',
        },
      }),
      seedActivity({
        id: 'a-unlock',
        activity_type: 'unlock',
        occurred_at: new Date(t0.getTime() + 5_000),
        metadata: { remote_command_id: 'cmd-1', correlated_remote: true, method: 'admin_remote' },
      }),
      seedActivity({
        id: 'a-lock',
        activity_type: 'lock',
        occurred_at: new Date(t0.getTime() + 65_000),
        metadata: {},
      }),
    ];

    const result = await run();
    expect(result.sessionsCreated).toBe(1);
    expect(result.activityLinks).toBe(3);
    expect(store.access_sessions).toHaveLength(1);
    expect(store.access_sessions[0].state).toBe('closed');
    expect(store.access_sessions[0].remote_command_id).toBe('cmd-1');
    expect(store.access_sessions[0].open_duration_sec).toBe(60);
    expect(store.activity_logs.every((a) => a.access_session_id === store.access_sessions[0].id)).toBe(
      true,
    );
  });

  it('creates open session for remote grant+unlock without lock', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.activity_logs = [
      seedActivity({
        id: 'a-grant',
        activity_type: 'access_attempt',
        occurred_at: t0,
        metadata: { action: 'remote_access_granted', remote_command_id: 'cmd-2', method: 'admin_remote' },
      }),
      seedActivity({
        id: 'a-unlock',
        activity_type: 'unlock',
        occurred_at: new Date(t0.getTime() + 2_000),
        metadata: { remote_command_id: 'cmd-2', correlated_remote: true },
      }),
    ];

    const result = await run();
    expect(result.sessionsCreated).toBe(1);
    expect(store.access_sessions[0].state).toBe('open');
    expect(store.access_sessions[0].opened_at).toBeTruthy();
    expect(store.access_sessions[0].closed_at).toBeNull();
  });

  it('does not downgrade live pending session from grant-only history', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.access_sessions = [
      {
        id: 'live-pending',
        device_id: 'dev-1',
        kind: 'access',
        state: 'pending',
        started_at: t0,
        opened_at: null,
        closed_at: null,
        remote_command_id: 'cmd-live',
        open_duration_sec: null,
        settled_at: t0,
      } satisfies SessionSeed,
    ];
    store.activity_logs = [
      seedActivity({
        id: 'a-grant',
        activity_type: 'access_attempt',
        occurred_at: t0,
        metadata: { action: 'remote_access_granted', remote_command_id: 'cmd-live', method: 'admin_remote' },
      }),
    ];

    const result = await run();
    expect(result.sessionsCreated).toBe(0);
    expect(result.activityLinks).toBe(1);
    expect(store.access_sessions[0].state).toBe('pending');
    expect(store.activity_logs[0].access_session_id).toBe('live-pending');
  });

  it('advances pending when unlock evidence arrives in backfill', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.access_sessions = [
      {
        id: 'live-pending',
        device_id: 'dev-1',
        kind: 'access',
        state: 'pending',
        started_at: t0,
        opened_at: null,
        closed_at: null,
        remote_command_id: 'cmd-adv',
        open_duration_sec: null,
      },
    ];
    store.activity_logs = [
      seedActivity({
        id: 'a-unlock',
        activity_type: 'unlock',
        occurred_at: new Date(t0.getTime() + 3_000),
        metadata: { remote_command_id: 'cmd-adv', correlated_remote: true },
      }),
    ];

    const result = await run();
    expect(result.sessionsUpdated).toBe(1);
    expect(store.access_sessions[0].state).toBe('open');
    expect(store.activity_logs[0].access_session_id).toBe('live-pending');
  });

  it('attaches orphan lock to host session; synthesizes when none', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.access_sessions = [
      {
        id: 'host-open',
        device_id: 'dev-1',
        kind: 'access',
        state: 'open',
        started_at: t0,
        opened_at: t0,
        closed_at: null,
        open_duration_sec: null,
        remote_command_id: null,
      },
    ];
    store.activity_logs = [
      seedActivity({
        id: 'lock-1',
        activity_type: 'lock',
        occurred_at: new Date(t0.getTime() + 30_000),
      }),
      seedActivity({
        id: 'lock-orphan',
        activity_type: 'lock',
        device_id: 'dev-2',
        occurred_at: new Date(t0.getTime() + 40_000),
      }),
    ];

    const result = await run();
    expect(result.locksAttached).toBe(1);
    expect(result.locksSynthesized).toBe(1);
    expect(store.access_sessions.find((s) => s.id === 'host-open')?.state).toBe('closed');
    expect(store.access_sessions.some((s) => s.device_id === 'dev-2' && s.origin === 'local')).toBe(
      true,
    );
  });

  it('dry-run mirrors lock attach vs synthesize counts without writing', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.activity_logs = [
      seedActivity({
        id: 'u1',
        activity_type: 'unlock',
        occurred_at: t0,
        metadata: { method: 'keypad' },
      }),
      seedActivity({
        id: 'l1',
        activity_type: 'lock',
        occurred_at: new Date(t0.getTime() + 10_000),
      }),
      seedActivity({
        id: 'l2',
        activity_type: 'lock',
        device_id: 'dev-orphan',
        occurred_at: new Date(t0.getTime() + 20_000),
      }),
    ];

    const dry = await run({ dryRun: true });
    expect(dry.sessionsCreated).toBe(2); // unlock session + synthesized orphan lock
    expect(dry.locksAttached).toBe(1);
    expect(dry.locksSynthesized).toBe(1);
    expect(store.access_sessions).toHaveLength(0);
    expect(store.activity_logs.every((a) => a.access_session_id == null)).toBe(true);

    const wet = await run({ dryRun: false });
    expect(wet.sessionsCreated).toBe(dry.sessionsCreated);
    expect(wet.locksAttached).toBe(dry.locksAttached);
    expect(wet.locksSynthesized).toBe(dry.locksSynthesized);
    expect(wet.activityLinks).toBe(dry.activityLinks);
  });

  it('is idempotent on re-run after linking', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.activity_logs = [
      seedActivity({
        id: 'denial',
        activity_type: 'access_attempt',
        result: 'failure',
        occurred_at: t0,
        metadata: { method: 'keypad', denial_reason: 'invalid_code' },
      }),
    ];

    const first = await run();
    expect(first.sessionsCreated).toBe(1);
    const second = await run();
    expect(second.unlinkedActivityRows).toBe(0);
    expect(second.sessionsCreated).toBe(0);
    expect(store.access_sessions).toHaveLength(1);
    expect(store.access_sessions[0].state).toBe('denied');
  });

  it('recovers from unique remote_command_id conflict by linking', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    // Pre-insert so insert() hits ER_DUP_ENTRY when backfill tries to create.
    store.access_sessions = [
      {
        id: 'raced',
        device_id: 'dev-1',
        kind: 'access',
        state: 'pending',
        started_at: t0,
        opened_at: null,
        closed_at: null,
        remote_command_id: 'cmd-race',
      },
    ];
    store.activity_logs = [
      seedActivity({
        id: 'g1',
        activity_type: 'access_attempt',
        occurred_at: t0,
        metadata: { action: 'remote_access_granted', remote_command_id: 'cmd-race' },
      }),
      seedActivity({
        id: 'u1',
        activity_type: 'unlock',
        occurred_at: new Date(t0.getTime() + 1_000),
        metadata: { remote_command_id: 'cmd-race', correlated_remote: true },
      }),
    ];

    // findSessionByRemoteCommand will find existing — so no insert race.
    // Force race: clear remote lookup by using a row that insert hits after concurrent insert.
    // Simulate by removing existing detection: delete session after load would find it —
    // Instead: insert during transaction via unique check only — existing path finds it.
    // Use grant-only insert path with session that appears only at insert time:
    store.access_sessions = [];
    const knex = createMemoryKnex(store);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });

    // Inject session mid-flight: wrap insert to add competing row first once.
    let injected = false;
    const originalTable = knex;
    const wrapped: any = (table: string) => {
      const q = originalTable(table);
      if (table === 'access_sessions') {
        const origInsert = q.insert.bind(q);
        q.insert = async (data: any) => {
          if (!injected && data?.remote_command_id === 'cmd-race') {
            injected = true;
            store.access_sessions.push({
              id: 'winner',
              device_id: 'dev-1',
              kind: 'access',
              state: 'pending',
              started_at: t0,
              remote_command_id: 'cmd-race',
              opened_at: null,
              closed_at: null,
            });
          }
          return origInsert(data);
        };
      }
      return q;
    };
    wrapped.transaction = async (fn: any) => {
      const trx: any = (table: string) => wrapped(table);
      return fn(trx);
    };
    wrapped.raw = knex.raw;
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: wrapped });
    AccessSessionBackfillService.resetInstanceForTests();

    const result = await run();
    expect(result.skippedErrors).toBe(0);
    expect(store.activity_logs.filter((a) => a.access_session_id === 'winner').length).toBeGreaterThan(0);
    expect(store.access_sessions.filter((s) => s.remote_command_id === 'cmd-race')).toHaveLength(1);
  });

  it('skips rows without device_id and reports metric', async () => {
    store.activity_logs = [
      seedActivity({
        id: 'no-dev',
        activity_type: 'unlock',
        device_id: null,
        occurred_at: new Date('2026-06-01T10:00:00Z'),
      }),
    ];
    const result = await run();
    expect(result.skippedNoDevice).toBe(1);
    expect(result.sessionsCreated).toBe(0);
  });

  it('returns skippedBusy when advisory lock is held', async () => {
    store.lockAcquired = 0;
    AccessSessionBackfillService.resetInstanceForTests();
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: createMemoryKnex(store),
    });
    const result = await AccessSessionBackfillService.getInstance().run({
      days: 30,
      skipAdvisoryLock: false,
    });
    expect(result.skippedBusy).toBe(true);
    expect(result.sessionsCreated).toBe(0);
  });

  it('nulls facility/unit on FK failure and continues', async () => {
    const t0 = new Date('2026-06-01T10:00:00Z');
    store.activity_logs = [
      seedActivity({
        id: 'fk-row',
        activity_type: 'access_attempt',
        result: 'failure',
        facility_id: 'missing-fac',
        unit_id: 'missing-unit',
        occurred_at: t0,
        metadata: { method: 'keypad', denial_reason: 'invalid_code' },
      }),
    ];

    const knex = createMemoryKnex(store);
    const wrapped: any = (table: string) => {
      const q = knex(table);
      if (table === 'access_sessions') {
        const origInsert = q.insert.bind(q);
        q.insert = async (data: any) => {
          if (data.facility_id === 'missing-fac') {
            const err: any = new Error('FK');
            err.code = 'ER_NO_REFERENCED_ROW_2';
            err.errno = 1452;
            return Promise.reject(err);
          }
          return origInsert(data);
        };
      }
      return q;
    };
    wrapped.transaction = async (fn: any) => {
      const trx: any = (t: string) => wrapped(t);
      return fn(trx);
    };
    wrapped.raw = knex.raw;
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: wrapped });
    AccessSessionBackfillService.resetInstanceForTests();

    const result = await run();
    expect(result.sessionsCreated).toBe(1);
    expect(store.access_sessions[0].facility_id).toBeNull();
    expect(store.access_sessions[0].unit_id).toBeNull();
  });
});
