import { FMSChange } from '@/types/fms.types';

/** Invalid payloads or accepted changes that failed to apply — safe to dismiss from review. */
export function isFmsChangeDismissible(change: FMSChange): boolean {
  if (change.applied_at) return false;
  if (change.is_valid === false) return true;
  if (change.is_reviewed && change.is_accepted === true) return true;
  return false;
}

export function countDismissibleChanges(changes: FMSChange[]): number {
  return changes.filter(isFmsChangeDismissible).length;
}

export function getDismissibleChangeIds(changes: FMSChange[]): string[] {
  return changes.filter(isFmsChangeDismissible).map((c) => c.id);
}

/** Selected changes that can be applied (valid and not yet applied). */
export function countApplicableSelected(changes: FMSChange[], selectedIds: Set<string>): number {
  return changes.filter((c) => selectedIds.has(c.id) && c.is_valid !== false).length;
}
