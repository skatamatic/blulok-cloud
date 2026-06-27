import { logger } from '@/utils/logger';

/**
 * Post-activation side effects for tenant/owner accounts: denylist removal and share reactivation.
 * Used by POST /users/:id/activate and PUT /users/:id when isActive transitions to true.
 */
export async function runUserActivationSideEffects(userId: string): Promise<void> {
  const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
  const { DenylistService } = await import('@/services/denylist.service');
  const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
  const { DatabaseService } = await import('@/services/database.service');
  const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');

  const knex = DatabaseService.getInstance().connection;
  const denylistModel = new DenylistEntryModel();

  try {
    const entries = await denylistModel.findByUser(userId);
    if (entries.length > 0) {
      const deviceIds = Array.from(new Set(entries.map((entry) => entry.device_id)));
      const deviceFacilityRows = await knex('blulok_devices as bd')
        .join('units as u', 'bd.unit_id', 'u.id')
        .whereIn('bd.id', deviceIds)
        .select('bd.id as device_id', 'u.facility_id');

      const facilityToDeviceIds = new Map<string, string[]>();
      for (const row of deviceFacilityRows) {
        const list = facilityToDeviceIds.get(row.facility_id) || [];
        list.push(row.device_id);
        facilityToDeviceIds.set(row.facility_id, list);
      }

      await denylistModel.bulkRemove(deviceIds, userId);

      for (const [facilityId, targetDeviceIds] of facilityToDeviceIds.entries()) {
        const entriesForFacility = entries.filter((entry) => targetDeviceIds.includes(entry.device_id));
        const entriesToProcess = entriesForFacility.filter(
          (entry) => !DenylistOptimizationService.shouldSkipDenylistRemove(entry as any),
        );

        if (entriesToProcess.length > 0) {
          const jwt = await DenylistService.buildDenylistRemove([{ sub: userId, exp: 0 }], targetDeviceIds);
          GatewayEventsService.getInstance().unicastToFacility(facilityId, jwt);
        } else {
          logger.info(
            `Skipped DENYLIST_REMOVE for user ${userId} on ${targetDeviceIds.length} device(s) - entries already expired, removed from DB only`,
          );
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to process denylist removal on activation for user ${userId}:`, err);
  }

  try {
    await knex('key_sharing')
      .where('primary_tenant_id', userId)
      .where('is_active', false)
      .where(function (this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', knex.raw('UTC_TIMESTAMP()'));
      })
      .update({ is_active: true, updated_at: knex.raw('UTC_TIMESTAMP()') });
  } catch (err) {
    logger.error(`Failed to reactivate shares on activation for user ${userId}:`, err);
  }
}
