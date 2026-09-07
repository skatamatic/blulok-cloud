/**
 * Parse gateway PROXY ISO-8601 / Date timestamps for persistence.
 * Returns undefined when the value is missing or not a valid date.
 */
export function parseGatewayLastSeen(lastSeen: string | Date | undefined): Date | undefined {
  if (lastSeen === undefined) {
    return undefined;
  }

  const parsed = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}
