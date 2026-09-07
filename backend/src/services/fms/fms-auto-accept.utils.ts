import type { FMSProviderConfig } from '@/types/fms.types';

export type FmsAutoAcceptTrigger = 'manual' | 'automatic' | 'webhook';

type SyncSettings = FMSProviderConfig['syncSettings'];

/**
 * Resolve whether detected changes should auto-apply for a given trigger source.
 * Legacy: when only autoAcceptChanges is set, it applies to both manual and webhook paths.
 */
export function shouldAutoAcceptChanges(
  syncSettings: SyncSettings | undefined,
  triggeredBy: FmsAutoAcceptTrigger,
): boolean {
  if (!syncSettings) return false;

  if (triggeredBy === 'webhook') {
    if (syncSettings.autoAcceptWebhookChanges !== undefined) {
      return syncSettings.autoAcceptWebhookChanges;
    }
    return syncSettings.autoAcceptChanges ?? false;
  }

  return syncSettings.autoAcceptChanges ?? false;
}
