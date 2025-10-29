import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { config } from '@/config/environment';

describe('Ed25519Service', () => {
  it('signs and verifies JWTs', async () => {
    const token = await Ed25519Service.signJwt({ iss: 'BluCloud:Root', sub: 'user-1', aud: ['zone:A'], device_pubkey: config.security.opsPublicKeyB64 });
    const payload = await Ed25519Service.verifyJwt(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.iss).toBe('BluCloud:Root');
  });

  it('produces canonical JSON signatures for packets', async () => {
    const p = { b: 2, a: 1 } as any;
    const { signature } = await Ed25519Service.signPacket(p);
    const { signature: signature2 } = await Ed25519Service.signPacket({ a: 1, b: 2 } as any);
    expect(signature).toEqual(signature2);
  });
});


