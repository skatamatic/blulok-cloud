import { describe, expect, it } from 'vitest';
import {
  isCatalogAdminRole,
  isCloudApiSessionRole,
  isFmsWebhookRole,
} from '../src/main/auth/catalog-session.utils';

describe('catalog-session.utils', () => {
  it('allows admin and dev_admin for catalog import', () => {
    expect(isCatalogAdminRole('admin')).toBe(true);
    expect(isCatalogAdminRole('dev_admin')).toBe(true);
    expect(isCatalogAdminRole('DEV_ADMIN')).toBe(true);
  });

  it('rejects non-admin roles for catalog import', () => {
    expect(isCatalogAdminRole('tenant')).toBe(false);
    expect(isCatalogAdminRole('facility_admin')).toBe(false);
  });

  it('allows admin, dev_admin, and facility_admin for FMS webhooks', () => {
    expect(isFmsWebhookRole('admin')).toBe(true);
    expect(isFmsWebhookRole('dev_admin')).toBe(true);
    expect(isFmsWebhookRole('facility_admin')).toBe(true);
    expect(isFmsWebhookRole('FACILITY_ADMIN')).toBe(true);
  });

  it('rejects tenant for FMS webhooks', () => {
    expect(isFmsWebhookRole('tenant')).toBe(false);
  });

  it('isCloudApiSessionRole accepts catalog or webhook roles', () => {
    expect(isCloudApiSessionRole('admin')).toBe(true);
    expect(isCloudApiSessionRole('facility_admin')).toBe(true);
    expect(isCloudApiSessionRole('tenant')).toBe(false);
  });
});
