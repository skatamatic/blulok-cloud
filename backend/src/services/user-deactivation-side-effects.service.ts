import { logger } from '@/utils/logger';

/**
 * Post-deactivation side effects: denylist propagation and inactivation of owned shares.
 * Used by DELETE /users/:id and PUT /users/:id when isActive transitions to false.
 */
export async function runUserDeactivationSideEffects(
  userId: string,
  performedBy: string,
): Promise<void> {
  try {
    const { DenylistService } = await import('@/services/denylist.service');
    const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
    const { DatabaseService } = await import('@/services/database.service');
    const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
    const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
    const { config } = await import('@/config/environment');

    const knex = DatabaseService.getInstance().connection;
    const denylistModel = new DenylistEntryModel();

    const primaryUnitIds = await knex('unit_assignments')
      .where('tenant_id', userId)
      .pluck('unit_id');

    const sharedUnitIds = await knex('key_sharing')
      .where('shared_with_user_id', userId)
      .where('is_active', true)
      .where(function (this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
      })
      .pluck('unit_id');

    const unitIds = Array.from(new Set([...(primaryUnitIds || []), ...(sharedUnitIds || [])]));

    const { AccessControlZoneAccessService } = await import('@/services/access-control-zone-access.service');
    const denylistTargets = unitIds.length === 0
      ? []
      : await AccessControlZoneAccessService.getDenylistTargetsForUserRevocation(unitIds, userId);

    if (denylistTargets.length > 0) {
      const deviceFacilityMap = await AccessControlZoneAccessService.getDeviceFacilityIds(
        denylistTargets.map((target) => target.device_id),
      );

      const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(userId);

      const now = new Date();
      const ttlMs = (config.security.routePassTtlHours || 24) * 60 * 60 * 1000;
      const expiresAt = new Date(now.getTime() + ttlMs);
      const exp = Math.floor(expiresAt.getTime() / 1000);
      const byFacility = new Map<string, string[]>();

      await denylistModel.bulkCreate(denylistTargets.map((target) => ({
        device_id: target.device_id,
        device_type: target.device_type,
        user_id: userId,
        expires_at: expiresAt,
        source: 'user_deactivation' as const,
        created_by: performedBy,
      })));

      denylistTargets.forEach((target) => {
        const facilityId = deviceFacilityMap.get(target.device_id);
        if (!facilityId) return;
        const list = byFacility.get(facilityId) || [];
        list.push(target.device_id);
        byFacility.set(facilityId, list);
      });

      if (!shouldSkip) {
        for (const [facilityId, deviceIds] of byFacility.entries()) {
          const jwt = await DenylistService.buildDenylistAdd([{ sub: userId, exp }], deviceIds);
          GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
        }
      } else {
        logger.info(`Skipping DENYLIST_ADD for deactivated user ${userId} - last route pass is expired`);
      }
    }

    const activeSharesGranted = await knex('key_sharing')
      .where('primary_tenant_id', userId)
      .where('is_active', true)
      .where(function (this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
      })
      .select('id', 'unit_id', 'shared_with_user_id');

    for (const share of activeSharesGranted) {
      try {
        await knex('key_sharing')
          .where('id', share.id)
          .update({ is_active: false, updated_at: knex.fn.now() });
      } catch (err) {
        logger.error(`Failed cascading revoke for sharing ${share.id} on deactivation of user ${userId}:`, err);
      }
    }
  } catch (error) {
    logger.error('Failed to push denylist on user deactivation:', error);
  }
}
