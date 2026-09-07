/**
 * FMS Webhook Service
 *
 * Handles webhook events from FMS providers.
 * Extracted from FMSService to reduce monolith size.
 */

import { BaseFMSProvider } from './base-fms-provider';
import { StoredgeProvider } from './providers/storedge-provider';
import {
  FMSChange,
  FMSChangeType,
  FMSChangeAction,
  FMSTenant,
  FMSUnit,
  FMSWebhookPayload,
  FMSWebhookFeedItem,
  FMSSyncLog,
  FMSSyncStatus,
  FMSConfiguration,
} from '@/types/fms.types';
import { FMSWebhookAuthMode } from '@/types/fms.types';
import { validateFmsWebhookAuth, type FmsWebhookAuthHeaders } from './fms-webhook-auth';
import { shouldAutoAcceptChanges } from './fms-auto-accept.utils';
import { collectFmsReviewProblems } from './fms-review-notification.utils';
import {
  buildFmsOccupancyContext,
  formatVacantUnitLedgerConflictNote,
  isFmsUnitVacantStatus,
  resolveLedgerAssignAgainstUnitStatus,
  resolveOccupiedUnitBlockers,
  shouldOmitOccupiedUnitReview,
  type FmsOccupancyContext,
  type FmsOccupancyTenantInfo,
} from './fms-unit-occupancy-validation.utils';
import { validateFmsTenantWebhookFields, formatFmsTenantContactLabel } from './fms-tenant-validation.utils';
import {
  isOpaqueFmsId,
  labelsFromFmsChangePayloads,
  summarizeFmsWebhookPayload,
  type FmsWebhookDisplayLabels,
} from './fms-webhook-summary.utils';
import { logger } from '@/utils/logger';
import type { FMSServiceModels, FMSServiceCore } from './fms-service-context';
import type { FMSChangeApplicatorService } from './fms-change-applicator.service';

/**
 * Models are accessed via getter to support test-time mocking on parent service.
 */

