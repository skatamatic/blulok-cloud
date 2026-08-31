/** Resolve facility filter from either snake_case or camelCase query keys. */
export function resolveUnitsListFacilityId(query: Record<string, unknown>): string | undefined {
  const snake = typeof query.facility_id === 'string' ? query.facility_id.trim() : '';
  const camel = typeof query.facilityId === 'string' ? query.facilityId.trim() : '';
  return snake || camel || undefined;
}

/** Normalize list-units query params for model/service filtering. */
export function normalizeUnitsListQuery(
  query: Record<string, unknown>,
  forcedFacilityId?: string,
): Record<string, unknown> {
  const facility_id = forcedFacilityId || resolveUnitsListFacilityId(query);
  return {
    ...query,
    ...(facility_id ? { facility_id } : {}),
    sortBy: query.sortBy ?? query.sort_by,
    sortOrder: query.sortOrder ?? query.sort_order,
  };
}
