/** Well-formed UUID (any version) — used before auto-creating gateway rows. */
export function isValidGatewayUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isDuplicateKeyError(error: unknown): boolean {
  const record = error as { code?: string; errno?: number };
  return record?.code === 'ER_DUP_ENTRY' || record?.errno === 1062;
}

export type AutoRegisterReject = {
  code: 'AUTH_BAD_REQUEST' | 'AUTH_FORBIDDEN' | 'AUTH_RATE_LIMITED';
  message: string;
};
