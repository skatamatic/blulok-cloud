#!/usr/bin/env node
/**
 * Facility snapshot: users, units, locks, access control, gateways,
 * WS status, FMS config/sync/webhooks, and findings.
 */

import { parseFlagArgs, printJson } from './lib/cli-utils.mjs';
import { withAuth } from './lib/api-client.mjs';
import {
  analyzeFacilityInventory,
  displayName,
  fetchDevices,
  fetchFmsConfigs,
  fetchKeyShares,
  fetchFmsSyncHistory,
  fetchFmsWebhookEvents,
  fetchGateways,
  fetchUnits,
  fetchUsers,
  fetchWsStatus,
  lockSerial,
  lockStatus,
  resolveFacility,
  unitNumber,
} from './lib/inventory.mjs';
import { findingsSection, formatTs, reportHeader, writeReport } from './lib/report-utils.mjs';

const SPEC = {
  defaults: {
    env: undefined,
    facility: undefined,
    limit: 80,
    json: false,
    report: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--facility': { key: 'facility', takesValue: true },
    '--id': { key: 'facility', takesValue: true },
    '--limit': { key: 'limit', takesValue: true },
    '--json': { key: 'json' },
    '--report': { key: 'report' },
    '--out': { key: 'out', takesValue: true },
  },
};

async function inspectFacility(options) {
  if (!options.facility) throw new Error('Provide --facility <name|uuid>');

  return withAuth({ env: options.env }, async ({ config, api }) => {
    const facility = await resolveFacility(api, options.facility);
    const facilityId = facility.id;
    const limit = Number(options.limit) || 80;

    const [users, units, locks, accessControl, unassigned, gateways, sharesRes] = await Promise.all([
      fetchUsers(api, { facilityId, limit }),
      fetchUnits(api, { facilityId, limit }),
      fetchDevices(api, { facilityId, deviceType: 'blulok', limit }),
      fetchDevices(api, { facilityId, deviceType: 'access_control', limit }),
      fetchDevices(api, { facilityId, deviceType: 'blulok', unassigned: true, limit: 50 }),
      fetchGateways(api, { facilityId }),
      fetchKeyShares(api, { limit: 200 }).catch((err) => ({ shares: [], total: 0, error: String(err.message ?? err) })),
    ]);
    const unitIds = new Set(units.units.map((u) => u.id));
    const shares = {
      shares: (sharesRes.shares ?? []).filter((s) => unitIds.has(s.unit_id)),
      total: (sharesRes.shares ?? []).filter((s) => unitIds.has(s.unit_id)).length,
      error: sharesRes.error,
    };

    let wsStatus = null;
    let wsStatusError = null;
    try {
      wsStatus = await fetchWsStatus(api, facilityId);
    } catch (err) {
      wsStatusError = String(err.message ?? err);
    }

    let fms = { configs: [] };
    try {
      fms = await fetchFmsConfigs(api, { facilityId });
    } catch (err) {
      fms = { configs: [], error: String(err.message ?? err) };
    }

    const fmsConfig = fms.configs?.[0] ?? null;
    let syncLogs = [];
    let webhookEvents = [];
    if (fmsConfig) {
      try {
        syncLogs = (await fetchFmsSyncHistory(api, facilityId, { limit: 8 })).logs;
      } catch (err) {
        syncLogs = [{ error: String(err.message ?? err) }];
      }
      try {
        webhookEvents = (await fetchFmsWebhookEvents(api, facilityId, { limit: 8 })).events;
      } catch (err) {
        webhookEvents = [{ error: String(err.message ?? err) }];
      }
    }

    const findings = analyzeFacilityInventory({
      facility,
      users: users.users,
      units: units.units,
      locks: locks.devices,
      accessControl: accessControl.devices,
      unassigned: unassigned.devices,
      gateways: gateways.gateways,
      wsStatus,
      fms: fmsConfig,
      syncLogs,
    });

    return {
      config,
      facility,
      users,
      units,
      locks,
      accessControl,
      unassigned,
      shares,
      gateways,
      wsStatus,
      wsStatusError,
      fms: fmsConfig,
      fmsError: fms.error,
      syncLogs,
      webhookEvents,
      findings,
    };
  });
}

