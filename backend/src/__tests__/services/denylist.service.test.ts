import { DenylistService } from '@/services/denylist.service';

describe('DenylistService', () => {
  describe('buildDenylistAdd', () => {
  it('builds signed denylist add packet', async () => {
    const [payload, signature] = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
    expect(payload.cmd_type).toBe('DENYLIST_ADD');
    expect(Array.isArray(payload.denylist_add)).toBe(true);
      expect(payload.denylist_add[0]).toEqual({ sub: 'user-1', exp: 1234 });
    expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
  });

  it('includes targets with device_ids when provided', async () => {
    const deviceIds = ['dev-1', 'dev-2'];
    const [payload] = await DenylistService.buildDenylistAdd([{ sub: 'user-2', exp: 9999 }], deviceIds);
    expect(payload.targets).toBeDefined();
    expect(Array.isArray(payload.targets.device_ids)).toBe(true);
    expect(payload.targets.device_ids).toEqual(deviceIds);
    });

    it('handles multiple entries', async () => {
      const entries = [
        { sub: 'user-1', exp: 1234 },
        { sub: 'user-2', exp: 5678 },
      ];
      const [payload] = await DenylistService.buildDenylistAdd(entries);
      expect(payload.denylist_add).toHaveLength(2);
      expect(payload.denylist_add).toEqual(entries);
    });

    it('omits targets when device_ids not provided', async () => {
      const [payload] = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
      expect(payload.targets).toBeUndefined();
    });
  });

  describe('buildDenylistRemove', () => {
    it('builds signed denylist remove packet', async () => {
      const [payload, signature] = await DenylistService.buildDenylistRemove([{ sub: 'user-1', exp: 0 }]);
      expect(payload.cmd_type).toBe('DENYLIST_REMOVE');
      expect(Array.isArray(payload.denylist_remove)).toBe(true);
      expect(payload.denylist_remove[0]).toEqual({ sub: 'user-1', exp: 0 });
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('includes targets with device_ids when provided', async () => {
      const deviceIds = ['dev-1', 'dev-2'];
      const [payload] = await DenylistService.buildDenylistRemove([{ sub: 'user-2', exp: 0 }], deviceIds);
      expect(payload.targets).toBeDefined();
      expect(Array.isArray(payload.targets.device_ids)).toBe(true);
      expect(payload.targets.device_ids).toEqual(deviceIds);
    });

    it('handles multiple entries', async () => {
      const entries = [
        { sub: 'user-1', exp: 0 },
        { sub: 'user-2', exp: 0 },
      ];
      const [payload] = await DenylistService.buildDenylistRemove(entries);
      expect(payload.denylist_remove).toHaveLength(2);
      expect(payload.denylist_remove).toEqual(entries);
    });

    it('omits targets when device_ids not provided', async () => {
      const [payload] = await DenylistService.buildDenylistRemove([{ sub: 'user-1', exp: 0 }]);
      expect(payload.targets).toBeUndefined();
    });
  });
});


