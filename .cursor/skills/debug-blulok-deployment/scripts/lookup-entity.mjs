#!/usr/bin/env node
/**
 * Look up users, facilities, units, and gateways by name/email/phone/id.
 *
 * Usage:
 *   node lookup-entity.mjs --user "realize"
 *   node lookup-entity.mjs --user-email test@example.com
 *   node lookup-entity.mjs --facility "621 Sandbox"
 *   node lookup-entity.mjs --unit 100 --facility-id <uuid>
 *   node lookup-entity.mjs --gateway --facility-id <uuid>
 *   node lookup-entity.mjs --id <uuid> --type user|facility|unit|gateway
 */

import { buildQuery, withAuth } from './lib/api-client.mjs';
import { parseFlagArgs, printJson, printTable } from './lib/cli-utils.mjs';
import { findingsSection, reportHeader, userDisplayName, writeReport } from './lib/report-utils.mjs';

const SPEC = {
  defaults: {
    env: undefined,
    user: undefined,
    userEmail: undefined,
    userPhone: undefined,
    facility: undefined,
    unit: undefined,
    gateway: undefined,
    facilityId: undefined,
    id: undefined,
    type: undefined,
    limit: 20,
    json: false,
    details: false,
    report: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--user': { key: 'user', takesValue: true },
    '--user-email': { key: 'userEmail', takesValue: true },
    '--user-phone': { key: 'userPhone', takesValue: true },
    '--facility': { key: 'facility', takesValue: true },
    '--unit': { key: 'unit', takesValue: true },
    '--gateway': { key: 'gateway', takesValue: true },
    '--facility-id': { key: 'facilityId', takesValue: true },
    '--id': { key: 'id', takesValue: true },
    '--type': { key: 'type', takesValue: true },
    '--limit': { key: 'limit', takesValue: true },
    '--json': { key: 'json' },
    '--details': { key: 'details' },
    '--report': { key: 'report' },
    '--out': { key: 'out', takesValue: true },
  },
};

function normalizeSearchTerm(...parts) {
  return parts.filter(Boolean).join(' ').trim();
}

function filterGateways(gateways, term, facilityId) {
  let list = gateways;
  if (facilityId) list = list.filter((g) => g.facility_id === facilityId);
  if (!term) return list;
  const q = term.toLowerCase();
  return list.filter((g) => {
    const hay = [
      g.id,
      g.name,
      g.hostname,
      g.facility_id,
      g.facility_name,
      g.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

async function lookupById(api, id, type, details) {
  const pathByType = {
    user: `/users/${id}`,
    facility: `/facilities/${id}`,
    unit: `/units/${id}`,
    gateway: `/gateways/${id}`,
  };
  const suffix = pathByType[type];
  if (!suffix) throw new Error(`Unknown --type "${type}". Use user|facility|unit|gateway.`);

  const result = { type, id, record: await api(suffix) };
  if (type === 'user' && details) {
    try {
      result.details = await api(`/users/${id}/details`);
    } catch (err) {
      result.detailsError = String(err.message ?? err);
    }
  }
  return result;
}

async function runLookup(options) {
  return withAuth({ env: options.env }, async ({ config, api }) => {
    const results = { deployment: config.envName, apiBase: config.apiBase, matches: {} };

    if (options.id) {
      const type = options.type ?? 'user';
      results.matches.byId = await lookupById(api, options.id, type, options.details);
      return results;
    }

    const searchTerm = normalizeSearchTerm(
      options.user,
      options.userEmail,
      options.userPhone,
    );

    if (searchTerm || options.userEmail || options.userPhone) {
      const term = searchTerm || options.userEmail || options.userPhone;
      const qs = buildQuery({ search: term, limit: options.limit });
      const res = await api(`/users${qs}`);
      results.matches.users = res.users ?? res.data ?? [];
      if (options.details && results.matches.users.length === 1) {
        results.matches.userDetails = await api(`/users/${results.matches.users[0].id}/details`);
      }
    }

    if (options.facility) {
      const qs = buildQuery({ search: options.facility, limit: options.limit });
      const res = await api(`/facilities${qs}`);
      results.matches.facilities = res.facilities ?? [];
    }

    if (options.unit) {
      const qs = buildQuery({
        search: options.unit,
        facility_id: options.facilityId,
        limit: options.limit,
      });
      const res = await api(`/units${qs}`);
      results.matches.units = res.units ?? [];
    }

    if (options.gateway !== undefined || options.facilityId) {
      const res = await api('/gateways');
      const term = typeof options.gateway === 'string' ? options.gateway : '';
      results.matches.gateways = filterGateways(res.gateways ?? [], term, options.facilityId).slice(
        0,
        Number(options.limit) || 20,
      );
    }

    const hasQuery =
      searchTerm ||
      options.userEmail ||
      options.userPhone ||
      options.facility ||
      options.unit ||
      options.gateway !== undefined ||
      options.facilityId;
    if (!hasQuery) {
      throw new Error(
        'Provide a lookup: --user, --facility, --unit, --gateway, or --id with --type',
      );
    }

    return results;
  });
}

function printSummary(results) {
  console.log(`Deployment: ${results.deployment} (${results.apiBase})\n`);

  if (results.matches.byId) {
    printJson(results.matches.byId);
    return;
  }

  if (results.matches.users?.length) {
    console.log('Users:');
    printTable(results.matches.users, [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'first_name', label: 'first' },
      { key: 'last_name', label: 'last' },
      { key: 'email', label: 'email', maxWidth: 32 },
      { key: 'role', label: 'role' },
      { key: 'phone_number', label: 'phone' },
    ]);
    console.log('');
  }

  if (results.matches.facilities?.length) {
    console.log('Facilities:');
    printTable(results.matches.facilities, [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'name', label: 'name' },
      { key: 'status', label: 'status' },
      { key: 'city', label: 'city' },
    ]);
    console.log('');
  }

  if (results.matches.units?.length) {
    console.log('Units:');
    printTable(results.matches.units, [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'unit_number', label: 'unit' },
      { key: 'facility_name', label: 'facility' },
      { key: 'lock_status', label: 'lock' },
    ]);
    console.log('');
  }

  if (results.matches.gateways?.length) {
    console.log('Gateways:');
    printTable(results.matches.gateways, [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'name', label: 'name' },
      { key: 'facility_id', label: 'facility_id', maxWidth: 36 },
      { key: 'status', label: 'status' },
    ]);
  }

  const total =
    (results.matches.users?.length ?? 0) +
    (results.matches.facilities?.length ?? 0) +
    (results.matches.units?.length ?? 0) +
    (results.matches.gateways?.length ?? 0);
  if (!total) console.log('No matches.');
}

