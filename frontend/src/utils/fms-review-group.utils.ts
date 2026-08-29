import { FMSChange, FMSChangeType } from '@/types/fms.types';

export type FmsReviewProblemKind =
  | 'identity-collision'
  | 'ledger-vacant'
  | 'ledger-occupied'
  | 'incomplete-tenant'
  | 'occupied-no-tenant'
  | 'occupied-unknown-tenant'
  | 'occupied-blocked-tenant'
  | 'unmapped-tenant'
  | 'unmapped-unit'
  | 'unit-fetch-failed';

export type FmsReviewableChange = Pick<
  FMSChange,
  'id' | 'change_type' | 'external_id' | 'impact_summary' | 'is_valid' | 'validation_errors' | 'after_data'
>;

export type FmsReviewDisplayGroup<T extends FmsReviewableChange = FmsReviewableChange> = {
  key: string;
  kind: FmsReviewProblemKind | null;
  changes: T[];
  primary: T;
};

const OPAQUE_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const PROBLEM_TITLES: Record<FmsReviewProblemKind, string> = {
  'identity-collision': 'Shared tenant contact',
  'ledger-vacant': 'Unit status and ledger disagree',
  'ledger-occupied': 'Unit status and ledger disagree',
  'incomplete-tenant': 'Incomplete tenant record',
  'occupied-no-tenant': 'Occupied unit has no tenant',
  'occupied-unknown-tenant': 'Occupied unit names unknown tenant',
  'occupied-blocked-tenant': 'Tenant cannot be created',
  'unmapped-tenant': "Tenant isn't in BluLok yet",
  'unmapped-unit': "Unit isn't in BluLok yet",
  'unit-fetch-failed': 'Could not load unit from FMS',
};

function changeText(change: FmsReviewableChange): string {
  return [...(change.validation_errors ?? []), change.impact_summary ?? ''].join('\n');
}

export function sanitizeFmsReviewDisplayText(text: string): string {
  return text.replace(OPAQUE_ID_RE, 'this record').replace(/\s+/g, ' ').trim();
}

