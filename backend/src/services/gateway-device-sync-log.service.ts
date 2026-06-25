import { GatewayDeviceSyncLogModel } from '../models/gateway-device-sync-log.model';
import type {
  DeviceSyncLogEntry,
  GatewayDeviceSyncLogRecord,
  InventorySyncSummary,
} from '../types/gateway-device-sync.types';
import type { InventorySyncResult } from './device-sync.service';
import { InventorySyncNotificationService } from './notifications/inventory-sync-notification.service';
import { GatewayDeviceSyncLogSubscriptionManager } from './subscriptions/gateway-device-sync-log-subscription-manager';
import type { SubscriptionRegistry } from './subscriptions/subscription-registry';
import { logger } from '@/utils/logger';

export class GatewayDeviceSyncLogService {
  private static instance: GatewayDeviceSyncLogService;
  private readonly model = new GatewayDeviceSyncLogModel();
  private subscriptionRegistry: SubscriptionRegistry | null = null;

  static getInstance(): GatewayDeviceSyncLogService {
    if (!GatewayDeviceSyncLogService.instance) {
      GatewayDeviceSyncLogService.instance = new GatewayDeviceSyncLogService();
    }
    return GatewayDeviceSyncLogService.instance;
  }

  setSubscriptionRegistry(registry: SubscriptionRegistry): void {
    this.subscriptionRegistry = registry;
  }

  async recordInventorySync(params: {
    gatewayId: string;
    facilityId: string;
    source?: string;
    facilityName?: string;
    lockResult: InventorySyncResult | null;
    accessResult: InventorySyncResult | null;
    networkInfraResult?: InventorySyncResult | null;
  }): Promise<GatewayDeviceSyncLogRecord> {
    const lockResult = params.lockResult;
    const accessResult = params.accessResult;
    const networkInfraResult = params.networkInfraResult ?? null;

    const entries: DeviceSyncLogEntry[] = [
      ...(lockResult?.entries ?? []),
      ...(accessResult?.entries ?? []),
      ...(networkInfraResult?.entries ?? []),
    ];

    for (const err of lockResult?.errors ?? []) {
      if (!entries.some((e) => e.action === 'error' && e.reason === err && e.device_kind === 'blulok')) {
        entries.push({
          action: 'error',
          device_kind: 'blulok',
          identifier: '—',
          reason: err,
        });
      }
    }
    for (const err of accessResult?.errors ?? []) {
      if (!entries.some((e) => e.action === 'error' && e.reason === err && e.device_kind === 'access_control')) {
        entries.push({
          action: 'error',
          device_kind: 'access_control',
          identifier: '—',
          reason: err,
        });
      }
    }
    for (const err of networkInfraResult?.errors ?? []) {
      if (!entries.some((e) => e.action === 'error' && e.reason === err)) {
        entries.push({
          action: 'error',
          device_kind: 'bridge',
          identifier: '—',
          reason: err,
        });
      }
    }

    const toSummary = (result: InventorySyncResult | null): InventorySyncSummary | null => {
      if (!result) return null;
      return {
        added: result.added,
        removed: result.removed,
        unchanged: result.unchanged,
        updated: result.updated,
        skipped_manual: result.skipped_manual,
        errors: result.errors,
      };
    };

    const log = await this.model.create({
      gateway_id: params.gatewayId,
      facility_id: params.facilityId,
      sync_kind: 'inventory',
      source: params.source ?? 'gateway_ws',
      summary: {
        locks: toSummary(lockResult),
        access_control: toSummary(accessResult),
        network_infra: toSummary(networkInfraResult),
      },
      entries,
    });

    this.broadcast([log]);

    void InventorySyncNotificationService.getInstance()
      .notifyInventorySyncErrors({
        facilityId: params.facilityId,
        gatewayId: params.gatewayId,
        syncLogId: log.id,
        lockResult,
        accessResult,
        entries,
        facilityName: params.facilityName,
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[DEVICE-SYNC] Failed to dispatch inventory sync notifications', {
          facilityId: params.facilityId,
          gatewayId: params.gatewayId,
          error: message,
        });
      });

    return log;
  }

  async listForGateway(
    gatewayId: string,
    options: { limit?: number; offset?: number } = {},
  ) {
    return this.model.findByGatewayId(gatewayId, options);
  }

  broadcast(entries: GatewayDeviceSyncLogRecord[]): void {
    if (entries.length === 0) return;
    const manager = this.subscriptionRegistry?.getManager(
      'gateway_device_sync_logs',
    ) as GatewayDeviceSyncLogSubscriptionManager | undefined;
    manager?.broadcastUpdate(entries);
  }
}
