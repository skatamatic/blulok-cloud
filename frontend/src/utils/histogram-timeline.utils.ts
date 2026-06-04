export type HistogramTimePeriod = 'day' | 'week' | 'month' | 'year';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayBucketKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function hourBucketKey(d: Date): string {
  return `${dayBucketKey(d)} ${pad2(d.getHours())}:00:00`;
}

/** Match backend week grouping (Monday-based week start). */
export function weekBucketKey(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return dayBucketKey(weekStart);
}

export function generateHistogramSlotKeys(
  period: HistogramTimePeriod,
  referenceDate: Date = new Date(),
): string[] {
  const end = new Date(referenceDate);

  switch (period) {
    case 'day': {
      const slots: string[] = [];
      const cursor = new Date(end);
      cursor.setMinutes(0, 0, 0);
      for (let i = 23; i >= 0; i -= 1) {
        const slot = new Date(cursor);
        slot.setHours(cursor.getHours() - i);
        slots.push(hourBucketKey(slot));
      }
      return slots;
    }
    case 'week': {
      const slots: string[] = [];
      const cursor = new Date(end);
      cursor.setHours(12, 0, 0, 0);
      for (let i = 6; i >= 0; i -= 1) {
        const slot = new Date(cursor);
        slot.setDate(cursor.getDate() - i);
        slots.push(dayBucketKey(slot));
      }
      return slots;
    }
    case 'month': {
      const slots: string[] = [];
      const cursor = new Date(end);
      cursor.setHours(12, 0, 0, 0);
      for (let i = 29; i >= 0; i -= 1) {
        const slot = new Date(cursor);
        slot.setDate(cursor.getDate() - i);
        slots.push(dayBucketKey(slot));
      }
      return slots;
    }
    case 'year': {
      const slots: string[] = [];
      const endWeek = weekBucketKey(end);
      const weekStart = new Date(`${endWeek}T12:00:00`);
      for (let i = 51; i >= 0; i -= 1) {
        const slot = new Date(weekStart);
        slot.setDate(weekStart.getDate() - i * 7);
        slots.push(dayBucketKey(slot));
      }
      return slots;
    }
    default:
      return [];
  }
}

export function buildHistogramChartEntries<T>(
  period: HistogramTimePeriod,
  groupedData: Record<string, T[]>,
  referenceDate: Date = new Date(),
): Array<[string, T[]]> {
  return generateHistogramSlotKeys(period, referenceDate).map((key) => [key, groupedData[key] ?? []]);
}

/** Thin axis labels when many slots would overlap. */
export function shouldShowHistogramAxisLabel(
  index: number,
  total: number,
  period: HistogramTimePeriod,
): boolean {
  if (total <= 14) return true;
  if (index === 0 || index === total - 1) return true;

  switch (period) {
    case 'day':
      return index % 2 === 0;
    case 'month':
      return index % 2 === 0;
    case 'year':
      return index % 3 === 0;
    case 'week':
    default:
      return true;
  }
}

function parseHistogramChartDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T'));
  }
  return new Date(dateStr);
}

/** Compact axis labels for dense timelines (avoids truncation in narrow columns). */
export function formatHistogramAxisLabel(
  dateStr: string,
  period: HistogramTimePeriod,
  slotCount: number,
): string {
  const date = parseHistogramChartDate(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const compact = slotCount > 14;

  switch (period) {
    case 'day':
      if (compact) {
        const hour = date.getHours();
        const suffix = hour >= 12 ? 'p' : 'a';
        const hour12 = hour % 12 || 12;
        return `${hour12}${suffix}`;
      }
      return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    case 'week':
    case 'month':
      if (compact) {
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'year':
      return `${date.getMonth() + 1}/${date.getDate()}`;
    default:
      return dateStr;
  }
}
