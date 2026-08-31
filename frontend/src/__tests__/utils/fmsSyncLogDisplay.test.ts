import { FMSSyncLog, FMSSyncStatus } from '@/types/fms.types';
import {
  getFmsSyncAppliedColumnText,
  getFmsSyncHistoryChangesLabel,
  getFmsSyncHistoryDetectedSuffix,
  getFmsSyncLogKind,
  getFmsSyncLogTypeLabel,
  isFmsWebhookPushLog,
} from '@/utils/fmsSyncLogDisplay';

const base = (overrides: Partial<FMSSyncLog>): FMSSyncLog => ({
  id: 'log-1',
  facility_id: 'fac-1',
  fms_config_id: 'cfg-1',
  sync_status: FMSSyncStatus.COMPLETED,
  started_at: new Date().toISOString(),
  triggered_by: 'manual',
  changes_detected: 0,
  changes_applied: 0,
  changes_pending: 0,
  changes_rejected: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('fmsSyncLogDisplay', () => {
  describe('getFmsSyncHistoryDetectedSuffix', () => {
    it('returns empty for zero changes (no false auto-applied)', () => {
      expect(getFmsSyncHistoryDetectedSuffix(base({}))).toBe('');
    });

    it('shows Auto-applied only when sync_summary flag is true', () => {
      const log = base({
        changes_detected: 3,
        changes_applied: 3,
        changes_pending: 3,
        sync_summary: {
          tenants_synced: 1,
          units_synced: 1,
          errors: [],
          warnings: [],
          changes_auto_applied: true,
        },
      });
      expect(getFmsSyncHistoryDetectedSuffix(log)).toBe(' • Auto-applied');
    });

    it('shows All applied when counts match but flag is false', () => {
      const log = base({
        changes_detected: 2,
        changes_applied: 2,
        changes_pending: 2,
        sync_summary: {
          tenants_synced: 1,
          units_synced: 1,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        },
      });
      expect(getFmsSyncHistoryDetectedSuffix(log)).toBe(' • All applied');
    });

    it('shows All applied when flag is missing (legacy logs)', () => {
      const log = base({
        changes_detected: 2,
        changes_applied: 2,
        changes_pending: 0,
        sync_summary: {
          tenants_synced: 1,
          units_synced: 1,
          errors: [],
          warnings: [],
        },
      });
      expect(getFmsSyncHistoryDetectedSuffix(log)).toBe(' • All applied');
    });
  });

  describe('getFmsSyncAppliedColumnText', () => {
    it('shows em dash for zero changes', () => {
      expect(getFmsSyncAppliedColumnText(base({}))).toBe('—');
    });
  });

  describe('sync log kind', () => {
    it('classifies webhook runs as update pushes', () => {
      const log = base({ triggered_by: 'webhook' });
      expect(getFmsSyncLogKind(log)).toBe('webhook_push');
      expect(isFmsWebhookPushLog(log)).toBe(true);
      expect(getFmsSyncLogTypeLabel(log)).toBe('Update push');
    });

    it('classifies manual and automatic runs as full syncs', () => {
      expect(getFmsSyncLogTypeLabel(base({ triggered_by: 'manual' }))).toBe('Full sync');
      expect(getFmsSyncLogTypeLabel(base({ triggered_by: 'automatic' }))).toBe('Full sync');
    });
  });

  describe('getFmsSyncHistoryChangesLabel', () => {
    it('uses granular change wording for webhook pushes', () => {
      expect(getFmsSyncHistoryChangesLabel(base({ triggered_by: 'webhook', changes_detected: 0 }))).toBe(
        'No changes',
      );
      expect(getFmsSyncHistoryChangesLabel(base({ triggered_by: 'webhook', changes_detected: 1 }))).toBe(
        '1 change',
      );
      expect(getFmsSyncHistoryChangesLabel(base({ triggered_by: 'webhook', changes_detected: 3 }))).toBe(
        '3 changes',
      );
    });

    it('uses detected wording for full syncs', () => {
      expect(
        getFmsSyncHistoryChangesLabel(
          base({ triggered_by: 'manual', changes_detected: 5, changes_applied: 5 }),
        ),
      ).toBe('5 detected • All applied');
    });
  });
});
