import { AudienceResolver } from '@/services/passes/audience-resolver.service';
import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/database.service');

describe('AudienceResolver', () => {
  const makeKnex = () => {
    const db: any = jest.fn();
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      first: jest.fn(),
      fn: { now: () => new Date() },
    };
    (db as any).mockImplementation(() => qb);
    return { db, qb };
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns lock:* for all locks when role is ADMIN', async () => {
    const { db, qb } = makeKnex();
    qb.select.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const aud = await AudienceResolver.resolve(db as any, { userId: 'u1', userRole: UserRole.ADMIN });
    expect(aud).toEqual(['lock:l1', 'lock:l2']);
  });

  it('returns mixed audiences for TENANT (assigned + shared)', async () => {
    const { db, qb } = makeKnex();
    // Simulate join paths by swapping resolved values based on join args usage order
    let call = 0;
    qb.select.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve([{ id: 'lock-assigned' }]); // assigned
      if (call === 2) return Promise.resolve([{ device_id: 'lock-shared', owner_user_id: 'owner-1' }]); // shared
      return Promise.resolve([]);
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });

    const aud = await AudienceResolver.resolve(db as any, { userId: 'tenant-1', userRole: UserRole.TENANT });
    expect(aud).toEqual(expect.arrayContaining(['lock:lock-assigned', 'shared_key:owner-1:lock-shared']));
  });
});


