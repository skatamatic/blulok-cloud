jest.mock('@/models/device-group.model', () => ({
  DeviceGroupModel: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    findById: jest.fn(),
    findByFacility: jest.fn(),
    findDefaultByFacility: jest.fn(),
    countAccessControlMembershipsForDevice: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    getMembers: jest.fn(),
    getGroupsForDevice: jest.fn(),
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
import { AccessDeniedError, NotFoundError, ValidationError } from '@/middleware/error.middleware';
import { UserRole } from '@/types/auth.types';
import { DEFAULT_ACCESS_GROUP_NAME } from '@/constants/access-group.constants';

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
        count: jest.fn().mockReturnThis(),
      };
      return chain;
    });
    model.findDefaultByFacility.mockResolvedValue(null);
    model.countAccessControlMembershipsForDevice.mockResolvedValue(0);
  });

  it('creates group when user has facility access', async () => {
    model.create.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'zone',
      is_global_shared: false,
      is_default: false,
      name: 'Main Zone',
    });
    model.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'zone',
      is_global_shared: false,
      is_default: false,
      name: 'Main Zone',
    });

    const created = await service.create(
      { facility_id: 'fac-1', name: 'Main Zone' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
      { actorId: 'u1' },
    );

    expect(created.id).toBe('grp-1');
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ is_default: false }));
  });

  it('rejects creation when user lacks facility access', async () => {
    await expect(service.create(
      { facility_id: 'fac-2', name: 'Main Zone' },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    )).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('rejects manual default group creation', async () => {
    await expect(service.create(
      { facility_id: 'fac-1', name: 'Default', is_default: true },
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    )).rejects.toBeInstanceOf(ValidationError);
  });

  it('ensureDefaultGroup creates protected default group idempotently', async () => {
    model.findDefaultByFacility
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'def-1',
        facility_id: 'fac-1',
        is_default: true,
        is_global_shared: true,
        name: DEFAULT_ACCESS_GROUP_NAME,
      });
    model.create.mockResolvedValue({
      id: 'def-1',
      facility_id: 'fac-1',
      is_default: true,
      is_global_shared: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });

    const first = await service.ensureDefaultGroup('fac-1');
    const second = await service.ensureDefaultGroup('fac-1');

    expect(first.id).toBe('def-1');
    expect(second.id).toBe('def-1');
    expect(model.create).toHaveBeenCalledTimes(1);
  });

  it('findById throws NotFound for missing group', async () => {
    model.findById.mockResolvedValue(null);
    await expect(service.findById('missing', UserRole.ADMIN, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('adds unit-linked blulok member and resolves current unit device', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-1',
      facility_id: 'fac-1',
      is_default: false,
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

  it('removes access-control device from default group when added to specific group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-specific',
      facility_id: 'fac-1',
      is_default: false,
      name: 'Front Gate',
    });
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
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
      group_id: 'grp-specific',
      device_id: 'ac-2',
      device_type: 'access_control',
    });
    jest.spyOn(AccessCodeService.getInstance(), 'pushCodesToGateway').mockResolvedValue(undefined);

    await service.addMember(
      'grp-specific',
      'ac-2',
      'access_control',
      undefined,
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(model.removeMember).toHaveBeenCalledWith('grp-default', 'ac-2', 'access_control');
  });

  it('allows an access-control device to belong to multiple specific groups', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-specific-2',
      facility_id: 'fac-1',
      is_default: false,
      name: 'Secondary Group',
    });
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });
    model.addMember.mockResolvedValue({
      id: 'm-3',
      group_id: 'grp-specific-2',
      device_id: 'ac-2',
      device_type: 'access_control',
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
    jest.spyOn(AccessCodeService.getInstance(), 'pushCodesToGateway').mockResolvedValue(undefined);

    const member = await service.addMember(
      'grp-specific-2',
      'ac-2',
      'access_control',
      undefined,
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(member.group_id).toBe('grp-specific-2');
    expect(model.addMember).toHaveBeenCalledWith('grp-specific-2', 'ac-2', 'access_control', undefined);
  });

  it('removes a blulok lock from the default group when added to a specific group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-zone',
      facility_id: 'fac-1',
      is_default: false,
      name: 'East Wing',
    });
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });
    model.addMember.mockResolvedValue({
      id: 'm-lock',
      group_id: 'grp-zone',
      device_id: 'lock-1',
      device_type: 'blulok',
      source_unit_id: 'unit-1',
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

    await service.addMember(
      'grp-zone',
      undefined,
      'blulok',
      'unit-1',
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(model.removeMember).toHaveBeenCalledWith('grp-default', 'lock-1', 'blulok');
  });

  it('backfills ungrouped access-control devices into the default group', async () => {
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });
    model.countAccessControlMembershipsForDevice.mockResolvedValue(0);
    model.addMember.mockResolvedValue({
      id: 'm-new',
      group_id: 'grp-default',
      device_id: 'ac-1',
      device_type: 'access_control',
    });
    const acQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ id: 'ac-1' }, { id: 'ac-2' }]),
    };
    const blulokQuery = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ id: 'lock-1' }]),
    };
    const membersQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-member' })
        .mockResolvedValueOnce(null),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'access_control_devices as acd') return acQuery;
      if (table === 'blulok_devices as bd') return blulokQuery;
      if (table === 'device_group_members') return membersQuery;
      return {};
    });

    const result = await service.backfillDefaultGroupMemberships('fac-1');

    expect(result.added).toBe(2);
    expect(model.addMember).toHaveBeenCalledWith('grp-default', 'ac-1', 'access_control');
    expect(model.addMember).toHaveBeenCalledWith('grp-default', 'lock-1', 'blulok');
  });

  it('rejects deleting the default access group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });

    await expect(
      service.delete('grp-default', UserRole.FACILITY_ADMIN, ['fac-1']),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects removing access-control device directly from default group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });

    await expect(
      service.removeMember(
        'grp-default',
        'ac-1',
        'access_control',
        UserRole.FACILITY_ADMIN,
        ['fac-1'],
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects removing blulok lock directly from default group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });

    await expect(
      service.removeMember(
        'grp-default',
        'lock-1',
        'blulok',
        UserRole.FACILITY_ADMIN,
        ['fac-1'],
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('assigns a blulok lock to the default group when not in a specific group', async () => {
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });
    model.countAccessControlMembershipsForDevice.mockResolvedValue(0);
    model.addMember.mockResolvedValue({
      id: 'm-lock-default',
      group_id: 'grp-default',
      device_id: 'lock-9',
      device_type: 'blulok',
    });

    await service.assignBluLokToDefaultGroup('fac-1', 'lock-9');

    expect(model.addMember).toHaveBeenCalledWith('grp-default', 'lock-9', 'blulok');
  });

  it('rejoins blulok lock to default group after removal from its last specific group', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-zone',
      facility_id: 'fac-1',
      is_default: false,
      name: 'East Wing',
    });
    model.findDefaultByFacility.mockResolvedValue({
      id: 'grp-default',
      facility_id: 'fac-1',
      is_default: true,
      name: DEFAULT_ACCESS_GROUP_NAME,
    });
    model.countAccessControlMembershipsForDevice.mockResolvedValue(0);

    await service.removeMember(
      'grp-zone',
      'lock-1',
      'blulok',
      UserRole.FACILITY_ADMIN,
      ['fac-1'],
    );

    expect(model.addMember).toHaveBeenCalledWith('grp-default', 'lock-1', 'blulok');
  });

  it('pushes group code updates when adding access-control member', async () => {
    model.findById.mockResolvedValue({
      id: 'grp-3',
      facility_id: 'fac-1',
      is_default: false,
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

  it('rolls back group update when gateway push fails for gateway-relevant changes', async () => {
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      group_type: 'access_code',
      is_global_shared: false,
      is_default: false,
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
        is_active: false,
        name: 'Entry Group',
      })
      .mockResolvedValueOnce({
        id: 'grp-1',
        facility_id: 'fac-1',
        is_active: true,
        name: 'Entry Group',
      });
    model.findById.mockResolvedValueOnce({
      id: 'grp-1',
      facility_id: 'fac-1',
      is_active: false,
      name: 'Entry Group',
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
