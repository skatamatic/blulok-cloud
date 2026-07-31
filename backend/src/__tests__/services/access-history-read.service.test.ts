import { AccessHistoryReadService } from '@/services/access/access-history-read.service';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';
import { AccessLogModel } from '@/models/access-log.model';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/activity-log.model');
jest.mock('@/services/access/access-event-scope.service');
jest.mock('@/models/access-log.model');

describe('AccessHistoryReadService', () => {
  const mockFindWithContext = jest.fn();
  const mockCount = jest.fn();
  const mockFindById = jest.fn();
  const mockBuildScope = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (ActivityLogModel as unknown as jest.Mock).mockImplementation(() => ({
      findWithContext: mockFindWithContext,
      count: mockCount,
      findById: mockFindById,
    }));
    (AccessEventScopeService as unknown as jest.Mock).mockImplementation(() => ({
      buildScope: mockBuildScope,
    }));
    (AccessLogModel as unknown as jest.Mock).mockImplementation(() => ({
      findById: jest.fn().mockResolvedValue(null),
      findAll: jest.fn(),
    }));
    mockBuildScope.mockResolvedValue({});
    mockCount.mockResolvedValue(2);
  });

  it('maps lock activity_type to lock action when filtering', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-1',
        activity_type: 'lock',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'gateway',
        actor_name: 'Gateway',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'blulok' },
        device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
        blulok_device_settings: { displayName: 'Front Gate Lock' },
        facility_name: 'Petrolia Storage Facility',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'lock' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('lock');
    expect(result.logs[0].method).toBe('local_device');
    expect(result.logs[0].device_name).toBe('Front Gate Lock');
    expect(result.logs[0].metadata?.actor).toEqual({ type: 'gateway', name: 'Gateway' });
    expect(result.logs[0].metadata?.device).toMatchObject({ name: 'Front Gate Lock' });
  });

  it('resolves BluLok unit number when assigned (never lock number)', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-lock-number',
        activity_type: 'lock',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'gateway',
        actor_name: 'Gateway',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'blulok' },
        device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
        blulok_device_settings: { lockNumber: 106 },
        unit_number: '106',
        facility_name: 'Petrolia Storage Facility',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'lock' });
    expect(result.logs[0].device_name).toBe('106');
  });

  it('resolves Unassigned serial prefix when BluLok has no unit', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-unassigned',
        activity_type: 'lock',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'gateway',
        actor_name: 'Gateway',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'blulok' },
        device_serial: 'SN987654321',
        blulok_device_settings: { lockNumber: 106 },
        facility_name: 'Petrolia Storage Facility',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'lock' });
    expect(result.logs[0].device_name).toBe('Unassigned - 98765');
  });

  it('uses access-control join when metadata wrongly says blulok (HQ Admin route_pass case)', async () => {
    // Mirrors deployed row: device_id is an AC cloud UUID, but ingest stored device_type=blulok.
    // BluLok join misses (no serial) → old code rendered "Unassigned - ?????".
    mockFindWithContext.mockResolvedValue([
      {
        id: '9632b7eb-5745-44a0-bf23-dcd6e07d9599',
        activity_type: 'access_attempt',
        entity_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        device_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        facility_id: 'a7333c15-5ca8-4790-9860-e0dd44e3c581',
        actor_type: 'user',
        actor_id: 'd9aaf16d-a228-488b-b2b4-066f88e8f6b9',
        actor_name: 'HQ Admin',
        result: 'success',
        occurred_at: new Date('2026-07-28T22:23:10.000Z'),
        created_at: new Date('2026-07-28T22:23:09.000Z'),
        updated_at: new Date('2026-07-28T22:23:09.000Z'),
        metadata: {
          action: 'access_granted',
          method: 'route_pass',
          device_type: 'blulok',
          event_id: 'gateway-mobile-7917bfe6-6ac4-4e39-ae91-80138c7d3ed2',
          actor: {
            user_id: 'd9aaf16d-a228-488b-b2b4-066f88e8f6b9',
            role: 'admin',
            name: 'HQ Admin',
          },
        },
        actor_user_first_name: 'HQ',
        actor_user_last_name: 'Admin',
        actor_user_email: 'hqadmin@blulok.com',
        facility_name: 'BluLok HQ',
        device_serial: null,
        blulok_device_settings: null,
        unit_number: null,
        access_control_device_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        access_control_device_name: 'Main Entrance',
        access_control_device_serial: 'KP-HQ-1',
        device_location: 'Lobby',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    const log = result.logs[0];

    expect(log.device_name).toBe('Main Entrance');
    expect(log.device_type).toBe('access_control');
    expect(log.device_name).not.toBe('Unassigned - ?????');
    expect(log.metadata?.device).toMatchObject({
      id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
      name: 'Main Entrance',
      type: 'access_control',
      navigation_url: '/devices/access-control/f759bd50-a70e-5bba-81c5-25e9a7c695c1',
    });
  });

  it('enriches legacy rows that stored AC hardware serial as device_id', async () => {
    const serial = 'f759bd50-a70e-5bba-81c5-25e9a7c695c1';
    const cloudId = 'cloud-ac-keypad-1';
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-serial-legacy',
        activity_type: 'access_attempt',
        entity_id: serial,
        device_id: serial,
        facility_id: 'fac-hq',
        actor_type: 'user',
        actor_id: 'user-hq',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'keypad_attempt',
          method: 'keypad',
          device_type: 'blulok',
        },
        device_serial: null,
        blulok_device_settings: null,
        access_control_device_id: cloudId,
        access_control_device_name: 'Keypad-f759bd50',
        access_control_device_serial: serial,
        device_location: 'Gateway relay 1',
        facility_name: 'BluLok HQ',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    const log = result.logs[0];

    expect(log.device_id).toBe(cloudId);
    expect(log.device_name).toBe('Keypad-f759bd50');
    expect(log.device_type).toBe('access_control');
    expect(log.metadata?.device).toMatchObject({
      id: cloudId,
      name: 'Keypad-f759bd50',
      serial,
      navigation_url: `/devices/access-control/${cloudId}`,
    });
  });

  it('does not invent Unassigned - ????? when neither device table joins', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-orphan-device',
        activity_type: 'access_attempt',
        entity_id: 'missing-device',
        device_id: 'missing-device',
        actor_type: 'user',
        actor_id: 'user-9',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'access_granted',
          method: 'route_pass',
          device_type: 'blulok',
        },
        device_serial: null,
        blulok_device_settings: null,
        access_control_device_name: null,
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    expect(result.logs[0].device_name).toBeUndefined();
    expect(result.logs[0].device_name).not.toBe('Unassigned - ?????');
  });

  it('resolves route-pass actor display name from joined user record', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-route-pass',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_id: 'user-9',
        actor_name: '13a907c7-8537-459a-be49-ff30cfc0083f',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'access_granted',
          method: 'route_pass',
          device_type: 'blulok',
          actor: {
            user_id: 'user-9',
            role: 'tenant',
            name: '13a907c7-8537-459a-be49-ff30cfc0083f',
          },
        },
        actor_user_first_name: 'Alex',
        actor_user_last_name: 'Tenant',
        actor_user_email: 'alex@example.com',
        device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
        blulok_device_settings: { lockNumber: 12 },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    expect(result.logs[0].user_name).toBe('Alex Tenant');
    expect(result.logs[0].user_email).toBe('alex@example.com');
    expect(result.logs[0].metadata?.user).toMatchObject({
      id: 'user-9',
      name: 'Alex Tenant',
      email: 'alex@example.com',
    });
  });

  it('ignores gateway Unknown User placeholders and falls back to email', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-placeholder',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_id: 'user-9',
        actor_name: 'Unknown User',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'access_granted',
          method: 'mobile_key',
          device_type: 'blulok',
          event_id: 'evt-placeholder-1',
          actor: {
            user_id: 'user-9',
            role: 'unknown',
            name: 'Unknown User',
          },
        },
        actor_user_first_name: null,
        actor_user_last_name: null,
        actor_user_email: 'casey@example.com',
        device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    expect(result.logs[0].user_name).toBe('casey@example.com');
    expect(result.logs[0].metadata?.event_id).toBe('evt-placeholder-1');
  });

  it('uses end-of-day UTC for date-only date_to filters', async () => {
    mockFindWithContext.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const mockFindAll = jest.fn().mockResolvedValue({ logs: [], total: 0 });
    (AccessLogModel as unknown as jest.Mock).mockImplementation(() => ({
      findById: jest.fn().mockResolvedValue(null),
      findAll: mockFindAll,
    }));

    const service = new AccessHistoryReadService();
    await service.query('user-1', UserRole.ADMIN, undefined, {
      date_from: '2026-06-16',
      date_to: '2026-06-16',
    });

    expect(mockFindWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        from_date: new Date('2026-06-16T00:00:00.000Z'),
        to_date: new Date('2026-06-16T23:59:59.999Z'),
      }),
    );
  });

  it('parses full ISO date_from/date_to without UTC day expansion', async () => {
    mockFindWithContext.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const mockFindAll = jest.fn().mockResolvedValue({ logs: [], total: 0 });
    (AccessLogModel as unknown as jest.Mock).mockImplementation(() => ({
      findById: jest.fn().mockResolvedValue(null),
      findAll: mockFindAll,
    }));

    const from = '2026-06-16T04:00:00.000Z';
    const to = '2026-06-17T03:59:59.999Z';
    const service = new AccessHistoryReadService();
    await service.query('user-1', UserRole.ADMIN, undefined, {
      date_from: from,
      date_to: to,
    });

    expect(mockFindWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        from_date: new Date(from),
        to_date: new Date(to),
      }),
    );
  });

  it('maps access_denied to unlock_attempt with failure summary', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-denied',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_name: 'Tenant User',
        actor_id: 'user-1',
        result: 'failure',
        result_message: 'Access denied: out of schedule window',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'access_denied',
          method: 'app',
          denial_reason: 'out_of_schedule',
          device_type: 'blulok',
        },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    expect(result.logs[0].action).toBe('unlock_attempt');
    expect(result.logs[0].metadata?.failure_summary).toContain('Out of schedule');
  });

  it('preserves redacted keypad metadata in presentation layer', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-keypad',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        result: 'failure',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'keypad_attempt',
          method: 'keypad',
          denial_reason: 'out_of_schedule',
          device_type: 'blulok',
          keypad: {
            entered_code: '***REDACTED***',
            schedule_name: 'Night Schedule',
          },
        },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, {});
    expect(result.logs[0].action).toBe('unlock_attempt');
    expect(result.logs[0].method).toBe('keypad');
    expect(result.logs[0].metadata?.keypad).toMatchObject({
      entered_code: '***REDACTED***',
      schedule_name: 'Night Schedule',
    });
  });

  it('treats access_denied filter as unlock_attempt alias', async () => {
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-denied',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_name: 'Tenant User',
        actor_id: 'user-1',
        result: 'failure',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'access_denied',
          method: 'app',
          device_type: 'blulok',
        },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'access_denied' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('unlock_attempt');
  });

  it('uses unit-or-actor SQL scope for tenants so admin events on assigned units are returned', async () => {
    mockBuildScope.mockResolvedValue({
      allowedUnitIds: ['unit-1'],
      ownUserId: 'tenant-1',
    });
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-admin-open',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_id: 'admin-1',
        actor_name: 'Platform Admin',
        result: 'success',
        unit_id: 'unit-1',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          action: 'admin_remote_open',
          method: 'admin_remote',
          device_type: 'blulok',
        },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('tenant-1', UserRole.TENANT, undefined, {});

    expect(mockFindWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_or_actor_scope: {
          unit_ids: ['unit-1'],
          actor_id: 'tenant-1',
        },
      }),
    );
    expect(mockFindWithContext.mock.calls[0][0]).not.toHaveProperty('actor_id');
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].user_id).toBe('admin-1');
    expect(result.logs[0].unit_id).toBe('unit-1');
  });

  it('excludes access_control device events from tenant access history', async () => {
    mockBuildScope.mockResolvedValue({
      allowedUnitIds: ['unit-1'],
      ownUserId: 'tenant-1',
    });
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-blulok',
        activity_type: 'access_attempt',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        actor_type: 'user',
        actor_id: 'admin-1',
        result: 'success',
        unit_id: 'unit-1',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'blulok', action: 'access_granted', method: 'app' },
      },
      {
        id: 'log-gate',
        activity_type: 'access_attempt',
        entity_id: 'gate-1',
        device_id: 'gate-1',
        actor_type: 'user',
        actor_id: 'admin-1',
        result: 'success',
        unit_id: 'unit-1',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'access_control', action: 'access_granted', method: 'app' },
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('tenant-1', UserRole.TENANT, undefined, {});

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].id).toBe('log-blulok');
  });

  it('returns enriched lock/unlock records from findById', async () => {
    mockFindById.mockResolvedValue({
      id: 'log-2',
      activity_type: 'unlock',
      entity_id: 'dev-1',
      device_id: 'dev-1',
      result: 'success',
      occurred_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      metadata: { device_type: 'access_control' },
    });
    mockFindWithContext.mockResolvedValue([
      {
        id: 'log-2',
        activity_type: 'unlock',
        entity_id: 'dev-1',
        device_id: 'dev-1',
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: { device_type: 'access_control' },
        access_control_device_name: 'Door 1',
      },
    ]);

    const service = new AccessHistoryReadService();
    const record = await service.findById('log-2', 'user-1', UserRole.ADMIN, undefined);
    expect(record?.action).toBe('unlock');
    expect(record?.device_type).toBe('access_control');
  });
});
