/**
 * Probe Storable Edge occupancy sources for a sandbox facility.
 *
 * BluLok sync derives occupancy from TWO Storable collections that can disagree:
 *   - units[]            → unit.status + unit.current_tenant_id  (unit_updated)
 *   - ledgers/current[]  → tenant ↔ unit assignments             (tenant_unit_changed)
 *
 * This script dumps both, focuses on a named unit / tenant, and flags mismatches
 * that would make successive syncs flip assign ↔ unassign.
 *
 * Usage (do not commit credentials):
 *   STOREDGE_KEY=... STOREDGE_SECRET=... STOREDGE_FACILITY=... \
 *     node scripts/storedge-occupancy-probe.js
 *
 * Optional:
 *   STOREDGE_BASE_URL=https://api.storedgefms.com
 *   FOCUS_UNIT=101
 *   FOCUS_TENANT=june.mary   (matches email / first / last, case-insensitive)
 *   WRITE_JSON=1            (writes full dump next to this script)
 */

const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const consumerKey = process.env.STOREDGE_KEY || '';
const consumerSecret = process.env.STOREDGE_SECRET || '';
const facilityId = process.env.STOREDGE_FACILITY || '';
const baseUrl = (process.env.STOREDGE_BASE_URL || 'https://api.storedgefms.com').replace(/\/+$/, '');
const focusUnit = (process.env.FOCUS_UNIT || '101').trim().toLowerCase();
const focusTenant = (process.env.FOCUS_TENANT || 'june.mary').trim().toLowerCase();
const writeJson = process.env.WRITE_JSON === '1';

if (!consumerKey || !consumerSecret || !facilityId) {
  console.error('Set STOREDGE_KEY, STOREDGE_SECRET, and STOREDGE_FACILITY.');
  process.exit(1);
}

const oauth = new OAuth({
  consumer: { key: consumerKey, secret: consumerSecret },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString, key) {
    return crypto.createHmac('sha1', key).update(baseString).digest('base64');
  },
});

