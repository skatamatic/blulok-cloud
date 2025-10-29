import { UnitAssignmentEventsService, UnitAssignmentEvent } from '@/services/events/unit-assignment-events.service';
import { DenylistService } from '@/services/denylist.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';

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
 * - Comprehensive audit logging of revocation events
 */
export class AccessRevocationListenerService {
  private static instance: AccessRevocationListenerService;
  private events: UnitAssignmentEventsService;

  private constructor() {
    this.events = UnitAssignmentEventsService.getInstance();
    this.registerHandlers();
  }

  public static getInstance(): AccessRevocationListenerService {
    if (!this.instance) this.instance = new AccessRevocationListenerService();
    return this.instance;
  }

  private registerHandlers(): void {
    // When a tenant is unassigned from a unit, push denylist update to the facility
    this.events.onTenantUnassigned(async (event: UnitAssignmentEvent) => {
      try {
        const exp = Math.floor(Date.now() / 1000);
        // Fetch device ids for this unit (targeting specific locks)
        const knex = DatabaseService.getInstance().connection;
        const devices = await knex('blulok_devices').where({ unit_id: event.unitId }).select('id');
        const deviceIds = devices.map((d: any) => d.id);
        const packet = await DenylistService.buildDenylistAdd([{ sub: event.tenantId, exp }], deviceIds);
        GatewayEventsService.getInstance().unicastToFacility(event.facilityId, packet);
        logger.info(`Pushed denylist update for user ${event.tenantId} to facility ${event.facilityId}`);
      } catch (error) {
        logger.error('Failed to push denylist on unassignment:', error);
      }
    });
  }
}


