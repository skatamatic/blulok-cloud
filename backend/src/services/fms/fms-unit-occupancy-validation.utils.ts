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

/** Tenant external ids that cannot be created, mapped to their validation reasons. */
function collectBlockedTenants(tenantChanges: BlockedTenantSource[]): Map<string, string[]> {
  const blocked = new Map<string, string[]>();
  for (const change of tenantChanges) {
    if (change.change_type !== FMSChangeType.TENANT_ADDED) continue;
    if (!isFlaggedInvalid(change.is_valid)) continue;
    const reasons = Array.isArray(change.validation_errors) ? change.validation_errors : [];
    blocked.set(change.external_id, reasons.length > 0 ? reasons : ['Tenant record is incomplete']);
  }
  return blocked;
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
