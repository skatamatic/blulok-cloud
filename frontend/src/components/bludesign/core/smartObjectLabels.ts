/**
 * Display names and sort keys for smart objects (matches import unit list behavior).
 */

import { parseNumericLabel } from '../layout-import/labelResolution';
import { compareUnitLabels } from '../layout-import/unitLabelSort';

const UNIT_PREFIX = /^unit\s+/i;
const FLOOR_SUFFIX = /\s*(\(F-?\d+\))\s*$/;

/** Strip "Unit" prefix and floor suffix for natural numeric sort. */
export function normalizeUnitLabelForSort(name?: string): string {
  let s = (name ?? '').trim();
  s = s.replace(FLOOR_SUFFIX, '').trim();
  s = s.replace(UNIT_PREFIX, '').trim();
  return s;
}

/**
 * Prefix storage unit labels with "Unit" when missing (24 → Unit 24, 24A → Unit 24A).
 * Preserves floor suffixes and names that already start with "Unit".
 */
export function formatStorageUnitDisplayName(name?: string): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'Unknown';

  const floorMatch = raw.match(FLOOR_SUFFIX);
  const floorSuffix = floorMatch ? ` ${floorMatch[1]}` : '';
  const withoutFloor = floorMatch ? raw.slice(0, raw.length - floorMatch[0].length).trim() : raw;

  if (UNIT_PREFIX.test(withoutFloor)) {
    return raw;
  }

  if (parseNumericLabel(withoutFloor)) {
    return `Unit ${withoutFloor}${floorSuffix}`;
  }

  return raw;
}

export function compareSmartObjectNames(a?: string, b?: string): number {
  return compareUnitLabels(normalizeUnitLabelForSort(a), normalizeUnitLabelForSort(b));
}
