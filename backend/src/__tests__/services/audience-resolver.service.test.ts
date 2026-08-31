import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';
import { AppEntryAccessService } from '@/services/passes/app-entry-access.service';

jest.mock('@/services/database.service');

describe('AudienceResolver', () => {
  const makeKnex = () => {
    const db: any = jest.fn();
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      first: jest.fn(),
    };
    db.fn = { now: () => new Date() };
    (db).mockImplementation(() => qb);
    return { db, qb };
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty aud for ADMIN (devices authorize via user_role)', async () => {
    const { db } = makeKnex();
    const appEntrySpy = jest.spyOn(AppEntryAccessService, 'resolveDeviceIds');

    const aud = await AudienceResolver.resolve(db, { userId: 'u1', userRole: UserRole.ADMIN });
    expect(aud).toEqual([]);
    expect(appEntrySpy).not.toHaveBeenCalled();
    expect(db).not.toHaveBeenCalled();
  });

  it('returns empty aud for DEV_ADMIN', async () => {
    const { db } = makeKnex();

    const aud = await AudienceResolver.resolve(db, { userId: 'u1', userRole: UserRole.DEV_ADMIN });
    expect(aud).toEqual([]);
  });

  it('returns empty aud for FACILITY_ADMIN (even when assigned facilities have app-entry devices)', async () => {
    const { db } = makeKnex();
    const appEntrySpy = jest
      .spyOn(AppEntryAccessService, 'resolveDeviceIds')
      .mockResolvedValue(['ac-fac-1']);

    const aud = await AudienceResolver.resolve(db, {
      userId: 'fa-1',
      userRole: UserRole.FACILITY_ADMIN,
      facilityIds: ['fac-1'],
    });
    expect(aud).toEqual([]);
    expect(appEntrySpy).not.toHaveBeenCalled();
  });

  it('returns mixed audiences for TENANT (assigned + shared)', async () => {
    const { db, qb } = makeKnex();
    // Simulate join paths by swapping resolved values based on join args usage order
    let call = 0;
    qb.select.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve([{ device_serial: 'serial-assigned' }]); // assigned
      if (call === 2) return Promise.resolve([{ device_serial: 'serial-shared', owner_user_id: 'owner-1' }]); // shared
      return Promise.resolve([]);
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const aud = await AudienceResolver.resolve(db, { userId: 'tenant-1', userRole: UserRole.TENANT });
    expect(aud).toEqual(expect.arrayContaining(['lock:serial-assigned', 'shared_key:owner-1:serial-shared']));
    expect(qb.where).toHaveBeenCalledWith('ua.tenant_id', 'tenant-1');
    expect(qb.where).toHaveBeenCalledWith(expect.any(Function));
  });
});
