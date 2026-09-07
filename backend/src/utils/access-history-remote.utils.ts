import { UserRole } from '@/types/auth.types';
import type { ActivityType } from '@/models/activity-log.model';

export type RemoteAccessMethod = 'admin_remote' | 'remote_gateway';

export function resolveRemoteAccessMethod(role: string): RemoteAccessMethod {
  if (
    role === UserRole.ADMIN
    || role === UserRole.DEV_ADMIN
    || role === UserRole.FACILITY_ADMIN
  ) {
    return 'admin_remote';
  }
  return 'remote_gateway';
}

export function terminalActivityMatchesRequestedStatus(
  activityType: ActivityType,
  requestedStatus: 'locked' | 'unlocked',
): boolean {
  if (requestedStatus === 'unlocked') {
    return activityType === 'unlock';
  }
  return activityType === 'lock';
}

export function mapLegacyAccessAction(action: string | undefined, success: boolean): string {
  if (action === 'access_denied') return 'unlock_attempt';
  if (action === 'keypad_attempt' && !success) return 'unlock_attempt';
  if (action === 'lock_attempt' || action === 'unlock_attempt') return action;
  return action || (success ? 'access_granted' : 'unlock_attempt');
}

export function mapLegacyAccessMethod(method: string | undefined): string {
  if (!method || method === 'automatic') return 'local_device';
  return method;
}
