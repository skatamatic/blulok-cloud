import { apiBaseUrl } from '@protocol/constants';
import type { FmsWebhookTargetSummary } from '@protocol/ipc-channels';
import {
  isWebhookAuthReady,
  resolveWebhookAuthFromSyncSettings,
  type FmsWebhookAuthMode,
} from '@protocol/fms-webhook-sender.utils';
import type { FmsConfigRecord } from '../auth/backend-api.types';
import { API_PATHS } from '../auth/backend-api.paths';

/** Main-process only — includes signing secrets. Never send to renderer. */
export type InternalFmsWebhookTarget = {
  configId: string;
  facilityId: string;
  facilityName: string | null;
  providerType: string;
  isEnabled: boolean;
  webhookUrl: string;
  externalFacilityId: string;
  hasExternalFacilityId: boolean;
  authMode: FmsWebhookAuthMode;
  authReady: boolean;
  webhookSecret?: string;
  webhookAuthHeader?: string;
  webhookSignatureHeader?: string;
};

export function mapFmsConfigToWebhookTarget(
  record: FmsConfigRecord,
  backendUrl: string,
): InternalFmsWebhookTarget {
  const syncSettings = record.config?.syncSettings;
  const auth = resolveWebhookAuthFromSyncSettings(syncSettings);
  const customExternalId = record.config?.customSettings?.facilityId?.trim();
  const externalFacilityId = customExternalId || record.facility_id;
  const base = apiBaseUrl(backendUrl);

  return {
    configId: record.id,
    facilityId: record.facility_id,
    facilityName: record.facility_name ?? null,
    providerType: record.provider_type,
    isEnabled: record.is_enabled,
    webhookUrl: `${base}${API_PATHS.fmsWebhook(record.facility_id)}`,
    externalFacilityId,
    hasExternalFacilityId: Boolean(customExternalId),
    authMode: auth.mode,
    authReady: isWebhookAuthReady(auth),
    webhookSecret: syncSettings?.webhookSecret,
    webhookAuthHeader: syncSettings?.webhookAuthHeader,
    webhookSignatureHeader: syncSettings?.webhookSignatureHeader,
  };
}

export function toPublicWebhookTargetSummary(target: InternalFmsWebhookTarget): FmsWebhookTargetSummary {
  return {
    configId: target.configId,
    facilityId: target.facilityId,
    facilityName: target.facilityName,
    providerType: target.providerType,
    isEnabled: target.isEnabled,
    webhookUrl: target.webhookUrl,
    externalFacilityId: target.externalFacilityId,
    hasExternalFacilityId: target.hasExternalFacilityId,
    authMode: target.authMode,
    authReady: target.authReady,
    webhookAuthHeader: target.webhookAuthHeader,
    webhookSignatureHeader: target.webhookSignatureHeader,
  };
}
