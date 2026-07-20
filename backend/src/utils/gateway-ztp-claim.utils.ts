/** Metadata key: facility the FA claimed this sticker for (may be unbound swap-prep). */
export const ZTP_INTENDED_FACILITY_ID_KEY = 'ztpIntendedFacilityId';

export function parseGatewayMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

export function getZtpIntendedFacilityId(metadata: unknown): string | null {
  const value = parseGatewayMetadataRecord(metadata)[ZTP_INTENDED_FACILITY_ID_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function withZtpIntendedFacilityId(
  metadata: unknown,
  facilityId: string,
): Record<string, unknown> {
  return {
    ...parseGatewayMetadataRecord(metadata),
    provisionedVia: 'ztp_sticker',
    key_protection: 'software',
    [ZTP_INTENDED_FACILITY_ID_KEY]: facilityId,
  };
}

/** Drop swap-prep intent so operational AUTH requires a fresh claim. */
export function withoutZtpIntendedFacilityId(metadata: unknown): Record<string, unknown> {
  const next = { ...parseGatewayMetadataRecord(metadata) };
  delete next[ZTP_INTENDED_FACILITY_ID_KEY];
  return next;
}
