import {
  denialReasonToLabel,
  buildAccessFailureSummary,
  isGatewaySyncActivityDescription,
  DENIAL_REASON_MESSAGES,
} from '@/constants/access-history.constants';

describe('access-history.constants', () => {
  describe('denialReasonToLabel', () => {
    it('returns undefined for empty reason', () => {
      expect(denialReasonToLabel(undefined)).toBeUndefined();
      expect(denialReasonToLabel('')).toBeUndefined();
    });

    it('maps known denial codes to labels', () => {
      expect(denialReasonToLabel('out_of_schedule')).toBe(
        DENIAL_REASON_MESSAGES.out_of_schedule,
      );
      expect(denialReasonToLabel('settlement_mismatch')).toBe(
        DENIAL_REASON_MESSAGES.settlement_mismatch,
      );
    });

    it('title-cases unknown snake_case reasons', () => {
      expect(denialReasonToLabel('custom_failure_code')).toBe('Custom Failure Code');
    });
  });

  describe('buildAccessFailureSummary', () => {
    it('combines distinct denial label and result message', () => {
      expect(buildAccessFailureSummary('invalid_credential', 'Key rejected')).toBe(
        `${DENIAL_REASON_MESSAGES.invalid_credential} — Key rejected`,
      );
    });

    it('returns a single string when label and message match', () => {
      const label = DENIAL_REASON_MESSAGES.timeout;
      expect(buildAccessFailureSummary('timeout', label)).toBe(label);
    });

    it('falls back to whichever of label or message is present', () => {
      expect(buildAccessFailureSummary(undefined, 'Only message')).toBe('Only message');
      expect(buildAccessFailureSummary('device_offline', undefined)).toBe(
        DENIAL_REASON_MESSAGES.device_offline,
      );
      expect(buildAccessFailureSummary(undefined, undefined)).toBeUndefined();
    });
  });

  describe('isGatewaySyncActivityDescription', () => {
    it('matches legacy gateway sync descriptions', () => {
      expect(isGatewaySyncActivityDescription('Device was unlocked by Gateway')).toBe(true);
      expect(isGatewaySyncActivityDescription('  Device was locking by Gateway  ')).toBe(true);
    });

    it('rejects non-matching or empty descriptions', () => {
      expect(isGatewaySyncActivityDescription(undefined)).toBe(false);
      expect(isGatewaySyncActivityDescription('Device was unlocked locally at the device')).toBe(
        false,
      );
    });
  });
});
