/**
 * device_status WebSocket payloads (after WebSocketContext unwraps `data`) typically include
 * `updatedDeviceId` and/or a `devices` array. Used to avoid full list refresh on unrelated devices.
 */
export function shouldRefreshDeviceListForPayload(
  payload: unknown,
  relevantIds: ReadonlySet<string>
): boolean {
  if (relevantIds.size === 0) return true;
  if (!payload || typeof payload !== 'object') return true;

  const p = payload as Record<string, unknown>;
  const updated = p.updatedDeviceId;
  if (typeof updated === 'string' && updated) {
    return relevantIds.has(updated);
  }

  const devices = p.devices;
  if (Array.isArray(devices) && devices.length > 0) {
    return devices.some((d) => {
      if (!d || typeof d !== 'object') return false;
      const id = (d as { id?: string }).id;
      return typeof id === 'string' && relevantIds.has(id);
    });
  }

  return true;
}
