#!/usr/bin/env node
/**
 * Investigate gateway connectivity, telemetry, and session trace dumps.
 */

import { buildQuery, withAuth } from './lib/api-client.mjs';
import { renderTraceSummary } from './lib/access-analysis.mjs';
import { parseFlagArgs, printJson, printTable } from './lib/cli-utils.mjs';
import { resolveFacilityGateways } from './lib/gateway-resolve.mjs';
import { sanitizeConfig } from './lib/load-deploy-config.mjs';
import {
  findingsSection,
  formatTs,
  reportHeader,
  summarizeTelemetryLog,
  summarizeSyncLog,
  writeReport,
} from './lib/report-utils.mjs';

const SPEC = {
  defaults: {
    env: undefined,
    gatewayId: undefined,
    facilityId: undefined,
    userId: undefined,
    unitId: undefined,
    deviceId: undefined,
    trace: false,
    telemetry: false,
    syncLogs: false,
    wsStatus: false,
    ping: false,
    search: undefined,
    limit: 30,
    report: false,
    json: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--gateway': { key: 'gatewayId', takesValue: true },
    '--facility': { key: 'facilityId', takesValue: true },
    '--user': { key: 'userId', takesValue: true },
    '--unit': { key: 'unitId', takesValue: true },
    '--device': { key: 'deviceId', takesValue: true },
    '--trace': { key: 'trace' },
    '--telemetry': { key: 'telemetry' },
    '--sync-logs': { key: 'syncLogs' },
    '--ws-status': { key: 'wsStatus' },
    '--ping': { key: 'ping' },
    '--search': { key: 'search', takesValue: true },
    '--limit': { key: 'limit', takesValue: true },
    '--report': { key: 'report' },
    '--json': { key: 'json' },
    '--out': { key: 'out', takesValue: true },
  },
};

async function resolveGateway(api, options) {
  if (options.gatewayId) {
    const res = await api(`/gateways/${options.gatewayId}`);
    const gateway = res.gateway ?? res;
    const facilityId = options.facilityId ?? gateway?.facility_id;
    const siblings = facilityId ? (await resolveFacilityGateways(api, { facilityId })).gateways : [gateway];
    return { gateway, gateways: siblings.length ? siblings : [gateway].filter(Boolean) };
  }
  if (!options.facilityId) return { gateway: null, gateways: [] };
  const resolved = await resolveFacilityGateways(api, {
    facilityId: options.facilityId,
    deviceId: options.deviceId,
  });
  return resolved;
}

function analyze(context) {
  const findings = [];
  const gw = context.gateway;
  if (!gw && !context.wsStatus) {
    findings.push({ severity: 'error', code: 'gateway_not_found', message: 'Gateway not found for the given id/facility.' });
    return findings;
  }

  if (context.wsStatus) {
    const connected = context.wsStatus.connected ?? context.wsStatus.isConnected;
    if (connected === false) {
      findings.push({
        severity: 'likely_root_cause',
        code: 'gateway_disconnected',
        message: 'Gateway WebSocket is not connected for this facility.',
      });
    } else if (connected === true) {
      findings.push({ severity: 'info', code: 'gateway_connected', message: 'Gateway WebSocket is connected.' });
    }
    if (context.wsStatus.lastPongAt) {
      const ageMs = Date.now() - Number(context.wsStatus.lastPongAt);
      if (ageMs > 120_000) {
        findings.push({
          severity: 'warning',
          code: 'stale_pong',
          message: `Last WS pong was ${Math.round(ageMs / 1000)}s ago — connection may be stale.`,
        });
      }
    }
  }

  const snapshot = context.trace?.snapshot;
  if (snapshot?.pending_attributions?.length) {
    findings.push({
      severity: 'warning',
      code: 'pending_commands',
      message: `${snapshot.pending_attributions.length} pending gateway command(s) on this Cloud Run instance.`,
    });
  }

  if (context.telemetry && context.telemetry.logs?.length === 0) {
    findings.push({
      severity: 'info',
      code: 'no_telemetry',
      message: 'No telemetry logs matched — widen --limit, adjust --search, or expand time window.',
    });
  }

  const recentErrors = (context.telemetry?.logs ?? []).filter((log) => {
    const text = JSON.stringify(log).toLowerCase();
    return text.includes('error') || text.includes('fail') || text.includes('timeout');
  });
  if (recentErrors.length) {
    findings.push({
      severity: 'warning',
      code: 'telemetry_errors',
      message: `${recentErrors.length} telemetry log(s) mention error/fail/timeout.`,
    });
  }

  if (context.syncLogs?.logs?.length) {
    const failed = context.syncLogs.logs.filter((l) => String(l.status).toLowerCase().includes('fail'));
    if (failed.length) {
      findings.push({
        severity: 'warning',
        code: 'sync_failures',
        message: `${failed.length} recent device sync log(s) report failure.`,
      });
    }
  }

  if (context.gateways?.length > 1) {
    findings.push({
      severity: 'info',
      code: 'multi_gateway_facility',
      message: `Facility has ${context.gateways.length} gateways. Using primary \`${context.gateway?.id}\` — pass --gateway to inspect another.`,
    });
  }

  return findings;
}

