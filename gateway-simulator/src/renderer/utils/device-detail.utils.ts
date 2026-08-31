import type { GatewayInventoryKind } from '@protocol/device-kinds';
import { DEVICE_DETAIL_TABS, type DeviceDetailTabId } from './device-detail-tab.types';
import { createLocalDeviceDetailTabStorage } from './device-detail-tab.storage';

export { DEVICE_DETAIL_TABS, type DeviceDetailTabId } from './device-detail-tab.types';

const LEGACY_TAB_ALIASES: Record<string, DeviceDetailTabId> = {
  keys: 'security',
  telemetry: 'overview',
};

const defaultTabStorage = createLocalDeviceDetailTabStorage();

export function normalizeDeviceDetailTab(raw: string | null | undefined): DeviceDetailTabId | null {
  if (!raw) return null;
  const aliased = LEGACY_TAB_ALIASES[raw] ?? raw;
  if (DEVICE_DETAIL_TABS.some((tab) => tab.id === aliased)) {
    return aliased as DeviceDetailTabId;
  }
  return null;
}

export function readDeviceDetailTab(
  storage: Pick<ReturnType<typeof createLocalDeviceDetailTabStorage>, 'read'> = defaultTabStorage,
): DeviceDetailTabId {
  const normalized = normalizeDeviceDetailTab(storage.read());
  return normalized ?? 'overview';
}

export function writeDeviceDetailTab(
  tab: DeviceDetailTabId,
  storage: Pick<ReturnType<typeof createLocalDeviceDetailTabStorage>, 'write'> = defaultTabStorage,
): void {
  storage.write(tab);
}

/** Tabs shown for a device kind — simulate is lock/access_control only. */
export function deviceDetailTabsForKind(kind: GatewayInventoryKind): DeviceDetailTabId[] {
  const base: DeviceDetailTabId[] = ['overview', 'security', 'activity'];
  if (kind === 'lock' || kind === 'access_control') {
    return ['overview', 'security', 'simulate', 'activity'];
  }
  return base;
}

export function isDeviceDetailTabId(value: string): value is DeviceDetailTabId {
  return DEVICE_DETAIL_TABS.some((tab) => tab.id === value);
}
