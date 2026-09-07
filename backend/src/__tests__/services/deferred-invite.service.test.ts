/**
 * Deferred invite bookkeeping — reopen after resolve + claim race helpers.
 */

const rows = new Map<string, any>();

function makeQuery() {
  const state: {
    filters: Record<string, unknown>;
    nullResolved?: boolean;
  } = { filters: {} };

  const api: any = {
    where(arg: any, val?: unknown) {
      if (typeof arg === 'object') {
        Object.assign(state.filters, arg);
      } else if (val !== undefined) {
        state.filters[arg] = val;
      }
      return api;
    },
    whereNull(col: string) {
      if (col === 'resolved_at') state.nullResolved = true;
      return api;
    },
    first: jest.fn(async () => {
      for (const row of rows.values()) {
        if (state.filters.user_id && row.user_id !== state.filters.user_id) continue;
        if (state.filters.id && row.id !== state.filters.id) continue;
        if (state.nullResolved && row.resolved_at != null) continue;
        return { ...row };
      }
      return undefined;
    }),
    update: jest.fn(async (patch: Record<string, unknown>) => {
      let count = 0;
      for (const [id, row] of rows.entries()) {
        if (state.filters.id && row.id !== state.filters.id) continue;
        if (state.filters.user_id && row.user_id !== state.filters.user_id) continue;
        if (state.nullResolved && row.resolved_at != null) continue;
        rows.set(id, { ...row, ...patch });
        count += 1;
      }
      return count;
    }),
    insert: jest.fn(async (data: Record<string, unknown>) => {
      const id = 'def-new';
      rows.set(id, { id, resolved_at: null, resolved_reason: null, ...data });
      return [id];
    }),
  };
  return api;
}

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: Object.assign((table: string) => {
        if (table !== 'deferred_user_invites') throw new Error(`unexpected table ${table}`);
        return makeQuery();
      }, {
        fn: { now: () => 'NOW' },
      }),
    }),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { DeferredInviteService } from '@/services/notifications/deferred-invite.service';

describe('DeferredInviteService', () => {
  beforeEach(() => {
    rows.clear();
  });

  it('reopens a previously resolved row instead of inserting a duplicate', async () => {
    rows.set('def-1', {
      id: 'def-1',
      user_id: 'u1',
      facility_id: 'fac-old',
      reason: 'policy_none',
      resolved_at: new Date(),
      resolved_reason: 'manual_invite',
    });

    const row = await DeferredInviteService.getInstance().recordDeferredInvite({
      userId: 'u1',
      facilityId: 'fac-new',
      reason: 'awaiting_blulok_device',
    });

    expect(row.id).toBe('def-1');
    expect(row.facility_id).toBe('fac-new');
    expect(row.reason).toBe('awaiting_blulok_device');
    expect(row.resolved_at).toBeNull();
    expect(rows.size).toBe(1);
  });

  it('tryClaimPending only succeeds once', async () => {
    rows.set('def-1', {
      id: 'def-1',
      user_id: 'u1',
      facility_id: 'fac-1',
      reason: 'awaiting_blulok_device',
      resolved_at: null,
      resolved_reason: null,
    });

    const svc = DeferredInviteService.getInstance();
    expect(await svc.tryClaimPending('def-1', 'device_assigned')).toBe(true);
    expect(await svc.tryClaimPending('def-1', 'tenant_assigned')).toBe(false);
  });
});
