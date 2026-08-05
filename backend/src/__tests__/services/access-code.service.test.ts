const mockEnqueue = jest.fn();
const mockFindActiveForFacility = jest.fn();
const mockFindById = jest.fn();
const mockMarkInProgress = jest.fn();
const mockMarkDelivered = jest.fn();
const mockScheduleRetry = jest.fn();
const mockFindDue = jest.fn().mockResolvedValue([]);
const mockRecoverStaleInProgress = jest.fn().mockResolvedValue(0);

jest.mock('@/models/access-code-push-outbox.model', () => ({
  AccessCodePushOutboxModel: jest.fn().mockImplementation(() => ({
    enqueue: mockEnqueue,
    findActiveForFacility: mockFindActiveForFacility,
    findById: mockFindById,
    markInProgress: mockMarkInProgress,
    markDelivered: mockMarkDelivered,
    scheduleRetry: mockScheduleRetry,
    recoverStaleInProgress: (...args: unknown[]) => mockRecoverStaleInProgress(...args),
    findDue: (...args: unknown[]) => mockFindDue(...args),
    hasPendingForFacility: jest.fn().mockResolvedValue(false),
  })),
}));

jest.mock('@/models/access-code.model', () => ({
  AccessCodeModel: jest.fn().mockImplementation(() => ({
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
    create: jest.fn(),
    deactivateForScope: jest.fn(),
    getActiveCodesForFacility: jest.fn(),
    findActive: jest.fn(),
    findCodesForDevices: jest.fn(),
  })),
}));

