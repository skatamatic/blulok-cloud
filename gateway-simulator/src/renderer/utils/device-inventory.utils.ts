import type { DeviceInventoryItem, GatewayInventoryKind, LockState } from '@protocol/device-kinds';

export function inventoryDeviceKey(item: DeviceInventoryItem): string {
  switch (item.kind) {
    case 'lock':
      return `lock:${item.lock_id}`;
    case 'access_control':
      return `access_control:${item.access_id}:${item.relay_channel ?? 1}`;
    default:
      return `${item.kind}:${(item as { serial: string }).serial}`;
  }
}

export function inventoryDeviceLabel(item: DeviceInventoryItem): string {
  switch (item.kind) {
    case 'lock':
      return item.lock_id;
    case 'access_control':
      return `${item.access_id} · ch ${item.relay_channel ?? 1}`;
    case 'gateway':
      return `Gateway ${(item as { serial: string }).serial}`;
    default:
      return (item as { serial: string }).serial;
  }
}

export const KIND_LABELS: Record<GatewayInventoryKind, string> = {
  lock: 'Lock',
  access_control: 'Access control',
  bridge: 'Bridge',
  friend_node: 'Friend node',
  gateway: 'Gateway',
};

/** CSS modifier for kind-specific badge styling in device cards and detail headers. */
export function kindBadgeClass(kind: GatewayInventoryKind): string {
  switch (kind) {
    case 'lock':
      return 'kind-badge-lock';
    case 'access_control':
      return 'kind-badge-access-control';
    case 'bridge':
      return 'kind-badge-bridge';
    case 'friend_node':
      return 'kind-badge-friend-node';
    default:
      return 'kind-badge-gateway';
  }
}

export const LOCK_STATES: LockState[] = ['CLOSED', 'OPENED', 'ERROR', 'UNKNOWN'];

export function supportsAccessEvents(item: DeviceInventoryItem): boolean {
  return item.kind === 'lock' || item.kind === 'access_control';
}

export function isEditableInventoryDevice(item: DeviceInventoryItem): boolean {
  return item.kind !== 'gateway';
}

export type DeviceSummaryStatTone = 'neutral' | 'success' | 'warning' | 'danger' | 'muted';

export type DevicePresenceStatus = 'online' | 'offline' | 'error';

export function devicePresenceStatusLabel(status: DevicePresenceStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Error';
  }
}

/** Whether a device row should render the error (red) icon treatment. */
export function isDeviceInErrorState(item: DeviceInventoryItem): boolean {
  const row = item as DeviceInventoryItem & {
    error_code?: string;
    error_message?: string;
    state?: string;
  };

  if (row.error_code?.trim() || row.error_message?.trim()) {
    return true;
  }

  if (item.kind === 'lock' && item.state === 'ERROR') {
    return true;
  }

  if (item.kind === 'bridge' || item.kind === 'friend_node' || item.kind === 'gateway') {
    const state = row.state?.trim().toLowerCase();
    if (state && (state.includes('error') || state.includes('fault') || state.includes('fail'))) {
      return true;
    }
  }

  return false;
}

export function resolveDevicePresenceStatus(item: DeviceInventoryItem): DevicePresenceStatus {
  if (isDeviceInErrorState(item)) {
    return 'error';
  }
  const online = (item as { online?: boolean }).online ?? false;
  return online ? 'online' : 'offline';
}

/** Whether a BluLok lock row should render the open padlock icon. */
export function isLockShownOpen(item: DeviceInventoryItem): boolean {
  if (item.kind !== 'lock') {
    return false;
  }
  if (item.state === 'OPENED') {
    return true;
  }
  if (item.state === 'CLOSED') {
    return false;
  }
  return item.locked === false;
}

export type DeviceSummaryStat = {
  key: string;
  label: string;
  tone?: DeviceSummaryStatTone;
};

function lockStateTone(state: LockState): DeviceSummaryStatTone {
  switch (state) {
    case 'CLOSED':
      return 'success';
    case 'OPENED':
      return 'warning';
    case 'ERROR':
      return 'danger';
    default:
      return 'muted';
  }
}

/** Read-only chips for collapsed device card summary rows. */
export function buildDeviceSummaryStats(item: DeviceInventoryItem): DeviceSummaryStat[] {
  switch (item.kind) {
    case 'lock': {
      const state = item.state ?? 'UNKNOWN';
      const stats: DeviceSummaryStat[] = [
        { key: 'state', label: state, tone: lockStateTone(state) },
      ];
      if (item.battery_level != null) {
        stats.push({ key: 'battery', label: `${item.battery_level} mV`, tone: 'neutral' });
      }
      if (item.signal_strength != null) {
        stats.push({ key: 'signal', label: `${item.signal_strength} dBm`, tone: 'neutral' });
      }
      if (item.firmware_version) {
        stats.push({ key: 'firmware', label: `v${item.firmware_version}`, tone: 'neutral' });
      }
      return stats;
    }
    case 'access_control': {
      const stats: DeviceSummaryStat[] = [
        {
          key: 'type',
          label: (item.device_type ?? 'gate').replace(/^./, (c) => c.toUpperCase()),
          tone: 'neutral',
        },
        {
          key: 'locked',
          label: item.locked ? 'Locked' : 'Unlocked',
          tone: item.locked ? 'neutral' : 'warning',
        },
      ];
      if (item.firmware_version) {
        stats.push({ key: 'firmware', label: `v${item.firmware_version}`, tone: 'neutral' });
      }
      return stats;
    }
    case 'bridge':
    case 'friend_node': {
      const stats: DeviceSummaryStat[] = [];
      const state = (item as { state?: string }).state;
      if (state) {
        stats.unshift({ key: 'state', label: state, tone: 'neutral' });
      }
      const firmware = (item as { firmware_version?: string }).firmware_version;
      if (firmware) {
        stats.push({ key: 'firmware', label: `v${firmware}`, tone: 'neutral' });
      }
      return stats;
    }
    case 'gateway':
      return [
        {
          key: 'state',
          label: (item as { state?: string }).state ?? 'Unknown',
          tone: 'neutral',
        },
        { key: 'role', label: 'Session', tone: 'muted' },
      ];
    default:
      return [];
  }
}
