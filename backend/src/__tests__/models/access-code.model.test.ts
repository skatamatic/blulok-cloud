const mockConnection = jest.fn();

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: mockConnection })),
  },
}));

import { AccessCodeModel } from '@/models/access-code.model';

describe('AccessCodeModel.findCodesForDevices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockConnection as any).fn = { now: jest.fn(() => new Date('2026-01-15T00:00:00Z')) };
  });

  it('resolves codes deterministically across duplicate and multi-group scopes', async () => {
    const deviceRows = [
      { device_id: 'dev-1', relay_channel: 1, facility_id: 'fac-1' },
      { device_id: 'dev-2', relay_channel: 2, facility_id: 'fac-1' },
      { device_id: 'dev-3', relay_channel: 3, facility_id: 'fac-1' },
    ];

    const groupRows = [
      { group_id: 'grp-z', device_id: 'dev-2' },
      { group_id: 'grp-a', device_id: 'dev-2' },
    ];

    const activeCodes = [
      // Newest-first order from findActive query.
      {
        id: 'code-device-new',
        facility_id: 'fac-1',
        scope_type: 'device',
        scope_id: 'dev-1',
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        is_active: true,
      },
      {
        id: 'code-device-old',
        facility_id: 'fac-1',
        scope_type: 'device',
        scope_id: 'dev-1',
        code: '333333',
        valid_from: new Date('2025-12-01T00:00:00Z'),
        valid_until: new Date('2026-01-15T00:00:00Z'),
        is_active: true,
      },
      {
        id: 'code-group-z',
        facility_id: 'fac-1',
        scope_type: 'device_group',
        scope_id: 'grp-z',
        code: '444444',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        is_active: true,
      },
      {
        id: 'code-group-a',
        facility_id: 'fac-1',
        scope_type: 'device_group',
        scope_id: 'grp-a',
        code: '555555',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        is_active: true,
      },
    ];

    const devicesQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue(deviceRows),
    };
    const groupsQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      then: (resolve: (value: any) => void) => resolve(groupRows),
      catch: () => undefined,
    } as any;

    const activeCodesQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue(activeCodes),
    };

    mockConnection.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return devicesQuery;
      if (table === 'device_group_members as dgm') return groupsQuery;
      if (table === 'access_codes') return activeCodesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const model = new AccessCodeModel();
    const result = await model.findCodesForDevices(['dev-1', 'dev-2', 'dev-3']);

    const codesByDevice = new Map<string, typeof result>();
    result.forEach((entry) => {
      const list = codesByDevice.get(entry.device_id) || [];
      list.push(entry);
      codesByDevice.set(entry.device_id, list);
    });

    expect(codesByDevice.get('dev-1')?.[0]).toEqual(expect.objectContaining({
      code: '222222',
      source_scope_type: 'device',
    }));
    expect(codesByDevice.get('dev-2')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: '444444',
        source_scope_type: 'device_group',
        source_scope_id: 'grp-z',
      }),
      expect.objectContaining({
        code: '555555',
        source_scope_type: 'device_group',
        source_scope_id: 'grp-a',
      }),
    ]));
    expect(codesByDevice.get('dev-3')).toBeUndefined();
  });

  it('returns one active code per schedule context for a grouped device', async () => {
    const deviceRows = [{ device_id: 'dev-1', relay_channel: 1, facility_id: 'fac-1' }];
    const groupRows = [{ group_id: 'grp-a', device_id: 'dev-1' }];
    const activeCodes = [
      {
        id: 'code-group-sched',
        facility_id: 'fac-1',
        scope_type: 'device_group',
        scope_id: 'grp-a',
        schedule_id: 'sched-1',
        code: '777777',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        is_active: true,
      },
      {
        id: 'code-group-default',
        facility_id: 'fac-1',
        scope_type: 'device_group',
        scope_id: 'grp-a',
        schedule_id: null,
        code: '666666',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        is_active: true,
      },
    ];

    const devicesQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue(deviceRows),
    };
    const groupsQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      then: (resolve: (value: any) => void) => resolve(groupRows),
      catch: () => undefined,
    } as any;

    const activeCodesQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue(activeCodes),
    };

    mockConnection.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return devicesQuery;
      if (table === 'device_group_members as dgm') return groupsQuery;
      if (table === 'access_codes') return activeCodesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const model = new AccessCodeModel();
    const result = await model.findCodesForDevices(['dev-1']);
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.schedule_id).sort()).toEqual([null, 'sched-1']);
  });
});

