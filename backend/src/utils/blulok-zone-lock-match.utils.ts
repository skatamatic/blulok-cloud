import type { Knex } from 'knex';

export type BluLokZoneLockMatch = {
  unitIds?: string[];
  bluLokDeviceIds?: string[];
};

/**
 * Restricts a zone_lock alias to BluLok members matched by unit anchor and/or device id.
 */
export function applyBlulokZoneLockMatch(
  qb: Knex.QueryBuilder,
  zoneLockAlias: string,
  match: BluLokZoneLockMatch,
): void {
  const unitIds = (match.unitIds ?? []).filter(Boolean);
  const bluLokDeviceIds = (match.bluLokDeviceIds ?? []).filter(Boolean);

  if (unitIds.length === 0 && bluLokDeviceIds.length === 0) {
    qb.whereRaw('1 = 0');
    return;
  }

  qb.andWhere(function zoneLockMatch(this: Knex.QueryBuilder) {
    if (unitIds.length > 0) {
      this.whereIn(`${zoneLockAlias}.source_unit_id`, unitIds);
    }
    if (bluLokDeviceIds.length > 0) {
      if (unitIds.length > 0) {
        this.orWhereIn(`${zoneLockAlias}.device_id`, bluLokDeviceIds);
      } else {
        this.whereIn(`${zoneLockAlias}.device_id`, bluLokDeviceIds);
      }
    }
  });
}
