import { FMSChangeType, FMSTenant, FMSUnit } from '@/types/fms.types';
import { formatFmsTenantContactLabel } from './fms-tenant-validation.utils';

/**
 * BluLok occupancy is assignment-gated, so a unit can only be stored as `occupied` once a tenant
 * is assigned. When FMS reports a unit occupied by a tenant BluLok can never create (e.g. the FMS
 * record has no email and no phone), the unit update can never succeed — every sync would re-detect
 * it and every apply would fail with the same error.
 *
 * **Unit status is the source of truth for occupancy.** Storable (and similar) can disagree with
 * itself: `units.status` may say vacant while `ledgers/current` still lists a tenant. Trusting both
 * causes sync to flip-flop (ledger assign → vacant kick-out → assign again). Ledger-driven
 * assign/unassign rows that contradict unit status are therefore blocked for human review, while
 * vacant/occupied `unit_updated` from unit status still applies.
 *
 * These helpers detect those dead ends and conflicts up front so the change is surfaced as
 * **blocked** in the review queue, with the reason named, instead of failing during apply or
 * silently oscillating.
 */

/** FMS statuses that mean the unit is not occupied for BluLok access purposes. */
export function isFmsUnitVacantStatus(
  status: FMSUnit['status'] | string | null | undefined,
): boolean {
  if (!status) return false;
  return status === 'available' || status === 'vacant' || status === 'maintenance' || status === 'reserved';
}

export function isFmsUnitOccupiedStatus(
  status: FMSUnit['status'] | string | null | undefined,
): boolean {
  return status === 'occupied';
}

export type FmsOccupancyTenantInfo = Pick<FMSTenant, 'firstName' | 'lastName' | 'email' | 'phone'>;
export type FmsOccupancyContextTenant = FmsOccupancyTenantInfo & { externalId: string };

/** Accepts persisted `fms_changes` rows and not-yet-inserted change payloads alike. */
export type BlockedTenantSource = {
  change_type: FMSChangeType;
  external_id: string;
  is_valid?: boolean;
  validation_errors?: string[] | undefined;
  after_data?: { collidingExternalIds?: unknown } | Record<string, unknown> | null;
};

export type FmsOccupancyContext = {
  /** Tenants present in the FMS payload, keyed by FMS external id. */
  tenantsByExternalId: Map<string, FmsOccupancyTenantInfo>;
  /** Tenants this batch must create but cannot, with the reasons why. */
  blockedTenantErrorsByExternalId: Map<string, string[]>;
  /** Tenants already mapped to a BluLok user for this facility. */
  mappedTenantExternalIds: Set<string>;
  /**
   * Full sync sees every tenant, so a tenant missing from the payload is a real data problem.
   * A webhook batch only sees one event, so unknown tenants must not be flagged there.
   */
  treatUnknownTenantAsBlocker: boolean;
};

