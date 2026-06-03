export const HISTOGRAM_ACTIVITY_TYPE_ORDER = [
  'access_attempt',
  'unlock',
  'lock',
  'unlocking',
  'locking',
] as const;

export type HistogramActivityType = (typeof HISTOGRAM_ACTIVITY_TYPE_ORDER)[number];

export const HISTOGRAM_ACTIVITY_TYPE_LABELS: Record<HistogramActivityType, string> = {
  access_attempt: 'Access',
  unlock: 'Unlock',
  lock: 'Lock',
  unlocking: 'Unlocking',
  locking: 'Locking',
};

export type HistogramTypeBreakdown = {
  type: HistogramActivityType;
  label: string;
  count: number;
};

export function getHistogramTypeBreakdown(
  byType: Partial<Record<HistogramActivityType, number>>,
): HistogramTypeBreakdown[] {
  return HISTOGRAM_ACTIVITY_TYPE_ORDER.map((type) => ({
    type,
    label: HISTOGRAM_ACTIVITY_TYPE_LABELS[type],
    count: byType[type] ?? 0,
  })).filter((row) => row.count > 0);
}
