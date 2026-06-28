import type { DeviceInventoryItem, GatewayInventoryKind } from '@protocol/device-kinds';
import { GATEWAY_INVENTORY_KINDS } from '@protocol/device-kinds';
import { inventoryDeviceKey, inventoryDeviceLabel, KIND_LABELS } from './device-inventory.utils';

export const DEVICE_SORT_COLUMNS = [
  { id: 'kind', label: 'Kind' },
  { id: 'id', label: 'ID' },
  { id: 'online', label: 'Online' },
  { id: 'state', label: 'State' },
  { id: 'locked', label: 'Locked' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'battery', label: 'Battery' },
  { id: 'signal', label: 'Signal' },
] as const;

export type DeviceSortColumn = (typeof DEVICE_SORT_COLUMNS)[number]['id'];
export type SortDirection = 'asc' | 'desc';
export type OnlineFilter = 'all' | 'online' | 'offline';
export type KindFilter = 'all' | GatewayInventoryKind;

export type DeviceListFilters = {
  search: string;
  kind: KindFilter;
  online: OnlineFilter;
  sortColumn: DeviceSortColumn;
  sortDirection: SortDirection;
};

export const DEFAULT_DEVICE_LIST_FILTERS: DeviceListFilters = {
  search: '',
  kind: 'all',
  online: 'all',
  sortColumn: 'kind',
  sortDirection: 'asc',
};

function readOnline(item: DeviceInventoryItem): boolean | null {
  if (item.kind === 'gateway') return null;
  return (item as { online?: boolean }).online ?? false;
}

function readState(item: DeviceInventoryItem): string {
  if (item.kind === 'lock') return item.state ?? 'UNKNOWN';
  if (item.kind === 'access_control') return item.state ?? (item.locked ? 'locked' : 'unlocked');
  if (item.kind === 'bridge' || item.kind === 'friend_node' || item.kind === 'gateway') {
    return (item as { state?: string }).state ?? '';
  }
  return '';
}

function readLocked(item: DeviceInventoryItem): boolean | null {
  if (item.kind === 'lock' || item.kind === 'access_control') {
    return item.locked ?? null;
  }
  return null;
}

function readFirmware(item: DeviceInventoryItem): string {
  return (item as { firmware_version?: string }).firmware_version ?? '';
}

function readBattery(item: DeviceInventoryItem): number | null {
  return item.kind === 'lock' ? (item.battery_level ?? null) : null;
}

function readSignal(item: DeviceInventoryItem): number | null {
  return item.kind === 'lock' ? (item.signal_strength ?? null) : null;
}

export function getDeviceSortValue(item: DeviceInventoryItem, column: DeviceSortColumn): string | number | boolean | null {
  switch (column) {
    case 'kind':
      return KIND_LABELS[item.kind];
    case 'id':
      return inventoryDeviceLabel(item);
    case 'online':
      return readOnline(item);
    case 'state':
      return readState(item);
    case 'locked':
      return readLocked(item);
    case 'firmware':
      return readFirmware(item);
    case 'battery':
      return readBattery(item);
    case 'signal':
      return readSignal(item);
    default:
      return inventoryDeviceLabel(item);
  }
}

export function getDeviceSearchableText(item: DeviceInventoryItem): string {
  const online = readOnline(item);
  const locked = readLocked(item);
  const parts = [
    item.kind,
    KIND_LABELS[item.kind],
    inventoryDeviceLabel(item),
    inventoryDeviceKey(item),
    readState(item),
    readFirmware(item),
    online === null ? '' : online ? 'online' : 'offline',
    locked === null ? '' : locked ? 'locked' : 'unlocked',
    item.kind === 'lock' && item.battery_level != null ? String(item.battery_level) : '',
    item.kind === 'lock' && item.signal_strength != null ? String(item.signal_strength) : '',
    item.kind === 'access_control' ? item.device_type ?? '' : '',
    item.kind === 'access_control' && item.relay_channel != null ? `ch ${item.relay_channel}` : '',
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function compareSortValues(a: string | number | boolean | null, b: string | number | boolean | null, direction: SortDirection): number {
  const mult = direction === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mult;
  if (b == null) return -1 * mult;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (Number(a) - Number(b)) * mult;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mult;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * mult;
}

export function deviceMatchesFilters(item: DeviceInventoryItem, filters: DeviceListFilters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query && !getDeviceSearchableText(item).includes(query)) {
    return false;
  }

  if (filters.kind !== 'all' && item.kind !== filters.kind) {
    return false;
  }

  if (filters.online !== 'all') {
    const online = readOnline(item);
    if (online === null) return filters.online === 'offline';
    if (filters.online === 'online' && !online) return false;
    if (filters.online === 'offline' && online) return false;
  }

  return true;
}

export function filterAndSortDevices(
  devices: DeviceInventoryItem[],
  filters: DeviceListFilters,
): DeviceInventoryItem[] {
  const filtered = devices.filter((item) => deviceMatchesFilters(item, filters));
  const sorted = [...filtered].sort((a, b) => {
    const primary = compareSortValues(
      getDeviceSortValue(a, filters.sortColumn),
      getDeviceSortValue(b, filters.sortColumn),
      filters.sortDirection,
    );
    if (primary !== 0) return primary;
    return inventoryDeviceLabel(a).localeCompare(inventoryDeviceLabel(b), undefined, { numeric: true });
  });
  return sorted;
}

export function isDeviceSortColumn(value: string): value is DeviceSortColumn {
  return DEVICE_SORT_COLUMNS.some((col) => col.id === value);
}

export const KIND_FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  ...GATEWAY_INVENTORY_KINDS.map((kind) => ({ value: kind as KindFilter, label: KIND_LABELS[kind] })),
];