function extractBluLokUser(text: string): string | null {
  const match = text.match(/BluLok user ([^\s,]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractLedgerTenant(text: string): string | null {
  const listed = text.match(/lists (.+?) on (?:it|them|those units)/i);
  if (listed?.[1]) return listed[1].trim().toLowerCase();
  const assigned = text.match(/Assign (.+?) to units?/i);
  if (assigned?.[1]) return assigned[1].trim().toLowerCase();
  const removed = text.match(/Remove (.+?) from units?/i);
  return removed?.[1]?.trim().toLowerCase() ?? null;
}

function afterRecord(change: FmsReviewableChange): Record<string, unknown> | null {
  if (!change.after_data || typeof change.after_data !== 'object' || Array.isArray(change.after_data)) {
    return null;
  }
  return change.after_data as Record<string, unknown>;
}

export function getFmsReviewProblemKind(change: FmsReviewableChange): FmsReviewProblemKind | null {
  if (change.is_valid !== false) return null;
  const text = changeText(change);

  if (/already mapped to a different FMS tenant/i.test(text) || /matches BluLok user /i.test(text)) {
    return 'identity-collision';
  }
  if (/removal was not applied/i.test(text) || /FMS units? still occupied/i.test(text)) {
    return 'ledger-occupied';
  }
  if (/ledger still lists/i.test(text) || /assignment was not applied/i.test(text)) {
    return 'ledger-vacant';
  }
  if (
    /missing or empty (first|last) name/i.test(text) ||
    /must have a first or last name/i.test(text)
  ) {
    return 'incomplete-tenant';
  }
  if (/does not say which tenant holds it/i.test(text)) {
    return 'occupied-no-tenant';
  }
  if (/missing from the FMS tenant list/i.test(text)) {
    return 'occupied-unknown-tenant';
  }
  if (/cannot be created in BluLok/i.test(text)) {
    return 'occupied-blocked-tenant';
  }
  if (/tenant is not mapped in BluLok/i.test(text)) {
    return 'unmapped-tenant';
  }
  if (/unit is not mapped in BluLok/i.test(text)) {
    return 'unmapped-unit';
  }
  if (/could not fetch unit/i.test(text)) {
    return 'unit-fetch-failed';
  }
  return null;
}

export function getFmsReviewProblemGroupKey(change: FmsReviewableChange): string | null {
  const kind = getFmsReviewProblemKind(change);
  if (!kind) return null;
  const text = changeText(change);
  const after = afterRecord(change);

  switch (kind) {
    case 'identity-collision':
      return `identity:${extractBluLokUser(text) ?? 'shared-contact'}`;
    case 'ledger-vacant':
      return `ledger-vacant:${extractLedgerTenant(text) ?? change.external_id}`;
    case 'ledger-occupied':
      return `ledger-occupied:${extractLedgerTenant(text) ?? change.external_id}`;
    case 'incomplete-tenant': {
      const tenantId =
        (typeof after?.tenantId === 'string' && after.tenantId) ||
        (change.change_type === FMSChangeType.TENANT_ADDED ? change.external_id : null);
      return `incomplete:${tenantId ?? change.external_id}`;
    }
    case 'occupied-no-tenant':
    case 'occupied-unknown-tenant':
    case 'occupied-blocked-tenant':
      return `${kind}:${change.external_id}`;
    case 'unmapped-tenant':
      return `unmapped-tenant:${change.external_id}`;
    case 'unmapped-unit':
    case 'unit-fetch-failed':
      return `${kind}:${change.external_id}`;
    default:
      return null;
  }
}

function pickPrimary<T extends FmsReviewableChange>(kind: FmsReviewProblemKind | null, changes: T[]): T {
  if (kind === 'identity-collision' || kind === 'incomplete-tenant') {
    return changes.find((change) => change.change_type === FMSChangeType.TENANT_ADDED) ?? changes[0];
  }
  if (kind === 'ledger-vacant' || kind === 'ledger-occupied') {
    return (
      changes.find((change) => change.change_type === FMSChangeType.TENANT_UNIT_CHANGED) ??
      changes[0]
    );
  }
  return changes[0];
}

/** Cluster sibling invalid rows that are the same root FMS problem. Valid rows stay 1:1. */
export function groupFmsReviewChanges<T extends FmsReviewableChange>(
  changes: T[],
): FmsReviewDisplayGroup<T>[] {
  const seen = new Map<string, FmsReviewDisplayGroup<T>>();
  const result: FmsReviewDisplayGroup<T>[] = [];

  for (const change of changes) {
    const kind = getFmsReviewProblemKind(change);
    const groupKey = getFmsReviewProblemGroupKey(change);
    if (!kind || !groupKey) {
      result.push({ key: change.id, kind: null, changes: [change], primary: change });
      continue;
    }

    const existing = seen.get(groupKey);
    if (existing) {
      existing.changes.push(change);
      existing.primary = pickPrimary(kind, existing.changes);
      continue;
    }

    const group: FmsReviewDisplayGroup<T> = {
      key: groupKey,
      kind,
      changes: [change],
      primary: change,
    };
    seen.set(groupKey, group);
    result.push(group);
  }

  return result;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractUnitNumbers(changes: FmsReviewableChange[]): string[] {
  const numbers: string[] = [];
  for (const change of changes) {
    const after = change.after_data as { unitNumber?: string; unitNumbers?: string[] } | null;
    if (Array.isArray(after?.unitNumbers)) {
      numbers.push(...after.unitNumbers.filter((value): value is string => typeof value === 'string'));
    } else if (typeof after?.unitNumber === 'string') {
      numbers.push(after.unitNumber);
    } else {
      const fromImpact = change.impact_summary?.match(/units? ([A-Za-z0-9._-]+(?:,\s*[A-Za-z0-9._-]+)*)/i);
      if (fromImpact?.[1]) {
        numbers.push(...fromImpact[1].split(',').map((part) => part.trim()));
      }
    }
  }
  return uniqueStrings(numbers);
}

export type FmsReviewGroupPresentation = {
  title: string;
  impact: string;
  errors: string[];
  relatedSummaries: string[];
};

function presentIdentity(group: FmsReviewDisplayGroup): FmsReviewGroupPresentation {
  const { primary, changes } = group;
  const tenantRows = changes.filter((change) => change.change_type === FMSChangeType.TENANT_ADDED);
  const user = extractBluLokUser(changeText(primary)) ?? 'an existing BluLok user';
  const tenantLabels = uniqueStrings(
    tenantRows.map((change) => {
      const match = change.impact_summary.match(/FMS tenant[s]? (.+?) (?:matches|share)/i);
      return match?.[1];
    }),
  );
  const impact =
    tenantLabels.length > 1
      ? `FMS tenants ${tenantLabels.join(' and ')} share contact info with BluLok user ${user}, who is already mapped to a different FMS tenant`
      : tenantRows[0]?.impact_summary ||
        `Contact info matches BluLok user ${user}, who is already mapped to a different FMS tenant`;
  const rootError =
    tenantRows[0]?.validation_errors?.[0] ??
    (primary.validation_errors?.[0]?.replace(/^Unit .+? cannot be created in BluLok:\s*/i, '') ?? '');
  const relatedSummaries = uniqueStrings(
    changes
      .filter((change) => change.change_type !== FMSChangeType.TENANT_ADDED)
      .map((change) => change.impact_summary),
  );
  return {
    title: PROBLEM_TITLES['identity-collision'],
    impact,
    errors: rootError ? [rootError] : [],
    relatedSummaries,
  };
}

function presentLedger(
  group: FmsReviewDisplayGroup,
  kind: 'ledger-vacant' | 'ledger-occupied',
): FmsReviewGroupPresentation {
  const { primary, changes } = group;
  const units = extractUnitNumbers(changes);
  const tenant =
    changes[0].impact_summary.match(/Assign (.+?) to units?/i)?.[1] ??
    changes[0].impact_summary.match(/Remove (.+?) from units?/i)?.[1] ??
    extractLedgerTenant(changeText(changes[0])) ??
    'this tenant';

  if (kind === 'ledger-vacant') {
    const impact =
      units.length > 1
        ? `Assign ${tenant} to units ${units.join(', ')} — blocked (FMS units are vacant)`
        : primary.impact_summary;
    const errors =
      units.length > 1
        ? [
            `FMS marks units ${units.join(', ')} as vacant, but a ledger still lists ${tenant} on them. Unit status is the source of truth for occupancy, so these assignments were not applied. Fix the ledger or unit status in your FMS so they agree, then sync again.`,
          ]
        : (primary.validation_errors ?? []);
    return { title: PROBLEM_TITLES[kind], impact, errors, relatedSummaries: [] };
  }

  const impact =
    units.length > 1
      ? `Remove ${tenant} from units ${units.join(', ')} — blocked (FMS units still occupied)`
      : primary.impact_summary;
  const errors =
    units.length > 1
      ? [
          `FMS marks units ${units.join(', ')} as occupied, but ${tenant}'s ledger no longer lists them. Unit status is the source of truth for occupancy, so these removals were not applied. Fix the ledger or unit status in your FMS so they agree, then sync again.`,
        ]
      : (primary.validation_errors ?? []);
  return { title: PROBLEM_TITLES[kind], impact, errors, relatedSummaries: [] };
}

export function presentFmsReviewGroup(group: FmsReviewDisplayGroup): FmsReviewGroupPresentation {
  const { primary, changes, kind } = group;
  if (!kind) {
    return {
      title: '',
      impact: sanitizeFmsReviewDisplayText(primary.impact_summary),
      errors: (primary.validation_errors ?? []).map(sanitizeFmsReviewDisplayText),
      relatedSummaries: [],
    };
  }

  let presented: FmsReviewGroupPresentation;
  if (kind === 'identity-collision') {
    presented = presentIdentity(group);
  } else if (kind === 'ledger-vacant' || kind === 'ledger-occupied') {
    presented = presentLedger(group, kind);
  } else if (kind === 'incomplete-tenant' && changes.length > 1) {
    const tenantRow = changes.find((change) => change.change_type === FMSChangeType.TENANT_ADDED) ?? primary;
    presented = {
      title: PROBLEM_TITLES[kind],
      impact: tenantRow.impact_summary,
      errors: tenantRow.validation_errors ?? primary.validation_errors ?? [],
      relatedSummaries: uniqueStrings(
        changes
          .filter((change) => change !== tenantRow)
          .map((change) => change.impact_summary),
      ),
    };
  } else {
    presented = {
      title: PROBLEM_TITLES[kind],
      impact: primary.impact_summary,
      errors: primary.validation_errors ?? [],
      relatedSummaries: [],
    };
  }

  return {
    title: presented.title,
    impact: sanitizeFmsReviewDisplayText(presented.impact),
    errors: presented.errors.map(sanitizeFmsReviewDisplayText),
    relatedSummaries: presented.relatedSummaries.map(sanitizeFmsReviewDisplayText),
  };
}
