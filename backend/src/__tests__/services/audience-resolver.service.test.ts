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
      fn: { now: () => new Date() },
    };
    (db).mockImplementation(() => qb);
    return { db, qb };
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns lock:* for all locks when role is ADMIN', async () => {
    const { db, qb } = makeKnex();
    qb.select.mockResolvedValue([{ device_serial: 'ser-1' }, { device_serial: 'ser-2' }]);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    jest.spyOn(AppEntryAccessService, 'resolveDeviceIds').mockResolvedValue([]);

    const aud = await AudienceResolver.resolve(db, { userId: 'u1', userRole: UserRole.ADMIN });
    expect(aud).toEqual(['lock:ser-1', 'lock:ser-2']);
  });

  it('includes app-entry access_control:* audiences', async () => {
    const { db, qb } = makeKnex();
    qb.select.mockResolvedValue([{ device_serial: 'ser-1' }]);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    jest.spyOn(AppEntryAccessService, 'resolveDeviceIds').mockResolvedValue(['ac-1', 'ac-2']);

    const aud = await AudienceResolver.resolve(db, { userId: 'u1', userRole: UserRole.ADMIN });
    expect(aud).toEqual(expect.arrayContaining(['lock:ser-1', 'access_control:ac-1', 'access_control:ac-2']));
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


