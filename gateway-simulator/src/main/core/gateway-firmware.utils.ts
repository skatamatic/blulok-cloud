/** Default running firmware for new simulator gateway tabs (reported on WS AUTH). */
export const DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION = '1.0.0';

export function resolveSimulatorGatewayFirmwareVersion(sources: {
  profileVersion?: string;
  legacyInventoryVersion?: string;
}): string {
  const fromProfile = sources.profileVersion?.trim();
  if (fromProfile) return fromProfile;
  const fromLegacy = sources.legacyInventoryVersion?.trim();
  if (fromLegacy) return fromLegacy;
  return DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION;
}
