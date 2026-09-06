import {
  coerceOptionalAccessId,
  isPlaceholderAccessString,
  readMetadataString,
} from '@/utils/access-event-placeholder.utils';
import type { AccessEventPayload } from '@/services/access/access-event.types';

const CREDENTIAL_LOCK_EVENTS = new Set([
  'granted',
  'denied',
  'access_granted',
  'access_denied',
  'rejected',
  'blocked',
]);

export type LockStateEchoPolarity = 'locked' | 'unlocked' | 'unknown';

function readNestedLockStateEvent(metadata: Record<string, unknown> | undefined): string | undefined {
  const direct = readMetadataString(metadata, 'event');
  if (direct) return direct;
  const nested = metadata?.metadata;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return readMetadataString(nested as Record<string, unknown>, 'event');
  }
  return undefined;
}

function readNestedLockField(metadata: Record<string, unknown> | undefined): string | undefined {
  const direct = readMetadataString(metadata, 'lock');
  if (direct) return direct;
  const nested = metadata?.metadata;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return readMetadataString(nested as Record<string, unknown>, 'lock');
  }
  return undefined;
}

function readNestedSource(metadata: Record<string, unknown> | undefined): string | undefined {
  const direct = readMetadataString(metadata, 'source');
  if (direct) return direct;
  const nested = metadata?.metadata;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return readMetadataString(nested as Record<string, unknown>, 'source');
  }
  return undefined;
}

function hasCredentialContext(event: AccessEventPayload): boolean {
  if (coerceOptionalAccessId(event.actor?.user_id)) return true;
  if (coerceOptionalAccessId(event.route_pass?.route_pass_id)) return true;
  if (coerceOptionalAccessId(event.route_pass?.issuance_id)) return true;
  if (coerceOptionalAccessId(event.keypad?.code_id)) return true;
  const entered = event.keypad?.entered_code?.trim();
  if (entered && !isPlaceholderAccessString(entered)) return true;
  return false;
}

function looksLikeLockStateEnvelope(event: AccessEventPayload): boolean {
  const meta = event.metadata || {};
  const source = readNestedSource(meta);
  if (source?.toLowerCase() === 'gateway_lock_state') return true;
  const lock = readNestedLockField(meta);
  const hardwareId =
    readMetadataString(meta, 'hardware_lock_id')
    || readMetadataString(meta, 'lock_id')
    || (typeof meta.metadata === 'object' && meta.metadata
      ? readMetadataString(meta.metadata as Record<string, unknown>, 'hardware_lock_id')
      : undefined);
  return Boolean(lock && hardwareId);
}

function isCredentialLockEvent(lockEvent: string | undefined): boolean {
  if (!lockEvent || isPlaceholderAccessString(lockEvent)) return false;
  return CREDENTIAL_LOCK_EVENTS.has(lockEvent.trim().toLowerCase());
}

/**
 * Firmware sometimes wraps a lock-state heartbeat (`event: none`, no user) as
 * `access_granted` + `mobile_key`. Those are physical state, not a new grant.
 * A real credential eval has `event: granted|denied` and/or a user / keypad / route pass.
 */
export function isGatewayLockStateAccessEventEcho(event: AccessEventPayload): boolean {
  if (event.action !== 'access_granted' && event.action !== 'access_denied') {
    return false;
  }
  if (!looksLikeLockStateEnvelope(event)) return false;
  const lockEvent = readNestedLockStateEvent(event.metadata);
  if (isCredentialLockEvent(lockEvent)) return false;
  if (hasCredentialContext(event)) return false;
  return isPlaceholderAccessString(lockEvent) || !lockEvent;
}

export function lockStateEchoPolarity(event: AccessEventPayload): LockStateEchoPolarity {
  const lock = readNestedLockField(event.metadata)?.trim().toLowerCase();
  if (!lock || isPlaceholderAccessString(lock)) return 'unknown';
  if (['closed', 'locked', 'lock'].includes(lock)) return 'locked';
  if (['open', 'opened', 'unlocked', 'unlock'].includes(lock)) return 'unlocked';
  return 'unknown';
}
