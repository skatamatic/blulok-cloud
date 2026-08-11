/**
 * DeferredInviteListenerService
 *
 * Auto-sends invites when a previously deferred tenant becomes eligible
 * under invitePolicy=device_equipped (tenant assigned to a BluLok-equipped
 * unit, or a BluLok device assigned to their unit).
 *
 * policy_none deferrals are intentionally NOT auto-resolved here.
 */

import { UnitAssignmentEventsService, UnitAssignmentEvent } from '@/services/events/unit-assignment-events.service';
import {
  DeviceEventService,
  DeviceEvent,
  DeviceAssignedEvent,
} from '@/services/device-event.service';
import { DeferredInviteService } from '@/services/notifications/deferred-invite.service';
import { isDeviceEquippedTenant } from '@/services/fms/fms-invite-policy.utils';
import { UserModel, type User } from '@/models/user.model';
import { logger } from '@/utils/logger';

export class DeferredInviteListenerService {
  private static instance: DeferredInviteListenerService;
  private assignmentEvents: UnitAssignmentEventsService;
  private deviceEvents: DeviceEventService;
  private deferred: DeferredInviteService;

  private constructor() {
    this.assignmentEvents = UnitAssignmentEventsService.getInstance();
    this.deviceEvents = DeviceEventService.getInstance();
    this.deferred = DeferredInviteService.getInstance();
    this.registerHandlers();
  }

  public static getInstance(): DeferredInviteListenerService {
    if (!DeferredInviteListenerService.instance) {
      DeferredInviteListenerService.instance = new DeferredInviteListenerService();
    }
    return DeferredInviteListenerService.instance;
  }

  private registerHandlers(): void {
    this.assignmentEvents.onTenantAssigned(async (event: UnitAssignmentEvent) => {
      try {
        await this.tryResolveForTenant(event.tenantId, event.facilityId, 'tenant_assigned');
      } catch (error) {
        logger.error('[DeferredInvite] Error handling tenant:assigned', error);
      }
    });

    this.deviceEvents.on(DeviceEvent.DEVICE_ASSIGNED, async (event: DeviceAssignedEvent) => {
      try {
        await this.tryResolveForUnit(event.unitId, event.facilityId);
      } catch (error) {
        logger.error('[DeferredInvite] Error handling deviceAssigned', error);
      }
    });

    logger.info('[DeferredInvite] Listener registered for tenant:assigned and deviceAssigned');
  }

  private async tryResolveForUnit(unitId: string, facilityId: string): Promise<void> {
    const pending = await this.deferred.findPendingAwaitingDeviceForUnit(unitId);
    for (const row of pending) {
      await this.sendAndResolve(row.user_id, row.id, facilityId, 'device_assigned');
    }
  }

  private async tryResolveForTenant(
    tenantId: string,
    facilityId: string,
    trigger: string,
  ): Promise<void> {
    const pending = await this.deferred.findPendingAwaitingDeviceForTenant(tenantId);
    if (!pending) return;

    const equipped = await isDeviceEquippedTenant(tenantId, facilityId);
    if (!equipped) return;

    await this.sendAndResolve(tenantId, pending.id, facilityId, trigger);
  }

  private async sendAndResolve(
    userId: string,
    deferredId: string,
    facilityId: string,
    trigger: string,
  ): Promise<void> {
    // Claim first so concurrent tenant:assigned / deviceAssigned handlers don't double-send
    const claimed = await this.deferred.tryClaimPending(deferredId, trigger);
    if (!claimed) return;

    const user = (await UserModel.findById(userId)) as User | undefined;
    if (!user) {
      return;
    }
    if (!user.email && !user.phone_number) {
      await this.deferred.reopenClaim(deferredId);
      logger.info(`[DeferredInvite] User ${userId} still has no contact; leaving deferred`);
      return;
    }
    if (user.is_placeholder) {
      await this.deferred.reopenClaim(deferredId);
      logger.info(`[DeferredInvite] User ${userId} is still placeholder; leaving deferred`);
      return;
    }

    try {
      const { FirstTimeUserService } = await import('@/services/first-time-user.service');
      await FirstTimeUserService.getInstance().sendInvite(user);
      logger.info(`[DeferredInvite] Sent deferred invite for user ${userId}`, {
        facilityId,
        trigger,
      });
    } catch (error) {
      await this.deferred.reopenClaim(deferredId);
      throw error;
    }
  }
}
