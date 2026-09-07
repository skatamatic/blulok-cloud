/**
 * Shared context and types for FMS service collaborators.
 * Centralizes model references and shared dependencies to avoid circular imports.
 */

import type { FMSConfigurationModel } from '@/models/fms-configuration.model';
import type { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import type { FMSChangeModel } from '@/models/fms-change.model';
import type { FMSEntityMappingModel } from '@/models/fms-entity-mapping.model';
import type { FMSWebhookEventModel } from '@/models/fms-webhook-event.model';
import type { UnitModel } from '@/models/unit.model';
import type { UnitAssignmentModel } from '@/models/unit-assignment.model';
import type { UnitsService } from '@/services/units.service';
import type { BaseFMSProvider } from './base-fms-provider';
import type {
  FMSProviderType,
  FMSConfiguration,
  FMSApplyContext,
  FMSWebhookFeedItem,
} from '@/types/fms.types';

/**
 * Shared model references for FMS collaborator services.
 * Passed from FMSService to avoid each collaborator instantiating their own models.
 */
export interface FMSServiceModels {
  fmsConfigModel: FMSConfigurationModel;
  syncLogModel: FMSSyncLogModel;
  changeModel: FMSChangeModel;
  entityMappingModel: FMSEntityMappingModel;
  webhookEventModel: FMSWebhookEventModel;
  unitModel: UnitModel;
  unitAssignmentModel: UnitAssignmentModel;
  unitsService: UnitsService;
}

/**
 * Core operations that collaborators can invoke on the main FMSService.
 * This interface decouples collaborators from FMSService's full implementation.
 */
export interface FMSServiceCore {
  getProvider(facilityId: string, config: FMSConfiguration): BaseFMSProvider;
  broadcastFMSSyncProgress(payload: FMSSyncProgressPayload): void;
  broadcastFMSSyncUpdate(facilityId: string, webhookEvent?: FMSWebhookFeedItem): void;
}

/**
 * Progress broadcast payload for FMS sync operations.
 */
export interface FMSSyncProgressPayload {
  facilityId: string;
  syncLogId: string;
  step: 'connecting' | 'fetching' | 'detecting' | 'preparing' | 'applying' | 'complete' | 'failed';
  percent: number;
  message?: string;
}

/**
 * Context passed to change applicator methods.
 * Re-exported for convenience.
 */
export { FMSApplyContext };

/**
 * Provider registry type.
 */
export type ProviderRegistry = Map<FMSProviderType, typeof BaseFMSProvider>;
