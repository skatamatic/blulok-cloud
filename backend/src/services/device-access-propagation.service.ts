import {
  DeviceAssignedEvent,
  DeviceEvent,
  DeviceEventService,
  DeviceUnassignedEvent,
} from '@/services/device-event.service';
import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';
import { DenylistService } from '@/services/denylist.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { DenylistEntryModel, type DenylistSource } from '@/models/denylist-entry.model';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { DatabaseService } from '@/services/database.service';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import type { DenylistDeviceTarget } from '@/types/denylist.types';

/**
 * Propagates BluLok lock assign/unassign to zone access (denylist) for tenants and
 * key-share users without removing unit assignments.
 */
export class DeviceAccessPropagationService {
  private static instance: DeviceAccessPropagationService;
  private denylistModel = new DenylistEntryModel();

  private constructor() {
    const events = DeviceEventService.getInstance();
    events.on(DeviceEvent.DEVICE_UNASSIGNED, (event: DeviceUnassignedEvent) => {
      void this.handleDeviceUnassigned(event);
    });
    events.on(DeviceEvent.DEVICE_ASSIGNED, (event: DeviceAssignedEvent) => {
      void this.handleDeviceAssigned(event);
    });
  }

  public static getInstance(): DeviceAccessPropagationService {
    if (!this.instance) this.instance = new DeviceAccessPropagationService();
    return this.instance;
  }

  private getExpirationEpochSeconds(): number {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = (config.security.routePassTtlHours || 24) * 60 * 60;
    return now + ttlSeconds;
  }

  private async getUnitAccessUserIds(unitId: string): Promise<string[]> {
    const db = DatabaseService.getInstance().connection;
    const now = db.fn.now();

    const [tenantRows, sharedRows] = await Promise.all([
      db('unit_assignments')
        .select('tenant_id')
        .where('unit_id', unitId)
        .where((qb) => {
          qb.whereNull('access_expires_at').orWhere('access_expires_at', '>', now);
        }),
      db('key_sharing')
        .select('shared_with_user_id')
        .where({ unit_id: unitId, is_active: true })
        .where((qb) => {
          qb.whereNull('expires_at').orWhere('expires_at', '>', now);
        }),
    ]);

    return Array.from(
      new Set(
        [...tenantRows.map((row) => String(row.tenant_id)), ...sharedRows.map((row) => String(row.shared_with_user_id))],
      ),
    );
  }

  private async pushDenylistAdd(
    facilityId: string,
    userId: string,
    targets: DenylistDeviceTarget[],
    source: DenylistSource,
    performedBy?: string,
  ): Promise<void> {
    if (targets.length === 0) return;

    const knex = DatabaseService.getInstance().connection;
    const exp = this.getExpirationEpochSeconds();
    const deviceIds = targets.map((target) => target.device_id);

    await this.denylistModel.bulkCreate(
      targets.map((target) => ({
        device_id: target.device_id,
        device_type: target.device_type,
        user_id: userId,
        expires_at: knex.raw('FROM_UNIXTIME(?)', [exp]),
        source,
        created_by: performedBy || 'system',
      })),
    );

    const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(userId);
    if (shouldSkip) {
      logger.info(`Skipping DENYLIST_ADD for user ${userId} after lock unassign — route pass expired`);
      return;
    }

    const jwt = await DenylistService.buildDenylistAdd([{ sub: userId, exp }], deviceIds);
    GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
  }

  private async pushDenylistRemove(
    facilityId: string,
    userId: string,
    targets: DenylistDeviceTarget[],
  ): Promise<void> {
    if (targets.length === 0) return;

    const deviceIds = targets.map((target) => target.device_id);
    const userEntries = await this.denylistModel.findByUser(userId);
    const entries = userEntries.filter((entry) => deviceIds.includes(entry.device_id));
    if (entries.length === 0) return;

    await this.denylistModel.bulkRemove(deviceIds, userId);

    const entriesToProcess = entries.filter((entry) => !DenylistOptimizationService.shouldSkipDenylistRemove(entry));
    if (entriesToProcess.length === 0) return;

    const filteredDeviceIds = Array.from(new Set(entriesToProcess.map((entry) => entry.device_id)));
    const jwt = await DenylistService.buildDenylistRemove([{ sub: userId, exp: 0 }], filteredDeviceIds);
    GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
  }

  private async handleDeviceUnassigned(event: DeviceUnassignedEvent): Promise<void> {
    try {
      const userIds = await this.getUnitAccessUserIds(event.unitId);
      if (userIds.length === 0) return;

      const scopedAccessControlIds = await AccessControlZoneAccessService
        .getAppEnabledAccessControlDeviceIdsForUnits([event.unitId]);
      const targets: DenylistDeviceTarget[] = scopedAccessControlIds.map((device_id) => ({
        device_id,
        device_type: 'access_control',
      }));

      const source: DenylistSource = 'unit_unassignment';

      for (const userId of userIds) {
        await this.pushDenylistAdd(
          event.facilityId,
          userId,
          targets,
          source,
          event.metadata?.performedBy,
        );
      }

      logger.info(
        `Revoked scoped zone access for ${userIds.length} user(s) after lock unassigned from unit ${event.unitId}`,
        { deviceId: event.deviceId, reason: event.metadata?.reason },
      );
    } catch (error) {
      logger.error('Failed to propagate access revocation after device unassign:', error);
    }
  }

  private async handleDeviceAssigned(event: DeviceAssignedEvent): Promise<void> {
    try {
      const userIds = await this.getUnitAccessUserIds(event.unitId);
      if (userIds.length === 0) return;

      for (const userId of userIds) {
        const targets = await AccessControlZoneAccessService.getDenylistRemovalTargetsForUserGrant(
          [event.unitId],
          userId,
        );
        await this.pushDenylistRemove(event.facilityId, userId, targets);
      }

      logger.info(
        `Re-granted scoped zone access for ${userIds.length} user(s) after lock assigned to unit ${event.unitId}`,
        { deviceId: event.deviceId },
      );
    } catch (error) {
      logger.error('Failed to propagate access grant after device assign:', error);
    }
  }
}
