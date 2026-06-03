import { FacilityModel } from '@/models/facility.model';
import { DatabaseService } from '@/services/database.service';
import type { DeviceSyncLogEntry } from '@/types/gateway-device-sync.types';
import type { InventorySyncResult } from '@/services/device-sync.service';
import { InAppNotificationDispatcher } from '@/services/notifications/in-app-notification-dispatcher.service';
import {
  buildInventorySyncIssueNotification,
  parseInventorySyncError,
  type ParsedInventorySyncIssue,
  type SerialConflictContext,
} from '@/utils/inventory-sync-error-notification.util';
import { logger } from '@/utils/logger';

type NotifyInventorySyncParams = {
  facilityId: string;
  gatewayId: string;
  syncLogId: string;
  lockResult: InventorySyncResult | null;
  accessResult: InventorySyncResult | null;
  entries: DeviceSyncLogEntry[];
  facilityName?: string;
};

export class InventorySyncNotificationService {
  private static instance: InventorySyncNotificationService;
  private readonly db = DatabaseService.getInstance();
  private readonly facilityModel = new FacilityModel();
  private readonly dispatcher = InAppNotificationDispatcher.getInstance();

  static getInstance(): InventorySyncNotificationService {
    if (!InventorySyncNotificationService.instance) {
      InventorySyncNotificationService.instance = new InventorySyncNotificationService();
    }
    return InventorySyncNotificationService.instance;
  }

  async notifyInventorySyncErrors(params: NotifyInventorySyncParams): Promise<void> {
    const issues = this.collectIssues(params);
    if (issues.length === 0) return;

    const facilityName =
      params.facilityName ??
      (await this.facilityModel.findById(params.facilityId))?.name ??
      'this facility';

    for (const issue of issues) {
      try {
        const conflict = await this.resolveExistingSerialRegistration(
          issue.deviceSerial,
          issue.deviceKind,
        );
        const copy = buildInventorySyncIssueNotification({
          issue,
          sourceFacilityName: facilityName,
          sourceFacilityId: params.facilityId,
          conflict,
        });

        await this.dispatcher.notifyDeviceInventorySyncError({
          facilityId: params.facilityId,
          gatewayId: params.gatewayId,
          syncLogId: params.syncLogId,
          deviceSerial: issue.deviceSerial,
          deviceKind: issue.deviceKind,
          title: copy.title,
          message: copy.message,
          priority: copy.priority,
          metadata: {
            rawError: issue.rawError,
            issueKind: issue.kind,
            conflictingFacilityId: conflict?.facilityId ?? null,
            conflictingFacilityName: conflict?.facilityName ?? null,
            conflictingUnitId: conflict?.unitId ?? null,
            conflictingUnitNumber: conflict?.unitNumber ?? null,
            conflictingAccessDeviceName: conflict?.accessDeviceName ?? null,
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[InventorySyncNotification] Failed to notify for issue', {
          facilityId: params.facilityId,
          deviceSerial: issue.deviceSerial,
          error: message,
        });
      }
    }
  }

  private collectIssues(params: NotifyInventorySyncParams): ParsedInventorySyncIssue[] {
    const bySerial = new Map<string, ParsedInventorySyncIssue>();

    const ingest = (raw: string, kindHint?: DeviceSyncLogEntry['device_kind']) => {
      const parsed = parseInventorySyncError(raw, kindHint);
      if (!parsed) return;
      if (parsed.kind !== 'duplicate_serial') return;
      if (!bySerial.has(parsed.deviceSerial)) {
        bySerial.set(parsed.deviceSerial, parsed);
      }
    };

    for (const entry of params.entries) {
      if (entry.action !== 'error' || !entry.reason) continue;
      ingest(entry.reason, entry.device_kind);
    }

    for (const raw of params.lockResult?.errors ?? []) {
      ingest(raw, 'blulok');
    }
    for (const raw of params.accessResult?.errors ?? []) {
      ingest(raw, 'access_control');
    }

    return Array.from(bySerial.values());
  }

  private async resolveExistingSerialRegistration(
    deviceSerial: string,
    _deviceKind: ParsedInventorySyncIssue['deviceKind'],
  ): Promise<SerialConflictContext | null> {
    const knex = this.db.connection;
    const serial = deviceSerial.trim();
    if (!serial) return null;

    const blulokRow = await knex('blulok_devices as bd')
      .join('gateways as g', 'bd.gateway_id', 'g.id')
      .join('facilities as f', 'g.facility_id', 'f.id')
      .leftJoin('units as u', 'bd.unit_id', 'u.id')
      .where('bd.device_serial', serial)
      .select(
        'f.id as facility_id',
        'f.name as facility_name',
        'bd.unit_id',
        'u.unit_number',
      )
      .first();

    if (blulokRow) {
      return {
        facilityId: String(blulokRow.facility_id),
        facilityName: String(blulokRow.facility_name),
        unitId: blulokRow.unit_id ? String(blulokRow.unit_id) : null,
        unitNumber: blulokRow.unit_number ? String(blulokRow.unit_number) : null,
      };
    }

    const accessRow = await knex('access_control_devices as ac')
      .join('gateways as g', 'ac.gateway_id', 'g.id')
      .join('facilities as f', 'g.facility_id', 'f.id')
      .where('ac.device_serial', serial)
      .select(
        'f.id as facility_id',
        'f.name as facility_name',
        'ac.name as access_device_name',
      )
      .first();

    if (accessRow) {
      return {
        facilityId: String(accessRow.facility_id),
        facilityName: String(accessRow.facility_name),
        unitId: null,
        unitNumber: null,
        accessDeviceName: accessRow.access_device_name
          ? String(accessRow.access_device_name)
          : null,
      };
    }

    return null;
  }
}
