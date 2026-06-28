import { GatewayModel } from '@/models/gateway.model';

/** Max length aligned with gateway / internal-gateway firmware_version validation. */
export const AUTH_FIRMWARE_VERSION_MAX_LEN = 128;

/**
 * Parse optional firmware_version from a gateway WS AUTH payload.
 * Returns null when absent, blank, or not a string.
 */
export function parseAuthFirmwareVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > AUTH_FIRMWARE_VERSION_MAX_LEN
    ? trimmed.slice(0, AUTH_FIRMWARE_VERSION_MAX_LEN)
    : trimmed;
}

/**
 * Persist the gateway-reported firmware seed from AUTH.
 * Always overwrites gateways.firmware_version when a version is provided.
 * OTA success may update the row between reconnects; the next AUTH seed wins.
 */
export async function persistAuthFirmwareSeed(params: {
  facilityId: string;
  gatewayId?: string;
  firmwareVersion: string | null;
}): Promise<{ gatewayId: string } | null> {
  if (!params.firmwareVersion) return null;

  const gatewayModel = new GatewayModel();
  let gatewayId = params.gatewayId;
  if (!gatewayId) {
    const bound = await gatewayModel.findByFacilityId(params.facilityId);
    gatewayId = bound?.id;
  }
  if (!gatewayId) return null;

  await gatewayModel.update(gatewayId, { firmware_version: params.firmwareVersion });
  return { gatewayId };
}