function renderUserReport(results) {
  const details = results.matches.userDetails?.user ?? results.matches.byId?.details?.user;
  const user = details ?? results.matches.byId?.record?.user ?? results.matches.users?.[0];
  const config = {
    label: results.deployment,
    envName: results.deployment,
    apiBase: results.apiBase,
  };
  if (!user) {
    return `${reportHeader('Entity lookup report', config)}\nNo user found.\n`;
  }

  const lines = [reportHeader('User entitlement report', config, {
    User: `${userDisplayName(user)} (\`${user.id ?? user.user?.id}\`)`,
    Email: user.email ?? '—',
    Role: user.role ?? '—',
  })];

  lines.push('## App devices');
  lines.push('');
  for (const d of user.devices ?? []) {
    lines.push(`- **${d.platform}** ${d.device_name ?? d.app_device_id} — \`${d.status}\`${d.public_key ? ` — key \`${d.public_key.slice(0, 12)}…\`` : ''}`);
  }
  if (!(user.devices?.length)) lines.push('- (none registered)');
  lines.push('');

  lines.push('## Unit access');
  lines.push('');
  for (const fac of user.facilities ?? []) {
    lines.push(`### ${fac.facility_name} (\`${fac.facility_id}\`)`);
    for (const unit of fac.units ?? []) {
      const serial = unit.device?.device_serial ?? 'no lock';
      const lock = unit.device?.lock_status ?? '—';
      lines.push(`- Unit **${unit.unitNumber}** — lock \`${serial}\` (${lock})${unit.isPrimary ? ' [primary]' : ' [co-tenant/share]'}`);
    }
    lines.push('');
  }

  const findings = [];
  const revoked = (user.devices ?? []).filter((d) => d.status === 'revoked');
  if (revoked.length) {
    findings.push({ severity: 'warning', code: 'revoked_devices', message: `${revoked.length} revoked app device(s) — route pass may reference stale key.` });
  }
  const unitsNoLock = (user.facilities ?? []).flatMap((f) => f.units ?? []).filter((u) => !u.device?.device_serial);
  if (unitsNoLock.length) {
    findings.push({ severity: 'likely_root_cause', code: 'units_without_lock', message: `${unitsNoLock.length} assigned unit(s) have no lock — tenant route pass aud will be empty.` });
  }
  lines.push(findingsSection(findings));

  lines.push('## Follow-up');
  lines.push('');
  lines.push('```bash');
  lines.push(`node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs route-pass --user ${user.id} --report`);
  lines.push(`node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs access --user ${user.id} --limit 10 --report`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node lookup-entity.mjs --user "First Last|email|phone"
  node lookup-entity.mjs --facility "621 Sandbox"
  node lookup-entity.mjs --unit 100 [--facility-id <uuid>]
  node lookup-entity.mjs --gateway [--facility-id <uuid>] [--gateway "name filter"]
  node lookup-entity.mjs --id <uuid> --type user [--details]
`);
    process.exit(0);
  }

  const results = await runLookup(options);
  if (options.report) writeReport(renderUserReport(results), options.out);
  else if (options.json) printJson(results);
  else printSummary(results);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
