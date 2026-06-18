import { GatewayDeviceSyncLogModel } from '../models/gateway-device-sync-log.model';
import type { DeviceSyncLogEntry, InventorySyncSummary } from '../types/gateway-device-sync.types';
import type { InventorySyncResult } from './device-sync.service';
import { InventorySyncNotificationService } from './notifications/inventory-sync-notification.service';
import { logger } from '@/utils/logger';

export class GatewayDeviceSyncLogService {
  private static instance: GatewayDeviceSyncLogService;
  private readonly model = new GatewayDeviceSyncLogModel();

  static getInstance(): GatewayDeviceSyncLogService {
    if (!GatewayDeviceSyncLogService.instance) {
      GatewayDeviceSyncLogService.instance = new GatewayDeviceSyncLogService();
    }
    return GatewayDeviceSyncLogService.instance;
  }

  async recordInventorySync(params: {
    gatewayId: string;
    facilityId: string;
    source?: string;
    facilityName?: string;
    lockResult: InventorySyncResult | null;
    accessResult: InventorySyncResult | null;
    networkInfraResult?: InventorySyncResult | null;
  }): Promise<void> {
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
  }

  async listForGateway(
    gatewayId: string,
    options: { limit?: number; offset?: number } = {}
  ) {
    return this.model.findByGatewayId(gatewayId, options);
  }
}
