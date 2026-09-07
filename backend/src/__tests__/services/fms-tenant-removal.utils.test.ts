import {
  clearFmsMappingRemoved,
  FMS_MAPPING_REMOVED_AT_KEY,
  isFmsMappingMarkedRemoved,
  isFmsUserRemovedFromFacility,
  isUserInactive,
  stampFmsMappingRemoved,
} from '@/services/fms/fms-tenant-removal.utils';

describe('fms-tenant-removal.utils', () => {
  it('treats MySQL 0/1 is_active values as booleans', () => {
    expect(isUserInactive({ is_active: 0 })).toBe(true);
    expect(isUserInactive({ is_active: false })).toBe(true);
    expect(isUserInactive({ is_active: 1 })).toBe(false);
    expect(isUserInactive({ is_active: true })).toBe(false);
    expect(isUserInactive({})).toBe(false);
    expect(isUserInactive(null)).toBe(false);
  });

  it('detects legacy removals for MySQL 0 inactive flags', () => {
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: 0 }, 0)).toBe(true);
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: 0 }, 1)).toBe(false);
  });

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
    expect(isFmsUserRemovedFromFacility(null, { is_active: false }, 0)).toBe(true);
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: false }, 1)).toBe(false);
    expect(isFmsUserRemovedFromFacility({ metadata: {} }, { is_active: true }, 0)).toBe(false);
  });

  it('detects explicit removal stamp on mapping metadata', () => {
    expect(isFmsMappingMarkedRemoved({})).toBe(false);
    expect(isFmsMappingMarkedRemoved({ [FMS_MAPPING_REMOVED_AT_KEY]: '2026-01-01T00:00:00.000Z' })).toBe(true);
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
