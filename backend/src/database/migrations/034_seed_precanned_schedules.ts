import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seed precanned schedules for existing facilities
 * 
 * This migration ensures that all existing facilities have the default
 * precanned schedules: "Default Tenant Schedule" and "Maintenance Schedule".
 * 
 * - Default Tenant Schedule: 24/7 access (all days, 00:00-23:59)
 * - Maintenance Schedule: Empty initially (can be customized)
 */
export async function up(knex: Knex): Promise<void> {
  const hasSchedulesTable = await knex.schema.hasTable('schedules');
  const hasFacilitiesTable = await knex.schema.hasTable('facilities');
  
  if (!hasSchedulesTable || !hasFacilitiesTable) {
    console.log('Schedules or facilities table does not exist, skipping seed');
    return;
  }

  // Get all facilities
  const facilities = await knex('facilities').select('id');
  
  if (facilities.length === 0) {
    console.log('No facilities found, skipping precanned schedule seed');
    return;
  }

  let seededCount = 0;

  for (const facility of facilities) {
    const facilityId = facility.id;

    // Check if precanned schedules already exist for this facility
    const existingPrecanned = await knex('schedules')
      .where({ facility_id: facilityId, schedule_type: 'precanned' })
      .select('name');

    const existingNames = existingPrecanned.map(s => s.name);
    const hasDefaultTenant = existingNames.includes('Default Tenant Schedule');
    const hasMaintenance = existingNames.includes('Maintenance Schedule');

    // Create Default Tenant Schedule if missing
    if (!hasDefaultTenant) {
      const defaultTenantScheduleId = uuidv4();
      await knex('schedules').insert({
        id: defaultTenantScheduleId,
        facility_id: facilityId,
        name: 'Default Tenant Schedule',
        schedule_type: 'precanned',
        is_active: true,
        created_by: null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      // Add 24/7 time windows (all days, 00:00-23:59)
      const timeWindows = [];
      for (let day = 0; day <= 6; day++) {
        timeWindows.push({
          id: uuidv4(),
          schedule_id: defaultTenantScheduleId,
          day_of_week: day,
          start_time: '00:00:00',
          end_time: '23:59:59',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }
      
      if (timeWindows.length > 0) {
        await knex('schedule_time_windows').insert(timeWindows);
      }

      seededCount++;
      console.log(`Created Default Tenant Schedule for facility ${facilityId}`);
    }

    // Create Maintenance Schedule if missing
    if (!hasMaintenance) {
      await knex('schedules').insert({
        id: uuidv4(),
        facility_id: facilityId,
        name: 'Maintenance Schedule',
        schedule_type: 'precanned',
        is_active: true,
        created_by: null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

      seededCount++;
      console.log(`Created Maintenance Schedule for facility ${facilityId}`);
    }
  }

  console.log(`Seeded precanned schedules for ${facilities.length} facilities (${seededCount} schedules created)`);
}

export async function down(knex: Knex): Promise<void> {
  // This is a data migration, so we don't remove the precanned schedules
  // They are system-required and should remain
  console.log('Precanned schedules seed rollback skipped (system-required data)');
}








