const LIST_ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/devices': 'Devices',
  '/units': 'Units',
  '/users': 'Users',
  '/access-history': 'Access History',
  '/settings': 'Settings',
  '/settings/add-facility': 'Add Facility',
  '/facility-sitemap': 'Site Map',
  '/simple-sitemap': 'Site Map',
  '/units-management': 'Units Management',
};

export const stripPathQueryAndHash = (path: string): string =>
  path.split('?')[0].split('#')[0];

/** Human-readable name for the page at `path` (without "Back to"). */
export function getDestinationLabel(path: string): string {
  const pathname = stripPathQueryAndHash(path);

  if (/^\/facilities\/[^/]+\/edit$/.test(pathname)) return 'Facility';
  if (/^\/facilities\/[^/]+$/.test(pathname)) return 'Facility';
  if (/^\/devices\/[^/]+$/.test(pathname)) return 'Device';
  if (/^\/units\/[^/]+$/.test(pathname)) return 'Unit';
  if (/^\/users\/[^/]+/.test(pathname)) return 'User';

  if (LIST_ROUTE_LABELS[pathname]) return LIST_ROUTE_LABELS[pathname];

  if (pathname === '/facilities') return 'Facility Setup';

  return 'Previous page';
}

/** Button label for returning to the page at `path`. */
export function getBackButtonLabel(path: string): string {
  const destination = getDestinationLabel(path);
  if (destination === 'Previous page') return 'Back';
  return `Back to ${destination}`;
}
