/**
 * JWT / lock-command claim assertions for the gateway E2E suite.
 */

function base64UrlDecode(str) {
  try {
    const pad = (s) => s + '==='.slice((s.length + 3) % 4);
    const b64 = pad(str).replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(b64, 'base64');
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function decodeJwtClaims(jwt) {
  const parts = (jwt || '').split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

/**
 * Route pass JWTs must include `user_role`: lowercase, underscore-separated (matches cloud UserRole).
 * @param {object|null} claims
 * @param {string} expectedLowerSnake e.g. 'tenant', 'facility_admin'
 */
function assertRoutePassUserRole(claims, expectedLowerSnake) {
  if (!claims || typeof claims.user_role !== 'string' || claims.user_role.length === 0) {
    throw new Error('Route pass JWT must include non-empty user_role claim');
  }
  if (claims.user_role !== expectedLowerSnake) {
    throw new Error(`Route pass user_role expected "${expectedLowerSnake}", got "${claims.user_role}"`);
  }
}

/**
 * LOCK/UNLOCK command JWTs include expires_at (unix seconds): now + facility lock_command_timeout_sec.
 * timeoutSec 0 → expires_at 0 (no expiry on device).
 */
function assertLockCommandExpiresAt(cmd, expectedTimeoutSec, slackSec = 15) {
  if (!cmd || (cmd.cmd_type !== 'UNLOCK' && cmd.cmd_type !== 'LOCK')) {
    throw new Error(`Expected LOCK/UNLOCK command, got ${JSON.stringify(cmd)}`);
  }
  if (typeof cmd.expires_at !== 'number') {
    throw new Error(`Lock command missing numeric expires_at: ${JSON.stringify(cmd)}`);
  }
  if (expectedTimeoutSec === 0) {
    if (cmd.expires_at !== 0) {
      throw new Error(`Expected expires_at=0 for one-shot timeout, got ${cmd.expires_at}`);
    }
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const expected = now + expectedTimeoutSec;
  if (cmd.expires_at < now - 2) {
    throw new Error(`expires_at ${cmd.expires_at} is before now (${now})`);
  }
  if (Math.abs(cmd.expires_at - expected) > slackSec) {
    throw new Error(
      `expires_at ${cmd.expires_at} not within ${slackSec}s of expected ${expected} (timeout ${expectedTimeoutSec}s)`,
    );
  }
}

/** UNLOCK with timed open must include open_until (unix UTC seconds) within slack of expected. */
function assertLockCommandOpenUntil(cmd, expectedOpenUntil, slackSec = 15) {
  if (!cmd || cmd.cmd_type !== 'UNLOCK') {
    throw new Error(`Expected UNLOCK command, got ${JSON.stringify(cmd)}`);
  }
  if (typeof cmd.open_until !== 'number') {
    throw new Error(`Timed UNLOCK missing numeric open_until: ${JSON.stringify(cmd)}`);
  }
  if (Math.abs(cmd.open_until - expectedOpenUntil) > slackSec) {
    throw new Error(
      `open_until ${cmd.open_until} not within ${slackSec}s of expected ${expectedOpenUntil}`,
    );
  }
}

/** One-shot UNLOCK must omit open_until. */
function assertLockCommandOmitsOpenUntil(cmd) {
  if (!cmd || cmd.cmd_type !== 'UNLOCK') {
    throw new Error(`Expected UNLOCK command, got ${JSON.stringify(cmd)}`);
  }
  if (cmd.open_until != null) {
    throw new Error(`Expected no open_until on one-shot UNLOCK, got ${cmd.open_until}`);
  }
}

module.exports = {
  base64UrlDecode,
  decodeJwtClaims,
  assertRoutePassUserRole,
  assertLockCommandExpiresAt,
  assertLockCommandOpenUntil,
  assertLockCommandOmitsOpenUntil,
};
