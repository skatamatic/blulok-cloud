/** Roles allowed to list users and mint simulator sessions. */
export const CATALOG_ADMIN_ROLES = new Set(['admin', 'dev_admin']);

/** Roles allowed to fetch FMS configs and simulate webhooks. */
export const FMS_WEBHOOK_ROLES = new Set(['admin', 'dev_admin', 'facility_admin']);

export function isCatalogAdminRole(role: string | undefined): boolean {
  if (!role) return false;
  return CATALOG_ADMIN_ROLES.has(role.toLowerCase());
}

export function isFmsWebhookRole(role: string | undefined): boolean {
  if (!role) return false;
  return FMS_WEBHOOK_ROLES.has(role.toLowerCase());
}

export function isCloudApiSessionRole(role: string | undefined): boolean {
  return isCatalogAdminRole(role) || isFmsWebhookRole(role);
}
