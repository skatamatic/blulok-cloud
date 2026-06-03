import type { ActivityType } from '@/models/activity-log.model';

/** Device lock_status values that map to activity_logs.activity_type rows. */
export type LoggableDeviceLockStatus = 'locked' | 'unlocked' | 'locking' | 'unlocking';

const LOCK_STATUS_TO_ACTIVITY: Record<LoggableDeviceLockStatus, ActivityType> = {
  locked: 'lock',
  unlocked: 'unlock',
  locking: 'locking',
  unlocking: 'unlocking',
};

const ACTIVITY_VERB: Record<ActivityType, string> = {
  lock: 'locked',
  unlock: 'unlocked',
  locking: 'locking',
  unlocking: 'unlocking',
  access_attempt: 'accessed',
  status_change: 'changed',
  error: 'errored',
  maintenance_start: 'entered maintenance',
  maintenance_end: 'left maintenance',
  assignment_change: 'changed assignment',
  configuration_change: 'configured',
  connection_change: 'changed connection',
  general: 'updated',
};

const ACTIVITY_TITLE: Record<
  Extract<ActivityType, 'lock' | 'unlock' | 'locking' | 'unlocking'>,
  string
> = {
  lock: 'Device Locked',
  unlock: 'Device Unlocked',
  locking: 'Device Locking',
  unlocking: 'Device Unlocking',
};

export function mapLockStatusToActivityType(lockStatus: string): ActivityType | null {
  if (lockStatus in LOCK_STATUS_TO_ACTIVITY) {
    return LOCK_STATUS_TO_ACTIVITY[lockStatus as LoggableDeviceLockStatus];
  }
  return null;
}

export function isLoggableLockStatusTransition(lockStatus: string): boolean {
  return mapLockStatusToActivityType(lockStatus) !== null;
}

export function lockActivityTitle(activityType: ActivityType): string {
  if (activityType in ACTIVITY_TITLE) {
    return ACTIVITY_TITLE[activityType as keyof typeof ACTIVITY_TITLE];
  }
  return 'Device Lock Update';
}

export function lockActivityVerb(activityType: ActivityType): string {
  return ACTIVITY_VERB[activityType] ?? activityType;
}
