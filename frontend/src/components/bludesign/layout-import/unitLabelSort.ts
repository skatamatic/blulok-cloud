/**
 * Natural sort for storage unit labels: numeric core first, then letter suffix
 * (24, 24A, 25, 25A, 25B — not plain alphabetical).
 */

import { parseNumericLabel } from './labelResolution';

/** Compare two unit labels for list ordering. Unlabeled sorts last. */
export function compareUnitLabels(a?: string, b?: string): number {
  const pa = parseNumericLabel(a);
  const pb = parseNumericLabel(b);

  if (pa && pb) {
    if (pa.num !== pb.num) return pa.num - pb.num;
    return pa.suffix.localeCompare(pb.suffix);
  }
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;

  const la = (a ?? '').trim().toLowerCase();
  const lb = (b ?? '').trim().toLowerCase();
  if (!la && !lb) return 0;
  if (!la) return 1;
  if (!lb) return -1;
  return la.localeCompare(lb);
}

/** Stable sort key: label order, then original detection index. */
export function compareUnitsByLabel(
  a: { id: string; label?: string },
  b: { id: string; label?: string },
  originalIndex: Map<string, number>
): number {
  const byLabel = compareUnitLabels(a.label, b.label);
  if (byLabel !== 0) return byLabel;
  return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
}
