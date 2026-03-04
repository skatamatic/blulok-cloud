jest.mock('@/models/access-code.model', () => ({
  AccessCodeModel: jest.fn().mockImplementation(() => ({
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
    create: jest.fn(),
    deactivateForScope: jest.fn(),
    getActiveCodesForFacility: jest.fn(),
    findCodesForDevices: jest.fn(),
  })),
}));

jest.mock('@/models/device-group.model', () => ({
  DeviceGroupModel: jest.fn().mockImplementation(() => ({
    findByFacility: jest.fn().mockResolvedValue([]),
    getMembers: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
  })),
}));

jest.mock('@/models/activity-log.model', () => ({
  ActivityLogModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({ id: 'act-1' }),
  })),
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: jest.fn() })),
  },
}));

jest.mock('@/services/crypto/ed25519.service', () => ({
  Ed25519Service: {
    signCommandJwt: jest.fn().mockResolvedValue('signed-jwt'),
  },
}));

const mockUnicast = jest.fn();
const mockGatewayConnectionStatus = jest.fn(() => ({ connected: true }));
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      unicastToFacility: mockUnicast,
      getFacilityConnectionStatus: mockGatewayConnectionStatus,
    })),
  },
}));

import { AccessCodeService } from '@/services/access-code.service';
import { AccessDeniedError, ValidationError } from '@/middleware/error.middleware';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserRole } from '@/types/auth.types';

