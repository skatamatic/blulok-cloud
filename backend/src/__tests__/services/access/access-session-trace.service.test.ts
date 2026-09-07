import { AccessSessionTraceService } from '@/services/access/access-session-trace.service';

const mockFindWithContextSessions = jest.fn();
const mockFindWithContextActivity = jest.fn();
const mockFindBluLok = jest.fn();
const mockFindAc = jest.fn();
const mockGatewayFind = jest.fn();
const mockListPending = jest.fn();

jest.mock('@/models/access-session.model', () => ({
  AccessSessionModel: jest.fn().mockImplementation(() => ({
    findWithContext: mockFindWithContextSessions,
  })),
}));

jest.mock('@/models/activity-log.model', () => ({
  ActivityLogModel: jest.fn().mockImplementation(() => ({
    findWithContext: mockFindWithContextActivity,
  })),
}));

jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    findBluLokDevices: mockFindBluLok,
    findAccessControlDevices: mockFindAc,
  })),
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: mockGatewayFind,
  })),
}));

jest.mock('@/services/lock-command.service', () => ({
  LockCommandService: {
    getInstance: () => ({
      listPendingAttributions: mockListPending,
    }),
  },
}));

describe('AccessSessionTraceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AccessSessionTraceService.resetForTests();
    mockGatewayFind.mockResolvedValue({
      id: 'gw-1',
      name: 'GW',
      facility_id: 'fac-1',
      status: 'online',
    });
    mockFindBluLok.mockResolvedValue([
      {
        id: 'dev-1',
        device_serial: 'BL-1',
        unit_id: 'unit-1',
        unit_number: '102',
        lock_status: 'locked',
        device_status: 'online',
        gateway_id: 'gw-1',
      },
    ]);
    mockFindAc.mockResolvedValue([]);
    mockFindWithContextSessions.mockResolvedValue([
      {
        id: 's1',
        facility_id: 'fac-1',
        unit_id: 'unit-1',
        unit_number: '102',
        device_id: 'dev-1',
        device_type: 'blulok',
        gateway_id: 'gw-1',
        state: 'pending',
        origin: 'on_site',
        method: 'mobile_key',
        actor_id: 'u1',
        actor_name: 'Tester One',
        actor_user_email: 't1@blulok.com',
        started_at: new Date('2026-08-12T19:21:00.000Z'),
        metadata: { coalesced_pending_grant: true },
      },
    ]);
    mockFindWithContextActivity.mockResolvedValue([]);
    mockListPending.mockReturnValue([]);
  });

  it('builds a snapshot with lookups and records correlator decisions', async () => {
    const svc = AccessSessionTraceService.getInstance();
    svc.recordCorrelatorDecision({
      hook: 'grant',
      session: {
        id: 's1',
        facility_id: 'fac-1',
        unit_id: 'unit-1',
        device_id: 'dev-1',
        device_type: 'blulok',
        gateway_id: 'gw-1',
        kind: 'access',
        origin: 'on_site',
        method: 'mobile_key',
        outcome: 'granted',
        state: 'pending',
        actor_type: 'user',
        actor_id: 'u1',
        actor_name: 'Tester One',
        actor_role: 'tenant',
        denial_reason: null,
        reason_message: null,
        started_at: new Date(),
        opened_at: null,
        closed_at: null,
        expires_at: null,
        settled_at: null,
        open_duration_sec: null,
        attempt_count: 2,
        remote_command_id: null,
        correlation_id: null,
        metadata: { coalesced_pending_grant: true },
        created_at: new Date(),
        updated_at: new Date(),
      },
      params: { facilityId: 'fac-1', deviceId: 'dev-1', method: 'mobile_key' },
    });

    const snapshot = await svc.snapshot({
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
    });

    expect(snapshot.live_sessions).toHaveLength(1);
    expect(snapshot.lookups.devices['dev-1'].unit_number).toBe('102');
    expect(snapshot.lookups.users['u1'].email).toBe('t1@blulok.com');
    expect(snapshot.correlator_decisions[0].decision).toBe('coalesce_repeat_on_site_pending');
    expect(snapshot.lock_states[0].lock_status).toBe('locked');
    expect(snapshot.rules.length).toBeGreaterThan(0);
  });
});
