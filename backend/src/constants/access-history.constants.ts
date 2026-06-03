import type { ActivityType } from '@/models/activity-log.model';

/** Max facilities included in activity histogram aggregation (all-facilities mode). */
export const MAX_HISTOGRAM_FACILITIES = 50;

/** Max rows returned from access history export. */
export const MAX_ACCESS_HISTORY_EXPORT = 5000;

/** Activity types shown in Activity Monitor, histogram, and live activity feeds. */
export const DASHBOARD_ACTIVITY_TYPES: ActivityType[] = ['access_attempt', 'lock', 'unlock'];