function parseWebhookJson(rawBody: Buffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function moveOutValidationErrors(
  tenantExternalId: string,
  unitExternalId: string,
  tenantInternalId?: string,
  unitInternalId?: string
): string[] | undefined {
  const errors: string[] = [];
  if (!tenantExternalId || !unitExternalId) {
    errors.push('Move-out payload missing tenant_id or unit_id');
    return errors;
  }
  if (!tenantInternalId) {
    errors.push('This tenant is not mapped in BluLok yet');
  }
  if (!unitInternalId) {
    errors.push('This unit is not mapped in BluLok yet');
  }
  return errors.length > 0 ? errors : undefined;
}

/**
 * Collaborator service for FMS webhook handling.
 */
export class FMSWebhookService {
  constructor(
    private readonly getModels: () => FMSServiceModels,
    private readonly core: FMSServiceCore,
    private readonly applicator: FMSChangeApplicatorService,
    private readonly getProviderFn: (facilityId: string, config: FMSConfiguration) => BaseFMSProvider,
    private readonly reviewChangesFn: (changeIds: string[], accepted: boolean) => Promise<void>
  ) {}

  private get models(): FMSServiceModels {
    return this.getModels();
  }

  /**
   * Process an inbound FMS webhook.
   */
  async handleWebhookEvent(
    facilityId: string,
    rawBody: Buffer,
    requestHeaders: FmsWebhookAuthHeaders
  ): Promise<{
    duplicate: boolean;
    message: string;
    syncLogId?: string;
    changesDetected?: number;
    changesApplied?: number;
    requiresReview?: boolean;
  }> {
    const config = await this.models.fmsConfigModel.findByFacilityId(facilityId);
    if (!config) {
      throw new Error('FMS configuration not found for facility');
    }
    if (!config.is_enabled) {
      throw new Error('FMS integration is not enabled for this facility');
    }

    const provider = this.getProviderFn(facilityId, config);
    if (!provider.getCapabilities().supportsWebhooks) {
      throw new Error(`Provider ${config.provider_type} does not support webhooks`);
    }

    const authResult = validateFmsWebhookAuth(
      config.config.syncSettings,
      config.config.customSettings,
      rawBody,
      requestHeaders
    );
    if (!authResult.valid) {
      throw new Error(authResult.error ?? 'Invalid webhook signature');
    }
    if (authResult.mode === FMSWebhookAuthMode.NONE) {
      logger.warn('[FMS Webhook] Processing unauthenticated webhook (webhookAuthMode=none)', {
        facilityId,
      });
    }

    const payload = await provider.parseWebhookPayload(rawBody);
    const rawPayload = parseWebhookJson(rawBody);

    const existing = await this.models.webhookEventModel.findByExternalEventId(
      facilityId,
      payload.externalEventId
    );
    if (existing && this.models.webhookEventModel.isProcessed(existing)) {
      return { duplicate: true, message: 'Event already processed' };
    }
    if (existing && !this.models.webhookEventModel.isProcessed(existing)) {
      await this.models.webhookEventModel.deleteByExternalEventId(facilityId, payload.externalEventId);
    }

    if (payload.disposition === 'ignored') {
      return this.recordIgnoredWebhook(facilityId, payload, rawPayload);
    }

    const autoAccept = shouldAutoAcceptChanges(config.config.syncSettings, 'webhook');
    let syncLog: FMSSyncLog;
    let syncLogCreatedForEvent = false;

    if (!autoAccept) {
      const openReview = await this.models.syncLogModel.findOpenWebhookReviewSyncLog(facilityId);
      if (openReview) {
        syncLog = openReview;
      } else {
        syncLog = await this.models.syncLogModel.create({
          facility_id: facilityId,
          fms_config_id: config.id,
          triggered_by: 'webhook',
        });
        syncLogCreatedForEvent = true;
      }
    } else {
      syncLog = await this.models.syncLogModel.create({
        facility_id: facilityId,
        fms_config_id: config.id,
        triggered_by: 'webhook',
      });
      syncLogCreatedForEvent = true;
    }

    const webhookRecord = await this.models.webhookEventModel.create({
      facility_id: facilityId,
      external_event_id: payload.externalEventId,
      event_type: payload.event_type,
      sync_log_id: syncLog.id,
      status: 'received',
      raw_payload: rawPayload,
    });

    try {
      const pendingInserts = await this.buildWebhookChanges(
        facilityId,
        syncLog.id,
        this.toApplyPayload(payload),
        provider
      );
      const displayLabels = await this.resolveWebhookDisplayLabels(
        facilityId,
        payload.data ?? {},
        pendingInserts
      );
      const { summary, summaryText } = summarizeFmsWebhookPayload(payload, displayLabels);

      const changes: FMSChange[] = [];
      for (const insert of pendingInserts) {
        changes.push(await this.models.changeModel.create(insert));
      }

      const priorDetected = Number(syncLog.changes_detected ?? 0);
      const priorPending = Number(syncLog.changes_pending ?? 0);

      let changesApplied = 0;
      let changesFailed = 0;
      let applyErrors: string[] = [];
      let autoApplied = false;
      let requiresReview = false;

      if (autoAccept && changes.length > 0) {
        const outcome = await this.applicator.autoAcceptAndApplyChanges(
          syncLog.id,
          changes,
          this.reviewChangesFn
        );
        changesApplied = outcome.changesApplied;
        changesFailed = outcome.changesFailed;
        applyErrors = outcome.applyErrors;
        autoApplied = outcome.autoApplied;
        requiresReview = outcome.requiresReview;

        await this.models.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected + changes.length,
          changes_applied: Number(syncLog.changes_applied ?? 0) + changesApplied,
          sync_status: requiresReview ? FMSSyncStatus.PENDING_REVIEW : FMSSyncStatus.COMPLETED,
        });
        await this.applicator.refreshSyncLogChangeCounts(syncLog.id);

        if (requiresReview) {
          await this.models.syncLogModel.markPendingReview(syncLog.id, {
            tenants_synced: 0,
            units_synced: 0,
            errors: applyErrors,
            warnings: [],
            changes_auto_applied: changesApplied > 0,
          });
        } else {
          await this.models.syncLogModel.markCompleted(syncLog.id, {
            tenants_synced: 0,
            units_synced: 0,
            errors: applyErrors,
            warnings: [],
            changes_auto_applied: true,
          });
        }
      } else if (changes.length > 0) {
        requiresReview = true;
        await this.models.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected + changes.length,
          changes_pending: priorPending + changes.length,
          sync_status: FMSSyncStatus.PENDING_REVIEW,
        });
        await this.models.syncLogModel.markPendingReview(syncLog.id, {
          tenants_synced: 0,
          units_synced: 0,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      } else {
        await this.models.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected,
          sync_status: FMSSyncStatus.COMPLETED,
        });
        await this.models.syncLogModel.markCompleted(syncLog.id, {
          tenants_synced: 0,
          units_synced: 0,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      }

      const { problemSummaries } = collectFmsReviewProblems(changes);
      const autoApplyAttempted = autoAccept && changes.length > 0;

      const eventSummary = {
        ...summary,
        summaryText,
        changesDetected: changes.length,
        changesApplied,
        autoApplied,
        requiresReview,
        autoApplyAttempted,
        problemSummaries,
      };

      await this.models.webhookEventModel.markProcessed(webhookRecord.id, syncLog.id, eventSummary);

      const webhookFeedItem = this.toWebhookFeedItem({
        id: webhookRecord.id,
        facility_id: facilityId,
        external_event_id: payload.externalEventId,
        event_type: payload.event_type,
        received_at: webhookRecord.received_at,
        sync_log_id: syncLog.id,
        event_summary: eventSummary,
        status: 'processed',
        raw_payload: rawPayload,
      }, { includeRawPayload: true });

      void this.notifyFmsWebhookReceived(facilityId, payload, webhookFeedItem, displayLabels, {
        autoApplyAttempted,
        problemSummaries,
      });
      this.core.broadcastFMSSyncUpdate(facilityId, webhookFeedItem);

      return {
        duplicate: false,
        message: `Processed ${payload.event_type} webhook`,
        syncLogId: syncLog.id,
        changesDetected: changes.length,
        changesApplied,
        requiresReview,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Webhook processing failed';
      await this.models.webhookEventModel.markFailed(webhookRecord.id, errorMessage, {
        summaryText: `Failed: ${payload.event_type}`,
        eventType: payload.event_type,
      });
      if (syncLogCreatedForEvent) {
        await this.models.syncLogModel.update(syncLog.id, {
          sync_status: FMSSyncStatus.FAILED,
          error_message: errorMessage,
        });
      }
      void this.notifyFmsWebhookFailure(facilityId, payload, errorMessage);
      this.core.broadcastFMSSyncUpdate(
        facilityId,
        this.toWebhookFeedItem({
          ...webhookRecord,
          status: 'failed',
          error_message: errorMessage,
          event_summary: { summaryText: `Failed: ${payload.event_type}`, eventType: payload.event_type },
          raw_payload: rawPayload,
        }, { includeRawPayload: true })
      );
      throw error;
    }
  }

  /**
   * Recent webhook events for the facility FMS tab feed.
   */
  async getRecentWebhookEvents(
    facilityId: string,
    limit = 5,
    options: { includeUnsuccessful?: boolean; includeRawPayload?: boolean } = {}
  ): Promise<FMSWebhookFeedItem[]> {
    const records = await this.models.webhookEventModel.findRecentByFacility(facilityId, limit, {
      includeUnsuccessful: options.includeUnsuccessful === true,
    });
    const syncLogIds = [
      ...new Set(
        records
          .map((record) => record.sync_log_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ];

    const pendingCountBySyncLog = new Map<string, number>();
    await Promise.all(
      syncLogIds.map(async (syncLogId) => {
        const pending = await this.models.changeModel.findPendingBySyncLogId(syncLogId);
        pendingCountBySyncLog.set(syncLogId, pending.length);
      })
    );

    return records.map((record) => {
      const item = this.toWebhookFeedItem(record, {
        includeRawPayload: options.includeRawPayload === true,
      });
      if (!item.requiresReview || !item.syncLogId) {
        return item;
      }

      const pendingCount = pendingCountBySyncLog.get(item.syncLogId) ?? 0;
      if (pendingCount === 0) {
        return { ...item, requiresReview: false };
      }

      return item;
    });
  }

  private toWebhookFeedItem(
    record: {
      id: string;
      facility_id: string;
      external_event_id: string;
      event_type: string;
      received_at: Date | string;
      sync_log_id?: string | null;
      event_summary?: Record<string, unknown> | null;
      status?: FMSWebhookFeedItem['status'];
      error_message?: string | null;
      raw_payload?: Record<string, unknown> | null;
    },
    options: { includeRawPayload?: boolean } = {}
  ): FMSWebhookFeedItem {
    const eventSummary = record.event_summary ?? {};
    const changesDetected = Number(eventSummary.changesDetected ?? 0);
    const changesApplied = Number(eventSummary.changesApplied ?? 0);
    const autoApplied = eventSummary.autoApplied === true;
    const requiresReview = eventSummary.requiresReview === true;
    const summaryText =
      typeof eventSummary.summaryText === 'string'
        ? eventSummary.summaryText
        : record.event_type.replace(/\./g, ' ');

    const receivedAt =
      record.received_at instanceof Date
        ? record.received_at.toISOString()
        : new Date(record.received_at).toISOString();

    return {
      id: record.id,
      facilityId: record.facility_id,
      eventType: record.event_type,
      externalEventId: record.external_event_id,
      receivedAt,
      summary: eventSummary,
      summaryText,
      changesDetected,
      changesApplied,
      autoApplied,
      requiresReview,
      syncLogId: record.sync_log_id ?? '',
      status: record.status ?? 'processed',
      errorMessage: record.error_message ?? null,
      rawPayload: options.includeRawPayload ? record.raw_payload ?? null : null,
    };
  }

  private toApplyPayload(payload: FMSWebhookPayload): FMSWebhookPayload {
    if (!payload.applyAs || payload.applyAs === payload.event_type) {
      return payload;
    }
    return { ...payload, event_type: payload.applyAs };
  }

  private async recordIgnoredWebhook(
    facilityId: string,
    payload: FMSWebhookPayload,
    rawPayload: Record<string, unknown> | null
  ): Promise<{
    duplicate: boolean;
    message: string;
    syncLogId?: string;
    changesDetected?: number;
    changesApplied?: number;
    requiresReview?: boolean;
  }> {
    const displayLabels = await this.resolveWebhookDisplayLabels(facilityId, payload.data ?? {}, []);
    const { summary, summaryText } = summarizeFmsWebhookPayload(payload, displayLabels);
    const eventSummary = {
      ...summary,
      summaryText,
      changesDetected: 0,
      changesApplied: 0,
      autoApplied: false,
      requiresReview: false,
      ignored: true,
      rawType: payload.rawType,
    };

    const webhookRecord = await this.models.webhookEventModel.create({
      facility_id: facilityId,
      external_event_id: payload.externalEventId,
      event_type: payload.event_type,
      status: 'ignored',
      raw_payload: rawPayload,
      event_summary: eventSummary,
    });

    const webhookFeedItem = this.toWebhookFeedItem(webhookRecord, { includeRawPayload: true });
    this.core.broadcastFMSSyncUpdate(facilityId, webhookFeedItem);

    return {
      duplicate: false,
      message: `Recorded ${payload.event_type} webhook (not applied)`,
      changesDetected: 0,
      changesApplied: 0,
      requiresReview: false,
    };
  }

  private async getFacilityName(facilityId: string): Promise<string> {
    const { DatabaseService } = await import('@/services/database.service');
    const row = await DatabaseService.getInstance()
      .connection('facilities')
      .where('id', facilityId)
      .first('name');
    return (row?.name as string | undefined) || 'Facility';
  }

  private async resolveWebhookDisplayLabels(
    facilityId: string,
    data: Record<string, unknown>,
    inserts: Parameters<typeof this.models.changeModel.create>[0][]
  ): Promise<FmsWebhookDisplayLabels> {
    const fromInserts = labelsFromFmsChangePayloads(inserts);
    let unitLabel = fromInserts.unitLabel;
    let tenantLabel = fromInserts.tenantLabel;

    const unitExternalId =
      typeof data.unit_id === 'string'
        ? data.unit_id
        : typeof data.unitId === 'string'
          ? data.unitId
          : undefined;
    const tenantExternalId =
      typeof data.tenant_id === 'string'
        ? data.tenant_id
        : typeof data.tenantId === 'string'
          ? data.tenantId
          : undefined;

    if (!unitLabel && unitExternalId) {
      const unitMapping = await this.models.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        unitExternalId
      );
      if (unitMapping?.internal_id) {
        const unit = await this.models.unitModel.findById(unitMapping.internal_id);
        if (unit?.unit_number && !isOpaqueFmsId(unit.unit_number)) {
          unitLabel = unit.unit_number;
        }
      }
    }

    if (!tenantLabel && tenantExternalId) {
      const tenantMapping = await this.models.entityMappingModel.findByExternalId(
        facilityId,
        'user',
        tenantExternalId
      );
      if (tenantMapping?.internal_id) {
        try {
          const { DatabaseService } = await import('@/services/database.service');
          const row = await DatabaseService.getInstance()
            .connection('users')
            .where('id', tenantMapping.internal_id)
            .first('first_name', 'last_name', 'email');
          const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
          if (name) tenantLabel = name;
          else if (typeof row?.email === 'string' && row.email.trim() && !isOpaqueFmsId(row.email)) {
            tenantLabel = row.email.trim();
          }
        } catch {
          // Display lookup is best-effort; notification still sends without a name.
        }
      }
    }

    return { tenantLabel, unitLabel };
  }

  private async notifyFmsWebhookReceived(
    facilityId: string,
    payload: FMSWebhookPayload,
    webhookFeedItem: FMSWebhookFeedItem,
    display?: FmsWebhookDisplayLabels,
    reviewContext?: { autoApplyAttempted?: boolean; problemSummaries?: string[] }
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      const facilityName = await this.getFacilityName(facilityId);
      const dispatcher = InAppNotificationDispatcher.getInstance();
      const payloadData: Record<string, unknown> = { ...(payload.data ?? {}) };
      if (display?.unitLabel) payloadData.unit_number = display.unitLabel;
      if (display?.tenantLabel && !payloadData.first_name && !payloadData.firstName) {
        payloadData.first_name = display.tenantLabel;
      }

      await dispatcher.notifyFmsWebhookReceived(
        facilityId,
        facilityName,
        webhookFeedItem.id,
        payload.event_type,
        payloadData,
        {
          changesDetected: webhookFeedItem.changesDetected,
          changesApplied: webhookFeedItem.changesApplied,
          autoApplied: webhookFeedItem.autoApplied,
          requiresReview: webhookFeedItem.requiresReview,
          syncLogId: webhookFeedItem.syncLogId,
          autoApplyAttempted: reviewContext?.autoApplyAttempted,
          problemSummaries: reviewContext?.problemSummaries,
        },
        webhookFeedItem.requiresReview ? 'high' : 'low'
      );
    } catch (err) {
      logger.error('[FMS] Failed to send webhook notification:', err);
    }
  }

  private async notifyFmsWebhookFailure(
    facilityId: string,
    payload: FMSWebhookPayload,
    errorMessage: string
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      const facilityName = await this.getFacilityName(facilityId);
      await InAppNotificationDispatcher.getInstance().notifyFmsSyncFailed(
        facilityId,
        facilityName,
        payload.externalEventId,
        `Webhook ${payload.event_type} failed: ${errorMessage}`
      );
    } catch (err) {
      logger.error('[FMS] Failed to send webhook failure notification:', err);
    }
  }

  async buildWebhookChanges(
    facilityId: string,
    syncLogId: string,
    payload: FMSWebhookPayload,
    provider: BaseFMSProvider
  ): Promise<Parameters<typeof this.models.changeModel.create>[0][]> {
    const data = payload.data;
    const inserts: Parameters<typeof this.models.changeModel.create>[0][] = [];

    const resolveTenantMapping = async (externalTenantId: string) =>
      this.models.entityMappingModel.findByExternalId(facilityId, 'user', externalTenantId);

    const resolveUnitMapping = async (externalUnitId: string) =>
      this.models.entityMappingModel.findByExternalId(facilityId, 'unit', externalUnitId);

    switch (payload.event_type) {
      case 'tenant.created': {
        const tenantData =
          provider instanceof StoredgeProvider
            ? provider.mapTenantBodyToFMSTenant(data)
            : this.mapGenericTenantBody(data);
        const validationErrors = this.validateTenantData(tenantData);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: tenantData.externalId,
          after_data: tenantData,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ADD_ACCESS],
          impact_summary: `Create tenant ${tenantData.email ?? tenantData.externalId} from webhook`,
          is_valid: validationErrors.length === 0,
          validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
        });
        break;
      }
      case 'tenant.updated': {
        const tenantData =
          provider instanceof StoredgeProvider
            ? provider.mapTenantBodyToFMSTenant(data)
            : this.mapGenericTenantBody(data);
        const mapping = await resolveTenantMapping(tenantData.externalId);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UPDATED,
          entity_type: 'tenant',
          external_id: tenantData.externalId,
          internal_id: mapping?.internal_id,
          after_data: tenantData,
          required_actions: [FMSChangeAction.UPDATE_USER],
          impact_summary: `Update tenant ${tenantData.email ?? tenantData.externalId} from webhook`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Tenant is not mapped in BluLok yet'],
        });
        break;
      }
      case 'ledger.moved-in': {
        const tenantExternalId = String(data.tenant_id);
        const unitExternalId = String(data.unit_id);
        let tenantMapping = await resolveTenantMapping(tenantExternalId);
        if (!tenantMapping) {
          const fetched = await provider.fetchTenant(tenantExternalId);
          if (fetched) {
            const validationErrors = this.validateTenantData(fetched);
            inserts.push({
              sync_log_id: syncLogId,
              change_type: FMSChangeType.TENANT_ADDED,
              entity_type: 'tenant',
              external_id: fetched.externalId,
              after_data: fetched,
              required_actions: [FMSChangeAction.CREATE_USER],
              impact_summary: `Create tenant before move-in (${tenantExternalId})`,
              is_valid: validationErrors.length === 0,
              validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
            });
          }
        }

        let unitMapping = await resolveUnitMapping(unitExternalId);
        if (!unitMapping) {
          const resolved = await this.resolveWebhookUnit(provider, { unit_id: unitExternalId });
          if (resolved.unit) {
            inserts.push({
              sync_log_id: syncLogId,
              change_type: FMSChangeType.UNIT_ADDED,
              entity_type: 'unit',
              external_id: resolved.unit.externalId,
              after_data: resolved.unit,
              required_actions: [FMSChangeAction.ADD_ACCESS],
              impact_summary: `Create unit ${resolved.unit.unitNumber} before move-in`,
              is_valid: true,
            });
          }
        }

        tenantMapping = tenantMapping ?? (await resolveTenantMapping(tenantExternalId));
        unitMapping = unitMapping ?? (await resolveUnitMapping(unitExternalId));
        const unit = unitMapping?.internal_id
          ? await this.models.unitModel.findById(unitMapping.internal_id)
          : null;

        const fetchedUnit = unitExternalId ? await provider.fetchUnit(unitExternalId) : null;
        const assignBlockers = resolveLedgerAssignAgainstUnitStatus({
          unitNumber: fetchedUnit?.unitNumber ?? unit?.unit_number ?? unitExternalId,
          fmsUnitStatus: fetchedUnit?.status,
          tenant: this.webhookTenantInfoFromInserts(inserts, tenantExternalId),
        });

        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: tenantExternalId,
          internal_id: tenantMapping?.internal_id,
          after_data: {
            action: 'assign_unit',
            unitId: unitMapping?.internal_id,
            externalUnitId: unitExternalId,
            unitNumber: unit?.unit_number ?? unitExternalId,
            webhookOnly: true,
          },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary:
            assignBlockers.length > 0
              ? `Move-in: assign tenant to unit ${unit?.unit_number ?? unitExternalId} — blocked (FMS unit is vacant)`
              : `Move-in: assign tenant to unit ${unit?.unit_number ?? unitExternalId}`,
          is_valid: assignBlockers.length === 0,
          validation_errors: assignBlockers.length > 0 ? assignBlockers : undefined,
        });

        await this.maybeAppendWebhookUnitUpdated(inserts, {
          facilityId,
          syncLogId,
          provider,
          unitExternalId,
          unitInternalId: unitMapping?.internal_id,
          prefetchedUnit: fetchedUnit ?? undefined,
        });
        break;
      }
      case 'ledger.moved-out': {
        const tenantExternalId = String(data.tenant_id);
        const unitExternalId = String(data.unit_id);
        const tenantMapping = await resolveTenantMapping(tenantExternalId);
        const unitMapping = await resolveUnitMapping(unitExternalId);
        const unit = unitMapping?.internal_id
          ? await this.models.unitModel.findById(unitMapping.internal_id)
          : null;

        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: tenantExternalId,
          internal_id: tenantMapping?.internal_id,
          before_data: {
            action: 'unassign_unit',
            unitId: unitMapping?.internal_id,
            externalUnitId: unitExternalId,
            unitNumber: unit?.unit_number ?? unitExternalId,
            webhookOnly: true,
          },
          after_data: null as never,
          required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Move-out: unassign tenant from unit ${unit?.unit_number ?? unitExternalId}`,
          is_valid: Boolean(tenantMapping?.internal_id && unitMapping?.internal_id),
          validation_errors: moveOutValidationErrors(
            tenantExternalId,
            unitExternalId,
            tenantMapping?.internal_id,
            unitMapping?.internal_id
          ),
        });

        await this.maybeAppendWebhookUnitUpdated(inserts, {
          facilityId,
          syncLogId,
          provider,
          unitExternalId,
          unitInternalId: unitMapping?.internal_id,
        });
        break;
      }
      case 'unit.created': {
        const resolved = await this.resolveWebhookUnit(provider, data);
        const unitExternalId = String(data.unit_id ?? '');
        if (!resolved.unit) {
          inserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_ADDED,
            entity_type: 'unit',
            external_id: unitExternalId,
            after_data: { externalId: unitExternalId },
            required_actions: [FMSChangeAction.ADD_ACCESS],
            impact_summary: `Create unit ${unitExternalId} from webhook`,
            is_valid: false,
            validation_errors:
              resolved.validationErrors ?? [`Could not fetch unit ${unitExternalId} from FMS API`],
          });
        } else {
          inserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_ADDED,
            entity_type: 'unit',
            external_id: resolved.unit.externalId,
            after_data: resolved.unit,
            required_actions: [FMSChangeAction.ADD_ACCESS],
            impact_summary: `Create unit ${resolved.unit.unitNumber} from webhook`,
            is_valid: true,
          });
        }
        break;
      }
      case 'unit.deleted': {
        const unitExternalId = String(data.unit_id);
        const mapping = await resolveUnitMapping(unitExternalId);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_REMOVED,
          entity_type: 'unit',
          external_id: unitExternalId,
          internal_id: mapping?.internal_id,
          before_data: mapping ? { externalId: unitExternalId } : null,
          after_data: null,
          required_actions: [FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Remove unit ${unitExternalId} deleted in FMS`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Unit is not mapped in BluLok'],
        });
        break;
      }
      case 'unit.overlock-applied':
      case 'unit.overlock-removed': {
        const unitExternalId = String(data.unit_id);
        const mapping = await resolveUnitMapping(unitExternalId);
        const isOverlocked = payload.event_type === 'unit.overlock-applied';
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_OVERLOCK_CHANGED,
          entity_type: 'unit',
          external_id: unitExternalId,
          internal_id: mapping?.internal_id,
          before_data: { is_overlocked: !isOverlocked },
          after_data: { is_overlocked: isOverlocked },
          required_actions: isOverlocked
            ? [FMSChangeAction.REMOVE_ACCESS]
            : [FMSChangeAction.ADD_ACCESS],
          impact_summary: isOverlocked
            ? `Apply overlock to unit ${unitExternalId}`
            : `Remove overlock from unit ${unitExternalId}`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Unit is not mapped in BluLok'],
        });
        break;
      }
      default:
        throw new Error(`Unhandled webhook event type: ${payload.event_type}`);
    }

    return inserts;
  }

  private mapGenericTenantBody(data: Record<string, unknown>): FMSTenant {
    return {
      externalId: String(data.tenant_id ?? data.externalId ?? ''),
      email: data.email != null ? String(data.email) : null,
      firstName:
        data.first_name != null
          ? String(data.first_name)
          : data.firstName != null
            ? String(data.firstName)
            : null,
      lastName:
        data.last_name != null
          ? String(data.last_name)
          : data.lastName != null
            ? String(data.lastName)
            : null,
      phone: data.phone != null ? String(data.phone) : undefined,
      unitIds: [],
      status: 'active',
    };
  }

  private async maybeAppendWebhookUnitUpdated(
    inserts: Parameters<typeof this.models.changeModel.create>[0][],
    options: {
      facilityId: string;
      syncLogId: string;
      provider: BaseFMSProvider;
      unitExternalId: string;
      unitInternalId?: string;
      prefetchedUnit?: FMSUnit | null;
    }
  ): Promise<void> {
    const { facilityId, syncLogId, provider, unitExternalId, unitInternalId, prefetchedUnit } =
      options;
    if (!unitInternalId || !unitExternalId) {
      return;
    }

    const blulokUnit = await this.models.unitModel.findById(unitInternalId);
    if (!blulokUnit || blulokUnit.facility_id !== facilityId) {
      return;
    }

    const fetched = prefetchedUnit ?? (await provider.fetchUnit(unitExternalId));
    const fetchedExternalId = fetched?.externalId || unitExternalId;
    if (!fetched || !fetchedExternalId || (fetched.status == null && !fetched.unitNumber && !fetched.externalId)) {
      logger.warn(
        `[FMS] Webhook occupancy: could not fetch unit ${unitExternalId} for companion unit_updated`,
        {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
        }
      );
      return;
    }

    const normalized: FMSUnit = {
      ...fetched,
      externalId: fetchedExternalId,
    };

    const hasChanges =
      blulokUnit.status !== normalized.status || blulokUnit.unit_type !== normalized.unitType;
    if (!hasChanges) {
      return;
    }

    const occupancyContext = await this.buildWebhookOccupancyContext(
      facilityId,
      inserts,
      normalized.tenantId
    );
    const occupancyBlockers = resolveOccupiedUnitBlockers(
      normalized,
      blulokUnit.status,
      occupancyContext
    );
    if (shouldOmitOccupiedUnitReview(normalized, occupancyBlockers, occupancyContext)) {
      return;
    }
    if (occupancyBlockers.length > 0) {
      logger.warn(`[FMS] Webhook occupancy: unit ${normalized.unitNumber} cannot be marked occupied yet`, {
        fms_sync: true,
        sync_log_id: syncLogId,
        facility_id: facilityId,
        reasons: occupancyBlockers,
      });
    }

    const unitLabel = normalized.unitNumber || blulokUnit.unit_number || unitExternalId;
    let impactSummary = `Update unit ${unitLabel} from webhook (occupancy sync)`;
    if (isFmsUnitVacantStatus(normalized.status) && occupancyBlockers.length === 0) {
      const tenantLabel = this.webhookBatchTenantLabel(inserts, normalized.tenantId);
      const ledgerNote = formatVacantUnitLedgerConflictNote(
        unitLabel,
        tenantLabel ? [tenantLabel] : []
      );
      if (ledgerNote) impactSummary = `${ledgerNote} (webhook)`;
    }

    inserts.push({
      sync_log_id: syncLogId,
      change_type: FMSChangeType.UNIT_UPDATED,
      entity_type: 'unit',
      external_id: fetchedExternalId,
      internal_id: unitInternalId,
      before_data: { status: blulokUnit.status, unitType: blulokUnit.unit_type },
      after_data: normalized,
      required_actions: [],
      impact_summary: impactSummary,
      is_valid: occupancyBlockers.length === 0,
      validation_errors: occupancyBlockers.length > 0 ? occupancyBlockers : undefined,
    });
  }

  private webhookBatchTenantLabel(
    inserts: Parameters<typeof this.models.changeModel.create>[0][],
    tenantExternalId?: string | null
  ): string | null {
    if (!tenantExternalId) return null;
    const row = inserts.find(
      (r) =>
        (r.change_type === FMSChangeType.TENANT_ADDED ||
          r.change_type === FMSChangeType.TENANT_UNIT_CHANGED) &&
        r.external_id === tenantExternalId
    );
    if (!row) return tenantExternalId;
    const payload = (row.after_data ?? row.before_data ?? {}) as FmsOccupancyTenantInfo;
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();
    const contact = formatFmsTenantContactLabel(payload);
    return name || contact || tenantExternalId;
  }

  private webhookTenantInfoFromInserts(
    inserts: Parameters<typeof this.models.changeModel.create>[0][],
    tenantExternalId: string
  ): FmsOccupancyTenantInfo | undefined {
    const row = inserts.find(
      (r) => r.change_type === FMSChangeType.TENANT_ADDED && r.external_id === tenantExternalId
    );
    if (!row?.after_data || typeof row.after_data !== 'object') return undefined;
    return row.after_data as FmsOccupancyTenantInfo;
  }

  private async buildWebhookOccupancyContext(
    facilityId: string,
    inserts: Parameters<typeof this.models.changeModel.create>[0][],
    unitTenantExternalId?: string
  ): Promise<FmsOccupancyContext> {
    const tenantRows = inserts.filter((row) => row.change_type === FMSChangeType.TENANT_ADDED);
    const batchTenants = tenantRows.map((row) => {
      const payload = (row.after_data ?? {}) as FmsOccupancyTenantInfo;
      return {
        externalId: row.external_id,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        email: payload.email ?? null,
        phone: payload.phone,
      };
    });

    const mapping = unitTenantExternalId
      ? await this.models.entityMappingModel.findByExternalId(facilityId, 'user', unitTenantExternalId)
      : null;

    return buildFmsOccupancyContext({
      fmsTenants: batchTenants,
      tenantChanges: tenantRows,
      mappedTenantExternalIds: mapping && unitTenantExternalId ? [unitTenantExternalId] : [],
      treatUnknownTenantAsBlocker: false,
    });
  }

  private async resolveWebhookUnit(
    provider: BaseFMSProvider,
    data: Record<string, unknown>
  ): Promise<{ unit: FMSUnit | null; validationErrors?: string[] }> {
    const unitExternalId = String(data.unit_id ?? '');
    if (!unitExternalId) {
      return { unit: null, validationErrors: ['Webhook payload missing unit_id'] };
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const fetched = await provider.fetchUnit(unitExternalId);
      if (fetched) {
        return { unit: fetched };
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!(provider instanceof StoredgeProvider)) {
      const fromBody = this.mapGenericUnitBody(data);
      const bodyErrors = this.validateUnitBodyData(fromBody);
      if (bodyErrors.length === 0) {
        return { unit: fromBody };
      }
    }

    const storedgeHint =
      provider instanceof StoredgeProvider
        ? ' Storable unit.created webhooks only include unit_id — use a unit UUID that exists in your FMS facility.'
        : '';
    return {
      unit: null,
      validationErrors: [`Could not fetch unit ${unitExternalId} from FMS API.${storedgeHint}`],
    };
  }

  private mapGenericUnitBody(data: Record<string, unknown>): FMSUnit {
    const unitNumber =
      data.unit_number != null
        ? String(data.unit_number)
        : data.unitNumber != null
          ? String(data.unitNumber)
          : data.name != null
            ? String(data.name)
            : '';

    return {
      externalId: String(data.unit_id ?? data.externalId ?? ''),
      unitNumber,
      unitType:
        data.unit_type != null
          ? String(data.unit_type)
          : data.unitType != null
            ? String(data.unitType)
            : undefined,
      size: data.size != null ? String(data.size) : undefined,
      status: this.normalizeUnitStatus(data.status),
      tenantId: data.tenant_id != null ? String(data.tenant_id) : undefined,
      monthlyRate:
        typeof data.monthly_rate === 'number'
          ? data.monthly_rate
          : typeof data.monthlyRate === 'number'
            ? data.monthlyRate
            : undefined,
    };
  }

  private normalizeUnitStatus(status: unknown): FMSUnit['status'] {
    if (
      status === 'occupied' ||
      status === 'maintenance' ||
      status === 'reserved' ||
      status === 'available'
    ) {
      return status;
    }
    if (status === 'vacant') {
      return 'available';
    }
    return 'available';
  }

  private validateUnitBodyData(unit: FMSUnit): string[] {
    const errors: string[] = [];
    if (!unit.externalId) {
      errors.push('Unit must have an external ID');
    }
    if (!unit.unitNumber) {
      errors.push('Unit must have a unit number in webhook payload or via FMS API');
    }
    return errors;
  }

  private validateTenantData(tenant: FMSTenant): string[] {
    return validateFmsTenantWebhookFields(tenant);
  }
}
