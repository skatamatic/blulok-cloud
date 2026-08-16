/**
 * FirmwarePushSessionStore
 *
 * Module-level in-memory state for active firmware pushes, chunk ACK resolvers,
 * disconnect grace timers, resume queues, and timeout overrides.
 *
 * Extracted from FirmwareService to isolate stateful session management.
 */

import {
  DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS,
  DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS,
  FIRMWARE_TIMEOUT_OVERRIDE_MAX_MS,
  FIRMWARE_TIMEOUT_OVERRIDE_MIN_MS,
} from '@/constants/firmware-timeout.constants';

/**
 * In-memory state for active push tasks.
 * Maps pushId -> resolver/rejector + cancellation flag + nonce + facilityId.
 */
export interface ActivePush {
  cancel: boolean;
  nonce: string;
  facilityId: string;
  chunkAckResolvers: Map<number, { resolve: () => void; reject: (err: Error) => void }>;
}

// =========================================================================
// Module-level Maps/State
// =========================================================================

/** Active push sessions keyed by pushId. */
export const activePushes = new Map<string, ActivePush>();

/** Verifying timeout timers keyed by pushId. */
export const verifyingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/** Transfer disconnect grace timers keyed by pushId. */
export const transferDisconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/** Absolute deadline (ms) for v2 transfer wait — extended when gateway reports progress. */
export const v2TransferDeadlines = new Map<string, number>();

/** Push IDs currently being resumed (prevents duplicate resume attempts). */
export const resumeInFlightPushes = new Set<string>();

/** Facility retry timers for resume attempts. */
export const resumeFacilityRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Facilities currently running resume logic (prevents concurrent runs). */
export const resumeFacilityRunsInFlight = new Set<string>();

// =========================================================================
// Timeout Overrides (Dev/e2e)
// =========================================================================

/** Dev/e2e process overrides; `null` uses env/default constants. */
let transferDisconnectGraceMsOverride: number | null = null;
let verifyDisconnectGraceMsOverride: number | null = null;

export function assertTimeoutOverrideMs(ms: number, field: string): number {
  if (!Number.isFinite(ms)) {
    throw new Error(`${field} must be a finite number or null`);
  }
  const rounded = Math.floor(ms);
  if (rounded < FIRMWARE_TIMEOUT_OVERRIDE_MIN_MS || rounded > FIRMWARE_TIMEOUT_OVERRIDE_MAX_MS) {
    throw new Error(
      `${field} must be between ${FIRMWARE_TIMEOUT_OVERRIDE_MIN_MS} and ${FIRMWARE_TIMEOUT_OVERRIDE_MAX_MS}`,
    );
  }
  return rounded;
}

/** Grace window to resume chunk transfer after a gateway WS drop. */
export function transferDisconnectGraceMs(): number {
  return transferDisconnectGraceMsOverride ?? DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS;
}

/** Grace while verifying during disconnect (gateway may be rebooting). */
export function verifyDisconnectGraceMs(): number {
  return verifyDisconnectGraceMsOverride ?? DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS;
}

export function getTransferDisconnectGraceMsOverride(): number | null {
  return transferDisconnectGraceMsOverride;
}

export function setTransferDisconnectGraceMsOverrideValue(value: number | null): void {
  transferDisconnectGraceMsOverride = value;
}

export function getVerifyDisconnectGraceMsOverride(): number | null {
  return verifyDisconnectGraceMsOverride;
}

export function setVerifyDisconnectGraceMsOverrideValue(value: number | null): void {
  verifyDisconnectGraceMsOverride = value;
}

// =========================================================================
// Test Exports
// =========================================================================

/** Exposed for unit tests only — allows tests to set up handleChunkAck state. */
export const _testActivePushes = activePushes;
export const _testResumeInFlightPushes = resumeInFlightPushes;

/** Test-only: clear module-level firmware push timers between Jest suites. */
export function _testClearPendingTimers(): void {
  for (const timer of verifyingTimeouts.values()) {
    clearTimeout(timer);
  }
  verifyingTimeouts.clear();

  for (const timer of transferDisconnectTimeouts.values()) {
    clearTimeout(timer);
  }
  transferDisconnectTimeouts.clear();

  for (const timer of resumeFacilityRetryTimers.values()) {
    clearTimeout(timer);
  }
  resumeFacilityRetryTimers.clear();

  activePushes.clear();
  resumeInFlightPushes.clear();
  resumeFacilityRunsInFlight.clear();
}
