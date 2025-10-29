import { TimeSyncService } from '@/services/time-sync.service';

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
    expect(first.timeSyncPacket[0].ts).toBeGreaterThanOrEqual(1000);
    expect(second.timeSyncPacket[0].ts).toBeGreaterThanOrEqual(first.timeSyncPacket[0].ts);
    expect(typeof first.timeSyncPacket[1]).toBe('string');
  });
});


