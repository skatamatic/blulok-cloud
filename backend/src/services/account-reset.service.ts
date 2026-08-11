/**
 * AccountResetService — scorched-earth auth identity reset + re-invite.
 *
 * Wipes password, app devices, invites/OTPs/password-reset tokens, then pushes
 * denylist entries so revoked device keys cannot open locks. Preserves
 * unit_assignments, facility associations, key_sharing, and FMS mappings.
 */

import { DatabaseService } from '@/services/database.service';
import { UserModel, type User } from '@/models/user.model';
import { FMS_PLACEHOLDER_PASSWORD_HASH } from '@/services/fms/fms-placeholder-user.utils';
import { isPlaceholderUser } from '@/services/fms/fms-placeholder-user.utils';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistService } from '@/services/denylist.service';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { ActivityService } from '@/services/activity.service';

/** Shared unusable password hash for invite-style accounts. */
export const UNUSABLE_PASSWORD_HASH = FMS_PLACEHOLDER_PASSWORD_HASH;

export class AccountResetService {
  private static instance: AccountResetService;

  public static getInstance(): AccountResetService {
    if (!AccountResetService.instance) {
      AccountResetService.instance = new AccountResetService();
    }
    return AccountResetService.instance;
  }

  /**
   * Reset auth identity and optionally re-send the invite flow.
   */
  public async resetAndReinvite(
    userId: string,
    options: { performedBy: string; sendInvite?: boolean; actorName?: string },
  ): Promise<{ user: User; devicesRevoked: number }> {
    const user = (await UserModel.findById(userId)) as User | undefined;
    if (!user) {
      throw new Error('User not found');
    }
    if (isPlaceholderUser(user)) {
      throw new Error('Cannot reset a placeholder tenant. Add an email or phone first.');
    }
    if (!user.email && !user.phone_number) {
      throw new Error('User has no email or phone for re-invite');
    }

    const knex = DatabaseService.getInstance().connection;
    let devicesRevoked = 0;
    let unitIds: string[] = [];

    await knex.transaction(async (trx) => {
      // Collect unit assignments for denylist (preserve rows)
      unitIds = await trx('unit_assignments')
        .where({ tenant_id: userId })
        .pluck('unit_id');

      const userDeviceIds: string[] = await trx('user_devices')
        .where({ user_id: userId })
        .pluck('id');
      devicesRevoked = userDeviceIds.length;

      if (userDeviceIds.length > 0) {
        // device_lock_associations may not exist on all deployments
        const hasLockAssoc = await trx.schema.hasTable('device_lock_associations');
        if (hasLockAssoc) {
          await trx('device_lock_associations').whereIn('user_device_id', userDeviceIds).del();
        }
        await trx('user_devices')
          .whereIn('id', userDeviceIds)
          .update({ status: 'revoked', updated_at: trx.fn.now() });
      }

      await trx('user_invites').where({ user_id: userId }).del();
      await trx('user_otps').where({ user_id: userId }).del();

      const hasPasswordReset = await trx.schema.hasTable('password_reset_tokens');
      if (hasPasswordReset) {
        await trx('password_reset_tokens').where({ user_id: userId }).del();
      }

      await trx('users').where({ id: userId }).update({
        password_hash: UNUSABLE_PASSWORD_HASH,
        requires_password_reset: true,
        last_login: null,
        updated_at: trx.fn.now(),
      });
    });

    // Post-commit: denylist push so stale app keys cannot open locks
    await this.pushDenylistForUser(userId, unitIds, options.performedBy);

    // Activity log
    try {
      await ActivityService.getInstance().logActivity({
        entityType: 'user',
        entityId: userId,
        activityType: 'configuration_change',
        title: 'Account reset',
        description: `Auth identity reset for ${user.email || user.phone_number || userId}; ${devicesRevoked} device(s) revoked`,
        actorType: 'user',
        actorId: options.performedBy,
        actorName: options.actorName || undefined,
        result: 'success',
        metadata: {
          action: 'account_reset',
          devicesRevoked,
          sendInvite: options.sendInvite !== false,
        },
      });
    } catch (e) {
      logger.warn('Failed to log account reset activity', e);
    }

    // In-app notification for facility operators
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      await InAppNotificationDispatcher.getInstance().notifyUserAccountReset({
        targetUserId: userId,
        targetName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || userId,
        performedBy: options.performedBy,
        facilityIds: await this.getUserFacilityIds(userId),
      });
    } catch (e) {
      logger.warn('Failed to dispatch account reset notification', e);
    }

    const refreshed = (await UserModel.findById(userId)) as User;

    if (options.sendInvite !== false) {
      const { FirstTimeUserService } = await import('@/services/first-time-user.service');
      await FirstTimeUserService.getInstance().sendInvite(refreshed);
    }

    return { user: refreshed, devicesRevoked };
  }

  private async getUserFacilityIds(userId: string): Promise<string[]> {
    const { UserFacilityAssociationModel } = await import(
      '@/models/user-facility-association.model'
    );
    return UserFacilityAssociationModel.getUserFacilityIds(userId);
  }

  private async pushDenylistForUser(
    userId: string,
    unitIds: string[],
    performedBy: string,
  ): Promise<void> {
    if (unitIds.length === 0) return;

    try {
      const knex = DatabaseService.getInstance().connection;
      const denylistModel = new DenylistEntryModel();
      const denylistTargets =
        await AccessControlZoneAccessService.getDenylistTargetsForUserRevocation(unitIds, userId);

      if (denylistTargets.length === 0) return;

      const ttlSeconds = (config.security.routePassTtlHours || 24) * 60 * 60;
      const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
      const deviceIds = denylistTargets.map((t) => t.device_id);

      await denylistModel.bulkCreate(
        denylistTargets.map((target) => ({
          device_id: target.device_id,
          device_type: target.device_type,
          user_id: userId,
          expires_at: knex.raw('FROM_UNIXTIME(?)', [exp]),
          source: 'user_deactivation',
          created_by: performedBy,
        })),
      );

      const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(userId);
      if (shouldSkip) {
        logger.info(
          `Skipping DENYLIST_ADD for reset user ${userId} - last route pass expired (DB entries created)`,
        );
        return;
      }

      const deviceFacilityMap =
        await AccessControlZoneAccessService.getDeviceFacilityIds(deviceIds);
      const facilityMap = new Map<string, string[]>();
      for (const deviceId of deviceIds) {
        const facilityId = deviceFacilityMap.get(deviceId);
        if (!facilityId) continue;
        if (!facilityMap.has(facilityId)) facilityMap.set(facilityId, []);
        facilityMap.get(facilityId)!.push(deviceId);
      }

      for (const [facilityId, ids] of facilityMap.entries()) {
        const jwt = await DenylistService.buildDenylistAdd([{ sub: userId, exp }], ids);
        GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
      }

      logger.info(`Pushed denylist after account reset for user ${userId}`, {
        deviceCount: deviceIds.length,
      });
    } catch (error) {
      logger.error('Failed to push denylist after account reset:', error);
    }
  }
}
