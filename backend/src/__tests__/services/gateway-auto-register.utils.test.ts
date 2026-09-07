import { isDuplicateKeyError, isValidGatewayUuid } from '@/utils/gateway-auto-register.utils';

describe('gateway-auto-register.utils', () => {
  describe('isValidGatewayUuid', () => {
    it('accepts well-formed UUIDs', () => {
      expect(isValidGatewayUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
      expect(isValidGatewayUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects malformed values', () => {
      expect(isValidGatewayUuid('not-a-uuid')).toBe(false);
      expect(isValidGatewayUuid('gw-new')).toBe(false);
      expect(isValidGatewayUuid('')).toBe(false);
    });
  });

  describe('isDuplicateKeyError', () => {
    it('detects MySQL duplicate key errors', () => {
      expect(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' })).toBe(true);
      expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
      expect(isDuplicateKeyError(new Error('other'))).toBe(false);
    });
  });
});
