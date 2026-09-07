/**
 * Types and helpers for remote lock-command attribution.
 * Timers remain process-local in LockCommandService; durable pending state lives in access_sessions.
 */

export type LockStatus =
  | 'locked'
  | 'unlocked'
  | 'locking'
  | 'unlocking'
  | 'error'
  | 'maintenance'
  | 'unknown';

export interface LockCommandInitiator {
  userId: string;
  userName: string;
  role: string;
}

export interface LockCommandAttribution {
  commandId: string;
  initiator: LockCommandInitiator;
  gatewayId: string;
  facilityId: string;
  unitId?: string;
  requestedStatus: 'locked' | 'unlocked';
  deviceType: 'blulok' | 'access_control';
  tenantUnlockOverride?: {
    reason: string;
    reasonLabel: string;
    notes?: string;
  };
}

export interface PendingLockCommand {
  commandId: string;
  deviceId: string;
  previousStatus: LockStatus;
  requestedStatus: 'locked' | 'unlocked';
  timeoutHandle?: NodeJS.Timeout;
  initiator?: LockCommandInitiator;
  gatewayId: string;
  facilityId: string;
  unitId?: string;
  deviceType: 'blulok' | 'access_control';
  tenantUnlockOverride?: {
    reason: string;
    reasonLabel: string;
    notes?: string;
  };
}

/** Map a pending access_sessions row (cloud_remote) into attribution shape. */
export function attributionFromAccessSession(session: {
  id: string;
  remote_command_id: string | null;
  gateway_id: string | null;
  facility_id: string | null;
  unit_id: string | null;
  device_type: 'blulok' | 'access_control';
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
}): LockCommandAttribution | null {
  if (!session.remote_command_id || !session.actor_id || !session.facility_id) {
    return null;
  }
  const initiatedBy = session.metadata?.initiated_by as
    | { id?: string; name?: string; role?: string }
    | undefined;
  const overrideRaw = session.metadata?.tenant_unlock_override as
    | { reason?: string; reason_label?: string; notes?: string | null }
    | undefined;

  return {
    commandId: session.remote_command_id,
    initiator: {
      userId: initiatedBy?.id || session.actor_id,
      userName: initiatedBy?.name || session.actor_name || 'User',
      role: initiatedBy?.role || session.actor_role || 'unknown',
    },
    gatewayId: session.gateway_id || '',
    facilityId: session.facility_id,
    unitId: session.unit_id || undefined,
    requestedStatus: 'unlocked',
    deviceType: session.device_type,
    tenantUnlockOverride: overrideRaw?.reason
      ? {
          reason: overrideRaw.reason,
          reasonLabel: overrideRaw.reason_label || overrideRaw.reason,
          notes: overrideRaw.notes ?? undefined,
        }
      : undefined,
  };
}
