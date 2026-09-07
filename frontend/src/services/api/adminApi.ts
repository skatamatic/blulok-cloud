import { get, post } from './httpClient';

export async function pingGatewayDev(facilityId: string) {
  return post<{ success: boolean; facilityId: string }>('/admin/dev-tools/gateway-ping', { facilityId });
}

export async function backfillAccessSessions(params?: {
  days?: number;
  dryRun?: boolean;
  cursor?: { afterOccurredAt: string; afterId: string } | null;
}) {
  return post<{
    success: boolean;
    message: string;
    results?: {
      days: number;
      dryRun: boolean;
      unlinkedActivityRows: number;
      sessionsCreated: number;
      sessionsUpdated: number;
      activityLinks: number;
      locksAttached: number;
      locksSynthesized: number;
      skippedNoDevice: number;
      skippedErrors: number;
      skippedBusy: boolean;
      done: boolean;
      cursor: { afterOccurredAt: string; afterId: string } | null;
    };
    error?: string;
  }>('/admin/access-sessions/backfill', {
    days: params?.days,
    dryRun: params?.dryRun === true,
    cursor: params?.cursor ?? undefined,
  });
}

export async function getSecureTimeSyncPacket() {
  return get<{ success: boolean; timeSyncJwt: string }>('/internal/gateway/time-sync');
}

export async function requestTimeSyncForLock(lockId: string) {
  return post<{ success: boolean; timeSyncJwt: string }>('/internal/gateway/request-time-sync', { lock_id: lockId });
}

export async function requestFallbackPass(fallbackJwt: string) {
  return post<{ success: boolean; routePass?: string }>('/internal/gateway/fallback-pass', { fallbackJwt });
}

export async function rotateOpsKey(params: { rootPrivateKeyB64: string; customOpsPublicKeyB64?: string }) {
  return post<{
    success: boolean;
    payload: { cmd_type: 'ROTATE_OPERATIONS_KEY'; new_ops_pubkey: string; ts: number };
    signature: string;
    generated_ops_key_pair?: { private_key_b64: string; public_key_b64: string };
  }>('/admin/ops-key-rotation/broadcast', {
    root_private_key_b64: params.rootPrivateKeyB64,
    custom_ops_public_key_b64: params.customOpsPublicKeyB64 || undefined,
  });
}

export async function sendGatewayCommand(params: {
  facilityId: string;
  command: 'DENYLIST_ADD' | 'DENYLIST_REMOVE' | 'LOCK' | 'UNLOCK';
  targetDeviceIds: string[];
  userId?: string;
  expirationSeconds?: number;
}) {
  return post<{
    success: boolean;
    command: string;
    payload?: unknown;
    signature?: string;
    targetDeviceIds?: string[];
  }>('/admin/dev-tools/gateway-command', {
    facilityId: params.facilityId,
    command: params.command,
    targetDeviceIds: params.targetDeviceIds,
    userId: params.userId,
    expirationSeconds: params.expirationSeconds,
  });
}