function renderReport(context) {
  const parts = [reportHeader('Gateway investigation report', context.config)];

  if (context.gateways?.length) {
    parts.push(`## Facility gateways (${context.gateways.length})`);
    parts.push('');
    parts.push('| Name | Status | Last seen | ID |');
    parts.push('|------|--------|-----------|-----|');
    for (const g of context.gateways) {
      const mark = g.id === context.gateway?.id ? ' ← primary' : '';
      parts.push(
        `| ${g.name ?? '—'} | ${g.status ?? '—'} | ${formatTs(g.last_seen)} | \`${g.id}\`${mark} |`,
      );
    }
    parts.push('');
  } else if (context.gateway) {
    const g = context.gateway;
    parts.push('## Gateway');
    parts.push('');
    parts.push(`- **ID:** \`${g.id}\``);
    parts.push(`- **Name:** ${g.name ?? '—'}`);
    parts.push(`- **Facility:** \`${g.facility_id ?? '—'}\``);
    parts.push(`- **Status:** ${g.status ?? '—'}`);
    parts.push(`- **Firmware:** ${g.firmware_version ?? '—'}`);
    parts.push(`- **Last seen:** ${formatTs(g.last_seen)}`);
    parts.push('');
  }

  if (context.wsStatus) {
    parts.push('## WebSocket status');
    parts.push('');
    parts.push(`- Connected: **${context.wsStatus.connected ?? 'unknown'}**`);
    if (context.wsStatus.lastPongAt) {
      parts.push(`- Last pong: ${formatTs(context.wsStatus.lastPongAt)}`);
    }
    parts.push('');
  }

  if (context.trace?.snapshot) {
    parts.push(renderTraceSummary(context.trace.snapshot));
  }

  if (context.telemetry?.logs?.length) {
    parts.push(`## Telemetry (${context.telemetry.total ?? context.telemetry.logs.length} total)`);
    parts.push('');
    for (const log of context.telemetry.logs.slice(0, 15)) {
      const s = summarizeTelemetryLog(log);
      parts.push(`- ${s.at} [${s.source}] ${s.summary}`);
    }
    parts.push('');
  }

  if (context.syncLogs?.logs?.length) {
    parts.push('## Device sync logs');
    parts.push('');
    for (const log of context.syncLogs.logs.slice(0, 8)) {
      parts.push(`- ${formatTs(log.created_at)} **${log.sync_kind ?? log.status ?? '—'}** ${summarizeSyncLog(log)}`);
    }
    parts.push('');
  }

  if (context.pingResult) {
    parts.push('## Gateway ping');
    parts.push('');
    parts.push('```json');
    parts.push(JSON.stringify(context.pingResult, null, 2));
    parts.push('```');
    parts.push('');
  }

  parts.push(findingsSection(context.findings));
  return parts.join('\n');
}

