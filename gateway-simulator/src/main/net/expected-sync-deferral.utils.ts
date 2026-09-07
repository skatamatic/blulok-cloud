import type { GatewaySessionRole } from '@protocol/messages';
import { isNotBoundGateway, isRecoveryBlocked, type SyncResult } from './proxy-result';

/** Swap candidates and in-flight recovery blocks are normal — not operator errors. */
export function isExpectedSyncDeferral(
  sessionRole: GatewaySessionRole | undefined,
  result: SyncResult,
): boolean {
  if (!result.ok && sessionRole === 'swap_candidate' && isNotBoundGateway(result)) {
    return true;
  }
  if (!result.ok && sessionRole === 'swap_candidate' && isRecoveryBlocked(result)) {
    return true;
  }
  return false;
}

export function expectedSyncDeferralMessage(sessionRole: GatewaySessionRole | undefined): string | undefined {
  if (sessionRole === 'swap_candidate') {
    return 'Connected as swap candidate — cloud inventory sync is blocked until this unit is promoted or recovery completes.';
  }
  return undefined;
}
