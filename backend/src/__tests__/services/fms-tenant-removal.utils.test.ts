import {
  clearFmsMappingRemoved,
  FMS_MAPPING_REMOVED_AT_KEY,
  isFmsUserRemovedFromFacility,
  stampFmsMappingRemoved,
} from '@/services/fms/fms-tenant-removal.utils';

describe('fms-tenant-removal.utils', () => {
  it('detects removed tenants via mapping metadata', () => {
    expect(
      isFmsUserRemovedFromFacility(
        { metadata: { [FMS_MAPPING_REMOVED_AT_KEY]: '2026-01-01T00:00:00.000Z' } },
        { is_active: true },
        2,
      ),
    ).toBe(true);
  });

  it('detects legacy removed tenants as inactive with no facility assignments', () => {
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: false }, 0)).toBe(true);
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: false }, 1)).toBe(false);
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: true }, 0)).toBe(false);
  });

  it('stamps and clears removal metadata', () => {
    const stamped = stampFmsMappingRemoved({ email: 'a@b.com' }, new Date('2026-06-01T12:00:00.000Z'));
    expect(stamped.email).toBe('a@b.com');
    expect(stamped[FMS_MAPPING_REMOVED_AT_KEY]).toBe('2026-06-01T12:00:00.000Z');

    const cleared = clearFmsMappingRemoved(stamped);
    expect(cleared.email).toBe('a@b.com');
    expect(cleared[FMS_MAPPING_REMOVED_AT_KEY]).toBeUndefined();
  });
});
