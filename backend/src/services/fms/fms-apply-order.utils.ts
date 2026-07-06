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
  is_reviewed?: boolean | number | null;
  is_accepted?: boolean | number | null;
}): boolean {
  if (change.applied_at != null) return false;
  const reviewed = change.is_reviewed === true || change.is_reviewed === 1;
  const rejected = change.is_accepted === false || change.is_accepted === 0;
  if (reviewed && rejected) return false;
  return true;
}

/**
 * Changes the operator can clear from the review queue without applying:
 * invalid payloads, or accepted changes that failed to apply.
 */
export function isFmsChangeDismissible(change: {
  applied_at?: Date | string | null;
  is_valid?: boolean | number | null;
  is_reviewed?: boolean | number | null;
  is_accepted?: boolean | number | null;
}): boolean {
  if (change.applied_at != null) return false;
  if (change.is_valid === false || change.is_valid === 0) return true;
  const reviewed = change.is_reviewed === true || change.is_reviewed === 1;
  const accepted = change.is_accepted === true || change.is_accepted === 1;
  if (reviewed && accepted) return true;
  return false;
}

/** Valid changes eligible for auto-accept; invalid payloads always need manual review. */
export function isFmsChangeAutoAppliable(change: {
  is_valid?: boolean | number | null;
}): boolean {
  return change.is_valid !== false && change.is_valid !== 0;
}

export function partitionChangesForAutoApply<T extends { is_valid?: boolean | number | null }>(
  changes: T[],
): { autoAppliable: T[]; manualReview: T[] } {
  const autoAppliable: T[] = [];
  const manualReview: T[] = [];
  for (const change of changes) {
    if (isFmsChangeAutoAppliable(change)) {
      autoAppliable.push(change);
    } else {
      manualReview.push(change);
    }
  }
  return { autoAppliable, manualReview };
}

export type FmsAutoApplyOutcome = {
  changesApplied: number;
  changesFailed: number;
  applyErrors: string[];
  requiresReview: boolean;
  autoApplied: boolean;
  pendingCount: number;
};

/** Derive webhook/sync auto-apply flags from apply results and remaining pending rows. */
export function resolveFmsAutoApplyOutcome(options: {
  totalChanges: number;
  applyResult: { changesApplied: number; changesFailed: number; errors: string[] };
  pendingCount: number;
}): FmsAutoApplyOutcome {
  const { totalChanges, applyResult, pendingCount } = options;
  const requiresReview = pendingCount > 0;
  const autoApplied =
    !requiresReview && totalChanges > 0 && applyResult.changesFailed === 0;

  return {
    changesApplied: applyResult.changesApplied,
    changesFailed: applyResult.changesFailed,
    applyErrors: applyResult.errors,
    requiresReview,
    autoApplied,
    pendingCount,
  };
}
