import { PassesService } from '@/services/passes.service';
import { DatabaseService } from '@/services/database.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

jest.mock('@/services/database.service');

describe('PassesService', () => {
  it('issues a route pass containing device_pubkey and claims', async () => {
    const token = await PassesService.issueRoutePass({ userId: 'user-xyz', devicePublicKey: 'cHVibGljS2V5', audiences: ['lock:1'] });
    const payload = await Ed25519Service.verifyJwt(token);
    expect(payload.sub).toBe('user-xyz');
    expect(payload.device_pubkey).toBe('cHVibGljS2V5');
    expect(Array.isArray(payload.aud)).toBe(true);
  });
});


