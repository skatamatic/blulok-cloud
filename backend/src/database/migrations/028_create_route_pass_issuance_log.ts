import { Knex } from 'knex';

/**
 * Create route_pass_issuance_log table
 * 
 * Tracks route pass (JWT) issuance for auditing and optimization purposes.
 * This enables:
 * - Audit trail of all route pass issuances
 * - Optimization: Skip denylist commands when route passes are already expired
 * - Security analysis and compliance tracking
 * - User activity monitoring
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table already exists
  const hasTable = await knex.schema.hasTable('route_pass_issuance_log');
  if (hasTable) {
    console.log('route_pass_issuance_log table already exists, skipping migration');
    return;
  }

  await knex.schema.createTable('route_pass_issuance_log', (table) => {
    table.string('id', 36).primary();
    table.string('user_id', 36).notNullable();
    table.string('device_id', 36).notNullable();
    table.json('audiences').notNullable(); // Array of lock IDs in format lock:deviceId
    table.string('jti', 36).notNullable(); // JWT ID for correlation
    table.timestamp('issued_at').notNullable();
    table.timestamp('expires_at').notNullable(); // issued_at + routePassTtlHours
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('device_id').references('id').inTable('user_devices').onDelete('CASCADE');

    // Indexes for efficient queries
    table.index(['user_id'], 'idx_route_pass_user_id');
    table.index(['issued_at'], 'idx_route_pass_issued_at');
    table.index(['expires_at'], 'idx_route_pass_expires_at');
    table.index(['user_id', 'issued_at'], 'idx_route_pass_user_issued');
    
    // Unique constraint on JTI to prevent duplicate tracking
    table.unique(['jti'], 'unique_route_pass_jti');
  });

  console.log('Created route_pass_issuance_log table');
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('route_pass_issuance_log');
  if (!hasTable) {
    console.log('route_pass_issuance_log table does not exist, skipping rollback');
    return;
  }

  await knex.schema.dropTableIfExists('route_pass_issuance_log');
  console.log('Dropped route_pass_issuance_log table');
}

