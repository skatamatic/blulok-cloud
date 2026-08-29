type StoredgeLedgerLike = {
  tenant?: { id?: string } | null;
  unit?: { id?: string } | null;
};

function asLedger(row: unknown): StoredgeLedgerLike | null {
  if (!row || typeof row !== 'object') return null;
  return row as StoredgeLedgerLike;
}

export function storedgeLedgerTenantId(ledger: unknown): string | undefined {
  const id = asLedger(ledger)?.tenant?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function storedgeLedgerUnitId(ledger: unknown): string | undefined {
  const id = asLedger(ledger)?.unit?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** Occupied unit ids for a tenant, skipping ledgers with a missing tenant or unit. */
export function unitIdsForStoredgeTenant(ledgers: unknown[], tenantId: string): string[] {
  const ids: string[] = [];
  for (const ledger of ledgers) {
    if (storedgeLedgerTenantId(ledger) !== tenantId) continue;
    const unitId = storedgeLedgerUnitId(ledger);
    if (unitId && !ids.includes(unitId)) ids.push(unitId);
  }
  return ids;
}
