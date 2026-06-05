import { UnitAssignmentEventsService, UnitAssignmentEvent } from '@/services/events/unit-assignment-events.service';
import { DenylistService } from '@/services/denylist.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { config } from '@/config/environment';
import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';

/**
 * Access Revocation Listener Service
 *
 * Event-driven service that monitors access changes and immediately revokes
 * compromised access credentials by pushing device-targeted denylist updates.
 *
 * Key Security Features:
 * - Real-time access revocation on unit unassignment
 * - Device-targeted denylist packets (not facility-wide)
 * - Immediate credential invalidation to prevent unauthorized access
 * - Database tracking of denylist state
 * - Automatic removal when users are re-assigned
 * - Expiration tied to route pass TTL
 * - Comprehensive audit logging of revocation events
 */
export class AccessRevocationListenerService {
  private static instance: AccessRevocationListenerService;
  private events: UnitAssignmentEventsService;
  private denylistModel: DenylistEntryModel;

  private constructor() {
    this.events = UnitAssignmentEventsService.getInstance();
    this.denylistModel = new DenylistEntryModel();
    this.registerHandlers();
  }

  public static getInstance(): AccessRevocationListenerService {
    if (!this.instance) this.instance = new AccessRevocationListenerService();
    return this.instance;
  }

  /**
   * Calculate expiration epoch based on route pass TTL.
   * Denylist entries should only last as long as the last-issued route pass is valid.
   */
  private getExpirationEpochSeconds(): number {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = (config.security.routePassTtlHours || 24) * 60 * 60;
    return now + ttlSeconds;
  }

  private registerHandlers(): void {
    // When a tenant is unassigned from a unit, create denylist entries and send commands
    this.events.onTenantUnassigned(async (event: UnitAssignmentEvent) => {
      try {
        const knex = DatabaseService.getInstance().connection;
        const denylistTargets = await AccessControlZoneAccessService.getDenylistTargetsForUnits([event.unitId]);

        if (denylistTargets.length === 0) {
          logger.info(`No devices found for unit ${event.unitId}, skipping denylist update`);
          return;
        }

        const deviceIds = denylistTargets.map((target) => target.device_id);

        // Calculate expiration based on route pass TTL
        const exp = this.getExpirationEpochSeconds();
        const createdBy = event.metadata?.performedBy || 'system';
        const source = event.metadata?.source === 'fms_sync' ? 'fms_sync' : 'unit_unassignment';

        // Bulk create DB entries for all devices (single INSERT query instead of N queries)
        await this.denylistModel.bulkCreate(denylistTargets.map((target) => ({
          device_id: target.device_id,
          device_type: target.device_type,
          user_id: event.tenantId,
          expires_at: knex.raw('FROM_UNIXTIME(?)', [exp]),
          source,
          created_by: createdBy,
        })));

        // Check if we should skip denylist command (user's last route pass is expired)
        const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(event.tenantId);
        if (shouldSkip) {
          logger.info(`Skipping DENYLIST_ADD for user ${event.tenantId} - last route pass is expired (DB entries created)`);
          return;
        }

        // Send denylist command to devices
        const jwt = await DenylistService.buildDenylistAdd([{ sub: event.tenantId, exp }], deviceIds);
        GatewayEventsService.getInstance().unicastToFacility(event.facilityId, jwt);

        logger.info(`Pushed denylist update for user ${event.tenantId} to ${deviceIds.length} device(s) in facility ${event.facilityId}`, {
          deviceIds,
          expiresAt: new Date(exp * 1000).toISOString(),
        });
      } catch (error) {
        logger.error('Failed to push denylist on unassignment:', error);
      }
    });

    // When a tenant is assigned to a unit, check if they were previously denied and remove them
    this.events.onTenantAssigned(async (event: UnitAssignmentEvent) => {
      try {
        const knex = DatabaseService.getInstance().connection;
        const denylistTargets = await AccessControlZoneAccessService.getDenylistTargetsForUnits([event.unitId]);
        const deviceIds = denylistTargets.map((target) => target.device_id);

        if (deviceIds.length === 0) {
          return;
        }

        // Check if user has denylist entries for any of these devices
        const userEntries = await this.denylistModel.findByUser(event.tenantId);
        const entries = userEntries.filter((entry) => deviceIds.includes(entry.device_id));

        if (entries.length === 0) {
          // No denylist entries to remove
          return;
        }

        // Batch fetch facility for all devices at once (single query set instead of N queries)
        const entryDeviceIds = entries.map(e => e.device_id);
        const deviceFacilityMap = await AccessControlZoneAccessService.getDeviceFacilityIds(entryDeviceIds);

        // Group devices by facility
        const facilityMap = new Map<string, string[]>();
        for (const deviceId of entryDeviceIds) {
          const facilityId = deviceFacilityMap.get(deviceId);
          if (!facilityId) continue;
          if (!facilityMap.has(facilityId)) {
            facilityMap.set(facilityId, []);
          }
          facilityMap.get(facilityId)!.push(deviceId);
        }

        // Bulk remove from DB (single DELETE query instead of N queries)
        await this.denylistModel.bulkRemove(entryDeviceIds, event.tenantId);

        // Send remove commands per facility
        for (const [facilityId, targetDeviceIds] of facilityMap.entries()) {
          try {
            // Check each entry to see if we should skip sending the command
            const entriesForFacility = entries.filter(e => targetDeviceIds.includes(e.device_id));
            const entriesToProcess = entriesForFacility.filter(e => !DenylistOptimizationService.shouldSkipDenylistRemove(e));

            // Only send command if there are non-expired entries
            if (entriesToProcess.length > 0) {
              const filteredDeviceIds = Array.from(new Set(entriesToProcess.map((entry) => entry.device_id)));
              const jwt = await DenylistService.buildDenylistRemove(
                [{ sub: event.tenantId, exp: 0 }], // exp not needed for remove
                filteredDeviceIds
              );
              GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);

              logger.info(`Removed user ${event.tenantId} from denylist for ${filteredDeviceIds.length} device(s) in facility ${facilityId}`, {
                deviceIds: filteredDeviceIds,
              });
            } else {
              logger.info(`Skipped DENYLIST_REMOVE for user ${event.tenantId} on ${targetDeviceIds.length} device(s) - entries already expired, removed from DB only`, {
                deviceIds: targetDeviceIds,
              });
            }
          } catch (error) {
            logger.error(`Failed to send denylist remove for user ${event.tenantId} on devices ${targetDeviceIds.join(', ')}:`, error);
          }
        }
      } catch (error) {
        logger.error('Failed to handle denylist removal on assignment:', error);
      }
    });
  }
}


