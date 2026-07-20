import { AccessControlDevice } from '@/types/facility.types';

export type AccessDevicePageTitleFields = {
  name?: string;
  location_description?: string;
  relay_channel?: number;
  device_type?: 'gate' | 'elevator' | 'door';
};

/** Page header title — avoids serial; prefers human-assigned identity. */
export function formatAccessDevicePageTitle(device: AccessDevicePageTitleFields): string {
  const name = device.name?.trim();
  if (name) return name;

  const location = device.location_description?.trim();
  if (location) return location;

  if (device.relay_channel != null && Number.isFinite(device.relay_channel)) {
    return `Relay ${device.relay_channel}`;
  }

  const deviceType = device.device_type?.trim();
  if (deviceType) {
    return deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
  }

  return 'Access device';
}

/** List/card subtitle: hardware identity first, then location fallback. */
export function formatAccessDeviceListSubtitle(
  device: Pick<AccessControlDevice, 'device_serial' | 'relay_channel' | 'location_description'>
): string {
  const serial = device.device_serial?.trim();
  const relay =
    device.relay_channel != null && Number.isFinite(device.relay_channel)
      ? `Relay ${device.relay_channel}`
      : '';
  const identity = [serial, relay].filter(Boolean).join(' · ');
  if (identity) return identity;
  return device.location_description?.trim() || '—';
}

export function isGatewaySyncProvisioned(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return metadata.createdFromGatewaySync === true;
}

/** True when the device was created via admin UI/REST (may also be gateway-seen). */
export function isManuallyAddedDevice(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return metadata.manuallyAdded === true;
}
