import { describe, expect, it } from 'vitest';
import { isCatalogAdminRole } from '../src/main/auth/catalog-session.utils';

describe('catalog-session.utils', () => {
  it('allows admin and dev_admin', () => {
    expect(isCatalogAdminRole('admin')).toBe(true);
    expect(isCatalogAdminRole('dev_admin')).toBe(true);
    expect(isCatalogAdminRole('DEV_ADMIN')).toBe(true);
  });

  it('rejects other roles', () => {
    expect(isCatalogAdminRole('tenant')).toBe(false);
    expect(isCatalogAdminRole('facility_admin')).toBe(false);
  });
});
