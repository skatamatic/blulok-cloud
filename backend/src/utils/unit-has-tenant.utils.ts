import type { Knex } from 'knex';

/**
 * True when the unit has any non-expired primary/shared assignment or an active key share.
 * Matches the product notion of “unit has a tenant” used by unlock override UX.
 */
export async function unitHasTenant(knex: Knex, unitId: string): Promise<boolean> {
  const assignment = await knex('unit_assignments')
    .where({ unit_id: unitId })
    .where(function activeAssignment() {
      this.whereNull('access_expires_at').orWhere('access_expires_at', '>', knex.fn.now());
    })
    .first('id');
  if (assignment) return true;

  const sharing = await knex('key_sharing')
    .where({ unit_id: unitId, is_active: true })
    .where(function activeShare() {
      this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
    })
    .first('id');

  return Boolean(sharing);
}
