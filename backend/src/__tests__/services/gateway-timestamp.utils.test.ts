import { parseGatewayLastSeen } from '@/utils/gateway-timestamp.utils';

describe('gateway-timestamp.utils', () => {
  describe('parseGatewayLastSeen', () => {
    it('parses valid ISO strings', () => {
      const parsed = parseGatewayLastSeen('2026-06-02T15:18:11.039532Z');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.toISOString()).toBe('2026-06-02T15:18:11.039Z');
    });

    it('accepts Date instances', () => {
      const input = new Date('2026-06-02T15:18:11.039Z');
      expect(parseGatewayLastSeen(input)).toEqual(input);
    });

    it('returns undefined for invalid strings', () => {
      expect(parseGatewayLastSeen('not-a-date')).toBeUndefined();
    });

    it('returns undefined when omitted', () => {
      expect(parseGatewayLastSeen(undefined)).toBeUndefined();
    });
  });
});
