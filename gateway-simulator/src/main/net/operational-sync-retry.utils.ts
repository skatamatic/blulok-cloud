import { isNotBoundGateway, isRecoveryBlocked, type SyncResult } from './proxy-result';

const DEFAULT_RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2500];

export function isRetryableOperationalSyncFailure(result: SyncResult): boolean {
  return !result.ok && (isRecoveryBlocked(result) || isNotBoundGateway(result));
}

export async function retryOperationalSync(
  attempt: () => Promise<SyncResult>,
  options?: { delaysMs?: number[] },
): Promise<SyncResult> {
  const delays = options?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let last: SyncResult = { ok: false, status: 0, message: 'Sync not attempted' };

  for (let index = 0; index <= delays.length; index += 1) {
    last = await attempt();
    if (last.ok) return last;
    if (!isRetryableOperationalSyncFailure(last) || index >= delays.length) return last;
    await new Promise((resolve) => setTimeout(resolve, delays[index]));
  }

  return last;
}
