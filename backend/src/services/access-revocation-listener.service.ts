import { UnitAssignmentEventsService, UnitAssignmentEvent } from '@/services/events/unit-assignment-events.service';
import { DenylistService } from '@/services/denylist.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { config } from '@/config/environment';

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
   * Calculate expiration time based on route pass TTL.
   * Denylist entries should only last as long as the last-issued route pass is valid.
   */
  private getExpirationDate(): Date {
    const now = new Date();
    const ttlMs = (config.security.routePassTtlHours || 24) * 60 * 60 * 1000;
    return new Date(now.getTime() + ttlMs);
  }

  private registerHandlers(): void {
    // When a tenant is unassigned from a unit, create denylist entries and send commands
    this.events.onTenantUnassigned(async (event: UnitAssignmentEvent) => {
      try {
        const knex = DatabaseService.getInstance().connection;
        // Fetch device ids for this unit (targeting specific locks)
        const devices = await knex('blulok_devices').where({ unit_id: event.unitId }).select('id');
        const deviceIds = devices.map((d: any) => d.id);

        if (deviceIds.length === 0) {
          logger.info(`No devices found for unit ${event.unitId}, skipping denylist update`);
          return;
        }

        // Check if we should skip denylist command (user's last route pass is expired)
        const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(event.tenantId);
        if (shouldSkip) {
          logger.info(`Skipping DENYLIST_ADD for user ${event.tenantId} - last route pass is expired`);
          // Still create DB entries for audit trail even if we skip the command
          const expiresAt = this.getExpirationDate();
          const createdBy = event.metadata?.performedBy || 'system';
          for (const deviceId of deviceIds) {
            await this.denylistModel.create({
              device_id: deviceId,
              user_id: event.tenantId,
              expires_at: expiresAt,
              source: event.metadata?.source === 'fms_sync' ? 'fms_sync' : 'unit_unassignment',
              created_by: createdBy,
            });
          }
          return;
        }

        // Calculate expiration based on route pass TTL
        const expiresAt = this.getExpirationDate();

        // Create database entries for each device
        const createdBy = event.metadata?.performedBy || 'system';
        for (const deviceId of deviceIds) {
          await this.denylistModel.create({
            device_id: deviceId,
            user_id: event.tenantId,
            expires_at: expiresAt,
            source: event.metadata?.source === 'fms_sync' ? 'fms_sync' : 'unit_unassignment',
            created_by: createdBy,
          });
        }

        // Send denylist command to devices
        const exp = Math.floor(expiresAt.getTime() / 1000);
        const jwt = await DenylistService.buildDenylistAdd([{ sub: event.tenantId, exp }], deviceIds);
        GatewayEventsService.getInstance().unicastToFacility(event.facilityId, jwt);

        logger.info(`Pushed denylist update for user ${event.tenantId} to ${deviceIds.length} device(s) in facility ${event.facilityId}`, {
          deviceIds,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        logger.error('Failed to push denylist on unassignment:', error);
      }
    });

    // When a tenant is assigned to a unit, check if they were previously denied and remove them
    this.events.onTenantAssigned(async (event: UnitAssignmentEvent) => {
      try {
        const knex = DatabaseService.getInstance().connection;
        // Fetch device ids for this unit
        const devices = await knex('blulok_devices').where({ unit_id: event.unitId }).select('id');
        const deviceIds = devices.map((d: any) => d.id);

        if (deviceIds.length === 0) {
          return;
        }

        // Check if user has denylist entries for any of these devices
        const entries = await this.denylistModel.findByUnitsAndUser([event.unitId], event.tenantId);

        if (entries.length === 0) {
          // No denylist entries to remove
          return;
        }

        // Get facility for each device and group by facility
        const facilityMap = new Map<string, string[]>();
        for (const entry of entries) {
          const device = await knex('blulok_devices')
            .join('units', 'blulok_devices.unit_id', 'units.id')
            .where('blulok_devices.id', entry.device_id)
            .select('units.facility_id')
            .first();

          if (device) {
            const facilityId = device.facility_id;
            if (!facilityMap.has(facilityId)) {
              facilityMap.set(facilityId, []);
            }
            facilityMap.get(facilityId)!.push(entry.device_id);
          }
        }

        // Send remove commands and delete database entries
        for (const [facilityId, targetDeviceIds] of facilityMap.entries()) {
          try {
            // Check each entry to see if we should skip sending the command
            const entriesForFacility = entries.filter(e => targetDeviceIds.includes(e.device_id));
            const entriesToProcess = entriesForFacility.filter(e => !DenylistOptimizationService.shouldSkipDenylistRemove(e));
            
            // Remove from DB regardless of whether we send commands (cleanup expired entries)
            for (const deviceId of targetDeviceIds) {
              await this.denylistModel.remove(deviceId, event.tenantId);
            }

            // Only send command if there are non-expired entries
            if (entriesToProcess.length > 0) {
              const jwt = await DenylistService.buildDenylistRemove(
                [{ sub: event.tenantId, exp: 0 }], // exp not needed for remove
                targetDeviceIds
              );
              GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);

              logger.info(`Removed user ${event.tenantId} from denylist for ${targetDeviceIds.length} device(s) in facility ${facilityId}`, {
                deviceIds: targetDeviceIds,
              });
            } else {
              logger.info(`Skipped DENYLIST_REMOVE for user ${event.tenantId} on ${targetDeviceIds.length} device(s) - entries already expired, removed from DB only`, {
                deviceIds: targetDeviceIds,
              });
            }
          } catch (error) {
            logger.error(`Failed to remove denylist for user ${event.tenantId} on devices ${targetDeviceIds.join(', ')}:`, error);
            // Don't remove from DB if command failed
          }
        }
      } catch (error) {
        logger.error('Failed to handle denylist removal on assignment:', error);
      }
    });
  }
}


