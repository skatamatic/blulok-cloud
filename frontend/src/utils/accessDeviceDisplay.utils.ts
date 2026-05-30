import { AccessControlDevice } from '@/types/facility.types';

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
