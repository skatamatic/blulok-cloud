jest.mock('@/models/device-group.model', () => ({
  DeviceGroupModel: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    findById: jest.fn(),
    findByFacility: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    getMembers: jest.fn(),
  })),
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: jest.fn() })),
  },
}));

jest.mock('@/models/activity-log.model', () => ({
  ActivityLogModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({ id: 'act-1' }),
  })),
}));

import { DeviceGroupService } from '@/services/device-group.service';
import { AccessCodeService } from '@/services/access-code.service';
import { UserRole } from '@/types/auth.types';
import { AccessDeniedError, NotFoundError, ValidationError } from '@/middleware/error.middleware';

describe('DeviceGroupService', () => {
  let service: DeviceGroupService;
  let model: any;
  let dbMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceGroupService as any).instance = undefined;
    service = DeviceGroupService.getInstance();
    model = (service as any).model;
    dbMock = jest.fn();
    jest.spyOn(service as any, 'db', 'get').mockReturnValue(dbMock);
    dbMock.mockImplementation(() => {
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        andWhereNot: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(1),
        join: jest.fn().mockReturnThis(),
      };
      return chain;
    });
  });

  it('creates group when user has facility access', async () => {
    model.create.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'zone',
      is_global_shared: false,
      name: 'Main Zone',
    });
    model.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'zone',
      is_global_shared: false,
      name: 'Main Zone',
    });

    const created = await service.create(
      { facility_id: 'fac-1', name: 'Main Zone' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      { actorId: 'u1' },
    );

    expect(created.id).toBe('grp-1');
    expect(model.create).toHaveBeenCalled();
  });

  it('rejects creation when user lacks facility access', async () => {
    await expect(service.create(
      { facility_id: 'fac-2', name: 'Main Zone' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    )).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('findById throws NotFound for missing group', async () => {
    model.findById.mockResolvedValue(null);
    await expect(service.findById('missing', UserRole.ADMIN, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('adds unit-linked blulok member and resolves current unit device', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      name: 'Unit-linked Group',
    });
    const unitsQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
    };
    const boundDeviceQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'lock-1' }),
    };
    const deviceFacilityQuery = {
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'units') return unitsQuery;
      if (table === 'blulok_devices') return boundDeviceQuery;
      if (table === 'blulok_devices as d') return deviceFacilityQuery;
      return {
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
      };
    });
    model.addMember.mockResolvedValue({
      id: 'm-1',
      group_id: 'grp-1',
      device_id: 'lock-1',
      device_type: 'blulok',
      source_unit_id: 'unit-1',
    });

    const member = await service.addMember(
      'grp-1',
      undefined,
      'blulok',
      'unit-1',
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      { actorId: 'u1' },
    );

    expect(member.device_id).toBe('lock-1');
    expect(model.addMember).toHaveBeenCalledWith('grp-1', 'lock-1', 'blulok', 'unit-1');
  });

  it('rejects unit-linked member when device_type is not blulok', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      name: 'Main Zone',
    });

    await expect(
      service.addMember(
        'grp-1',
        undefined,
        'access_control',
        'unit-1',
        UserRole.FACILITY_ADMIN,
        ['fac-1'],
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('promotes created global shared group and demotes any existing global group', async () => {
    model.create.mockResolvedValue({
      id: 'grp-new',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: true,
      name: 'Global Shared',
    });
    model.findById.mockResolvedValue({
      id: 'grp-new',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: true,
      name: 'Global Shared',
    });

    const existingGlobalQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereNot: jest.fn().mockReturnThis(),
      modify: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'grp-existing' }),
      update: jest.fn().mockResolvedValue(1),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return existingGlobalQuery;
      return {};
    });

    const created = await service.create(
      { facility_id: 'fac-1', group_type: 'access_code', is_global_shared: true, name: 'Global Shared' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(created.id).toBe('grp-new');
    expect(model.create).toHaveBeenCalled();
    expect(existingGlobalQuery.update).toHaveBeenCalled();
  });

  it('auto-assigns first access-code group as global shared', async () => {
    model.create.mockResolvedValue({
      id: 'grp-first',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      name: 'First Access Group',
    });
    model.findById.mockResolvedValue({
      id: 'grp-first',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: true,
      name: 'First Access Group',
    });
    const noExistingGlobalQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereNot: jest.fn().mockReturnThis(),
      modify: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(1),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return noExistingGlobalQuery;
      return {};
    });

    const created = await service.create(
      { facility_id: 'fac-1', group_type: 'access_code', name: 'First Access Group' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(created.is_global_shared).toBe(true);
  });

  it('pushes group code updates when adding access-control member to access-code group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-3',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      name: 'Entry Group',
    });
    const deviceFacilityQuery = {
      join: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as d') return deviceFacilityQuery;
      return {};
    });
    model.addMember.mockResolvedValue({
      id: 'm-2',
      group_id: 'grp-3',
      device_id: 'ac-2',
      device_type: 'access_control',
    });
    const pushSpy = jest.spyOn(AccessCodeService.getInstance(), 'pushCodesToGateway').mockResolvedValue(undefined);

    await service.addMember(
      'grp-3',
      'ac-2',
      'access_control',
      undefined,
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      { actorId: 'u1' },
    );

    expect(pushSpy).toHaveBeenCalledWith('fac-1');
  });

  it('does not push gateway codes when only setting access-code group as default/global', async () => {
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      is_active: true,
      name: 'Entry Group',
      settings: {},
      metadata: {},
    });
    model.update.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: true,
      is_active: true,
      name: 'Entry Group',
      settings: {},
      metadata: {},
    });
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: true,
      is_active: true,
      name: 'Entry Group',
      settings: {},
      metadata: {},
    });
    const existingGlobalQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereNot: jest.fn().mockReturnThis(),
      modify: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'grp-other' }),
      update: jest.fn().mockResolvedValue(1),
      then: (resolve: (value: any[]) => unknown) => Promise.resolve([{ id: 'grp-1', is_global_shared: false }]).then(resolve),
      catch: () => undefined,
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return existingGlobalQuery;
      return {};
    });
    const pushSpy = jest.spyOn(AccessCodeService.getInstance(), 'pushCodesToGateway').mockResolvedValue(undefined);

    await service.update(
      'grp-1',
      { is_global_shared: true },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      { actorId: 'u1' },
    );

    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('rolls back group update when gateway push fails for gateway-relevant changes', async () => {
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      is_active: true,
      name: 'Entry Group',
      settings: { x: 1 },
      metadata: { y: 2 },
      access_code_current_code: null,
      access_code_current_valid_from: null,
      access_code_current_valid_until: null,
    });
    model.update
      .mockResolvedValueOnce({
        id: 'grp-1',
        facility_id: 'fac-1',
        group_type: 'access_code',
        is_global_shared: false,
        is_active: false,
        name: 'Entry Group',
        settings: { x: 1 },
        metadata: { y: 2 },
      })
      .mockResolvedValueOnce({
        id: 'grp-1',
        facility_id: 'fac-1',
        group_type: 'access_code',
        is_global_shared: false,
        is_active: true,
        name: 'Entry Group',
        settings: { x: 1 },
        metadata: { y: 2 },
      });
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      is_active: false,
      name: 'Entry Group',
      settings: { x: 1 },
      metadata: { y: 2 },
    });
    const globalSnapshotRows = [{ id: 'grp-1', is_global_shared: false }];
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      andWhereNot: jest.fn().mockReturnThis(),
      modify: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'grp-other' }),
      update: jest.fn().mockResolvedValue(1),
      then: (resolve: (value: any[]) => unknown) => Promise.resolve(globalSnapshotRows).then(resolve),
      catch: () => undefined,
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return query;
      return {};
    });
    const pushSpy = jest.spyOn(AccessCodeService.getInstance(), 'pushCodesToGateway')
      .mockRejectedValue(new Error('gateway offline'));

    await expect(
      service.update(
        'grp-1',
        { is_active: false },
        UserRole.FACILITY_ADMIN,
        ['fac-1'],
        { actorId: 'u1' },
      ),
    ).rejects.toThrow('gateway offline');

    expect(pushSpy).toHaveBeenCalledWith('fac-1');
    expect(model.update).toHaveBeenNthCalledWith(
      2,
      'grp-1',
      expect.objectContaining({ is_active: true, name: 'Entry Group' }),
    );
  });
});

