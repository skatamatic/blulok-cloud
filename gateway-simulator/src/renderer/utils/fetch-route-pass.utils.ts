export type FetchRoutePassDisabledContext = {
  loggedIn: boolean;
  deviceRegistered: boolean;
  facilityId: string | undefined;
  busy: boolean;
};

export function getFetchRoutePassDisabledReason(
  ctx: FetchRoutePassDisabledContext,
): string | undefined {
  if (ctx.busy) return 'Another action is in progress';
  if (!ctx.loggedIn) return 'Refresh the user session first';
  if (!ctx.deviceRegistered) return 'Register the device key with the backend first';
  if (!ctx.facilityId) return 'Add a gateway to select a facility';
  return undefined;
}

export function isFetchRoutePassDisabled(ctx: FetchRoutePassDisabledContext): boolean {
  return getFetchRoutePassDisabledReason(ctx) !== undefined;
}