async function investigate(options) {
  return withAuth({ env: options.env }, async ({ config, api }) => {
    const context = { config };
    const runAll = !options.trace && !options.telemetry && !options.syncLogs && !options.wsStatus && !options.ping;

    const resolved = await resolveGateway(api, options);
    context.gateway = resolved.gateway;
    context.gateways = resolved.gateways ?? (resolved.gateway ? [resolved.gateway] : []);
    const gatewayId = context.gateway?.id ?? options.gatewayId;
    const facilityId = options.facilityId ?? context.gateway?.facility_id;

    if ((options.wsStatus || runAll) && facilityId) {
      context.wsStatus = await api(`/gateways/status/${facilityId}`);
    }

    if (gatewayId && (options.trace || runAll)) {
      const qs = buildQuery({
        user_id: options.userId,
        unit_id: options.unitId,
        device_id: options.deviceId,
      });
      context.trace = await api(`/gateways/${gatewayId}/session-trace${qs}`);
    }

    if (gatewayId && (options.telemetry || runAll)) {
      const qs = buildQuery({
        limit: options.limit,
        search: options.search,
      });
      context.telemetry = await api(`/gateways/${gatewayId}/telemetry-logs${qs}`);
    }

    if (gatewayId && (options.syncLogs || runAll)) {
      const qs = buildQuery({ limit: Math.min(Number(options.limit) || 20, 100) });
      context.syncLogs = await api(`/gateways/${gatewayId}/device-sync-logs${qs}`);
    }

    if (options.ping && facilityId) {
      context.pingResult = await api('/admin/dev-tools/gateway-ping', {
        method: 'POST',
        body: { facilityId },
      });
    }

    context.findings = analyze(context);
    return context;
  });
}

function printSummary(context) {
  console.log(`Deployment: ${context.config.envName}\n`);

  if (context.gateways?.length) {
    console.log(`Gateways (${context.gateways.length}):`);
    printTable(
      context.gateways.map((g) => ({
        ...g,
        pick: g.id === context.gateway?.id ? '*' : '',
      })),
      [
        { key: 'pick', label: '' },
        { key: 'id', label: 'id', maxWidth: 36 },
        { key: 'name', label: 'name' },
        { key: 'status', label: 'status' },
        { key: 'firmware_version', label: 'fw' },
      ],
    );
    console.log('');
  }

  if (context.wsStatus) {
    console.log(`WebSocket: connected=${context.wsStatus.connected}, lastPong=${formatTs(context.wsStatus.lastPongAt)}\n`);
  }

  if (context.telemetry?.logs?.length) {
    console.log(`Telemetry (${context.telemetry.total ?? context.telemetry.logs.length} total):`);
    printTable(
      context.telemetry.logs.slice(0, 15).map(summarizeTelemetryLog),
      [
        { key: 'at', label: 'at', maxWidth: 24 },
        { key: 'source', label: 'source' },
        { key: 'summary', label: 'summary', maxWidth: 60 },
      ],
    );
    console.log('');
  }

  if (context.findings?.length) {
    console.log('Findings:');
    for (const f of context.findings) console.log(`  [${f.severity}] ${f.code ?? ''} ${f.message}`);
  }
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node investigate-gateway.mjs --gateway <uuid> [--trace] [--telemetry] [--sync-logs]
  node investigate-gateway.mjs --facility <uuid> --ws-status --report
  node investigate-gateway.mjs --gateway <uuid> --telemetry --search "unlock"
`);
    process.exit(0);
  }

  if (!options.gatewayId && !options.facilityId) {
    console.error('Provide --gateway <uuid> and/or --facility <uuid>');
    process.exit(1);
  }

  const context = await investigate(options);

  if (options.report) writeReport(renderReport(context), options.out);
  else if (options.json) printJson({ ...context, config: sanitizeConfig(context.config) });
  else printSummary(context);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