describe('AccessCodeService', () => {
  let service: AccessCodeService;
  let model: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (AccessCodeService as any).instance = undefined;
    service = AccessCodeService.getInstance();
    model = (service as any).model;
  });

  it('generateCode returns digits of configured length', () => {
    const code = service.generateCode(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('upsertConfig rejects invalid digit count', async () => {
    await expect(service.upsertConfig('fac-1', { digit_count: 9 }))
      .rejects
      .toBeInstanceOf(ValidationError);
  });

  it('getConfig returns defaults when no config exists', async () => {
    model.getConfig.mockResolvedValue(null);
    const config = await service.getConfig('fac-1');
    expect(config).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      is_enabled: false,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    }));
  });

  it('setManualCode validates code length by facility config', async () => {
    const groupsModel = (service as any).groups;
    groupsModel.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      name: 'Group 1',
    });
    model.getConfig.mockResolvedValue({
      facility_id: 'fac-1',
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });

    await expect(
      service.setManualCode('fac-1', 'device_group', 'grp-1', '12345', 'user-1'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('pushCodesToGateway signs and dispatches command payload', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([
      {
        device_id: 'dev-1',
        relay_channel: 1,
        code: '123456',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'dev-1',
      },
      {
        device_id: 'dev-2',
        relay_channel: 2,
        code: '654321',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-1',
        schedule_id: 'sched-2',
      },
    ]);
    jest.spyOn(service as any, 'getScheduleMetaMap').mockResolvedValue(new Map([
      ['sched-2', {
        name: 'After Hours',
        schedule: {
          facility_id: 'fac-1',
          time_windows: [{ day_of_week: 1, start_time: '18:00:00', end_time: '23:59:59' }],
        },
      }],
    ]));
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);

    await service.pushCodesToGateway('fac-1');

    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd_type: 'ACCESS_CODE_UPDATE',
        facility_id: 'fac-1',
        codes: [
          expect.objectContaining({
            device_id: 'dev-1',
            valid_codes: [
              expect.objectContaining({
                code: '123456',
                schedule_id: null,
                schedule: null,
              }),
            ],
          }),
          expect.objectContaining({
            device_id: 'dev-2',
            valid_codes: [
              expect.objectContaining({
                code: '654321',
                schedule_id: 'sched-2',
                schedule: {
                  facility_id: 'fac-1',
                  time_windows: [{ day_of_week: 1, start_time: '18:00:00', end_time: '23:59:59' }],
                },
              }),
            ],
          }),
        ],
      }),
    );
    expect(mockUnicast).toHaveBeenCalledWith('fac-1', 'signed-jwt');
  });

  it('pushCodesToGateway aggregates multiple valid codes per device', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([
      {
        device_id: 'dev-1',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-a',
        schedule_id: null,
      },
      {
        device_id: 'dev-1',
        relay_channel: 1,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-b',
        schedule_id: null,
      },
    ]);
    jest.spyOn(service as any, 'getScheduleMetaMap').mockResolvedValue(new Map());
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);

    await service.pushCodesToGateway('fac-1');

    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd_type: 'ACCESS_CODE_UPDATE',
        codes: [
          expect.objectContaining({
            device_id: 'dev-1',
            valid_codes: expect.arrayContaining([
              expect.objectContaining({ code: '111111' }),
              expect.objectContaining({ code: '222222' }),
            ]),
          }),
        ],
      }),
    );
  });

  it('getEffectiveCodesForFacility returns resolved source metadata', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    const devicesChain = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([
        {
          id: 'dev-1',
          name: 'Gate A',
          device_type: 'gate',
          location_description: 'Main entry',
          relay_channel: 1,
        },
      ]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return devicesChain;
      if (table === 'device_groups') {
        return {
          select: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockResolvedValue([{ id: 'grp-1', name: 'Front Entrances' }]),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockResolvedValue([]),
      };
    });

    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'dev-1',
        relay_channel: 1,
        code: '654321',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-1',
      },
    ]);

    const result = await service.getEffectiveCodesForFacility('fac-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      device_id: 'dev-1',
      code: '654321',
      source_scope_type: 'device_group',
      source_scope_name: 'Front Entrances',
    }));
  });

  it('getGatewayPollPayload resolves keypad device IDs then maps codes', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    const keypadQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'dev-1' },
        { id: 'dev-2' },
      ]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return keypadQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'dev-1',
        relay_channel: 1,
        code: '123456',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'dev-1',
      },
    ]);

    const result = await service.getGatewayPollPayload('fac-1');

    expect(model.findCodesForDevices).toHaveBeenCalledWith(['dev-1', 'dev-2']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ device_id: 'dev-1', code: '123456' }));
  });

  it('rejects device-scoped set when device belongs to active access-code group', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    const deviceScopeQuery = {
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
    };
    const membershipQuery = {
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'grp-1', name: 'Front Entrances' }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return deviceScopeQuery;
      if (table === 'device_group_members as gm') return membershipQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(
      service.setManualCode('fac-1', 'device', 'dev-1', '123456', 'user-1'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns tenant app codes only for global or tenant-scoped groups', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue(['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-global',
        schedule_id: 'sched-tenant',
      },
      {
        device_id: 'ac-scoped',
        relay_channel: 2,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-scoped',
        schedule_id: 'sched-tenant',
      },
    ]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-global', facility_id: 'fac-1', name: 'Front Gate', device_type: 'gate', location_description: 'Main' },
      ]),
    };
    const scopedRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-scoped', facility_id: 'fac-1', name: 'Building Door', device_type: 'door', location_description: 'B1' },
      ]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ facility_id: 'fac-1', schedule_id: 'sched-tenant' }]),
    };
    const schedulesQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ id: 'sched-tenant', name: 'Tenant Schedule', facility_id: 'fac-1' }]),
    };
    const windowsQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'device_group_members as access_members') return scopedRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      if (table === 'schedules') return schedulesQuery;
      if (table === 'schedule_time_windows') return windowsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result.map((entry) => entry.device_id).sort()).toEqual(['ac-global', 'ac-scoped']);
  });

  it('does not return zone-scoped access control devices when tenant has no zoned unit access', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue([]);
    model.findCodesForDevices.mockResolvedValue([]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result).toEqual([]);
    expect(model.findCodesForDevices).not.toHaveBeenCalled();
  });

  it('returns multi-zone access control device when tenant has access to any linked zone', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue(['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-multi',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-zone-a',
        schedule_id: 'sched-tenant',
      },
      {
        device_id: 'ac-multi',
        relay_channel: 1,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-zone-b',
        schedule_id: 'sched-tenant',
      },
    ]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([]),
    };
    const scopedRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-multi', facility_id: 'fac-1', name: 'Shared Gate', device_type: 'gate', location_description: 'Entry' },
      ]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ facility_id: 'fac-1', schedule_id: 'sched-tenant' }]),
    };
    const schedulesQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ id: 'sched-tenant', name: 'Tenant Schedule', facility_id: 'fac-1' }]),
    };
    const windowsQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'device_group_members as access_members') return scopedRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      if (table === 'schedules') return schedulesQuery;
      if (table === 'schedule_time_windows') return windowsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result.some((entry) => entry.device_id === 'ac-multi')).toBe(true);
  });

  it('grants all keypad access control devices for facility_admin/admin/dev_admin by role', async () => {
    const allDevices = [
      {
        id: 'ac-1',
        facility_id: 'fac-1',
        name: 'Front Gate',
        device_type: 'gate',
        location_description: 'Main',
      },
    ];
    const expectedPairings = [
      {
        device_id: 'ac-1',
        facility_id: 'fac-1',
        device_name: 'Front Gate',
        device_type: 'gate',
        location_description: 'Main',
        code: '123456',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
      },
    ];
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    const allDevicesSpy = jest.spyOn(service as any, 'getAllKeypadAccessControlDevices').mockResolvedValue(allDevices);
    const resolveSpy = jest.spyOn(service as any, 'resolvePairingsForDevices').mockResolvedValue(expectedPairings);

    const facilityAdminResult = await service.getAppCodesForUser(
      'fa-1',
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      'fac-1',
    );
    const adminResult = await service.getAppCodesForUser(
      'admin-1',
      UserRole.ADMIN,
      undefined,
      'fac-1',
    );
    const devAdminResult = await service.getAppCodesForUser(
      'dev-1',
      UserRole.DEV_ADMIN,
      undefined,
      'fac-1',
    );

    expect(facilityAdminResult).toEqual(expectedPairings);
    expect(adminResult).toEqual(expectedPairings);
    expect(devAdminResult).toEqual(expectedPairings);
    expect(allDevicesSpy).toHaveBeenCalledTimes(3);
    expect(resolveSpy).toHaveBeenCalledTimes(3);
    expect(allDevicesSpy).toHaveBeenCalledWith(['fac-1']);
  });

  it('denies tenant app code request for inaccessible facility', async () => {
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);

    await expect(
      service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-2'),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('filters tenant app codes by assigned schedule and excludes unscheduled entries', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue([]);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-global',
        schedule_id: null,
      },
      {
        device_id: 'ac-global',
        relay_channel: 1,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-global',
        schedule_id: 'sched-2',
      },
    ]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-global', facility_id: 'fac-1', name: 'Front Gate', device_type: 'gate', location_description: 'Main' },
      ]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ facility_id: 'fac-1', schedule_id: 'sched-2' }]),
    };
    const schedulesQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ id: 'sched-2', name: 'After Hours' }]),
    };
    const windowsQuery = {
      select: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([
        { schedule_id: 'sched-2', day_of_week: 1, start_time: '18:00:00', end_time: '23:59:59' },
      ]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      if (table === 'schedules') return schedulesQuery;
      if (table === 'schedule_time_windows') return windowsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      device_id: 'ac-global',
      code: '222222',
      schedule_id: 'sched-2',
      schedule_name: 'After Hours',
    }));
  });

  it('returns no tenant app codes when tenant has facility access but no assigned schedule', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue(['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-global',
        schedule_id: null,
      },
    ]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-global', facility_id: 'fac-1', name: 'Front Gate', device_type: 'gate', location_description: 'Main' },
      ]),
    };
    const scopedRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'device_group_members as access_members') return scopedRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result).toEqual([]);
  });

  it('does not fallback tenant app codes to unscheduled when assigned schedule has no matching code', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    jest.spyOn(service as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue([]);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device_group',
        source_scope_id: 'grp-global',
        schedule_id: null,
      },
    ]);

    const globalRowsQuery = {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockResolvedValue([
        { id: 'ac-global', facility_id: 'fac-1', name: 'Front Gate', device_type: 'gate', location_description: 'Main' },
      ]),
    };
    const userSchedulesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ facility_id: 'fac-1', schedule_id: 'sched-2' }]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_group_members as gm') return globalRowsQuery;
      if (table === 'user_facility_schedules') return userSchedulesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await service.getAppCodesForUser('tenant-1', 'tenant' as any, ['fac-1'], 'fac-1');
    expect(result).toEqual([]);
  });

  it('sets push state to error when gateway is offline', async () => {
    mockGatewayConnectionStatus.mockReturnValueOnce({ connected: false });
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    await expect(service.pushCodesToGateway('fac-1')).rejects.toBeInstanceOf(Error);
    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'error',
    }));
  });

  it('records active push state when gateway accepts update', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);

    await service.pushCodesToGateway('fac-1');

    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'active',
    }));
  });

  it('sets push state to error when gateway rejects update ACK', async () => {
    const nonce = 'nonce-reject';
    const reject = jest.fn();
    const resolve = jest.fn();
    const timer = setTimeout(() => undefined, 60_000);
    (service as any).pendingPushAcksByNonce.set(nonce, {
      facilityId: 'fac-1',
      resolve,
      reject,
      timer,
    });
    service.handleGatewayAccessCodeUpdateAck('fac-1', {
      nonce,
      accepted: false,
      message: 'Gateway rejected access code update',
    });
    expect(reject).toHaveBeenCalled();
    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'error',
      last_error: expect.stringContaining('Gateway rejected access code update'),
    }));
  });

  it('sets push state to error when gateway ACK times out', async () => {
    await expect((service as any).awaitPushAcceptance('fac-1', 'nonce-timeout', 5))
      .rejects
      .toThrow('timed out waiting for gateway acceptance');

    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'error',
      last_error: expect.stringContaining('timed out waiting for gateway acceptance'),
    }));
  });

  it('forceRotate regenerates unscheduled and all active schedule contexts for group scope', async () => {
    jest.spyOn(service as any, 'validateScopeTarget').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'validateScheduleForFacility').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getGroupScopedConfig').mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    jest.spyOn(service as any, 'getActiveScheduleIdsForFacility').mockResolvedValue(['sched-1', 'sched-2']);
    const createScopeCodeSpy = jest.spyOn(service as any, 'createScopeCode').mockResolvedValue(undefined);
    const pushSpy = jest.spyOn(service, 'pushCodesToGateway').mockResolvedValue(undefined);

    await service.forceRotate('fac-1', 'device_group', 'grp-1', 'user-1');

    expect(createScopeCodeSpy).toHaveBeenCalledTimes(3);
    expect(createScopeCodeSpy).toHaveBeenNthCalledWith(
      1,
      'fac-1',
      'device_group',
      'grp-1',
      null,
      6,
      expect.any(Date),
      expect.any(Date),
      'admin',
      'user-1',
    );
    expect(createScopeCodeSpy).toHaveBeenNthCalledWith(
      2,
      'fac-1',
      'device_group',
      'grp-1',
      'sched-1',
      6,
      expect.any(Date),
      expect.any(Date),
      'admin',
      'user-1',
    );
    expect(createScopeCodeSpy).toHaveBeenNthCalledWith(
      3,
      'fac-1',
      'device_group',
      'grp-1',
      'sched-2',
      6,
      expect.any(Date),
      expect.any(Date),
      'admin',
      'user-1',
    );
    expect(pushSpy).toHaveBeenCalledWith('fac-1');
  });
});

