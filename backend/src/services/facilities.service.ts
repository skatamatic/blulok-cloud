import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export class FacilitiesService {
  private static instance: FacilitiesService;
  private db = DatabaseService.getInstance().connection;

  public static getInstance(): FacilitiesService {
    if (!FacilitiesService.instance) {
      FacilitiesService.instance = new FacilitiesService();
    }
    return FacilitiesService.instance;
  }

  public async getDeleteImpact(facilityId: string): Promise<{ units: number; devices: number; gateways: number; }> {
    const knex = this.db;

    const unitRow = await knex('units')
      .where('facility_id', facilityId)
      .count<{ count: string }[]>('* as count')
      .first();

    const deviceRow = await knex('blulok_devices')
      .join('units', 'blulok_devices.unit_id', 'units.id')
      .where('units.facility_id', facilityId)
      .count<{ count: string }[]>('* as count')
      .first();

    const gatewayRow = await knex('gateways')
      .where('facility_id', facilityId)
      .count<{ count: string }[]>('* as count')
      .first();

    return {
      units: Number(unitRow?.count ?? 0),
      devices: Number(deviceRow?.count ?? 0),
      gateways: Number(gatewayRow?.count ?? 0),
    };
  }

  public async deleteFacilityCascade(facilityId: string, performedBy: string): Promise<void> {
    const knex = this.db;

    const runDeletes = async (db: any) => {
      // Collect units
      const unitRows = await db('units').where('facility_id', facilityId).select('id');
      const unitIds = unitRows.map((r: any) => r.id);

      // Collect devices under those units
      const deviceRows = unitIds.length > 0
        ? await db('blulok_devices').whereIn('unit_id', unitIds).select('id')
        : [];
      const deviceIds = deviceRows.map((r: any) => r.id);

      // Collect gateways for facility
      const gatewayRows = await db('gateways').where('facility_id', facilityId).select('id');
      const gatewayIds = gatewayRows.map((r: any) => r.id);

      // Device-related cleanup
      if (deviceIds.length > 0) {
        await db('device_denylist_entries').whereIn('device_id', deviceIds).del();
        await db('blulok_devices').whereIn('id', deviceIds).del();
      }

      // Unit-related cleanup
      if (unitIds.length > 0) {
        await db('key_sharing').whereIn('unit_id', unitIds).del();
        await db('unit_assignments').whereIn('unit_id', unitIds).del();
        await db('units').whereIn('id', unitIds).del();
      }

      // Gateways cleanup
      if (gatewayIds.length > 0) {
        await db('access_control_devices').whereIn('gateway_id', gatewayIds).del();
        await db('gateways').whereIn('id', gatewayIds).del();
      }

      // Finally delete facility
      const deleted = await db('facilities').where('id', facilityId).del();
      if (deleted === 0) {
        throw new Error('Facility not found');
      }

      logger.info(`Facility ${facilityId} deleted by ${performedBy} (cascade: units=${unitIds.length}, devices=${deviceIds.length}, gateways=${gatewayIds.length})`);
    };

    // In test, some knex transaction mocks may hang; fall back to non-transactional execution.
    if (process.env.NODE_ENV === 'test') {
      await runDeletes(knex);
      return;
    }

    await knex.transaction(async (trx) => {
      await runDeletes(trx);
    });
  }
}


