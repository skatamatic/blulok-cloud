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
    (ActivityLogModel as jest.Mock).mockImplementation(() => ({
      findWithContext: mockFindWithContext,
      count: mockCount,
      findById: mockFindById,
    }));
    (AccessEventScopeService as jest.Mock).mockImplementation(() => ({
      buildScope: mockBuildScope,
    }));
    (AccessLogModel as jest.Mock).mockImplementation(() => ({
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
        result: 'success',
        occurred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {},
      },
    ]);

    const service = new AccessHistoryReadService();
    const result = await service.query('user-1', UserRole.ADMIN, undefined, { action: 'lock' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('lock');
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