function formatTenantLabel(tenant: FmsOccupancyTenantInfo | undefined): string {
  if (!tenant) return 'a tenant';
  const name = [tenant.firstName, tenant.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  const contact = formatFmsTenantContactLabel(tenant);
  if (name && contact !== 'no email or phone') return `${name} (${contact})`;
  if (name) return name;
  return contact === 'no email or phone' ? 'a tenant' : contact;
}

/** MySQL surfaces booleans as 0/1, so `is_valid` can arrive as either. */
function isFlaggedInvalid(isValid: unknown): boolean {
  return isValid === false || isValid === 0;
}

function collidingExternalIdsFromAfterData(afterData: BlockedTenantSource['after_data']): string[] {
  if (!afterData || typeof afterData !== 'object') return [];
  const raw = (afterData as { collidingExternalIds?: unknown }).collidingExternalIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function joinTenantLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/** Tenant external ids that cannot be created, mapped to their validation reasons. */
function collectBlockedTenants(tenantChanges: BlockedTenantSource[]): Map<string, string[]> {
  const blocked = new Map<string, string[]>();
  for (const change of tenantChanges) {
    if (change.change_type !== FMSChangeType.TENANT_ADDED) continue;
    if (!isFlaggedInvalid(change.is_valid)) continue;
    const reasons = Array.isArray(change.validation_errors) ? change.validation_errors : [];
    const fallback = reasons.length > 0 ? reasons : ['Tenant record is incomplete'];
    const ids = [change.external_id, ...collidingExternalIdsFromAfterData(change.after_data)];
    for (const id of ids) {
      blocked.set(id, fallback);
    }
  }
  return blocked;
}

/**
 * Occupied `unit_updated` is redundant when an invalid `tenant_added` already names the same
 * tenant — the review queue only needs the root identity / validation problem.
 * Webhook batches with no `tenant_added` still emit the blocked unit row.
 */
export function shouldOmitOccupiedUnitReview(
  fmsUnit: Pick<FMSUnit, 'tenantId'>,
  occupancyBlockers: string[],
  ctx: FmsOccupancyContext,
): boolean {
  if (occupancyBlockers.length === 0) return false;
  const tenantId = fmsUnit.tenantId?.trim();
  if (!tenantId) return false;
  return ctx.blockedTenantErrorsByExternalId.has(tenantId);
}

export function buildIdentityCollisionReview(options: {
  userLabel: string;
  tenants: Array<FmsOccupancyTenantInfo & { externalId: string }>;
}): {
  impact_summary: string;
  validation_errors: string[];
  collidingExternalIds: string[];
} {
  const collidingExternalIds = options.tenants.map((tenant) => tenant.externalId);
  const labels = [...new Set(options.tenants.map((tenant) => formatFmsTenantContactLabel(tenant)))];
  const impact_summary =
    labels.length <= 1
      ? `FMS tenant ${labels[0] ?? 'this tenant'} matches an existing BluLok user who is already mapped to a different FMS tenant`
      : `FMS tenants ${joinTenantLabels(labels)} share contact info with BluLok user ${options.userLabel}, who is already mapped to a different FMS tenant`;
  const uniqueHint =
    labels.length <= 1
      ? 'Give this tenant a unique email or phone in your FMS, or remap the user.'
      : 'Give each of these tenants a unique email or phone in your FMS, or remap the user.';
  return {
    impact_summary,
    validation_errors: [
      `Contact info matches BluLok user ${options.userLabel}, who is already mapped to a different FMS tenant. Each BluLok user can map to only one FMS tenant. ${uniqueHint}`,
    ],
    collidingExternalIds,
  };
}

export function buildOccupiedLedgerUnassignReview(options: {
  tenant: FmsOccupancyTenantInfo;
  units: Array<{ unitNumber: string }>;
}): { impact_summary: string; validation_errors: string[] } {
  const contact = formatFmsTenantContactLabel(options.tenant);
  const label = formatTenantLabel(options.tenant);
  if (options.units.length <= 1) {
    const unitNumber = options.units[0]?.unitNumber ?? 'this unit';
    return {
      impact_summary: `Remove ${contact} from unit ${unitNumber} — blocked (FMS unit still occupied)`,
      validation_errors: [
        `FMS marks unit ${unitNumber} as occupied by ${label}, but that tenant's ledger no longer ` +
          'lists this unit. Unit status is the source of truth for occupancy, so this removal was not applied. ' +
          'Fix the ledger or unit status in your FMS so they agree, then sync again.',
      ],
    };
  }

  const unitList = options.units.map((unit) => unit.unitNumber).join(', ');
  return {
    impact_summary: `Remove ${contact} from units ${unitList} — blocked (FMS units still occupied)`,
    validation_errors: [
      `FMS marks units ${unitList} as occupied by ${label}, but that tenant's ledger no longer ` +
        'lists those units. Unit status is the source of truth for occupancy, so these removals were not applied. ' +
        'Fix the ledger or unit status in your FMS so they agree, then sync again.',
    ],
  };
}

export function buildVacantLedgerAssignReview(options: {
  tenant: FmsOccupancyTenantInfo;
  units: Array<{ unitNumber: string; status: string }>;
}): { impact_summary: string; validation_errors: string[] } {
  const contact = formatFmsTenantContactLabel(options.tenant);
  if (options.units.length <= 1) {
    const unit = options.units[0];
    return {
      impact_summary: `Assign ${contact} to unit ${unit?.unitNumber ?? 'this unit'} — blocked (FMS unit is vacant)`,
      validation_errors: unit
        ? resolveLedgerAssignAgainstUnitStatus({
            unitNumber: unit.unitNumber,
            fmsUnitStatus: unit.status,
            tenant: options.tenant,
          })
        : [],
    };
  }

  const unitList = options.units.map((unit) => unit.unitNumber).join(', ');
  const label = formatTenantLabel(options.tenant);
  return {
    impact_summary: `Assign ${contact} to units ${unitList} — blocked (FMS units are vacant)`,
    validation_errors: [
      `FMS marks units ${unitList} as vacant, but a ledger still lists ${label} on them. ` +
        'Unit status is the source of truth for occupancy, so these assignments were not applied. ' +
        'Fix the ledger or unit status in your FMS so they agree, then sync again.',
    ],
  };
}

export function buildFmsOccupancyContext(options: {
  fmsTenants: FmsOccupancyContextTenant[];
  tenantChanges: BlockedTenantSource[];
  mappedTenantExternalIds: Iterable<string>;
  treatUnknownTenantAsBlocker?: boolean;
}): FmsOccupancyContext {
  return {
    tenantsByExternalId: new Map(options.fmsTenants.map((t) => [t.externalId, t])),
    blockedTenantErrorsByExternalId: collectBlockedTenants(options.tenantChanges),
    mappedTenantExternalIds: new Set(options.mappedTenantExternalIds),
    treatUnknownTenantAsBlocker: options.treatUnknownTenantAsBlocker ?? true,
  };
}

/**
 * Reasons an FMS `occupied` status can never be applied to this unit.
 * Empty array means the unit update can proceed (a tenant already holds the unit, or one will be
 * created / assigned earlier in the same apply batch).
 */
export function resolveOccupiedUnitBlockers(
  fmsUnit: Pick<FMSUnit, 'unitNumber' | 'status' | 'tenantId'>,
  currentEffectiveStatus: string | undefined,
  ctx: FmsOccupancyContext,
): string[] {
  if (fmsUnit.status !== 'occupied') return [];

  // Units that already read as occupied/overlocked in BluLok have assignments, so the gate is met.
  if (currentEffectiveStatus === 'occupied' || currentEffectiveStatus === 'overlocked') return [];

  const externalTenantId = fmsUnit.tenantId?.trim();
  if (!externalTenantId) {
    return [
      `FMS reports unit ${fmsUnit.unitNumber} as occupied but does not say which tenant holds it, ` +
        'so BluLok has nobody to grant access to. Assign a tenant to this unit in your FMS, then sync again.',
    ];
  }

  // Already a BluLok user: the unit update assigns them itself.
  if (ctx.mappedTenantExternalIds.has(externalTenantId)) return [];

  const blockedReasons = ctx.blockedTenantErrorsByExternalId.get(externalTenantId);
  if (blockedReasons) {
    const label = formatTenantLabel(ctx.tenantsByExternalId.get(externalTenantId));
    return [
      `Unit ${fmsUnit.unitNumber} is occupied by ${label} in FMS, but that tenant cannot be created ` +
        `in BluLok: ${blockedReasons.join('; ')}. Fix the tenant record in your FMS, then sync again.`,
    ];
  }

  if (ctx.treatUnknownTenantAsBlocker && !ctx.tenantsByExternalId.has(externalTenantId)) {
    return [
      `FMS reports unit ${fmsUnit.unitNumber} as occupied by a tenant that is missing from the FMS ` +
        'tenant list, so BluLok cannot grant access. Check that tenant record in your FMS, then sync again.',
    ];
  }

  return [];
}

/**
 * Ledger says assign this tenant to a unit, but FMS unit status is not occupied.
 * Unit status wins — block the assign and explain the Storable (or FMS) data conflict.
 */
export function resolveLedgerAssignAgainstUnitStatus(
  options: {
    unitNumber: string;
    fmsUnitStatus: FMSUnit['status'] | string | null | undefined;
    tenant?: FmsOccupancyTenantInfo;
  },
): string[] {
  if (!isFmsUnitVacantStatus(options.fmsUnitStatus)) return [];

  const label = formatTenantLabel(options.tenant);
  const statusLabel = options.fmsUnitStatus === 'available' ? 'vacant' : String(options.fmsUnitStatus);
  return [
    `FMS marks unit ${options.unitNumber} as ${statusLabel}, but a ledger still lists ${label} on it. ` +
      'Unit status is the source of truth for occupancy, so this assignment was not applied. ' +
      'Fix the ledger or unit status in your FMS so they agree, then sync again.',
  ];
}

/**
 * Ledger no longer lists this tenant on the unit, but FMS unit status is still occupied by them.
 * Unit status wins — block the unassign so sync does not revoke access the unit record still claims.
 */
export function resolveLedgerUnassignAgainstUnitStatus(
  options: {
    unitNumber: string;
    fmsUnitStatus: FMSUnit['status'] | string | null | undefined;
    fmsUnitTenantId?: string | null;
    tenantExternalId: string;
    tenant?: FmsOccupancyTenantInfo;
  },
): string[] {
  if (!isFmsUnitOccupiedStatus(options.fmsUnitStatus)) return [];
  const holderId = options.fmsUnitTenantId?.trim();
  if (!holderId || holderId !== options.tenantExternalId) return [];

  const label = formatTenantLabel(options.tenant);
  return [
    `FMS marks unit ${options.unitNumber} as occupied by ${label}, but that tenant's ledger no longer ` +
      'lists this unit. Unit status is the source of truth for occupancy, so this removal was not applied. ' +
      'Fix the ledger or unit status in your FMS so they agree, then sync again.',
  ];
}

/** Unit numbers (or labels) whose ledgers conflict with a vacant FMS unit status. */
export function formatVacantUnitLedgerConflictNote(
  unitNumber: string,
  conflictingTenantLabels: string[],
): string | null {
  if (conflictingTenantLabels.length === 0) return null;
  const who =
    conflictingTenantLabels.length === 1
      ? conflictingTenantLabels[0]
      : `${conflictingTenantLabels.slice(0, 2).join(', ')}${
          conflictingTenantLabels.length > 2 ? `, +${conflictingTenantLabels.length - 2} more` : ''
        }`;
  return (
    `Update unit ${unitNumber} to vacant (FMS unit status). ` +
    `Ledger still lists ${who} — assignment changes from that ledger were blocked for review.`
  );
}

/**
 * Split FMS tenant unitIds into those BluLok may assign (occupied unit status) vs ledger-only conflicts.
 */
export function partitionTenantUnitIdsByOccupancy(
  unitIds: string[],
  fmsUnitsByExternalId: Map<string, Pick<FMSUnit, 'externalId' | 'unitNumber' | 'status'>>,
): {
  occupiableUnitIds: string[];
  vacantConflicts: Array<{ externalId: string; unitNumber: string; status: string }>;
} {
  const occupiableUnitIds: string[] = [];
  const vacantConflicts: Array<{ externalId: string; unitNumber: string; status: string }> = [];
  for (const unitId of unitIds) {
    const fmsUnit = fmsUnitsByExternalId.get(unitId);
    if (!fmsUnit || isFmsUnitOccupiedStatus(fmsUnit.status)) {
      // Unknown unit (not in this sync's unit list): allow assign — unit detection may add it later.
      occupiableUnitIds.push(unitId);
      continue;
    }
    if (isFmsUnitVacantStatus(fmsUnit.status)) {
      vacantConflicts.push({
        externalId: fmsUnit.externalId,
        unitNumber: fmsUnit.unitNumber || unitId,
        status: fmsUnit.status,
      });
      continue;
    }
    occupiableUnitIds.push(unitId);
  }
  return { occupiableUnitIds, vacantConflicts };
}
