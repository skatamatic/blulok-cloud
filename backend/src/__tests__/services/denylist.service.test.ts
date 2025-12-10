import { DenylistService } from '@/services/denylist.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

// Helper to decode JWT payload
function decodeJwtPayload(jwt: string): Record<string, any> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

describe('DenylistService', () => {
  describe('buildDenylistAdd', () => {
    it('builds signed denylist add JWT', async () => {
      const jwt = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
      
      expect(typeof jwt).toBe('string');
      expect(jwt.split('.').length).toBe(3); // Valid JWT format
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.iss).toBe('BluCloud:Root');
      expect(payload.cmd_type).toBe('DENYLIST_ADD');
      expect(Array.isArray(payload.denylist_add)).toBe(true);
      expect(payload.denylist_add[0]).toEqual({ sub: 'user-1', exp: 1234 });
      expect(payload.iat).toBeDefined();
    });

    it('includes target as flat array when provided', async () => {
      const deviceIds = ['dev-1', 'dev-2'];
      const jwt = await DenylistService.buildDenylistAdd([{ sub: 'user-2', exp: 9999 }], deviceIds);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.target).toBeDefined();
      expect(Array.isArray(payload.target)).toBe(true);
      expect(payload.target).toEqual(deviceIds);
    });

    it('handles multiple entries', async () => {
      const entries = [
        { sub: 'user-1', exp: 1234 },
        { sub: 'user-2', exp: 5678 },
      ];
      const jwt = await DenylistService.buildDenylistAdd(entries);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.denylist_add).toHaveLength(2);
      expect(payload.denylist_add).toEqual(entries);
    });

    it('omits target when device_ids not provided', async () => {
      const jwt = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.target).toBeUndefined();
    });

    it('produces verifiable JWT', async () => {
      const jwt = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
      
      // Should be verifiable with Ed25519Service
      const verified = await Ed25519Service.verifyJwt(jwt);
      expect(verified.cmd_type).toBe('DENYLIST_ADD');
    });
  });

  describe('buildDenylistRemove', () => {
    it('builds signed denylist remove JWT', async () => {
      const jwt = await DenylistService.buildDenylistRemove([{ sub: 'user-1', exp: 0 }]);
      
      expect(typeof jwt).toBe('string');
      expect(jwt.split('.').length).toBe(3); // Valid JWT format
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.iss).toBe('BluCloud:Root');
      expect(payload.cmd_type).toBe('DENYLIST_REMOVE');
      expect(Array.isArray(payload.denylist_remove)).toBe(true);
      expect(payload.denylist_remove[0]).toEqual({ sub: 'user-1', exp: 0 });
      expect(payload.iat).toBeDefined();
    });

    it('includes target as flat array when provided', async () => {
      const deviceIds = ['dev-1', 'dev-2'];
      const jwt = await DenylistService.buildDenylistRemove([{ sub: 'user-2', exp: 0 }], deviceIds);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.target).toBeDefined();
      expect(Array.isArray(payload.target)).toBe(true);
      expect(payload.target).toEqual(deviceIds);
    });

    it('handles multiple entries', async () => {
      const entries = [
        { sub: 'user-1', exp: 0 },
        { sub: 'user-2', exp: 0 },
      ];
      const jwt = await DenylistService.buildDenylistRemove(entries);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.denylist_remove).toHaveLength(2);
      expect(payload.denylist_remove).toEqual(entries);
    });

    it('omits target when device_ids not provided', async () => {
      const jwt = await DenylistService.buildDenylistRemove([{ sub: 'user-1', exp: 0 }]);
      
      const payload = decodeJwtPayload(jwt);
      expect(payload.target).toBeUndefined();
    });

    it('produces verifiable JWT', async () => {
      const jwt = await DenylistService.buildDenylistRemove([{ sub: 'user-1', exp: 0 }]);
      
      // Should be verifiable with Ed25519Service
      const verified = await Ed25519Service.verifyJwt(jwt);
      expect(verified.cmd_type).toBe('DENYLIST_REMOVE');
    });
  });
});
