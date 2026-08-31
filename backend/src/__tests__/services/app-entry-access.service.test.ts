import { AppEntryAccessService } from '@/services/passes/app-entry-access.service';
import { UserRole } from '@/types/auth.types';

const makeThenableQuery = (rows: any[]) => ({
  distinct: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  andWhereRaw: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereRaw: jest.fn().mockReturnThis(),
  modify: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  then: (resolve: (value: any[]) => void) => Promise.resolve(rows).then(resolve),
  catch: () => undefined,
});

describe('AppEntryAccessService', () => {
  it('returns empty for facility admin with no facility scope', async () => {
    const db: any = jest.fn(() => makeThenableQuery([]));
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'fa-1',
      userRole: UserRole.FACILITY_ADMIN,
      facilityIds: [],
    });

    expect(deviceIds).toEqual([]);
    expect(db).not.toHaveBeenCalled();
  });

  it('returns empty for unsupported roles', async () => {
    const db: any = jest.fn(() => makeThenableQuery([]));
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'viewer-1',
      userRole: 'viewer' as any,
    });

    expect(deviceIds).toEqual([]);
    expect(db).not.toHaveBeenCalled();
  });

  it('returns all app-entry access control devices for admin scope', async () => {
    const adminRows = [{ id: 'ac-1' }, { id: 'ac-2' }];
    let adminQuery: any;
    const db: any = jest.fn((table: string) => {
      if (table === 'access_control_devices as acd') {
        adminQuery = makeThenableQuery(adminRows);
        return adminQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'u1',
      userRole: UserRole.ADMIN,
    });

    expect(deviceIds).toEqual(['ac-1', 'ac-2']);
    expect(adminQuery.whereRaw).toHaveBeenCalledWith(
      `JSON_CONTAINS(COALESCE(acd.access_methods, '["app"]'), '"app"')`,
    );
    expect(adminQuery.orderBy).toHaveBeenCalledWith('acd.id', 'asc');
  });

  it('applies explicit facility filter for admin scope', async () => {
    let adminQuery: any;
    const db: any = jest.fn((table: string) => {
      if (table === 'access_control_devices as acd') {
        adminQuery = makeThenableQuery([{ id: 'ac-1' }]);
        return adminQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'u1',
      userRole: UserRole.ADMIN,
      facilityId: 'fac-1',
    });

    expect(deviceIds).toEqual(['ac-1']);
    expect(adminQuery.where).toHaveBeenCalledWith('g.facility_id', 'fac-1');
  });

  it('returns scoped and global app-entry devices for tenant including shared-key lock access', async () => {
    const assignedRows = [{ device_id: 'lock-assigned-1' }];
    const sharedRows = [{ device_id: 'lock-shared-1' }];
    const assignedFacilityRows = [{ facility_id: 'fac-1' }];
    const sharedFacilityRows: any[] = [];
    const scopedRows = [{ id: 'ac-zone-1' }];
    const globalRows = [{ id: 'ac-global-1' }];
    const callCounts: Record<string, number> = {};
    const db: any = jest.fn((table: string) => {
      callCounts[table] = (callCounts[table] || 0) + 1;
      if (table === 'unit_assignments as ua') {
        return makeThenableQuery(callCounts[table] === 1 ? assignedRows : assignedFacilityRows);
      }
      if (table === 'key_sharing as ks') {
        return makeThenableQuery(callCounts[table] === 1 ? sharedRows : sharedFacilityRows);
      }
      if (table === 'device_group_members as zone_access') {
        return makeThenableQuery(callCounts[table] === 1 ? scopedRows : globalRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityId: 'fac-1',
    });

    expect(deviceIds).toEqual(['ac-zone-1', 'ac-global-1']);
  });

  it('returns default-group app-entry devices for facility default group', async () => {
    const assignedRows = [{ device_id: 'lock-assigned-1' }];
    const sharedRows: any[] = [];
    const assignedFacilityRows = [{ facility_id: 'fac-1' }];
    const sharedFacilityRows: any[] = [];
    const globalRows = [{ id: 'ac-default-1' }];
    const callCounts: Record<string, number> = {};
    let globalQuery: any;
    const db: any = jest.fn((table: string) => {
      callCounts[table] = (callCounts[table] || 0) + 1;
      if (table === 'unit_assignments as ua') {
        return makeThenableQuery(callCounts[table] === 1 ? assignedRows : assignedFacilityRows);
      }
      if (table === 'key_sharing as ks') {
        return makeThenableQuery(callCounts[table] === 1 ? sharedRows : sharedFacilityRows);
      }
      if (table === 'device_group_members as zone_access') {
        globalQuery = makeThenableQuery(globalRows);
        return globalQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityId: 'fac-1',
    });

    expect(deviceIds).toEqual(['ac-default-1']);
    expect(globalQuery.andWhere).toHaveBeenCalled();
  });

  it('returns global app-entry devices for tenant even without lock group membership', async () => {
    const assignedRows: any[] = [];
    const sharedRows: any[] = [];
    const assignedFacilityRows = [{ facility_id: 'fac-1' }];
    const sharedFacilityRows: any[] = [];
    const globalRows = [{ id: 'ac-global-1' }];
    const callCounts: Record<string, number> = {};
    const db: any = jest.fn((table: string) => {
      callCounts[table] = (callCounts[table] || 0) + 1;
      if (table === 'unit_assignments as ua') {
        return makeThenableQuery(callCounts[table] === 1 ? assignedRows : assignedFacilityRows);
      }
      if (table === 'key_sharing as ks') {
        return makeThenableQuery(callCounts[table] === 1 ? sharedRows : sharedFacilityRows);
      }
      if (table === 'device_group_members as zone_access') {
        return makeThenableQuery(globalRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityId: 'fac-1',
    });

    expect(deviceIds).toEqual(['ac-global-1']);
  });

  it('returns empty for tenant when no facility access exists', async () => {
    const assignedRows: any[] = [];
    const sharedRows: any[] = [];
    const db: any = jest.fn((table: string) => {
      if (table === 'unit_assignments as ua') return makeThenableQuery(assignedRows);
      if (table === 'key_sharing as ks') return makeThenableQuery(sharedRows);
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityId: 'fac-1',
    });

    expect(deviceIds).toEqual([]);
  });

  it('returns scoped devices for tenant without explicit facility scope', async () => {
    const assignedRows = [{ device_id: 'lock-assigned-1' }];
    const sharedRows: any[] = [];
    const assignedFacilityRows = [{ facility_id: 'fac-1' }];
    const sharedFacilityRows: any[] = [];
    const scopedRows = [{ id: 'ac-zone-1' }];
    const globalRows: any[] = [];
    const callCounts: Record<string, number> = {};
    const db: any = jest.fn((table: string) => {
      callCounts[table] = (callCounts[table] || 0) + 1;
      if (table === 'unit_assignments as ua') {
        return makeThenableQuery(callCounts[table] === 1 ? assignedRows : assignedFacilityRows);
      }
      if (table === 'key_sharing as ks') {
        return makeThenableQuery(callCounts[table] === 1 ? sharedRows : sharedFacilityRows);
      }
      if (table === 'device_group_members as zone_access') {
        return makeThenableQuery(callCounts[table] === 1 ? scopedRows : globalRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    db.fn = { now: () => new Date() };

    const deviceIds = await AppEntryAccessService.resolveDeviceIds(db, {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityIds: ['fac-1'],
    });

    expect(deviceIds).toEqual(['ac-zone-1']);
  });
});

