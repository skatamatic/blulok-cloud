/** Protected name for the per-facility default access group (all tenants). */
export const DEFAULT_ACCESS_GROUP_NAME = 'Default Facility Group';

/** Legacy names repaired to {@link DEFAULT_ACCESS_GROUP_NAME} during ensure/migrate. */
export const LEGACY_DEFAULT_ACCESS_GROUP_NAMES = [
  'free',
  'Free',
  'All Facility Access',
] as const;
