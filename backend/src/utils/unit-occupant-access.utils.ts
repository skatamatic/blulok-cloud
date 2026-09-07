import type { Knex } from 'knex';

/**
 * True when the user is entitled as an occupant of the unit:
 * - non-expired primary/shared row in `unit_assignments`, or
 * - active (non-expired) `key_sharing` recipient.
 *
 * Used to skip Occupied Unit Override for tenants unlocking their own unit
 * (or units shared with them) on both cloud remote and on-ground paths.
 */
export async function userIsUnitOccupantOrShareRecipient(
  knex: Knex,
  unitId: string,
  userId: string,
): Promise<boolean> {
  const assignment = await knex('unit_assignments')
    .where({ unit_id: unitId, tenant_id: userId })
    .where(function activeAssignment() {
      this.whereNull('access_expires_at').orWhere('access_expires_at', '>', knex.fn.now());
    })
    .first('id');
  if (assignment) {
    return true;
  }

  const sharing = await knex('key_sharing')
    .where({ unit_id: unitId, shared_with_user_id: userId, is_active: true })
    .where(function activeShare() {
      this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
    })
    .first('id');

  return Boolean(sharing);
}