function renderReport(ctx) {
  const f = ctx.facility;
  const lines = [
    reportHeader('Facility snapshot', ctx.config, {
      Facility: `${f.name ?? '—'} (\`${f.id}\`)`,
      Status: f.status ?? '—',
      Address: [f.address, f.city, f.state].filter(Boolean).join(', ') || '—',
    }),
  ];

  lines.push('## Counts', '');
  lines.push('| Kind | Count |');
  lines.push('|------|-------|');
  lines.push(`| users | ${ctx.users.total} |`);
  lines.push(`| units | ${ctx.units.total} |`);
  lines.push(`| BluLoks | ${ctx.locks.total} |`);
  lines.push(`| access control | ${ctx.accessControl.total} |`);
  lines.push(`| unassigned locks | ${ctx.unassigned.total} |`);
  lines.push(`| gateways | ${ctx.gateways.total} |`);
  lines.push(`| key shares | ${ctx.shares?.total ?? 0} |`);
  lines.push('');

  lines.push('## Users', '');
  if (!ctx.users.users.length) lines.push('_None._', '');
  for (const u of ctx.users.users.slice(0, 40)) {
    lines.push(`- **${displayName(u)}** \`${u.role}\` — ${u.email ?? '—'} (\`${u.id}\`)`);
  }
  if (ctx.users.users.length > 40) lines.push(`- … ${ctx.users.users.length - 40} more`);
  lines.push('');

  lines.push('## Units', '');
  if (!ctx.units.units.length) lines.push('_None._', '');
  for (const u of ctx.units.units.slice(0, 50)) {
    const serial = lockSerial(u) ?? 'no lock';
    const tenant = u.tenant_name ?? u.primary_tenant_name ?? u.tenant_email ?? 'vacant';
    lines.push(`- **${unitNumber(u)}** — ${tenant} — \`${serial}\` (${lockStatus(u)})`);
  }
  if (ctx.units.units.length > 50) lines.push(`- … ${ctx.units.units.length - 50} more`);
  lines.push('');

  if (ctx.shares?.shares?.length) {
    lines.push('## Key shares', '');
    for (const s of ctx.shares.shares.slice(0, 20)) {
      lines.push(
        `- unit \`${s.unit_id}\` owner \`${s.primary_tenant_id}\` → \`${s.shared_with_user_id}\` (${s.access_level ?? '—'})`,
      );
    }
    lines.push('');
  }

  lines.push('## Gateways', '');
  if (!ctx.gateways.gateways.length) lines.push('_None._', '');
  for (const g of ctx.gateways.gateways) {
    lines.push(`- **${g.name ?? g.id}** \`${g.status ?? '—'}\` last_seen ${formatTs(g.last_seen)} (\`${g.id}\`)`);
  }
  lines.push('');
  if (ctx.wsStatus) {
    const connected = ctx.wsStatus.connected ?? ctx.wsStatus.isConnected;
    lines.push(`- WS connected: **${connected === true ? 'yes' : connected === false ? 'no' : 'unknown'}**`);
    if (ctx.wsStatus.lastPongAt) lines.push(`- last pong: ${formatTs(ctx.wsStatus.lastPongAt)}`);
    lines.push('');
  } else if (ctx.wsStatusError) {
    lines.push(`- WS status error: ${ctx.wsStatusError}`, '');
  }

  lines.push('## FMS', '');
  if (ctx.fmsError) {
    lines.push(`_Error: ${ctx.fmsError}_`, '');
  } else if (!ctx.fms) {
    lines.push('_No FMS configuration._', '');
  } else {
    lines.push(`- **provider:** ${ctx.fms.provider_type ?? '—'}`);
    lines.push(`- **enabled:** ${ctx.fms.is_enabled}`);
    lines.push(`- **webhooks:** ${ctx.fms.supports_webhooks ?? '—'}`);
    lines.push(`- **webhook auth:** ${ctx.fms.webhook_auth_mode ?? '—'}`);
    lines.push(`- **last sync:** ${ctx.fms.last_sync_status ?? '—'} ${ctx.fms.last_sync_at ? `(${formatTs(ctx.fms.last_sync_at)})` : ''}`);
    lines.push('');
  }

  if (ctx.syncLogs?.length && !ctx.syncLogs[0]?.error) {
    lines.push('### Recent syncs', '');
    for (const log of ctx.syncLogs.slice(0, 6)) {
      lines.push(
        `- ${formatTs(log.started_at ?? log.created_at)} — ${log.status ?? log.sync_status ?? '—'} (\`${log.id}\`)`,
      );
    }
    lines.push('');
  }

  if (ctx.webhookEvents?.length && !ctx.webhookEvents[0]?.error) {
    lines.push('### Recent webhooks', '');
    for (const ev of ctx.webhookEvents.slice(0, 6)) {
      lines.push(
        `- ${formatTs(ev.received_at ?? ev.created_at ?? ev.time)} — ${ev.event_type ?? ev.type ?? '—'} — ${ev.status ?? '—'}`,
      );
    }
    lines.push('');
  }

  lines.push(findingsSection(ctx.findings));
  lines.push('## Follow-up', '');
  lines.push('```bash');
  lines.push(`node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs list --facility ${f.id}`);
  lines.push(`node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs gateway --facility ${f.id} --ws-status --telemetry`);
  lines.push(`node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs access --facility ${f.id} --limit 15`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function printText(ctx) {
  process.stdout.write(renderReport(ctx));
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node inspect-facility.mjs --facility "621 Sandbox" --report
  node inspect-facility.mjs --facility <uuid> --json
`);
    process.exit(0);
  }

  const ctx = await inspectFacility(options);
  if (options.report) writeReport(renderReport(ctx), options.out);
  else if (options.json) {
    printJson({
      deployment: ctx.config.envName,
      facility: ctx.facility,
      counts: {
        users: ctx.users.total,
        units: ctx.units.total,
        locks: ctx.locks.total,
        accessControl: ctx.accessControl.total,
        unassigned: ctx.unassigned.total,
        gateways: ctx.gateways.total,
      },
      users: ctx.users.users,
      units: ctx.units.units,
      locks: ctx.locks.devices,
      accessControl: ctx.accessControl.devices,
      unassigned: ctx.unassigned.devices,
      shares: ctx.shares?.shares,
      gateways: ctx.gateways.gateways,
      wsStatus: ctx.wsStatus,
      fms: ctx.fms,
      syncLogs: ctx.syncLogs,
      webhookEvents: ctx.webhookEvents,
      findings: ctx.findings,
    });
  } else {
    printText(ctx);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
