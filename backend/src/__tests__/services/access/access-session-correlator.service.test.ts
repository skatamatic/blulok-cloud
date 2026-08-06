/**
 * Access session correlator scenario matrix.
 * Uses an in-memory fake model to avoid DB coupling.
 */

jest.mock('@/models/access-session.model', () => {
  const store: any[] = [];
  let seq = 0;

  const parse = (row: any) => ({
    ...row,
    attempt_count: Number(row.attempt_count) || 1,
    metadata: row.metadata
      ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata)
      : null,
  });

  class AccessSessionModel {
    async create(data: any) {
      const id = `session-${++seq}`;
      const now = data.started_at || new Date();
      const row = {
        id,
        facility_id: data.facility_id || null,
        unit_id: data.unit_id || null,
        device_id: data.device_id,
        device_type: data.device_type || 'blulok',
        gateway_id: data.gateway_id || null,
        kind: data.kind || 'access',
        origin: data.origin,
        method: data.method,
        outcome: data.outcome ?? null,
        state: data.state,
        actor_type: data.actor_type || null,
        actor_id: data.actor_id || null,
        actor_name: data.actor_name || null,
        actor_role: data.actor_role || null,
        denial_reason: data.denial_reason || null,
        reason_message: data.reason_message || null,
        started_at: now,
        opened_at: data.opened_at || null,
        closed_at: data.closed_at || null,
        expires_at: data.expires_at || null,
        settled_at: data.settled_at || null,
        open_duration_sec: data.open_duration_sec ?? null,
        attempt_count: data.attempt_count ?? 1,
        remote_command_id: data.remote_command_id || null,
        correlation_id: data.correlation_id || null,
        metadata: data.metadata || null,
        created_at: now,
        updated_at: now,
      };
      store.push(row);
      return parse(row);
    }

    async findById(id: string) {
      const row = store.find((s) => s.id === id);
      return row ? parse(row) : null;
    }

    async update(id: string, data: any) {
      const idx = store.findIndex((s) => s.id === id);
      if (idx < 0) return null;
      store[idx] = { ...store[idx], ...data, updated_at: new Date() };
      return parse(store[idx]);
    }

    async findOpenByDevice(deviceId: string) {
      const rows = store
        .filter((s) => s.device_id === deviceId && s.state === 'open')
        .sort((a, b) => (b.opened_at || b.started_at).getTime() - (a.opened_at || a.started_at).getTime());
      return rows[0] ? parse(rows[0]) : null;
    }

    async findLatestUnlockSessionByDevice(deviceId: string) {
      const rank = (state: string) => {
        if (state === 'open') return 0;
        if (state === 'pending') return 1;
        if (state === 'closed') return 2;
        return 3;
      };
      const rows = store
        .filter((s) => s.device_id === deviceId && s.kind === 'access' && s.state !== 'denied')
        .sort((a, b) => {
          const rd = rank(a.state) - rank(b.state);
          if (rd !== 0) return rd;
          return b.started_at.getTime() - a.started_at.getTime();
        });
      return rows[0] ? parse(rows[0]) : null;
    }

    async findPendingByDevice(deviceId: string) {
      const rows = store
        .filter((s) => s.device_id === deviceId && s.state === 'pending')
        .sort((a, b) => b.started_at.getTime() - a.started_at.getTime());
      return rows[0] ? parse(rows[0]) : null;
    }

    async findPendingByRemoteCommandId(remoteCommandId: string) {
      const row = store.find(
        (s) => s.remote_command_id === remoteCommandId && s.state === 'pending',
      );
      return row ? parse(row) : null;
    }

    async findExpiredPending(now: Date = new Date()) {
      return store
        .filter((s) => s.state === 'pending' && s.expires_at && s.expires_at <= now)
        .map(parse);
    }

    static _reset() {
      store.length = 0;
      seq = 0;
    }
  }

  return { AccessSessionModel, __store: store, __reset: AccessSessionModel._reset };
});

import { AccessSessionCorrelator } from '@/services/access/access-session-correlator.service';

const mockModule = jest.requireMock('@/models/access-session.model') as {
  __reset: () => void;
};

