#!/usr/bin/env node
/**
 * Investigate access sessions and raw access events.
 */

import { buildQuery, withAuth } from './lib/api-client.mjs';
import {
  analyzeAccessContext,
  accessNextCommands,
  renderAccessReport,
} from './lib/access-analysis.mjs';
import { parseFlagArgs, printJson, printTable } from './lib/cli-utils.mjs';
import { resolveFacilityGateways } from './lib/gateway-resolve.mjs';
import { sanitizeConfig } from './lib/load-deploy-config.mjs';
import {
  commandsSection,
  findingsSection,
  nextStepsSection,
  reportHeader,
  sessionStartedAt,
  writeReport,
} from './lib/report-utils.mjs';

const SPEC = {
  defaults: {
    env: undefined,
    sessionId: undefined,
    userId: undefined,
    facilityId: undefined,
    unitId: undefined,
    deviceId: undefined,
    pending: false,
    raw: false,
    deep: false,
    limit: 25,
    report: false,
    json: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--session': { key: 'sessionId', takesValue: true },
    '--user': { key: 'userId', takesValue: true },
    '--facility': { key: 'facilityId', takesValue: true },
    '--unit': { key: 'unitId', takesValue: true },
    '--device': { key: 'deviceId', takesValue: true },
    '--pending': { key: 'pending' },
    '--raw': { key: 'raw' },
    '--deep': { key: 'deep' },
    '--limit': { key: 'limit', takesValue: true },
    '--report': { key: 'report' },
    '--json': { key: 'json' },
    '--out': { key: 'out', takesValue: true },
  },
};

async function resolveGateway(api, facilityId, deviceId) {
  const resolved = await resolveFacilityGateways(api, { facilityId, deviceId });
  return resolved;
}

async function investigate(options) {
  return withAuth({ env: options.env }, async ({ config, api }) => {
    const context = { config, facilityId: options.facilityId };

    if (options.sessionId) {
      context.sessionDetail = await api(`/access-sessions/${options.sessionId}`);
    }

    const sessionFilters = {
      user_id: options.userId,
      facility_id: options.facilityId,
      unit_id: options.unitId,
      device_id: options.deviceId,
      state: options.pending ? 'pending' : undefined,
      limit: options.limit,
      sort_order: 'desc',
    };

    if (!options.sessionId || options.userId || options.facilityId) {
      const qs = buildQuery(sessionFilters);
      const res = await api(`/access-sessions${qs}`);
      context.sessions = res.sessions ?? [];
      context.sessionTotal = res.total;
      context.currentlyOpen = res.currently_open;
    }

    if (options.raw) {
      const qs = buildQuery({
        view: 'raw',
        user_id: options.userId,
        facility_id: options.facilityId,
        unit_id: options.unitId,
        device_id: options.deviceId,
        limit: options.limit,
        sort_order: 'desc',
      });
      const res = await api(`/access-history${qs}`);
      context.rawEvents = res.logs ?? res.events ?? res.data ?? [];
    }

    const session = context.sessionDetail?.session;
    if ((options.deep || options.report) && session?.facility_id) {
      const resolved = await resolveGateway(api, session.facility_id, session.device_id);
      context.gateway = resolved.gateway;
      context.gateways = resolved.gateways;
      context.wsStatus = await api(`/gateways/status/${session.facility_id}`);
      if (context.gateway?.id) {
        context.gatewayTrace = await api(
          `/gateways/${context.gateway.id}/session-trace${buildQuery({
            user_id: session.user_id,
            device_id: session.device_id,
            unit_id: session.unit_id,
          })}`,
        );
      }
    }

    context.findings = analyzeAccessContext(context);
    return context;
  });
}

function renderReport(context) {
  const parts = [
    reportHeader('Access investigation report', context.config),
    renderAccessReport(context),
  ];

  if (context.rawEvents?.length) {
    parts.push('## Raw access events');
    parts.push('');
    for (const ev of context.rawEvents.slice(0, 15)) {
      parts.push(
        `- ${ev.occurred_at ?? ev.timestamp ?? '—'} ${ev.action ?? ev.action_type ?? 'event'} (${ev.method ?? '—'}) success=${ev.success ?? '—'}`,
      );
    }
    parts.push('');
  }

  parts.push(findingsSection(context.findings));
  parts.push(commandsSection('Follow-up commands', accessNextCommands(context)));
  return parts.join('\n');
}

function printSummary(context) {
  console.log(`Deployment: ${context.config.envName}\n`);

  if (context.sessionDetail?.session) {
    const s = context.sessionDetail.session;
    console.log('Session:');
    printTable([s], [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'state', label: 'state' },
      { key: 'outcome', label: 'outcome' },
      { key: 'user_name', label: 'user' },
      { key: 'unit_number', label: 'unit' },
      { key: 'method', label: 'method' },
    ]);
    console.log(`Started: ${sessionStartedAt(s) ?? '—'}`);
    if (context.sessionDetail.events?.length) {
      console.log(`\nTimeline (${context.sessionDetail.events.length} events):`);
      printTable(context.sessionDetail.events.slice(0, 20), [
        { key: 'occurred_at', label: 'at', maxWidth: 24 },
        { key: 'action', label: 'action' },
        { key: 'method', label: 'method' },
        { key: 'success', label: 'ok' },
      ]);
    }
    console.log('');
  }

  if (context.sessions?.length) {
    console.log(`Sessions (${context.sessionTotal ?? context.sessions.length} total):`);
    printTable(context.sessions, [
      { key: 'state', label: 'state' },
      { key: 'outcome', label: 'outcome' },
      { key: 'user_name', label: 'user' },
      { key: 'unit_number', label: 'unit' },
      { key: 'method', label: 'method' },
    ]);
    console.log('');
  }

  if (context.findings?.length) {
    console.log('Findings:');
    for (const f of context.findings) {
      console.log(`  [${f.severity}]${f.code ? ` ${f.code}:` : ''} ${f.message}`);
    }
  }
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node investigate-access.mjs --session <uuid> [--report] [--deep]
  node investigate-access.mjs --user <uuid> [--pending] [--raw]
  node investigate-access.mjs --facility <uuid> --limit 20 --report
`);
    process.exit(0);
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
