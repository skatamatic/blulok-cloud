jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(),
  },
}));

import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';
import { DatabaseService } from '@/services/database.service';

type QueryLike = {
  select: jest.Mock;
  whereIn: jest.Mock;
  distinct: jest.Mock;
  join: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  then: (resolve: (rows: any[]) => any, reject?: (error: any) => any) => Promise<any>;
  catch: (reject: (error: any) => any) => Promise<any>;
  finally: (finalizer: () => any) => Promise<any>;
};

const makeThenableQuery = (rows: any[]): QueryLike => {
  const query: QueryLike = {
    select: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    catch: (reject) => Promise.resolve(rows).catch(reject),
    finally: (finalizer) => Promise.resolve(rows).finally(finalizer),
  };
  return query;
};

describe('AccessControlZoneAccessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty bluLok IDs when no units provided', async () => {
    const db = jest.fn();
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const result = await AccessControlZoneAccessService.getBluLokDeviceIdsForUnits([]);

    expect(result).toEqual([]);
    expect(db).not.toHaveBeenCalled();
  });

  it('maps bluLok IDs for provided units', async () => {
    const blulokQuery = makeThenableQuery([{ id: 'lock-1' }, { id: 200 }]);
    const db = jest.fn((table: string) => {
      if (table === 'blulok_devices') return blulokQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const result = await AccessControlZoneAccessService.getBluLokDeviceIdsForUnits(['u-1', 'u-2']);

    expect(blulokQuery.whereIn).toHaveBeenCalledWith('unit_id', ['u-1', 'u-2']);
    expect(result).toEqual(['lock-1', '200']);
  });

  it('returns empty access-control IDs when no bluLok IDs provided', async () => {
    const db = jest.fn();
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const result = await AccessControlZoneAccessService.getAccessControlDeviceIdsForBluLokDevices([]);

    expect(result).toEqual([]);
    expect(db).not.toHaveBeenCalled();
  });

  it('resolves zone-linked access-control IDs from bluLok device IDs', async () => {
    const zoneQuery = makeThenableQuery([{ device_id: 'ac-1' }, { device_id: 44 }]);
    const db = jest.fn((table: string) => {
      if (table === 'device_group_members as zone_access') return zoneQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const result = await AccessControlZoneAccessService.getAccessControlDeviceIdsForBluLokDevices(['lock-1']);

    expect(zoneQuery.where).toHaveBeenCalledWith('dg.group_type', 'zone');
    expect(zoneQuery.andWhere).toHaveBeenCalledWith('dg.is_active', true);
    expect(zoneQuery.whereIn).toHaveBeenCalledWith('zone_lock.device_id', ['lock-1']);
    expect(result).toEqual(['ac-1', '44']);
  });

  it('chains unit -> blulok -> access-control resolution', async () => {
    const lockSpy = jest
      .spyOn(AccessControlZoneAccessService, 'getBluLokDeviceIdsForUnits')
      .mockResolvedValue(['lock-a', 'lock-b']);
    const acSpy = jest
      .spyOn(AccessControlZoneAccessService, 'getAccessControlDeviceIdsForBluLokDevices')
      .mockResolvedValue(['ac-a']);

    const result = await AccessControlZoneAccessService.getAccessControlDeviceIdsForUnits(['unit-a']);

    expect(lockSpy).toHaveBeenCalledWith(['unit-a']);
    expect(acSpy).toHaveBeenCalledWith(['lock-a', 'lock-b']);
    expect(result).toEqual(['ac-a']);
  });

  it('getDenylistDeviceIdsForUnits returns only bluLok locks (denylist FK target)', async () => {
    const lockSpy = jest
      .spyOn(AccessControlZoneAccessService, 'getBluLokDeviceIdsForUnits')
      .mockResolvedValue(['lock-a']);

    const result = await AccessControlZoneAccessService.getDenylistDeviceIdsForUnits(['unit-a']);

    expect(lockSpy).toHaveBeenCalledWith(['unit-a']);
    expect(result).toEqual(['lock-a']);
  });

  it('returns empty facility map when no device IDs provided', async () => {
    const db = jest.fn();
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const map = await AccessControlZoneAccessService.getDeviceFacilityIds([]);

    expect(map.size).toBe(0);
    expect(db).not.toHaveBeenCalled();
  });

  it('merges facility map from bluLok and access-control sources', async () => {
    const blulokQuery = makeThenableQuery([
      { device_id: 'lock-1', facility_id: 'fac-1' },
      { device_id: 'shared-id', facility_id: 'fac-from-lock' },
    ]);
    const accessControlQuery = makeThenableQuery([
      { device_id: 'ac-1', facility_id: 'fac-2' },
      { device_id: 'shared-id', facility_id: 'fac-from-ac' },
    ]);
    const db = jest.fn((table: string) => {
      if (table === 'blulok_devices as bd') return blulokQuery;
      if (table === 'access_control_devices as acd') return accessControlQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const map = await AccessControlZoneAccessService.getDeviceFacilityIds(['lock-1', 'ac-1', 'shared-id']);

    expect(blulokQuery.whereIn).toHaveBeenCalledWith('bd.id', ['lock-1', 'ac-1', 'shared-id']);
    expect(accessControlQuery.whereIn).toHaveBeenCalledWith('acd.id', ['lock-1', 'ac-1', 'shared-id']);
    expect(map.get('lock-1')).toBe('fac-1');
    expect(map.get('ac-1')).toBe('fac-2');
    // Access-control rows are applied after bluLok rows and should win on collisions.
    expect(map.get('shared-id')).toBe('fac-from-ac');
  });
});