function getJson(url) {
  return new Promise((resolve, reject) => {
    const requestData = { url, method: 'GET' };
    const authHeaders = oauth.toHeader(oauth.authorize(requestData));
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          ...authHeaders,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllPages(resourcePath, collectionKey) {
  const aggregated = [];
  let page = 1;
  const perPage = 100;
  for (let i = 0; i < 500; i++) {
    const url = new URL(`${baseUrl}/v1/${facilityId}/${resourcePath}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    const data = await getJson(url.toString());
    const chunk = data[collectionKey];
    if (Array.isArray(chunk) && chunk.length > 0) aggregated.push(...chunk);
    const nextPage = data.meta?.pagination?.next_page;
    if (nextPage == null) break;
    page = nextPage;
  }
  return aggregated;
}

function tenantLabel(t) {
  const name = [t.first_name, t.last_name].filter(Boolean).join(' ').trim();
  return `${name || '(no name)'} <${t.email || 'no email'}> [${t.id}]`;
}

function primaryPhone(t) {
  const primary = (t.phone_numbers || []).find((p) => p.primary);
  return primary?.number || (t.phone_numbers || [])[0]?.number || null;
}

function matchesFocusTenant(t) {
  const hay = [
    t.email,
    t.first_name,
    t.last_name,
    `${t.first_name || ''} ${t.last_name || ''}`,
    `${t.first_name || ''}.${t.last_name || ''}`,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(focusTenant);
}

function matchesFocusUnit(u) {
  return String(u.name || '').trim().toLowerCase() === focusUnit;
}

function summarizeUnit(u) {
  return {
    id: u.id,
    name: u.name,
    status: u.status,
    current_tenant_id: u.current_tenant_id ?? null,
    current_ledger_id: u.current_ledger_id ?? null,
    unit_type: u.unit_type?.name ?? null,
    size: u.size ?? null,
    price: u.price ?? null,
  };
}

function summarizeLedger(l) {
  return {
    id: l.id,
    status: l.status ?? null,
    moved_in_at: l.moved_in_at ?? l.move_in_date ?? null,
    moved_out_at: l.moved_out_at ?? l.move_out_date ?? null,
    tenant_id: l.tenant?.id ?? l.tenant_id ?? null,
    tenant_email: l.tenant?.email ?? null,
    tenant_name: [l.tenant?.first_name, l.tenant?.last_name].filter(Boolean).join(' ') || null,
    unit_id: l.unit?.id ?? l.unit_id ?? null,
    unit_name: l.unit?.name ?? null,
  };
}

function section(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

(async () => {
  console.log('Storable occupancy probe');
  console.log(`  baseUrl:    ${baseUrl}`);
  console.log(`  facility:   ${facilityId}`);
  console.log(`  focus unit: ${focusUnit}`);
  console.log(`  focus tenant substring: ${focusTenant}`);

  section('Fetching collections (paginated, same as StoredgeProvider)');
  const [units, tenants, ledgers] = await Promise.all([
    fetchAllPages('units', 'units'),
    fetchAllPages('tenants/current', 'tenants'),
    fetchAllPages('ledgers/current', 'ledgers'),
  ]);
  console.log(`  units:   ${units.length}`);
  console.log(`  tenants: ${tenants.length}`);
  console.log(`  ledgers: ${ledgers.length}`);

  const tenantsById = new Map(tenants.map((t) => [t.id, t]));
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const ledgersByTenant = new Map();
  const ledgersByUnit = new Map();
  for (const ledger of ledgers) {
    const tid = ledger.tenant?.id ?? ledger.tenant_id;
    const uid = ledger.unit?.id ?? ledger.unit_id;
    if (tid) {
      const list = ledgersByTenant.get(tid) || [];
      list.push(ledger);
      ledgersByTenant.set(tid, list);
    }
    if (uid) {
      const list = ledgersByUnit.get(uid) || [];
      list.push(ledger);
      ledgersByUnit.set(uid, list);
    }
  }

  // What BluLok's StoredgeProvider would produce
  const mappedTenants = tenants.map((tenant) => {
    const tenantLedgers = ledgersByTenant.get(tenant.id) || [];
    return {
      externalId: tenant.id,
      email: tenant.email,
      firstName: tenant.first_name,
      lastName: tenant.last_name,
      phone: primaryPhone(tenant),
      unitIds: tenantLedgers.map((l) => l.unit?.id ?? l.unit_id).filter(Boolean),
      unitNumbers: tenantLedgers
        .map((l) => l.unit?.name ?? unitsById.get(l.unit?.id ?? l.unit_id)?.name)
        .filter(Boolean),
      status: tenant.active ? 'active' : 'inactive',
    };
  });
  const mappedUnits = units.map((unit) => ({
    externalId: unit.id,
    unitNumber: unit.name,
    unitType: unit.unit_type?.name ?? '',
    size: unit.size,
    status: unit.status === 'vacant' ? 'available' : unit.status,
    tenantId: unit.current_tenant_id ?? null,
    monthlyRate: unit.price,
  }));

  section(`Focus unit "${focusUnit}"`);
  const focusUnits = units.filter(matchesFocusUnit);
  if (focusUnits.length === 0) {
    console.log('  No unit matched. Nearby names:');
    for (const u of units.filter((x) => String(x.name || '').includes('101')).slice(0, 10)) {
      console.log(`    - ${u.name} (${u.id}) status=${u.status}`);
    }
  } else {
    for (const u of focusUnits) {
      console.log('  raw unit summary:', JSON.stringify(summarizeUnit(u), null, 2));
      console.log('  BluLok-mapped unit:', JSON.stringify(
        mappedUnits.find((m) => m.externalId === u.id),
        null,
        2,
      ));
      const unitLedgers = ledgersByUnit.get(u.id) || [];
      console.log(`  ledgers/current for this unit (${unitLedgers.length}):`);
      for (const l of unitLedgers) {
        console.log('   ', JSON.stringify(summarizeLedger(l)));
      }
      if (u.current_tenant_id) {
        const ct = tenantsById.get(u.current_tenant_id);
        console.log(
          `  current_tenant_id resolves to: ${ct ? tenantLabel(ct) : `(not in tenants/current) ${u.current_tenant_id}`}`,
        );
      }
    }
  }

  section(`Focus tenant matching "${focusTenant}"`);
  const focusTenants = tenants.filter(matchesFocusTenant);
  if (focusTenants.length === 0) {
    console.log('  No tenant matched. Showing first 15 tenants for orientation:');
    for (const t of tenants.slice(0, 15)) console.log(`    - ${tenantLabel(t)}`);
  } else {
    for (const t of focusTenants) {
      console.log(`  ${tenantLabel(t)}`);
      console.log('  phones:', JSON.stringify(t.phone_numbers || []));
      console.log('  active:', t.active);
      const mapped = mappedTenants.find((m) => m.externalId === t.id);
      console.log('  BluLok-mapped tenant:', JSON.stringify(mapped, null, 2));
      const tenantLedgers = ledgersByTenant.get(t.id) || [];
      console.log(`  ledgers/current for this tenant (${tenantLedgers.length}):`);
      for (const l of tenantLedgers) {
        console.log('   ', JSON.stringify(summarizeLedger(l)));
      }
      // Units that claim this tenant via current_tenant_id
      const claimedByUnits = units.filter((u) => u.current_tenant_id === t.id);
      console.log(`  units with current_tenant_id=${t.id} (${claimedByUnits.length}):`);
      for (const u of claimedByUnits) {
        console.log('   ', JSON.stringify(summarizeUnit(u)));
      }
    }
  }

  section('Cross-source mismatches (root cause of assign ↔ unassign flip-flops)');
  const mismatches = [];

  for (const unit of units) {
    const unitLedgers = ledgersByUnit.get(unit.id) || [];
    const ledgerTenantIds = new Set(
      unitLedgers.map((l) => l.tenant?.id ?? l.tenant_id).filter(Boolean),
    );
    const currentTenantId = unit.current_tenant_id || null;
    const isVacant = unit.status === 'vacant' || unit.status === 'available';
    const isOccupied = unit.status === 'occupied' || (!isVacant && currentTenantId);

    if (currentTenantId && !ledgerTenantIds.has(currentTenantId)) {
      mismatches.push({
        kind: 'unit_claims_tenant_without_ledger',
        unit: unit.name,
        unitId: unit.id,
        unitStatus: unit.status,
        currentTenantId,
        ledgerTenantIds: [...ledgerTenantIds],
        note:
          'units says this tenant holds the unit, but ledgers/current has no matching ledger. ' +
          'BluLok unit_updated may assign them; next sync tenant_unit_changed may unassign (no ledger).',
      });
    }

    if (isOccupied && ledgerTenantIds.size === 0) {
      mismatches.push({
        kind: 'occupied_without_any_ledger',
        unit: unit.name,
        unitId: unit.id,
        unitStatus: unit.status,
        currentTenantId,
        note: 'Unit looks occupied but has zero current ledgers.',
      });
    }

    if (isVacant && ledgerTenantIds.size > 0) {
      mismatches.push({
        kind: 'vacant_with_ledger',
        unit: unit.name,
        unitId: unit.id,
        unitStatus: unit.status,
        currentTenantId,
        ledgerTenantIds: [...ledgerTenantIds],
        note:
          'Unit is vacant but ledgers/current still list tenant(s). ' +
          'BluLok may assign from ledgers, then vacant unit_updated kicks them out on the next sync.',
      });
    }

    for (const tid of ledgerTenantIds) {
      if (currentTenantId && tid !== currentTenantId) {
        mismatches.push({
          kind: 'ledger_tenant_differs_from_current_tenant_id',
          unit: unit.name,
          unitId: unit.id,
          unitStatus: unit.status,
          currentTenantId,
          ledgerTenantId: tid,
          note: 'Ledger tenant ≠ unit.current_tenant_id.',
        });
      }
    }
  }

  // Tenants whose ledger units disagree with units that claim them
  for (const tenant of tenants) {
    const ledgerUnitIds = new Set(
      (ledgersByTenant.get(tenant.id) || [])
        .map((l) => l.unit?.id ?? l.unit_id)
        .filter(Boolean),
    );
    const claimedUnitIds = new Set(
      units.filter((u) => u.current_tenant_id === tenant.id).map((u) => u.id),
    );
    for (const uid of claimedUnitIds) {
      if (!ledgerUnitIds.has(uid)) {
        // Already covered by unit_claims_tenant_without_ledger — skip duplicate noise
      }
    }
    for (const uid of ledgerUnitIds) {
      const u = unitsById.get(uid);
      if (u && u.current_tenant_id && u.current_tenant_id !== tenant.id) {
        mismatches.push({
          kind: 'ledger_points_to_unit_owned_by_someone_else',
          tenant: tenantLabel(tenant),
          unit: u.name,
          unitId: u.id,
          unitCurrentTenantId: u.current_tenant_id,
          note: 'Tenant has a current ledger on a unit whose current_tenant_id is someone else.',
        });
      }
    }
  }

  if (mismatches.length === 0) {
    console.log('  None — units.status / current_tenant_id agree with ledgers/current.');
  } else {
    console.log(`  Found ${mismatches.length} mismatch(es):\n`);
    for (const m of mismatches) {
      console.log(JSON.stringify(m, null, 2));
      console.log('');
    }
  }

  section('Focus-relevant slice of mismatches');
  const focusTenantIds = new Set(focusTenants.map((t) => t.id));
  const focusUnitIds = new Set(focusUnits.map((u) => u.id));
  const relevant = mismatches.filter(
    (m) =>
      focusUnitIds.has(m.unitId) ||
      focusTenantIds.has(m.currentTenantId) ||
      focusTenantIds.has(m.ledgerTenantId) ||
      (typeof m.tenant === 'string' && m.tenant.toLowerCase().includes(focusTenant)),
  );
  if (relevant.length === 0) {
    console.log('  No mismatches involving the focus unit/tenant.');
  } else {
    for (const m of relevant) console.log(JSON.stringify(m, null, 2), '\n');
  }

  section('What BluLok sync would conclude for the focus pair');
  for (const t of focusTenants) {
    const mapped = mappedTenants.find((m) => m.externalId === t.id);
    console.log(`  Tenant ${tenantLabel(t)}`);
    console.log(`    ledger-derived unitIds → ${JSON.stringify(mapped?.unitNumbers || [])}`);
  }
  for (const u of focusUnits) {
    const mapped = mappedUnits.find((m) => m.externalId === u.id);
    const holder = mapped?.tenantId ? tenantsById.get(mapped.tenantId) : null;
    console.log(`  Unit ${u.name}`);
    console.log(`    mapped status=${mapped?.status} tenantId=${mapped?.tenantId || 'null'}`);
    console.log(`    holder=${holder ? tenantLabel(holder) : '(none)'}`);
  }

  if (writeJson) {
    const outPath = path.join(__dirname, `storedge-occupancy-dump-${facilityId}.json`);
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          facilityId,
          focusUnit,
          focusTenant,
          counts: { units: units.length, tenants: tenants.length, ledgers: ledgers.length },
          mismatches,
          focusUnits: focusUnits.map(summarizeUnit),
          focusTenants: focusTenants.map((t) => ({
            id: t.id,
            email: t.email,
            first_name: t.first_name,
            last_name: t.last_name,
            active: t.active,
            phone_numbers: t.phone_numbers,
          })),
          focusLedgers: [
            ...focusUnits.flatMap((u) => ledgersByUnit.get(u.id) || []),
            ...focusTenants.flatMap((t) => ledgersByTenant.get(t.id) || []),
          ].map(summarizeLedger),
          mappedFocusTenants: mappedTenants.filter((m) => focusTenantIds.has(m.externalId)),
          mappedFocusUnits: mappedUnits.filter((m) => focusUnitIds.has(m.externalId)),
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${outPath}`);
  }

  console.log('\nDone.');
})().catch((err) => {
  console.error('\nProbe failed:', err.message || err);
  process.exit(1);
});
