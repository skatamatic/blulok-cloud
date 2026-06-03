import type { DeviceModel } from '@/models/device.model';
import type { AccessDeviceInventoryItem, AccessDeviceStateUpdate } from '@/utils/gateway-sync.utils';
import { parseGatewayLastSeen } from '@/utils/gateway-timestamp.utils';

export type AccessControlStateDbUpdate = Parameters<DeviceModel['updateAccessControlDevice']>[1];

/**
 * Map gateway PROXY access_control fields (inventory or state payload) to DB columns.
 * Gateway `last_seen` is stored as `last_activity` on access_control_devices.
 */
export function mapGatewayAccessStateFieldsToDbUpdate(
  fields: Pick<AccessDeviceInventoryItem, 'online' | 'locked' | 'last_seen'> &
    Pick<AccessDeviceStateUpdate, 'online' | 'locked' | 'last_seen'>
): AccessControlStateDbUpdate {
  const dbUpdates: AccessControlStateDbUpdate = {};

  if (fields.online !== undefined) {
    dbUpdates.status = fields.online ? 'online' : 'offline';
  }
  if (fields.locked !== undefined) {
    dbUpdates.is_locked = fields.locked;
  }

  const lastActivity = parseGatewayLastSeen(fields.last_seen);
  if (lastActivity !== undefined) {
    dbUpdates.last_activity = lastActivity;
  }

  return dbUpdates;
}
