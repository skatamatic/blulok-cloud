import {
  hasReportedStatusMismatch,
  resolveReachabilityDisplayFields,
  statusUnreachableReasonLabel,
} from '@/utils/device-reachability.utils';

describe('device-reachability.utils', () => {
  describe('statusUnreachableReasonLabel', () => {
    it('maps known gateway reasons to operator copy', () => {
      expect(statusUnreachableReasonLabel('gateway_offline')).toBe(
        'Gateway offline — device unreachable',
      );
      expect(statusUnreachableReasonLabel('gateway_maintenance')).toBe(
        'Gateway in maintenance — device unreachable',
      );
      expect(statusUnreachableReasonLabel('gateway_error')).toBe(
        'Gateway error — device unreachable',
      );
    });

    it('returns null when reason is absent', () => {
      expect(statusUnreachableReasonLabel(null)).toBeNull();
      expect(statusUnreachableReasonLabel(undefined)).toBeNull();
    });
  });

  describe('hasReportedStatusMismatch', () => {
    it('returns true when reason is set and effective differs from reported', () => {
      expect(
        hasReportedStatusMismatch({
          effective: 'offline',
          reported: 'online',
          reason: 'gateway_offline',
        }),
      ).toBe(true);
    });

    it('returns false when reason is absent', () => {
      expect(
        hasReportedStatusMismatch({
          effective: 'offline',
          reported: 'online',
          reason: null,
        }),
      ).toBe(false);
    });

    it('returns false when effective matches reported', () => {
      expect(
        hasReportedStatusMismatch({
          effective: 'offline',
          reported: 'offline',
          reason: 'gateway_offline',
        }),
      ).toBe(false);
    });
  });

  describe('resolveReachabilityDisplayFields', () => {
    it('prefers reported_device_status over reported_status', () => {
      const fields = resolveReachabilityDisplayFields({
        effectiveStatus: 'offline',
        reportedDeviceStatus: 'online',
        reportedStatus: 'maintenance',
        statusUnreachableReason: 'gateway_offline',
      });
      expect(fields.effective).toBe('offline');
      expect(fields.reported).toBe('online');
      expect(fields.reason).toBe('gateway_offline');
    });
  });
});
