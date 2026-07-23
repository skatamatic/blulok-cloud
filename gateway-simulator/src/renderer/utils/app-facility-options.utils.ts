export type FacilityRef = { id: string; name: string };

export type AppFacilityOption = FacilityRef & {
  /** User can subscribe via /ws/app (GET /facilities scoped to their token). */
  accessible: boolean;
  /** A simulator gateway tab is bound to this facility. */
  hasLocalGateway: boolean;
};

/**
 * Merge cloud-accessible facilities with local gateway facilities for the App tab picker.
 * Accessible + local gateway first; inaccessible gateway-only rows are kept (disabled) for clarity.
 */
export function buildAppFacilityOptions(
  accessible: FacilityRef[],
  gatewayFacilities: FacilityRef[],
): AppFacilityOption[] {
  const gwMap = new Map(gatewayFacilities.map((f) => [f.id, f.name]));
  const seen = new Set<string>();
  const options: AppFacilityOption[] = [];

  for (const f of accessible) {
    const id = f.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      name: f.name.trim() || id,
      accessible: true,
      hasLocalGateway: gwMap.has(id),
    });
  }

  for (const [id, name] of gwMap) {
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      name: name.trim() || id,
      accessible: false,
      hasLocalGateway: true,
    });
  }

  options.sort((a, b) => {
    const rank = (o: AppFacilityOption) =>
      o.accessible && o.hasLocalGateway ? 0 : o.accessible ? 1 : 2;
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });

  return options;
}

/** Prefer current selection when still valid; else accessible+gateway, else first accessible. */
export function pickDefaultAppFacilityId(
  options: AppFacilityOption[],
  currentId?: string,
): string {
  const trimmed = currentId?.trim() ?? '';
  if (trimmed && options.some((o) => o.id === trimmed && o.accessible)) {
    return trimmed;
  }
  const preferred =
    options.find((o) => o.accessible && o.hasLocalGateway) ??
    options.find((o) => o.accessible);
  return preferred?.id ?? '';
}

export function formatAppFacilityOptionLabel(option: AppFacilityOption): string {
  if (!option.accessible) return `${option.name} (no access)`;
  if (option.hasLocalGateway) return `${option.name} · local gateway`;
  return `${option.name} · no local gateway`;
}

export function appFacilitySelectionHint(
  options: AppFacilityOption[],
  selectedId: string,
): string | null {
  if (!options.length) {
    return 'No facilities available — refresh the cloud session, or add a gateway for a facility you can access.';
  }
  const selected = options.find((o) => o.id === selectedId);
  if (!selected) return null;
  if (!selected.accessible) {
    return 'This user cannot subscribe to that facility (no unit assignment / key share / association).';
  }
  if (!selected.hasLocalGateway) {
    return 'No local simulator gateway for this facility — realtime will work if the cloud gateway is online.';
  }
  return null;
}