jest.mock('@/models/device-group.model', () => ({
  DeviceGroupModel: jest.fn().mockImplementation(() => ({
    findByFacility: jest.fn().mockResolvedValue([]),
    getMembers: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/models/schedule.model', () => ({
  ScheduleModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@/services/facility-access.service', () => ({
  FacilityAccessService: {
    getUserFacilityIds: jest.fn().mockResolvedValue(['fac-1']),
  },
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
const mockBroadcastAccessCodesUpdate = jest.fn().mockResolvedValue(undefined);
const mockBroadcastAccessCodePushStateUpdate = jest.fn();
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      unicastToFacility: mockUnicast,
      getFacilityConnectionStatus: mockGatewayConnectionStatus,
    })),
  },
}));

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn(() => ({
      broadcastAccessCodesUpdate: (...args: unknown[]) => mockBroadcastAccessCodesUpdate(...args),
      broadcastAccessCodePushStateUpdate: (...args: unknown[]) => mockBroadcastAccessCodePushStateUpdate(...args),
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

  function mockTenantZoneAccess(
    svc: AccessCodeService,
    bluLokDeviceIds: string[],
    unitIds: string[] = [],
  ) {
    jest.spyOn(svc as any, 'getTenantAccessibleBluLokDeviceIds').mockResolvedValue(bluLokDeviceIds);
    jest.spyOn(svc as any, 'getTenantAccessibleUnitIds').mockResolvedValue(unitIds);
  }

  function mockAwaitableQueryBuilder<T>(rows: T[]) {
    return {
      distinct: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      then: (resolve: (value: T[]) => void) => resolve(rows),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (AccessCodeService as any).instance = undefined;
    mockGatewayConnectionStatus.mockReturnValue({ connected: true });
    mockFindDue.mockResolvedValue([]);
    mockRecoverStaleInProgress.mockResolvedValue(0);
    mockEnqueue.mockResolvedValue({
      id: 'outbox-1',
      facility_id: 'fac-1',
      status: 'pending',
      attempt_count: 0,
    });
    mockFindActiveForFacility.mockResolvedValue({
      id: 'outbox-1',
      facility_id: 'fac-1',
      status: 'pending',
      attempt_count: 0,
    });
    mockFindById.mockResolvedValue({
      id: 'outbox-1',
      facility_id: 'fac-1',
      status: 'failed',
      attempt_count: 1,
    });
    mockMarkInProgress.mockResolvedValue(undefined);
    mockMarkDelivered.mockImplementation(async () => {
      mockFindActiveForFacility.mockResolvedValue(null);
    });
    mockScheduleRetry.mockResolvedValue('failed');
    service = AccessCodeService.getInstance();
    model = (service as any).model;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const pendingByNonce = (service as any)?.pendingPushAcksByNonce as Map<string, { timer: NodeJS.Timeout }> | undefined;
    if (pendingByNonce) {
      for (const pending of pendingByNonce.values()) {
        clearTimeout(pending.timer);
      }
      pendingByNonce.clear();
    }
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
        access_id: 'KP-001',
        relay_channel: 1,
        code: '123456',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'dev-1',
      },
      {
        device_id: 'dev-2',
        access_id: 'KP-002',
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
            access_id: 'KP-001',
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

  it('pushCodesToGateway dispatches separate entries for same access_id on different relays', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([
      {
        device_id: 'door-1',
        access_id: 'KEYPAD-UUID',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'door-1',
      },
      {
        device_id: 'door-2',
        access_id: 'KEYPAD-UUID',
        relay_channel: 2,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-01T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'door-2',
      },
    ]);
    jest.spyOn(service as any, 'getScheduleMetaMap').mockResolvedValue(new Map());
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);

    await service.pushCodesToGateway('fac-1');

    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        codes: [
          expect.objectContaining({
            device_id: 'door-1',
            access_id: 'KEYPAD-UUID',
            relay_channel: 1,
            valid_codes: [expect.objectContaining({ code: '111111' })],
          }),
          expect.objectContaining({
            device_id: 'door-2',
            access_id: 'KEYPAD-UUID',
            relay_channel: 2,
            valid_codes: [expect.objectContaining({ code: '222222' })],
          }),
        ],
      }),
    );
  });

  it('pushCodesToGateway aggregates multiple valid codes per device', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([
      {
        device_id: 'dev-1',
        access_id: 'KP-001',
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
        access_id: 'KP-001',
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
        access_id: 'KP-001',
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

  it('getEffectiveCodesForFacility returns separate rows for same access_id on different relays', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    const devicesChain = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([
        {
          id: 'door-1',
          name: 'Main Door',
          device_type: 'door',
          location_description: 'Front',
          relay_channel: 1,
        },
        {
          id: 'door-2',
          name: 'Side Door',
          device_type: 'door',
          location_description: 'Side',
          relay_channel: 2,
        },
      ]),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return devicesChain;
      return {
        select: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockResolvedValue([]),
      };
    });

    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'door-1',
        access_id: 'KEYPAD-UUID',
        relay_channel: 1,
        code: '111111',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'door-1',
      },
      {
        device_id: 'door-2',
        access_id: 'KEYPAD-UUID',
        relay_channel: 2,
        code: '222222',
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2026-02-02T00:00:00Z'),
        source_scope_type: 'device',
        source_scope_id: 'door-2',
      },
    ]);

    const result = await service.getEffectiveCodesForFacility('fac-1');
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: 'door-1',
          access_id: 'KEYPAD-UUID',
          relay_channel: 1,
          code: '111111',
        }),
        expect.objectContaining({
          device_id: 'door-2',
          access_id: 'KEYPAD-UUID',
          relay_channel: 2,
          code: '222222',
        }),
      ]),
    );
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
        access_id: 'KP-001',
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
    mockTenantZoneAccess(service, ['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        access_id: 'KP-GLOBAL',
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
        access_id: 'KP-SCOPED',
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
    const scopedRowsQuery = mockAwaitableQueryBuilder([
      { id: 'ac-scoped', facility_id: 'fac-1', name: 'Building Door', device_type: 'door', location_description: 'B1' },
    ]);
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
    mockTenantZoneAccess(service, []);
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
    mockTenantZoneAccess(service, ['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-multi',
        access_id: 'KP-MULTI',
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
        access_id: 'KP-MULTI',
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
    const scopedRowsQuery = mockAwaitableQueryBuilder([
      { id: 'ac-multi', facility_id: 'fac-1', name: 'Shared Gate', device_type: 'gate', location_description: 'Entry' },
    ]);
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
    mockTenantZoneAccess(service, []);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        access_id: 'KP-GLOBAL',
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
        access_id: 'KP-GLOBAL',
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
      access_id: 'KP-GLOBAL',
      relay_channel: 1,
      code: '222222',
      schedule_id: 'sched-2',
      schedule_name: 'After Hours',
    }));
  });

  it('returns no tenant app codes when tenant has facility access but no assigned schedule', async () => {
    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1']);
    mockTenantZoneAccess(service, ['lock-1']);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        access_id: 'KP-GLOBAL',
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
    const scopedRowsQuery = mockAwaitableQueryBuilder([]);
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
    mockTenantZoneAccess(service, []);
    model.findCodesForDevices.mockResolvedValue([
      {
        device_id: 'ac-global',
        access_id: 'KP-GLOBAL',
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

  it('queues push when gateway is offline', async () => {
    mockGatewayConnectionStatus.mockReturnValueOnce({ connected: false });
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);

    await service.pushCodesToGateway('fac-1');

    expect(mockEnqueue).toHaveBeenCalledWith('fac-1');
    expect(mockUnicast).not.toHaveBeenCalled();
    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'pending',
    }));
    expect(mockBroadcastAccessCodePushStateUpdate).toHaveBeenCalledWith(
      'fac-1',
      expect.objectContaining({
        refreshEffectiveCodes: false,
        state: expect.objectContaining({ status: 'pending' }),
      }),
    );
  });

  it('records active push state when gateway accepts update', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);

    await service.pushCodesToGateway('fac-1');

    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'active',
    }));
    expect(mockBroadcastAccessCodePushStateUpdate).toHaveBeenCalledWith(
      'fac-1',
      expect.objectContaining({
        refreshEffectiveCodes: false,
        state: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('rejects push ACK without flipping UI to error (delivery path owns outbox retry state)', async () => {
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
    expect(resolve).not.toHaveBeenCalled();
  });

  it('accepts push ACK when success=true (gateway alias)', async () => {
    const nonce = 'nonce-success-alias';
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
      success: true,
    });
    expect(resolve).toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it('keeps push state pending (not error) when gateway ACK times out and retries remain', async () => {
    mockFindById.mockResolvedValue({
      id: 'outbox-1',
      facility_id: 'fac-1',
      status: 'in_progress',
      attempt_count: 1,
    });
    mockScheduleRetry.mockResolvedValue('failed');
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    jest.spyOn(service as any, 'awaitPushAcceptance').mockRejectedValue(
      new Error('timed out waiting for gateway acceptance (nonce=n-1)'),
    );

    await expect(service.pushCodesToGateway('fac-1')).rejects.toThrow(
      'timed out waiting for gateway acceptance',
    );

    expect(mockScheduleRetry).toHaveBeenCalled();
    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'pending',
      last_error: expect.stringContaining('timed out waiting for gateway acceptance'),
    }));
  });

  it('sets push state to error when ACK timeout exhausts retries (dead_letter)', async () => {
    mockFindById.mockResolvedValue({
      id: 'outbox-1',
      facility_id: 'fac-1',
      status: 'in_progress',
      attempt_count: 9,
    });
    mockScheduleRetry.mockResolvedValue('dead_letter');
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    jest.spyOn(service as any, 'awaitPushAcceptance').mockRejectedValue(
      new Error('timed out waiting for gateway acceptance (nonce=n-1)'),
    );

    await expect(service.pushCodesToGateway('fac-1')).rejects.toThrow(
      'timed out waiting for gateway acceptance',
    );

    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      facility_id: 'fac-1',
      status: 'error',
      last_error: expect.stringContaining('timed out waiting for gateway acceptance'),
    }));
  });

  it('stays pending after ACK when coalesced work remains', async () => {
    jest.spyOn(service, 'getGatewayPollPayload').mockResolvedValue([]);
    jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);
    mockMarkDelivered.mockImplementation(async () => {
      mockFindActiveForFacility.mockResolvedValue({
        id: 'outbox-1',
        facility_id: 'fac-1',
        status: 'pending',
        attempt_count: 1,
      });
    });

    await (service as any).deliverOutboxRow({
      id: 'outbox-1',
      facility_id: 'fac-1',
      attempt_count: 0,
    });

    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      status: 'pending',
    }));
  });

  it('defers push during recovery without burning outbox attempts', async () => {
    const { GatewayRecoveryService } = jest.requireMock('@/services/gateway/gateway-recovery.service') as {
      GatewayRecoveryService: { isBlockingActiveForFacilitySync: jest.Mock };
    };
    GatewayRecoveryService.isBlockingActiveForFacilitySync.mockReturnValueOnce(true);

    await (service as any).deliverOutboxRow({
      id: 'outbox-1',
      facility_id: 'fac-1',
      attempt_count: 3,
    });

    expect(mockMarkInProgress).not.toHaveBeenCalled();
    expect(mockScheduleRetry).not.toHaveBeenCalled();
    expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
      status: 'pending',
      last_error: 'deferred: gateway recovery in progress',
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
    const pushSpy = jest.spyOn(service, 'requestGatewayPush').mockResolvedValue(undefined);

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

    await Promise.resolve();
    await Promise.resolve();
    expect(mockBroadcastAccessCodesUpdate).toHaveBeenCalledWith('fac-1');
    expect(mockBroadcastAccessCodePushStateUpdate).toHaveBeenCalledWith(
      'fac-1',
      expect.objectContaining({ refreshEffectiveCodes: true }),
    );
  });

  it('upsertConfig rejects rotation_hour outside 0-23', async () => {
    await expect(service.upsertConfig('fac-1', { rotation_hour: 24 }))
      .rejects
      .toBeInstanceOf(ValidationError);
  });

  it('upsertConfig rejects rotation_minute outside 0-59', async () => {
    await expect(service.upsertConfig('fac-1', { rotation_minute: 60 }))
      .rejects
      .toBeInstanceOf(ValidationError);
  });

  it('rotateCodesForFacility returns early when facility has no keypad devices', async () => {
    jest.spyOn(service as any, 'getKeypadDeviceIdsForFacility').mockResolvedValue([]);
    const createSpy = jest.spyOn((service as any).activityLogs, 'create');

    await service.rotateCodesForFacility('fac-1');

    expect(createSpy).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('getActiveCodesForFacility uses all-codes query when scheduleId is omitted', async () => {
    model.getActiveCodesForFacility.mockResolvedValue([{ id: 'all-1' }]);

    const rows = await service.getActiveCodesForFacility('fac-1');

    expect(rows).toEqual([{ id: 'all-1' }]);
    expect(model.getActiveCodesForFacility).toHaveBeenCalledWith('fac-1');
    expect(model.findActive).not.toHaveBeenCalled();
  });

  it('getActiveCodesForFacility filters always-on codes when scheduleId is null', async () => {
    model.findActive.mockResolvedValue([{ id: 'always-on' }]);

    const rows = await service.getActiveCodesForFacility('fac-1', null);

    expect(rows).toEqual([{ id: 'always-on' }]);
    expect(model.findActive).toHaveBeenCalledWith('fac-1', undefined, undefined, null);
  });

  it('processDueOutboxPushes skips facilities whose gateway is offline', async () => {
    mockFindDue.mockResolvedValue([
      { id: 'o1', facility_id: 'fac-offline', status: 'pending', attempt_count: 0 },
    ]);
    mockGatewayConnectionStatus.mockReturnValue({ connected: false });
    const flushSpy = jest.spyOn(service, 'flushPendingPushForFacility');

    await service.processDueOutboxPushes(10);

    expect(mockRecoverStaleInProgress).toHaveBeenCalled();
    expect(mockFindDue).toHaveBeenCalledWith(10);
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('processDueOutboxPushes flushes due facilities when gateway is online', async () => {
    mockFindDue.mockResolvedValue([
      { id: 'o1', facility_id: 'fac-1', status: 'pending', attempt_count: 0 },
    ]);
    mockGatewayConnectionStatus.mockReturnValue({ connected: true });
    const flushSpy = jest
      .spyOn(service, 'flushPendingPushForFacility')
      .mockResolvedValue(undefined);

    await service.processDueOutboxPushes(5);

    expect(flushSpy).toHaveBeenCalledWith('fac-1');
  });

  it('processDueOutboxPushes swallows flush errors', async () => {
    mockFindDue.mockResolvedValue([
      { id: 'o1', facility_id: 'fac-1', status: 'pending', attempt_count: 0 },
    ]);
    mockGatewayConnectionStatus.mockReturnValue({ connected: true });
    jest.spyOn(service, 'flushPendingPushForFacility').mockRejectedValue(new Error('flush boom'));

    await expect(service.processDueOutboxPushes()).resolves.toBeUndefined();
  });

  describe('group config validation', () => {
    it('getGroupConfig returns defaults and rejects missing group', async () => {
      const groupsModel = (service as any).groups;
      groupsModel.findById.mockResolvedValueOnce(null);
      await expect(service.getGroupConfig('missing')).rejects.toBeInstanceOf(ValidationError);

      groupsModel.findById.mockResolvedValueOnce({
        id: 'grp-1',
        settings: {},
      });
      await expect(service.getGroupConfig('grp-1')).resolves.toEqual({
        is_enabled: false,
        digit_count: 6,
        rotation_interval_hours: 24,
        rotation_hour: 0,
        rotation_minute: 0,
      });
    });

    it('upsertGroupConfig merges patch and persists settings', async () => {
      const groupsModel = (service as any).groups;
      groupsModel.findById.mockResolvedValue({
        id: 'grp-1',
        settings: {
          access_code_config: {
            is_enabled: true,
            digit_count: 5,
            rotation_interval_hours: 12,
            rotation_hour: 3,
            rotation_minute: 15,
          },
          other: true,
        },
      });

      const next = await service.upsertGroupConfig('grp-1', { digit_count: 7, rotation_hour: 10 });

      expect(next).toEqual(expect.objectContaining({
        is_enabled: true,
        digit_count: 7,
        rotation_interval_hours: 12,
        rotation_hour: 10,
        rotation_minute: 15,
      }));
      expect(groupsModel.update).toHaveBeenCalledWith('grp-1', {
        settings: expect.objectContaining({
          other: true,
          access_code_config: expect.objectContaining({ digit_count: 7, rotation_hour: 10 }),
        }),
      });
    });

    it('upsertGroupConfig rejects invalid digit/interval/hour/minute', async () => {
      const groupsModel = (service as any).groups;
      groupsModel.findById.mockResolvedValue({ id: 'grp-1', settings: {} });

      await expect(service.upsertGroupConfig('grp-1', { digit_count: 2 }))
        .rejects.toBeInstanceOf(ValidationError);
      await expect(service.upsertGroupConfig('grp-1', { rotation_interval_hours: 0 }))
        .rejects.toBeInstanceOf(ValidationError);
      await expect(service.upsertGroupConfig('grp-1', { rotation_hour: 24 }))
        .rejects.toBeInstanceOf(ValidationError);
      await expect(service.upsertGroupConfig('grp-1', { rotation_minute: 60 }))
        .rejects.toBeInstanceOf(ValidationError);
      groupsModel.findById.mockResolvedValueOnce(null);
      await expect(service.upsertGroupConfig('missing', { digit_count: 6 }))
        .rejects.toBeInstanceOf(ValidationError);
    });

    it('getGroupFacilityId returns facility and rejects missing group', async () => {
      const groupsModel = (service as any).groups;
      groupsModel.findById.mockResolvedValueOnce(null);
      await expect(service.getGroupFacilityId('missing')).rejects.toBeInstanceOf(ValidationError);

      groupsModel.findById.mockResolvedValueOnce({ id: 'grp-1', facility_id: 'fac-9' });
      await expect(service.getGroupFacilityId('grp-1')).resolves.toBe('fac-9');
    });
  });

  describe('forceRotate paths', () => {
    beforeEach(() => {
      model.getConfig.mockResolvedValue({
        facility_id: 'fac-1',
        is_enabled: true,
        digit_count: 6,
        rotation_interval_hours: 24,
        rotation_hour: 0,
        rotation_minute: 0,
      });
      jest.spyOn(service, 'requestGatewayPush').mockResolvedValue(undefined);
    });

    it('forceRotate creates a single device-scope code', async () => {
      jest.spyOn(service as any, 'validateScopeTarget').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'validateScheduleForFacility').mockResolvedValue(undefined);
      const createSpy = jest.spyOn(service as any, 'createScopeCode').mockResolvedValue(undefined);

      await service.forceRotate('fac-1', 'device', 'dev-1', 'admin-1', null);

      expect(createSpy).toHaveBeenCalledWith(
        'fac-1',
        'device',
        'dev-1',
        null,
        6,
        expect.any(Date),
        expect.any(Date),
        'admin',
        'admin-1',
      );
    });

    it('forceRotate with group scheduleId only rotates that schedule context', async () => {
      jest.spyOn(service as any, 'validateScopeTarget').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'validateScheduleForFacility').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getGroupScopedConfig').mockResolvedValue({
        is_enabled: true,
        digit_count: 4,
        rotation_interval_hours: 6,
        rotation_hour: 1,
        rotation_minute: 0,
      });
      const createSpy = jest.spyOn(service as any, 'createScopeCode').mockResolvedValue(undefined);

      await service.forceRotate('fac-1', 'device_group', 'grp-1', 'admin-1', 'sched-only');

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith(
        'fac-1',
        'device_group',
        'grp-1',
        'sched-only',
        4,
        expect.any(Date),
        expect.any(Date),
        'admin',
        'admin-1',
      );
    });

    it('forceRotate without scope rotates facility group and device scopes from buildRotationScopes', async () => {
      jest.spyOn(service as any, 'buildRotationScopes').mockResolvedValue([
        { scopeType: 'device_group', scopeId: 'grp-1', scheduleId: undefined },
        { scopeType: 'device', scopeId: 'dev-9', scheduleId: null },
      ]);
      jest.spyOn(service as any, 'getGroupScopedConfig').mockResolvedValue({
        is_enabled: true,
        digit_count: 5,
        rotation_interval_hours: 8,
        rotation_hour: 0,
        rotation_minute: 0,
      });
      jest.spyOn(service as any, 'getRotationScheduleContexts').mockResolvedValue([null, 'sched-1']);
      const createSpy = jest.spyOn(service as any, 'createScopeCode').mockResolvedValue(undefined);

      await service.forceRotate('fac-1', undefined, undefined, 'admin-1');

      expect(createSpy).toHaveBeenCalledTimes(3);
      expect(createSpy).toHaveBeenCalledWith(
        'fac-1',
        'device_group',
        'grp-1',
        null,
        5,
        expect.any(Date),
        expect.any(Date),
        'admin',
        'admin-1',
      );
      expect(createSpy).toHaveBeenCalledWith(
        'fac-1',
        'device',
        'dev-9',
        null,
        6,
        expect.any(Date),
        expect.any(Date),
        'admin',
        'admin-1',
      );
    });

    it('buildRotationScopes skips inactive groups and groups without keypad members', async () => {
      jest.spyOn(service as any, 'getKeypadDeviceIdsForFacility').mockResolvedValue(['kp-1']);
      const groupsModel = (service as any).groups;
      groupsModel.findByFacility.mockResolvedValue([
        { id: 'inactive', is_active: false },
        { id: 'no-keypad', is_active: true },
        { id: 'with-keypad', is_active: true },
      ]);
      groupsModel.getMembers
        .mockResolvedValueOnce([{ device_id: 'other', device_type: 'blulok' }])
        .mockResolvedValueOnce([{ device_id: 'kp-1', device_type: 'access_control' }]);

      const scopes = await (service as any).buildRotationScopes('fac-1');
      expect(scopes).toEqual([{ scopeType: 'device_group', scopeId: 'with-keypad' }]);
    });
  });

  describe('getEffectiveCodesForFacility filters', () => {
    function mockDevicesDb(devices: any[]) {
      const dbMock = jest.fn();
      jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
      const devicesChain = {
        select: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(devices),
      };
      dbMock.mockImplementation((table: string) => {
        if (table === 'access_control_devices as d') return devicesChain;
        if (table === 'device_groups') {
          return {
            select: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockResolvedValue([{ id: 'grp-missing-name', name: 'Named' }]),
          };
        }
        if (table === 'schedules') {
          return {
            select: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockResolvedValue([
              { id: 'sched-1', name: 'Day', facility_id: 'fac-1' },
            ]),
          };
        }
        if (table === 'schedule_time_windows') {
          return {
            select: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              { schedule_id: 'sched-1', day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' },
            ]),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockResolvedValue([]),
        };
      });
      return dbMock;
    }

    it('returns empty when facility has no keypad devices', async () => {
      mockDevicesDb([]);
      await expect(service.getEffectiveCodesForFacility('fac-1')).resolves.toEqual([]);
      expect(model.findCodesForDevices).not.toHaveBeenCalled();
    });

    it('filters by scheduleId and enriches schedule windows; falls back for unknown group names', async () => {
      mockDevicesDb([
        {
          id: 'dev-1',
          name: 'Gate',
          device_type: 'gate',
          location_description: null,
          relay_channel: 1,
        },
      ]);
      model.findCodesForDevices.mockResolvedValue([
        {
          device_id: 'dev-1',
          access_id: 'KP-1',
          relay_channel: 1,
          code: '111111',
          valid_from: new Date('2026-01-01T00:00:00Z'),
          valid_until: new Date('2026-02-01T00:00:00Z'),
          source_scope_type: 'device_group',
          source_scope_id: 'grp-unknown',
          schedule_id: 'sched-1',
        },
        {
          device_id: 'dev-1',
          access_id: 'KP-1',
          relay_channel: 1,
          code: '222222',
          valid_from: new Date('2026-01-01T00:00:00Z'),
          valid_until: new Date('2026-02-01T00:00:00Z'),
          source_scope_type: 'device',
          source_scope_id: 'dev-1',
          schedule_id: null,
        },
      ]);
      jest.spyOn(service as any, 'validateScheduleForFacility').mockResolvedValue(undefined);

      const scheduled = await service.getEffectiveCodesForFacility('fac-1', 'sched-1');
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]).toEqual(expect.objectContaining({
        code: '111111',
        schedule_id: 'sched-1',
        schedule_name: 'Day',
        schedule_time_windows: [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
        source_scope_name: 'Group Code',
      }));

      const alwaysOn = await service.getEffectiveCodesForFacility('fac-1', null);
      expect(alwaysOn).toHaveLength(1);
      expect(alwaysOn[0]).toEqual(expect.objectContaining({
        code: '222222',
        schedule_id: null,
        source_scope_name: 'Gate',
      }));
    });
  });

  describe('getAppCodesForUser / tenant paths', () => {
    it('getCodesForUser delegates to getAppCodesForUser', async () => {
      const spy = jest.spyOn(service, 'getAppCodesForUser').mockResolvedValue([]);
      await service.getCodesForUser('u1', UserRole.TENANT, ['fac-1'], 'fac-1');
      expect(spy).toHaveBeenCalledWith('u1', UserRole.TENANT, ['fac-1'], 'fac-1');
    });

    it('returns empty when user has no accessible facilities', async () => {
      jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue([]);
      await expect(service.getAppCodesForUser('u1', UserRole.TENANT, [])).resolves.toEqual([]);
    });

    it('admin role loads all keypad devices for target facilities', async () => {
      jest.spyOn(service as any, 'getAccessibleFacilityIds').mockResolvedValue(['fac-1', 'fac-2']);
      const devicesSpy = jest.spyOn(service as any, 'getAllKeypadAccessControlDevices').mockResolvedValue([
        {
          id: 'dev-1',
          facility_id: 'fac-1',
          name: 'Gate',
          device_type: 'gate',
          location_description: null,
        },
      ]);
      jest.spyOn(service as any, 'resolvePairingsForDevices').mockResolvedValue([
        { device_id: 'dev-1', code: '123456' },
      ]);

      const result = await service.getAppCodesForUser('admin-1', UserRole.ADMIN, undefined, 'fac-1');
      expect(devicesSpy).toHaveBeenCalledWith(['fac-1']);
      expect(result).toEqual([{ device_id: 'dev-1', code: '123456' }]);
    });
  });

  describe('flushPendingPushForFacility and deliverOutboxRow ACK', () => {
    it('returns early when flush already in progress for facility', async () => {
      (service as any).flushInProgressByFacility.add('fac-1');
      const findSpy = mockFindActiveForFacility;
      findSpy.mockClear();

      await service.flushPendingPushForFacility('fac-1');

      expect(findSpy).not.toHaveBeenCalled();
      (service as any).flushInProgressByFacility.delete('fac-1');
    });

    it('sets pending push state when gateway is offline', async () => {
      mockGatewayConnectionStatus.mockReturnValue({ connected: false });

      await service.flushPendingPushForFacility('fac-1');

      expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
        status: 'pending',
        last_error: null,
      }));
      expect(mockMarkInProgress).not.toHaveBeenCalled();
    });

    it('returns when active outbox row is already in_progress', async () => {
      mockFindActiveForFacility.mockResolvedValue({
        id: 'outbox-1',
        facility_id: 'fac-1',
        status: 'in_progress',
        attempt_count: 1,
      });
      const deliverSpy = jest.spyOn(service as any, 'deliverOutboxRow');

      await service.flushPendingPushForFacility('fac-1');

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('defers via flush when recovery blocks sync without marking in progress', async () => {
      const { GatewayRecoveryService } = jest.requireMock('@/services/gateway/gateway-recovery.service') as {
        GatewayRecoveryService: { isBlockingActiveForFacilitySync: jest.Mock };
      };
      GatewayRecoveryService.isBlockingActiveForFacilitySync.mockReturnValue(true);
      // First lookup delivers/defers; post-deliver remaining lookup must be empty or flush recurses forever.
      mockFindActiveForFacility
        .mockResolvedValueOnce({
          id: 'outbox-1',
          facility_id: 'fac-1',
          status: 'pending',
          attempt_count: 0,
        })
        .mockResolvedValue(null);

      await service.flushPendingPushForFacility('fac-1');

      expect(mockMarkInProgress).not.toHaveBeenCalled();
      expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
        status: 'pending',
        last_error: 'deferred: gateway recovery in progress',
      }));
      GatewayRecoveryService.isBlockingActiveForFacilitySync.mockReturnValue(false);
    });

    it('chains flush when remaining pending work exists after ACK', async () => {
      // Avoid deep recursion: stub deliver and assert flush re-enters once for remaining work.
      const deliverSpy = jest
        .spyOn(service as any, 'deliverOutboxRow')
        .mockResolvedValue(undefined);

      mockFindActiveForFacility
        .mockResolvedValueOnce({ id: 'outbox-1', facility_id: 'fac-1', status: 'pending', attempt_count: 0 })
        .mockResolvedValueOnce({ id: 'outbox-2', facility_id: 'fac-1', status: 'pending', attempt_count: 0 })
        .mockResolvedValueOnce({ id: 'outbox-2', facility_id: 'fac-1', status: 'pending', attempt_count: 0 })
        .mockResolvedValue(null);

      await service.flushPendingPushForFacility('fac-1');

      expect(deliverSpy).toHaveBeenCalledTimes(2);
    });

    it('deliverOutboxRow marks active after successful ACK with no remaining work', async () => {
      jest.spyOn(service as any, 'awaitPushAcceptance').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'buildAccessCodeUpdateJwt').mockResolvedValue('jwt');
      mockFindActiveForFacility.mockResolvedValue(null);

      await (service as any).deliverOutboxRow({
        id: 'outbox-1',
        facility_id: 'fac-1',
        attempt_count: 0,
      });

      expect(mockMarkDelivered).toHaveBeenCalledWith('outbox-1');
      expect(service.getPushState('fac-1')).toEqual(expect.objectContaining({
        status: 'active',
      }));
    });

    it('handleGatewayAccessCodeUpdateAck ignores missing nonce or mismatched facility', () => {
      const reject = jest.fn();
      const resolve = jest.fn();
      const timer = setTimeout(() => undefined, 60_000);
      (service as any).pendingPushAcksByNonce.set('n1', {
        facilityId: 'fac-1',
        resolve,
        reject,
        timer,
      });

      service.handleGatewayAccessCodeUpdateAck('fac-1', {});
      service.handleGatewayAccessCodeUpdateAck('fac-other', { nonce: 'n1', accepted: true });
      expect(resolve).not.toHaveBeenCalled();
      expect(reject).not.toHaveBeenCalled();

      service.handleGatewayAccessCodeUpdateAck('fac-1', { nonce: 'n1', accepted: true });
      expect(resolve).toHaveBeenCalled();
      clearTimeout(timer);
    });

    it('hasPendingOutboxPush delegates to outbox model', async () => {
      const hasPending = jest.fn().mockResolvedValue(true);
      (service as any).pushOutbox.hasPendingForFacility = hasPending;
      await expect(service.hasPendingOutboxPush('fac-1')).resolves.toBe(true);
      expect(hasPending).toHaveBeenCalledWith('fac-1');
    });
  });

  it('upsertConfig rejects non-positive rotation_interval_hours', async () => {
    await expect(service.upsertConfig('fac-1', { rotation_interval_hours: 0 }))
      .rejects
      .toBeInstanceOf(ValidationError);
  });

  it('validateScheduleForFacility rejects missing, foreign, and inactive schedules', async () => {
    const { ScheduleModel } = jest.requireMock('@/models/schedule.model') as {
      ScheduleModel: { findById: jest.Mock };
    };
    ScheduleModel.findById.mockResolvedValueOnce(null);
    await expect((service as any).validateScheduleForFacility('fac-1', 's1'))
      .rejects.toBeInstanceOf(ValidationError);

    ScheduleModel.findById.mockResolvedValueOnce({ id: 's1', facility_id: 'other', is_active: true });
    await expect((service as any).validateScheduleForFacility('fac-1', 's1'))
      .rejects.toBeInstanceOf(AccessDeniedError);

    ScheduleModel.findById.mockResolvedValueOnce({ id: 's1', facility_id: 'fac-1', is_active: false });
    await expect((service as any).validateScheduleForFacility('fac-1', 's1'))
      .rejects.toBeInstanceOf(ValidationError);

    ScheduleModel.findById.mockResolvedValueOnce({ id: 's1', facility_id: 'fac-1', is_active: true });
    await expect((service as any).validateScheduleForFacility('fac-1', 's1')).resolves.toBeUndefined();
    await expect((service as any).validateScheduleForFacility('fac-1')).resolves.toBeUndefined();
  });

  it('setManualCode upserts a valid facility/group code and requests gateway push', async () => {
    jest.spyOn(service as any, 'validateScopeTarget').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'validateScheduleForFacility').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getGroupScopedConfig').mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 12,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    const upsertSpy = jest.spyOn(service as any, 'upsertScopeCode').mockResolvedValue(undefined);
    const pushSpy = jest.spyOn(service, 'requestGatewayPush').mockResolvedValue(undefined);

    await service.setManualCode('fac-1', 'device_group', 'grp-1', '654321', 'user-1', null);

    expect(upsertSpy).toHaveBeenCalledWith(
      'fac-1',
      'device_group',
      'grp-1',
      null,
      '654321',
      expect.any(Date),
      expect.any(Date),
      'admin',
      'user-1',
    );
    expect(pushSpy).toHaveBeenCalledWith('fac-1');
  });

  it('rotateCodesForFacility rotates enabled groups with keypad members', async () => {
    jest.spyOn(service as any, 'getKeypadDeviceIdsForFacility').mockResolvedValue(['kp-1']);
    const groupsModel = (service as any).groups;
    groupsModel.findByFacility.mockResolvedValue([
      {
        id: 'grp-1',
        is_active: true,
        settings: {
          access_code_config: {
            is_enabled: true,
            digit_count: 6,
            rotation_interval_hours: 24,
            rotation_hour: 0,
            rotation_minute: 0,
          },
        },
      },
      {
        id: 'grp-disabled',
        is_active: true,
        settings: { access_code_config: { is_enabled: false } },
      },
    ]);
    groupsModel.getMembers.mockResolvedValue([
      { device_id: 'kp-1', device_type: 'access_control' },
    ]);
    jest.spyOn(service as any, 'getActiveScheduleIdsForFacility').mockResolvedValue([]);
    const createSpy = jest.spyOn(service as any, 'createScopeCode').mockResolvedValue(undefined);
    jest.spyOn(service, 'requestGatewayPush').mockResolvedValue(undefined);

    await service.rotateCodesForFacility('fac-1');

    expect(createSpy).toHaveBeenCalledWith(
      'fac-1',
      'device_group',
      'grp-1',
      null,
      6,
      expect.any(Date),
      expect.any(Date),
      'system',
    );
    expect((service as any).activityLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Access codes rotated',
        description: expect.stringContaining('1 scope'),
      }),
    );
  });

  it('getAccessibleFacilityIds uses all facilities for admins and FacilityAccess for others', async () => {
    const dbMock = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue([{ id: 'fac-a' }, { id: 'fac-b' }]),
    });
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);

    await expect((service as any).getAccessibleFacilityIds('admin', UserRole.ADMIN))
      .resolves.toEqual(['fac-a', 'fac-b']);

    const { FacilityAccessService } = jest.requireMock('@/services/facility-access.service') as {
      FacilityAccessService: { getUserFacilityIds: jest.Mock };
    };
    FacilityAccessService.getUserFacilityIds.mockResolvedValueOnce(['fac-1']);
    await expect((service as any).getAccessibleFacilityIds('tenant', UserRole.TENANT))
      .resolves.toEqual(['fac-1']);
  });

  it('awaitPushAcceptance rejects after timeout', async () => {
    await expect(
      (service as any).awaitPushAcceptance('fac-1', 'nonce-timeout', 'outbox-1', 20),
    ).rejects.toThrow('timed out waiting for gateway acceptance');
  });

  it('recordPushDeliveryFailure marks error when outbox row is missing or retry scheduling fails', async () => {
    await (service as any).recordPushDeliveryFailure('fac-1', 'n1', 'boom');
    expect(service.getPushState('fac-1').status).toBe('error');

    mockFindById.mockResolvedValueOnce(null);
    await (service as any).recordPushDeliveryFailure('fac-1', 'n2', 'missing', 'outbox-x');
    expect(service.getPushState('fac-1').status).toBe('error');

    mockFindById.mockResolvedValueOnce({ id: 'outbox-x', attempt_count: 1 });
    mockScheduleRetry.mockRejectedValueOnce(new Error('db down'));
    await (service as any).recordPushDeliveryFailure('fac-1', 'n3', 'retry-fail', 'outbox-x');
    expect(service.getPushState('fac-1').status).toBe('error');
  });

  it('validateScopeTarget enforces group and device ownership rules', async () => {
    const groupsModel = (service as any).groups;
    await expect((service as any).validateScopeTarget('fac-1', 'device_group', null))
      .rejects.toBeInstanceOf(ValidationError);

    groupsModel.findById.mockResolvedValueOnce(null);
    await expect((service as any).validateScopeTarget('fac-1', 'device_group', 'grp-x'))
      .rejects.toBeInstanceOf(ValidationError);

    groupsModel.findById.mockResolvedValueOnce({ id: 'grp-x', facility_id: 'other' });
    await expect((service as any).validateScopeTarget('fac-1', 'device_group', 'grp-x'))
      .rejects.toBeInstanceOf(AccessDeniedError);

    groupsModel.findById.mockResolvedValueOnce({ id: 'grp-x', facility_id: 'fac-1' });
    await expect((service as any).validateScopeTarget('fac-1', 'device_group', 'grp-x'))
      .resolves.toBeUndefined();

    const dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    const deviceQuery = {
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    };
    dbMock.mockReturnValueOnce(deviceQuery);
    await expect((service as any).validateScopeTarget('fac-1', 'device', 'dev-missing'))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

