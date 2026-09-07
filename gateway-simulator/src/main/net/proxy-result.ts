import type { ProxyResponseMessage } from '@protocol/messages';

export type SyncResult =
  | { ok: true; status: number }
  | { ok: false; status: number; code?: string; message: string };

export function parseProxyError(response: ProxyResponseMessage): SyncResult {
  const body = response.body as Record<string, unknown> | undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message =
    typeof body?.message === 'string'
      ? body.message
      : code ?? `Request failed (${response.status})`;
  return { ok: false, status: response.status, code, message };
}

export function isRecoveryBlocked(result: SyncResult): boolean {
  return !result.ok && (result.code === 'recovery_in_progress' || result.status === 409);
}

export function isNotBoundGateway(result: SyncResult): boolean {
  return !result.ok && (result.code === 'not_bound_gateway' || (
    result.status === 403 && result.message.toLowerCase().includes('bound production gateway')
  ));
}

export function operationalSyncBlockedHint(result: SyncResult): string {
  if (isNotBoundGateway(result)) {
    return ' (swap candidate — complete swap recovery in the admin UI to bind this hardware)';
  }
  if (isRecoveryBlocked(result)) {
    return ' (recovery in progress — bypass or complete recovery in the admin UI, then sync)';
  }
  return '';
}
