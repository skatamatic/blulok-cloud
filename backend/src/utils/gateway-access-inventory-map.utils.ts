import type { DeviceModel } from '@/models/device.model';
import type { AccessDeviceInventoryItem } from '@/utils/gateway-sync.utils';
import { mapGatewayAccessStateFieldsToDbUpdate } from '@/utils/gateway-access-state-map.utils';

export type AccessControlInventoryDbUpdate = Parameters<DeviceModel['updateAccessControlDevice']>[1];

/**
 * Map gateway access_control inventory fields to DB columns.
 * Includes live telemetry (online/locked/last_seen) and non-identity properties (name, location, type).
 */
export function mapGatewayAccessInventoryFieldsToDbUpdate(
  item: Pick<
    AccessDeviceInventoryItem,
    'name' | 'location_description' | 'device_type' | 'access_methods' | 'online' | 'locked' | 'last_seen'
  >
): AccessControlInventoryDbUpdate {
  return {
    ...mapGatewayAccessStateFieldsToDbUpdate(item),
    ...mapGatewayAccessInventoryPropertiesToDbUpdate(item),
  };
}

export function mapGatewayAccessInventoryPropertiesToDbUpdate(
  item: Pick<
    AccessDeviceInventoryItem,
    'name' | 'location_description' | 'device_type' | 'access_methods'
  >,
  existing?: {
    name?: string;
    location_description?: string;
    device_type?: 'gate' | 'door' | 'elevator';
    access_methods?: Array<'app' | 'keypad' | 'fob'>;
  }
): Pick<
  AccessControlInventoryDbUpdate,
  'name' | 'location_description' | 'device_type' | 'access_methods'
> {
  const update: Pick<
    AccessControlInventoryDbUpdate,
    'name' | 'location_description' | 'device_type' | 'access_methods'
  > = {};

  if (item.name !== undefined) {
    const next = item.name.trim();
    const current = (existing?.name ?? '').trim();
    if (next !== current) {
      update.name = next;
    }
  }

  if (item.location_description !== undefined) {
    const next = item.location_description.trim();
    const current = (existing?.location_description ?? '').trim();
    if (next !== current) {
      update.location_description = next;
    }
  }

  if (item.device_type !== undefined && item.device_type !== existing?.device_type) {
    update.device_type = item.device_type;
  }

  if (Array.isArray(item.access_methods) && item.access_methods.length > 0) {
    const next = [...item.access_methods].sort();
    const current = [...(existing?.access_methods ?? [])].sort();
    if (next.length !== current.length || next.some((m, i) => m !== current[i])) {
      update.access_methods = item.access_methods;
    }
  }

  return update;
}
