/** Roles allowed to list users and mint simulator sessions. */
export const CATALOG_ADMIN_ROLES = new Set(['admin', 'dev_admin']);

export function isCatalogAdminRole(role: string | undefined): boolean {
  if (!role) return false;
  return CATALOG_ADMIN_ROLES.has(role.toLowerCase());
}
