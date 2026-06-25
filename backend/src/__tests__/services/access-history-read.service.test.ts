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

  it('resolves BluLok lock number when serial is a lock id UUID', async () => {
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
        facility_name: 'Petrolia Storage Facility',
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'lock' });
    expect(result.logs[0].device_name).toBe('Lock #106');
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
