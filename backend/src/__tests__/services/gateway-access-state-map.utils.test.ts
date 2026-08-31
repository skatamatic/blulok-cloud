import { mapGatewayAccessStateFieldsToDbUpdate } from '@/utils/gateway-access-state-map.utils';

describe('gateway-access-state-map.utils', () => {
  describe('mapGatewayAccessStateFieldsToDbUpdate', () => {
    it('maps online, locked, and last_seen', () => {
      expect(
        mapGatewayAccessStateFieldsToDbUpdate({
          online: true,
          locked: false,
          last_seen: '2026-06-02T15:18:11.039532Z',
        })
      ).toEqual({
        status: 'online',
        is_locked: false,
        last_activity: expect.any(Date),
      });
    });

    it('skips invalid last_seen', () => {
      expect(
        mapGatewayAccessStateFieldsToDbUpdate({
          online: true,
          last_seen: 'not-a-date',
        })
      ).toEqual({
        status: 'online',
      });
    });

    it('ignores locked telemetry when hardware has no lock feedback', () => {
      expect(
        mapGatewayAccessStateFieldsToDbUpdate(
          { online: true, locked: false, last_seen: '2026-06-02T15:18:11.039532Z' },
          { hasLockFeedback: false },
        ),
      ).toEqual({
        status: 'online',
        last_activity: expect.any(Date),
      });
    });

    it('returns empty object when no fields provided', () => {
      expect(mapGatewayAccessStateFieldsToDbUpdate({})).toEqual({});
    });
  });
});
