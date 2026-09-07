/**
 * Compare strings in "natural" order: alphabetical segments with numeric substrings
 * compared numerically (e.g. Unit 2 before Unit 10).
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareNaturalStrings(a: string, b: string): number {
  return collator.compare(String(a ?? ''), String(b ?? ''));
}
