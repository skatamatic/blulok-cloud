import { TimeSyncService } from '@/services/time-sync.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

// Mock DB persistence so unit test doesn't hit real/mocked DB; we still exercise logic
jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      connection: {
        // very small stub to satisfy calls
        where: function(this: any, _filter: any) {
          return {
            first: async () => null,
          } as any;
        },
        insert: async () => undefined,
        update: async () => undefined,
        fn: { now: () => new Date() },
      },
    }),
  },
}));

describe('TimeSyncService', () => {
  it('builds a signed time sync packet with non-decreasing ts', async () => {
    const first = await TimeSyncService.buildSecureTimeSync(1000);
    const second = await TimeSyncService.buildSecureTimeSync(900);

    expect(typeof first.timeSyncJwt).toBe('string');
    expect(typeof second.timeSyncJwt).toBe('string');

    const firstClaims = await Ed25519Service.verifyJwt(first.timeSyncJwt);
    const secondClaims = await Ed25519Service.verifyJwt(second.timeSyncJwt);

    expect(firstClaims.cmd_type).toBe('SECURE_TIME_SYNC');
    expect(secondClaims.cmd_type).toBe('SECURE_TIME_SYNC');
    expect(firstClaims.ts).toBeGreaterThanOrEqual(1000);
    expect(secondClaims.ts).toBeGreaterThanOrEqual(firstClaims.ts);
  });
});


