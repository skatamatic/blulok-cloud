import { FallbackService } from '@/services/fallback.service';
import { PassesService } from '@/services/passes.service';
import { DatabaseService } from '@/services/database.service';
import { importJWK, SignJWT, JWK, generateKeyPair, exportJWK } from 'jose';

jest.mock('@/services/database.service');
jest.mock('@/services/passes.service');

describe('FallbackService', () => {
  const dbMock: any = jest.fn();
  beforeEach(() => {
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: dbMock });
  });

  it('verifies device-signed JWT and returns a route pass', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const jwkPriv = await exportJWK(privateKey as any) as any;
    const jwkPub = await exportJWK(publicKey as any) as any;
    const deviceJwk: JWK = { kty: 'OKP', crv: 'Ed25519', d: jwkPriv.d, x: jwkPub.x } as any;
    const key = await importJWK(deviceJwk, 'EdDSA');
    const payload = { iss: 'blulok-app', sub: 'user-1', aud: 'blulok-cloud-fallback', iat: Math.floor(Date.now() / 1000), dev: 'device-1' } as any;
    const jwt = await new SignJWT(payload).setProtectedHeader({ alg: 'EdDSA' }).sign(key as any);

    dbMock.mockImplementation((table: string) => {
      if (table === 'user_devices') {
        return { where: () => ({ select: () => ({ first: () => Promise.resolve({ public_key: jwkPub.x }) }) }) } as any;
      }
      return {} as any;
    });

    (PassesService.issueRoutePass as jest.Mock).mockResolvedValue('route-pass-token');

    const service = new FallbackService();
    const routePass = await service.processFallbackJwt(jwt);
    expect(routePass).toBe('route-pass-token');
  });
});


