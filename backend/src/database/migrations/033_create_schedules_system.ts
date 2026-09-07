import { Knex } from 'knex';

/**
 * Create schedules system tables
 * 
 * Implements time-based access control at the facility level. Schedules define
 * when users can access locks, with support for multiple time windows per day.
 * 
 * Tables created:
 * - schedules: Facility-level schedule definitions (precanned or custom)
 * - schedule_time_windows: Time windows for each day of the week
 * - user_facility_schedules: User-schedule associations per facility
 */
export async function up(knex: Knex): Promise<void> {
  // Create schedules table
  const hasSchedulesTable = await knex.schema.hasTable('schedules');
  if (!hasSchedulesTable) {
    await knex.schema.createTable('schedules', (table) => {
      table.string('id', 36).primary();
      table.string('facility_id', 36).notNullable();
      table.string('name', 255).notNullable();
      table.enum('schedule_type', ['precanned', 'custom']).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.string('created_by', 36).nullable();
      table.timestamps(true, true);

      // Foreign keys
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');

      // Indexes
      table.index(['facility_id'], 'idx_schedules_facility_id');
      table.index(['schedule_type'], 'idx_schedules_type');
      table.index(['is_active'], 'idx_schedules_is_active');
    });
    console.log('Created schedules table');
  }

  // Create schedule_time_windows table
  const hasTimeWindowsTable = await knex.schema.hasTable('schedule_time_windows');
  if (!hasTimeWindowsTable) {
    await knex.schema.createTable('schedule_time_windows', (table) => {
      table.string('id', 36).primary();
      table.string('schedule_id', 36).notNullable();
      table.tinyint('day_of_week').notNullable().comment('0=Sunday, 6=Saturday');
      table.time('start_time').notNullable();
      table.time('end_time').notNullable();
      table.timestamps(true, true);

      // Foreign keys
      table.foreign('schedule_id').references('id').inTable('schedules').onDelete('CASCADE');

      // Indexes
      table.index(['schedule_id'], 'idx_schedule_time_windows_schedule_id');
      table.index(['schedule_id', 'day_of_week'], 'idx_schedule_time_windows_schedule_day');
    });
    console.log('Created schedule_time_windows table');
  }

  // Create user_facility_schedules table
  const hasUserFacilitySchedulesTable = await knex.schema.hasTable('user_facility_schedules');
  if (!hasUserFacilitySchedulesTable) {
    await knex.schema.createTable('user_facility_schedules', (table) => {
      table.string('id', 36).primary();
      table.string('user_id', 36).notNullable();
      table.string('facility_id', 36).notNullable();
      table.string('schedule_id', 36).notNullable();
      table.string('created_by', 36).nullable();
      table.timestamps(true, true);

      // Foreign keys
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('facility_id').references('id').inTable('facilities').onDelete('CASCADE');
      table.foreign('schedule_id').references('id').inTable('schedules').onDelete('CASCADE');
      table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');

      // Indexes
      table.index(['user_id'], 'idx_user_facility_schedules_user_id');
      table.index(['facility_id'], 'idx_user_facility_schedules_facility_id');
      table.index(['schedule_id'], 'idx_user_facility_schedules_schedule_id');
      
      // Unique constraint: one schedule per user per facility
      table.unique(['user_id', 'facility_id'], 'unique_user_facility_schedule');
    });
    console.log('Created user_facility_schedules table');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order (respecting foreign key constraints)
  const hasUserFacilitySchedulesTable = await knex.schema.hasTable('user_facility_schedules');
  if (hasUserFacilitySchedulesTable) {
    await knex.schema.dropTableIfExists('user_facility_schedules');
    console.log('Dropped user_facility_schedules table');
  }

  const hasTimeWindowsTable = await knex.schema.hasTable('schedule_time_windows');
  if (hasTimeWindowsTable) {
    await knex.schema.dropTableIfExists('schedule_time_windows');
    console.log('Dropped schedule_time_windows table');
  }

  const hasSchedulesTable = await knex.schema.hasTable('schedules');
  if (hasSchedulesTable) {
    await knex.schema.dropTableIfExists('schedules');
    console.log('Dropped schedules table');
  }
}

