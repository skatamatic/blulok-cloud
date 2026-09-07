import {
  buildFmsApplyErrorDetail,
  formatFmsApplyErrorFallback,
  resolveFmsChangeEntityLabel,
} from '@/services/fms/fms-apply-error.utils';
import { FMSChangeType } from '@/types/fms.types';

describe('fms-apply-error.utils', () => {
  const baseChange = {
    id: 'chg-1',
    sync_log_id: 'sync-1',
    change_type: FMSChangeType.UNIT_UPDATED,
    entity_type: 'unit' as const,
    external_id: '8a3a253e-fa5e-40a3-a730-70dee60c3e9d',
    required_actions: [],
    impact_summary: 'Update unit 101',
    is_reviewed: true,
    created_at: new Date(),
  };

  it('prefers unitNumber over UUID external id', () => {
    expect(
      resolveFmsChangeEntityLabel({
        ...baseChange,
        after_data: { unitNumber: '101', status: 'occupied' },
      }),
    ).toBe('101');
  });

  it('uses tenant email when present', () => {
    expect(
      resolveFmsChangeEntityLabel({
        ...baseChange,
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        after_data: { email: 'a@example.com', firstName: 'A', lastName: 'B' },
      }),
    ).toBe('a@example.com');
  });

  it('falls back to generic label instead of UUID', () => {
    expect(
      resolveFmsChangeEntityLabel({
        ...baseChange,
        after_data: {},
        impact_summary: '',
      }),
    ).toBe('a unit');
  });

  it('builds structured detail and compact fallback without UUID', () => {
    const detail = buildFmsApplyErrorDetail(
      {
        ...baseChange,
        after_data: { unitNumber: 'A-12' },
      },
      new Error('Cannot change unit status while tenants are assigned. Remove all tenants first.'),
    );

    expect(detail.entityLabel).toBe('A-12');
    expect(detail.message).toContain('Cannot change unit status');
    expect(formatFmsApplyErrorFallback(detail)).toBe(
      'unit_updated: Cannot change unit status while tenants are assigned. Remove all tenants first.',
    );
    expect(formatFmsApplyErrorFallback(detail)).not.toContain(baseChange.external_id);
  });
});
