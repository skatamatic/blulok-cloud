import { compareNaturalStrings } from '@/utils/natural-string-compare';

/** Whitelist for merged / in-memory device list sorting (matches API query param). */
export const DEVICE_LIST_SORT_KEYS = [
  'name',
  'unit_number',
  'device_type',
  'status',
  'facility_name',
  'gateway_name',
  'last_activity',
  'created_at',
] as const;

export type DeviceListSortKey = (typeof DEVICE_LIST_SORT_KEYS)[number];

export function normalizeDeviceListSortKey(raw: unknown): DeviceListSortKey {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s && (DEVICE_LIST_SORT_KEYS as readonly string[]).includes(s)) {
    return s as DeviceListSortKey;
  }
  return 'name';
}

function deviceDisplayName(d: { device_category?: string; name?: string; unit_number?: string | null; device_serial?: string }): string {
  if (d.device_category === 'blulok') {
    return d.unit_number ? String(d.unit_number) : String(d.device_serial ?? '');
  }
  return String(d.name ?? '');
}

function cmpNullableDate(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
  desc: boolean
): number {
  const time = (x: string | Date | null | undefined) => (x == null ? null : new Date(x).getTime());
  const ta = time(a);
  const tb = time(b);
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1; // nulls last
  if (tb == null) return -1;
  return desc ? tb - ta : ta - tb;
}

/** Compare two list devices (must have device_category set for mixed lists). */
export function compareMergedDevices(
  sortBy: DeviceListSortKey,
  sortOrder: 'asc' | 'desc',
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const desc = sortOrder === 'desc';
  const m = desc ? -1 : 1;

  switch (sortBy) {
    case 'name':
    case 'unit_number':
      return m * compareNaturalStrings(deviceDisplayName(a as any), deviceDisplayName(b as any));
    case 'device_type': {
      const la = a.device_category === 'blulok' ? 'blulok' : String((a as { device_type?: string }).device_type ?? '');
      const lb = b.device_category === 'blulok' ? 'blulok' : String((b as { device_type?: string }).device_type ?? '');
      return m * la.localeCompare(lb);
    }
    case 'status': {
      const sa =
        a.device_category === 'blulok'
          ? String((a as { device_status?: string }).device_status ?? '')
          : String((a as { status?: string }).status ?? '');
      const sb =
        b.device_category === 'blulok'
          ? String((b as { device_status?: string }).device_status ?? '')
          : String((b as { status?: string }).status ?? '');
      return m * sa.localeCompare(sb);
    }
    case 'facility_name':
      return m * String((a as { facility_name?: string }).facility_name ?? '').localeCompare(
        String((b as { facility_name?: string }).facility_name ?? '')
      );
    case 'gateway_name':
      return m * String((a as { gateway_name?: string }).gateway_name ?? '').localeCompare(
        String((b as { gateway_name?: string }).gateway_name ?? '')
      );
    case 'last_activity':
      return cmpNullableDate(
        (a as { last_activity?: string }).last_activity,
        (b as { last_activity?: string }).last_activity,
        desc
      );
    case 'created_at':
      return cmpNullableDate(
        (a as { created_at?: string }).created_at,
        (b as { created_at?: string }).created_at,
        desc
      );
    default:
      return compareNaturalStrings(deviceDisplayName(a as any), deviceDisplayName(b as any));
  }
}

export function sortMergedDeviceList(devices: Record<string, unknown>[], sortBy: string, sortOrder: 'asc' | 'desc'): void {
  const key = normalizeDeviceListSortKey(sortBy);
  devices.sort((a, b) => {
    const c = compareMergedDevices(key, sortOrder, a, b);
    if (c !== 0) return c;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

export function needsInMemoryDeviceSort(deviceType: string | undefined, sortBy: DeviceListSortKey): boolean {
  if (!deviceType || deviceType === 'all') return true;
  return sortBy === 'name' || sortBy === 'unit_number';
}
