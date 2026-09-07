import type { Knex } from 'knex';
import { TERMINAL_RECOVERY_STATUSES } from '@/models/gateway-recovery.model';

/**
 * Enforce at most one non-terminal recovery row per facility (MySQL-compatible).
 * Uses a generated active_facility_key column that is NULL for terminal rows.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('gateway_recoveries');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('gateway_recoveries', 'active_facility_key');
  if (!hasColumn) {
    await knex.schema.alterTable('gateway_recoveries', (table) => {
      table.string('active_facility_key', 36).nullable();
    });
  }

  const terminalList = TERMINAL_RECOVERY_STATUSES.map((s) => `'${s}'`).join(', ');
  await knex.raw(`
    UPDATE gateway_recoveries
    SET active_facility_key = CASE
      WHEN status IN (${terminalList}) THEN NULL
      ELSE facility_id
    END
  `);

  const hasIndex = await knex.schema.hasColumn('gateway_recoveries', 'active_facility_key');
  if (hasIndex) {
    try {
      await knex.schema.alterTable('gateway_recoveries', (table) => {
        table.unique(['active_facility_key'], 'uq_gw_recoveries_active_facility');
      });
    } catch {
      /* index may already exist from partial run */
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('gateway_recoveries');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('gateway_recoveries', (table) => {
      table.dropUnique(['active_facility_key'], 'uq_gw_recoveries_active_facility');
    });
  } catch {
    /* ignore */
  }

  const hasColumn = await knex.schema.hasColumn('gateway_recoveries', 'active_facility_key');
  if (hasColumn) {
    await knex.schema.alterTable('gateway_recoveries', (table) => {
      table.dropColumn('active_facility_key');
    });
  }
}
