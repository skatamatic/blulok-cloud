/**
 * Factory sticker QR payload — matches cursorDocs/gateway-ztp-sticker-design.md
 * `blulok://gw/claim?device_id=<uuid>&pk=<base64url-compressed-p256-pubkey>`
 */
export function buildZtpClaimUri(deviceId: string, publicKeyCompressedB64url: string): string {
  const id = deviceId.trim();
  const pk = publicKeyCompressedB64url.trim();
  if (!id) throw new Error('device_id is required for ZTP claim URI');
  if (!pk) throw new Error('public key is required for ZTP claim URI');
  const params = new URLSearchParams({ device_id: id, pk });
  return `blulok://gw/claim?${params.toString()}`;
}

export function tryBuildZtpClaimUri(
  deviceId: string | undefined,
  publicKeyCompressedB64url: string | undefined,
): string | null {
  if (!deviceId?.trim() || !publicKeyCompressedB64url?.trim()) return null;
  try {
    return buildZtpClaimUri(deviceId, publicKeyCompressedB64url);
  } catch {
    return null;
  }
}
