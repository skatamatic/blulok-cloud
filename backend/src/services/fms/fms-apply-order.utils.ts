import { FMSChange, FMSChangeType, FMSUnit } from '@/types/fms.types';

/** Apply phases — lower runs first. */
const APPLY_PHASE = {
  UNIT_ADD: 10,
  TENANT_ADD: 20,
  TENANT_UPDATE: 30,
  TENANT_UNIT_UNASSIGN: 40,
  TENANT_REMOVE: 50,
  UNIT_UPDATE: 55,
  UNIT_OVERLOCK: 58,
  TENANT_UNIT_ASSIGN: 70,
  UNIT_UPDATE_OCCUPIED: 72,
  UNIT_REMOVE: 80,
} as const;

export function getTenantUnitChangeAction(
  change: FMSChange,
): 'assign_unit' | 'unassign_unit' | null {
  if (change.change_type !== FMSChangeType.TENANT_UNIT_CHANGED) return null;
  const data = (change.after_data ?? change.before_data) as { action?: string } | null | undefined;
  if (data?.action === 'assign_unit' || data?.action === 'unassign_unit') {
    return data.action;
  }
  return null;
}

function unitUpdatedPhase(change: FMSChange): number {
  const after = change.after_data as FMSUnit | null | undefined;
  const before = change.before_data as FMSUnit | null | undefined;
  const newStatus = after?.status;
  const oldStatus = before?.status;

  if (newStatus === 'occupied' && oldStatus !== 'occupied') {
    return APPLY_PHASE.UNIT_UPDATE_OCCUPIED;
  }
  return APPLY_PHASE.UNIT_UPDATE;
}

/**
 * Resolve apply order so dependencies are satisfied:
 * units/tenants created → unassignments/removals → unit status/metadata → assignments → unit deletes.
 */
export function getFmsChangeApplyPhase(change: FMSChange): number {
  switch (change.change_type) {
    case FMSChangeType.UNIT_ADDED:
      return APPLY_PHASE.UNIT_ADD;
    case FMSChangeType.TENANT_ADDED:
      return APPLY_PHASE.TENANT_ADD;
    case FMSChangeType.TENANT_UPDATED:
      return APPLY_PHASE.TENANT_UPDATE;
    case FMSChangeType.TENANT_UNIT_CHANGED: {
      const action = getTenantUnitChangeAction(change);
      if (action === 'unassign_unit') return APPLY_PHASE.TENANT_UNIT_UNASSIGN;
      if (action === 'assign_unit') return APPLY_PHASE.TENANT_UNIT_ASSIGN;
      return APPLY_PHASE.TENANT_UNIT_ASSIGN;
    }
    case FMSChangeType.TENANT_REMOVED:
      return APPLY_PHASE.TENANT_REMOVE;
    case FMSChangeType.UNIT_UPDATED:
      return unitUpdatedPhase(change);
    case FMSChangeType.UNIT_OVERLOCK_CHANGED:
      return APPLY_PHASE.UNIT_OVERLOCK;
    case FMSChangeType.UNIT_REMOVED:
      return APPLY_PHASE.UNIT_REMOVE;
    default:
      return 999;
  }
}

export function sortChangesForApply(changes: FMSChange[]): FMSChange[] {
  return [...changes].sort((a, b) => {
    const phaseDiff = getFmsChangeApplyPhase(a) - getFmsChangeApplyPhase(b);
    if (phaseDiff !== 0) return phaseDiff;
    return a.id.localeCompare(b.id);
  });
}

/** A change still needs operator action: not applied, and not explicitly rejected. */
export function isFmsChangePending(change: {
  applied_at?: Date | string | null;
  is_reviewed?: boolean;
  is_accepted?: boolean | null;
}): boolean {
  if (change.applied_at != null) return false;
  if (change.is_reviewed && change.is_accepted === false) return false;
  return true;
}
