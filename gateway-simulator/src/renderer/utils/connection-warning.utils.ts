import type { GatewayInstanceState } from '@protocol/ipc-channels';

/** Warnings that are normal for a session role — should not trigger error toasts. */
export function isExpectedConnectionWarning(gateway: GatewayInstanceState): boolean {
  const warning = gateway.connectionWarning?.trim();
  if (!warning) return false;

  if (gateway.sessionRole === 'swap_candidate') {
    if (warning.toLowerCase().includes('bound production gateway')) return true;
    if (warning.toLowerCase().includes('swap candidate')) return true;
    if (warning.toLowerCase().includes('recovery in progress')) return true;
  }

  return false;
}
