import { DenylistService } from '@/services/denylist.service';

describe('DenylistService', () => {
  it('builds signed denylist add packet', async () => {
    const [payload, signature] = await DenylistService.buildDenylistAdd([{ sub: 'user-1', exp: 1234 }]);
    expect(payload.cmd_type).toBe('DENYLIST_ADD');
    expect(Array.isArray(payload.denylist_add)).toBe(true);
    expect(typeof signature).toBe('string');
  });

  it('includes targets with device_ids when provided', async () => {
    const deviceIds = ['dev-1', 'dev-2'];
    const [payload] = await DenylistService.buildDenylistAdd([{ sub: 'user-2', exp: 9999 }], deviceIds);
    expect(payload.targets).toBeDefined();
    expect(Array.isArray(payload.targets.device_ids)).toBe(true);
    expect(payload.targets.device_ids).toEqual(deviceIds);
  });
});


