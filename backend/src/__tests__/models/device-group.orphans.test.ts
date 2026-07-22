jest.unmock('@/models/device-group.model');

import { DeviceGroupModel } from '@/models/device-group.model';

describe('DeviceGroupModel orphan membership cleanup', () => {
  let model: DeviceGroupModel;
  let mockKnex: jest.Mock & { raw: jest.Mock };

  function chain(overrides: Record<string, unknown> = {}) {
    const c: Record<string, jest.Mock> = {
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereNotExists: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      pluck: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(0),
      ...overrides,
    };
    return c;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    model = new DeviceGroupModel();
    mockKnex = Object.assign(jest.fn(), { raw: jest.fn((sql: string) => sql) });
    (model as any).db = { connection: mockKnex };
  });

  it('removeOrphanedGroupMembers deletes BluLok and access_control orphans', async () => {
    let orphanQuery = 0;
    mockKnex.mockImplementation((table: string) => {
      if (table === 'device_group_members as m') {
        orphanQuery += 1;
        const rows =
          orphanQuery === 1
            ? [{ id: 'm-blulok', facility_id: 'fac-1' }]
            : [{ id: 'm-ac', facility_id: 'fac-1' }];
        const c = chain();
        (c as any).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve, reject);
        return c;
      }
      if (table === 'device_group_members') {
        return chain({
          del: jest.fn().mockResolvedValue(2),
        });
      }
      return chain();
    });

    const result = await model.removeOrphanedGroupMembers();

    expect(result.removed).toBe(2);
    expect(result.byFacility).toEqual({ 'fac-1': 2 });
  });

  it('removeOrphanedGroupMembers returns zero when nothing is stale', async () => {
    mockKnex.mockImplementation((table: string) => {
      if (table === 'device_group_members as m') {
        const c = chain();
        (c as any).then = (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve);
        return c;
      }
      return chain();
    });

    await expect(model.removeOrphanedGroupMembers()).resolves.toEqual({
      removed: 0,
      byFacility: {},
    });
  });

  it('removeAccessControlMembershipsForDevice deletes by device id', async () => {
    const del = jest.fn().mockResolvedValue(3);
    mockKnex.mockImplementation(() => chain({ del }));

    const removed = await model.removeAccessControlMembershipsForDevice('ac-1');
    expect(removed).toBe(3);
    expect(mockKnex).toHaveBeenCalledWith('device_group_members');
  });

  it('removeMembershipsForGatewayDevices clears AC and direct BluLok memberships', async () => {
    const memberDels: jest.Mock[] = [];
    mockKnex.mockImplementation((table: string) => {
      if (table === 'access_control_devices') {
        return chain({ pluck: jest.fn().mockResolvedValue(['ac-1', 'ac-2']) });
      }
      if (table === 'blulok_devices') {
        return chain({ pluck: jest.fn().mockResolvedValue(['lock-1']) });
      }
      if (table === 'device_group_members') {
        const del = jest.fn().mockResolvedValue(memberDels.length === 0 ? 2 : 1);
        memberDels.push(del);
        return chain({ del });
      }
      return chain();
    });

    const result = await model.removeMembershipsForGatewayDevices('gw-1');
    expect(result).toEqual({ accessControl: 2, blulokDirect: 1 });
    expect(memberDels).toHaveLength(2);
  });
});