describe('AccessSessionCorrelator', () => {
  let correlator: AccessSessionCorrelator;

  beforeEach(() => {
    mockModule.__reset();
    correlator = new AccessSessionCorrelator();
  });

  it('creates pending cloud remote unlock session', async () => {
    const session = await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-1',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(session.state).toBe('pending');
    expect(session.origin).toBe('cloud_remote');
    expect(session.remote_command_id).toBe('cmd-1');
  });

  it('opens pending remote session on unlock and closes on lock with duration', async () => {
    await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-1',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const openedAt = new Date('2026-08-04T22:00:00.000Z');
    const open = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      remoteCommandId: 'cmd-1',
      method: 'local_device',
      occurredAt: openedAt,
    });
    expect(open.state).toBe('open');
    expect(open.method).toBe('admin_remote');
    expect(open.opened_at?.toISOString()).toBe(openedAt.toISOString());

    const closedAt = new Date('2026-08-04T22:04:12.000Z');
    const closed = await correlator.onDeviceLocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      occurredAt: closedAt,
    });
    expect(closed.state).toBe('closed');
    expect(closed.open_duration_sec).toBe(252);
  });

  it('coalesces repeat grants into an open session', async () => {
    const openedAt = new Date();
    await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'HQ Admin', role: 'admin' },
      occurredAt: openedAt,
    });
    // Force method to mobile_key on open session via grant coalescing path:
    // create open with matching method by updating through grant after open with same actor/method
    const open = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'HQ Admin', role: 'admin' },
    });
    // First grant while open with different method creates pending; unlock local already open.
    // Create a proper open with mobile_key:
    mockModule.__reset();
    correlator = new AccessSessionCorrelator();
    const local = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'HQ Admin', role: 'admin' },
    });
    expect(local.state).toBe('open');
    expect(local.method).toBe('mobile_key');

    const coalesced = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'HQ Admin', role: 'admin' },
    });
    expect(coalesced.id).toBe(local.id);
    expect(coalesced.attempt_count).toBe(2);

    const again = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'HQ Admin', role: 'admin' },
    });
    expect(again.id).toBe(local.id);
    expect(again.attempt_count).toBe(3);
    expect(open).toBeTruthy();
  });

  it('creates terminal denied session that does not coalesce', async () => {
    const a = await correlator.onDenialAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'keypad',
      denialReason: 'out_of_schedule',
      reasonMessage: 'Out of schedule',
    });
    const b = await correlator.onDenialAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'keypad',
      denialReason: 'invalid_credential',
    });
    expect(a.state).toBe('denied');
    expect(b.state).toBe('denied');
    expect(a.id).not.toBe(b.id);
  });

  it('attaches stray lock to a local access session (never lock_only)', async () => {
    const locked = await correlator.onDeviceLocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
    });
    expect(locked.kind).toBe('access');
    expect(locked.state).toBe('closed');
    expect(locked.opened_at).toBeTruthy();
    expect(locked.closed_at).toBeTruthy();
  });

  it('closes an open unlock session on lock', async () => {
    await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'local_device',
    });
    const locked = await correlator.onDeviceLocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
    });
    expect(locked.kind).toBe('access');
    expect(locked.state).toBe('closed');
    expect(locked.open_duration_sec).toBeGreaterThanOrEqual(0);
  });

  it('times out expired pending sessions', async () => {
    await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-timeout',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() - 1000),
    });
    const expired = await correlator.expirePendingSessions(new Date());
    expect(expired).toHaveLength(1);
    expect(expired[0].state).toBe('timed_out');
    expect(expired[0].outcome).toBe('failed');
  });

  it('fails pending session on settlement mismatch', async () => {
    await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-fail',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    const failed = await correlator.failOrTimeout({
      remoteCommandId: 'cmd-fail',
      state: 'failed',
      denialReason: 'settlement_mismatch',
      reasonMessage: 'Device remained locked',
    });
    expect(failed?.state).toBe('failed');
    expect(failed?.denial_reason).toBe('settlement_mismatch');
  });

  it('attaches on-site grant to pending cloud session', async () => {
    const pending = await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-attach',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    const attached = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
    });
    expect(attached.id).toBe(pending.id);
    expect(attached.attempt_count).toBe(2);
  });

  it('confirmLockedIfLive closes pending without synthesizing when already locked', async () => {
    const pending = await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-same-state-lock',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    const closed = await correlator.confirmLockedIfLive({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
    });
    expect(closed?.id).toBe(pending.id);
    expect(closed?.state).toBe('closed');

    const noop = await correlator.confirmLockedIfLive({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
    });
    expect(noop).toBeNull();
  });

  it('prefers pending cloud_remote attach over absorbing a concurrent local open', async () => {
    const local = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'local_device',
    });
    expect(local.state).toBe('open');

    const pending = await correlator.onCloudRemoteUnlockIssued({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      commandId: 'cmd-prefer-pending',
      method: 'admin_remote',
      deviceType: 'blulok',
      initiator: { type: 'user', id: 'u1', name: 'Admin', role: 'admin' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const attached = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u2', name: 'Tenant', role: 'tenant' },
    });

    expect(attached.id).toBe(pending.id);
    expect(attached.id).not.toBe(local.id);
    expect(attached.state).toBe('pending');
    expect(attached.attempt_count).toBe(2);
    expect(attached.origin).toBe('cloud_remote');
  });

  it('opens pending mobile_key grant without overwriting method to local_device', async () => {
    const pending = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'FM', role: 'facility_admin' },
    });
    expect(pending.state).toBe('pending');
    expect(pending.method).toBe('mobile_key');

    const opened = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'local_device',
    });
    expect(opened.id).toBe(pending.id);
    expect(opened.state).toBe('open');
    expect(opened.method).toBe('mobile_key');
    expect(opened.actor_id).toBe('u1');
    expect(opened.actor_name).toBe('FM');
  });

  it('absorbs recent local open into a later mobile_key grant (unlock-before-grant)', async () => {
    const openedAt = new Date();
    const local = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'local_device',
      occurredAt: openedAt,
    });
    expect(local.origin).toBe('local');
    expect(local.method).toBe('local_device');

    const granted = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'FM', role: 'facility_admin' },
      occurredAt: new Date(openedAt.getTime() + 200),
    });

    expect(granted.id).toBe(local.id);
    expect(granted.state).toBe('open');
    expect(granted.origin).toBe('on_site');
    expect(granted.method).toBe('mobile_key');
    expect(granted.actor_id).toBe('u1');
    expect(granted.actor_name).toBe('FM');
  });

  it('does not absorb a stale local open into a new grant', async () => {
    const staleOpenAt = new Date(Date.now() - 5 * 60_000);
    const local = await correlator.onDeviceUnlocked({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'local_device',
      occurredAt: staleOpenAt,
    });

    const granted = await correlator.onGrantAccessEvent({
      facilityId: 'fac-1',
      deviceId: 'dev-1',
      deviceType: 'blulok',
      method: 'mobile_key',
      actor: { type: 'user', id: 'u1', name: 'FM', role: 'facility_admin' },
    });

    expect(granted.id).not.toBe(local.id);
    expect(granted.state).toBe('pending');
    expect(granted.method).toBe('mobile_key');
  });
});
