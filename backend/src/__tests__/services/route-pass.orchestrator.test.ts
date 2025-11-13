import { RoutePassOrchestrator } from '@/services/passes/route-pass.orchestrator';
import { DatabaseService } from '@/services/database.service';
import { PassesService } from '@/services/passes.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/database.service');
jest.mock('@/services/passes.service');
jest.mock('@/services/crypto/ed25519.service');
jest.mock('@/models/route-pass-issuance.model', () => ({
  RoutePassIssuanceModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({}),
  })),
}));

describe('RoutePassOrchestrator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('issues a route pass using preferred device header', async () => {
    const db: any = jest.fn((table: string) => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn(),
        join: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        fn: { now: () => new Date() },
      };
      if (table === 'user_devices') {
        qb.first.mockResolvedValue({ id: 'device-1', public_key: 'pubkey' });
      } else if (table.startsWith('blulok_devices')) {
        qb.select.mockResolvedValue([{ id: 'lock-1' }]);
      }
      return qb;
    });
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
    (PassesService.issueRoutePass as jest.Mock).mockResolvedValue('jwt-token');
    (Ed25519Service.verifyJwt as jest.Mock).mockResolvedValue({ jti: 'j', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });

    const token = await RoutePassOrchestrator.issueForUser(
      { userId: 'u1', role: UserRole.ADMIN, facilityIds: [] },
      'phone-1'
    );
    expect(token).toBe('jwt-token');
    expect(PassesService.issueRoutePass).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      devicePublicKey: 'pubkey',
      audiences: ['lock:lock-1'],
    }));
  });
});

