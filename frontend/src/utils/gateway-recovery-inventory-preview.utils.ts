/** Device row from GET .../recovery/inventory-preview (matches recovery snapshot payload). */
export type RecoveryInventoryPreviewDevice = {
  kind: string;
  lock_id?: string | null;
  access_id?: string | null;
  serial?: string | null;
  relay_channel?: number | null;
};

/** Identity line aligned with snapshot JSON field names (lock_id, access_id, serial). */
export function formatRecoveryInventoryPreviewIdentity(device: RecoveryInventoryPreviewDevice): string {
  if (device.kind === 'lock') {
    const lockId = device.lock_id?.trim();
    return lockId ? `lock_id: ${lockId}` : 'lock_id: (missing)';
  }
  if (device.kind === 'access_control') {
    const accessId = device.access_id?.trim();
    const relay = device.relay_channel ?? 1;
    if (!accessId) return 'access_id: (missing)';
    return relay === 1 ? `access_id: ${accessId}` : `access_id: ${accessId} · relay ${relay}`;
  }
  const serial = device.serial?.trim();
  return serial ? `serial: ${serial}` : 'serial: (missing)';
}

export function formatRecoveryInventoryPreviewLine(device: RecoveryInventoryPreviewDevice): string {
  return `${device.kind} · ${formatRecoveryInventoryPreviewIdentity(device)}`;
}
