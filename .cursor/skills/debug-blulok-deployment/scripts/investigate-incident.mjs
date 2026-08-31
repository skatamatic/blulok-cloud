#!/usr/bin/env node
/**
 * Deep incident investigation — correlates access session, gateway trace,
 * telemetry, and tenant route-pass entitlements.
 *
 * Usage:
 *   node investigate-incident.mjs --session <uuid> [--report]
 *   node investigate-incident.mjs --user "email or name"
 *   node investigate-incident.mjs --user-id <uuid> [--facility <uuid>]
 */

import { buildQuery, withAuth } from './lib/api-client.mjs';
import { parseFlagArgs, printJson } from './lib/cli-utils.mjs';
import {
  analyzeAccessContext,
  accessNextCommands,
  renderAccessReport,
} from './lib/access-analysis.mjs';
import {
  fetchTelemetryForGateways,
  resolveFacilityGateways,
} from './lib/gateway-resolve.mjs';
import { analyzeRoutePassEntitlements } from './lib/route-pass-analysis.mjs';
import {
  commandsSection,
  findingsSection,
  nextStepsSection,
  pickInterestingSession,
  reportHeader,
  userDisplayName,
  writeReport,
} from './lib/report-utils.mjs';
import { sanitizeConfig } from './lib/load-deploy-config.mjs';

const ROUTE_PASS_ROLES = new Set(['tenant', 'maintenance']);

const SPEC = {
  defaults: {
    env: undefined,
    sessionId: undefined,
    userId: undefined,
    userSearch: undefined,
    facilityId: undefined,
    gatewayId: undefined,
    limit: 15,
    report: true,
    json: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--session': { key: 'sessionId', takesValue: true },
    '--user-id': { key: 'userId', takesValue: true },
    '--user': { key: 'userSearch', takesValue: true },
    '--facility': { key: 'facilityId', takesValue: true },
    '--gateway': { key: 'gatewayId', takesValue: true },
    '--limit': { key: 'limit', takesValue: true },
    '--report': { key: 'report' },
    '--json': { key: 'json' },
    '--out': { key: 'out', takesValue: true },
  },
};

async function resolveUser(api, options) {
  if (options.userId) {
    const res = await api(`/users/${options.userId}`);
    return res.user ?? res;
  }
  if (!options.userSearch) return null;
  const qs = buildQuery({ search: options.userSearch, limit: 5 });
  const res = await api(`/users${qs}`);
  const users = res.users ?? [];
  if (!users.length) throw new Error(`No user found for "${options.userSearch}"`);
  if (users.length > 1) {
    return { ambiguous: users, picked: users[0] };
  }
  const detail = await api(`/users/${users[0].id}`);
  return detail.user ?? users[0];
}

async function loadUserDetails(api, userId) {
  if (!userId) return null;
  try {
    const res = await api(`/users/${userId}/details`);
    return res.user ?? null;
  } catch {
    return null;
  }
}

function telemetryWindow(session) {
  if (!session?.started_at) return {};
  const start = new Date(session.started_at);
  const end = new Date(session.settled_at ?? session.started_at);
  end.setMinutes(end.getMinutes() + 5);
  start.setMinutes(start.getMinutes() - 2);
  return { from: start.toISOString(), to: end.toISOString() };
}

function shouldFetchRoutePass(user) {
  return Boolean(user?.id && ROUTE_PASS_ROLES.has(String(user.role)));
}

async function investigate(options) {
  return withAuth({ env: options.env }, async ({ config, api }) => {
    const context = { config, facilityId: options.facilityId };

    const userResult = await resolveUser(api, options);
    if (userResult?.ambiguous) {
      context.userLookup = userResult;
      context.user = userResult.picked;
      context.findings = [{
        severity: 'info',
        code: 'ambiguous_user',
        message: `Multiple users matched "${options.userSearch}" — using ${userDisplayName(userResult.picked)} (\`${userResult.picked.id}\`).`,
      }];
    } else {
      context.user = userResult;
    }

    if (options.sessionId) {
      context.sessionDetail = await api(`/access-sessions/${options.sessionId}`);
    }

    const focalForFilters = context.sessionDetail?.session;
    const listFilters = {
      user_id: context.user?.id ?? options.userId ?? focalForFilters?.user_id,
      facility_id: options.facilityId ?? focalForFilters?.facility_id,
      unit_id: focalForFilters?.unit_id,
      device_id: focalForFilters?.device_id,
      limit: options.limit,
      sort_order: 'desc',
    };

    if (options.sessionId || context.user?.id || options.userId || options.facilityId) {
      const listRes = await api(`/access-sessions${buildQuery(listFilters)}`);
      context.sessions = listRes.sessions ?? [];
      context.sessionTotal = listRes.total;
    }

    if (!context.sessionDetail?.session) {
      const picked = pickInterestingSession(context.sessions);
      if (picked) {
        context.sessionDetail = await api(`/access-sessions/${picked.id}`);
        context.focalSessionAutoSelected = true;
      }
    }

    const focalSession = context.sessionDetail?.session;
    const facilityId = focalSession?.facility_id ?? options.facilityId;
    context.facilityId = facilityId;

    if (!context.user && focalSession?.user_id) {
      try {
        const res = await api(`/users/${focalSession.user_id}`);
        context.user = res.user ?? null;
      } catch {
        // optional
      }
    }

    if (facilityId) {
      const resolved = await resolveFacilityGateways(api, {
        facilityId,
        preferredGatewayId: options.gatewayId,
        deviceId: focalSession?.device_id,
      });
      context.gateways = resolved.gateways;
      context.gateway = resolved.gateway;
      context.wsStatus = await api(`/gateways/status/${facilityId}`);
    }

    const gatewayId = context.gateway?.id;
    if (gatewayId && focalSession) {
      context.gatewayTrace = await api(
        `/gateways/${gatewayId}/session-trace${buildQuery({
          user_id: focalSession.user_id,
          device_id: focalSession.device_id,
          unit_id: focalSession.unit_id,
        })}`,
      );

      const window = telemetryWindow(focalSession);
      const telemetryTargets = (context.gateways ?? [context.gateway])
        .filter(Boolean)
        .map((g) => g.id);
      context.telemetry = await fetchTelemetryForGateways(api, telemetryTargets, {
        limit: 40,
        search: focalSession.device_serial ?? undefined,
        ...window,
      });
    }

    if (context.user?.id) {
      context.userDetails = await loadUserDetails(api, context.user.id);
    }

    if (!facilityId && context.userDetails?.facilities?.[0]?.facility_id) {
      context.facilityId = context.userDetails.facilities[0].facility_id;
    }

    if (context.facilityId && !context.gateways) {
      const resolved = await resolveFacilityGateways(api, {
        facilityId: context.facilityId,
        preferredGatewayId: options.gatewayId,
        deviceId: context.userDetails?.facilities?.[0]?.units?.[0]?.device?.id,
      });
      context.gateways = resolved.gateways;
      context.gateway = resolved.gateway;
      context.wsStatus = await api(`/gateways/status/${context.facilityId}`);
    }

    if (shouldFetchRoutePass(context.user)) {
      try {
        context.routePassHistory = await api(`/route-passes/users/${context.user.id}?limit=8`);
      } catch {
        // optional
      }
      const rp = analyzeRoutePassEntitlements({
        user: context.user,
        userDetails: context.userDetails,
        routePassHistory: context.routePassHistory,
      });
      context.expectedAud = rp.expectedAud;
      context.routePassFindings = rp.findings;
    }

    context.findings = [
      ...(context.findings ?? []),
      ...analyzeAccessContext(context),
      ...(context.routePassFindings ?? []),
    ];

    return context;
  });
}

function renderRoutePassSection(context) {
  if (!shouldFetchRoutePass(context.user) && !context.routePassHistory) return '';
  const lines = ['## Route pass / entitlements', ''];
  if (context.user) {
    lines.push(`- **User:** ${userDisplayName(context.user)} (\`${context.user.id}\`)`);
    lines.push(`- **Role:** ${context.user.role ?? '—'}`);
    lines.push(`- **Active:** ${context.user.isActive ?? context.user.is_active ?? '—'}`);
    lines.push('');
  }

  const devices = context.userDetails?.devices ?? [];
  if (devices.length) {
    lines.push('### App devices');
    lines.push('');
    for (const d of devices) {
      lines.push(`- **${d.platform}** ${d.device_name ?? d.app_device_id} — \`${d.status}\``);
    }
    lines.push('');
  }

  if (context.expectedAud?.length) {
    lines.push('### Expected aud today');
    lines.push('');
    for (const entry of context.expectedAud) lines.push(`- \`${entry}\``);
    lines.push('');
  }

  const history = context.routePassHistory?.data ?? [];
  if (history.length) {
    lines.push('### Issuance log');
    lines.push('');
    lines.push('| Issued | jti | audiences |');
    lines.push('|--------|-----|-----------|');
    for (const row of history.slice(0, 8)) {
      const aud = row.audiences?.length ? row.audiences.join(', ') : '[]';
      lines.push(`| ${row.issuedAt} | \`${row.jti}\` | ${aud} |`);
    }
    lines.push('');
  } else if (shouldFetchRoutePass(context.user)) {
    lines.push('_No route pass issuance rows in the last 7-day retention window._');
    lines.push('');
  }

  return lines.join('\n');
}

function renderIncidentReport(context) {
  const session = context.sessionDetail?.session;
  const parts = [
    reportHeader('Incident investigation report', context.config, {
      'Focal session': session?.id ?? '(none)',
      User: session?.user_name ?? userDisplayName(context.user) ?? '—',
    }),
  ];

  if (context.focalSessionAutoSelected) {
    parts.push(`> Auto-selected focal session \`${session?.id}\` (${session?.state}) from recent activity.\n`);
  }

  if (context.userLookup?.ambiguous) {
    parts.push('## User lookup matches');
    parts.push('');
    for (const u of context.userLookup.ambiguous) {
      parts.push(`- ${userDisplayName(u)} — \`${u.id}\` — ${u.email ?? '—'}`);
    }
    parts.push('');
  }

  parts.push(renderAccessReport(context));
  parts.push(renderRoutePassSection(context));
  parts.push(findingsSection(context.findings));

  const steps = [];
  if (session?.state === 'pending') {
    steps.push('Poll `GET /access-sessions/:id` every ~2s until state settles.');
  }
  if (session?.state === 'timed_out') {
    steps.push('Check lock online status and gateway telemetry for device confirmation gaps.');
    steps.push('Verify gateway WS connected and hardware lock_number matches cloud device serial.');
  }
  if (shouldFetchRoutePass(context.user)) {
    steps.push('If unlock auth failed, inspect route pass aud[] and re-fetch pass on an **active** device.');
  }
  if (context.gateways?.length > 1) {
    steps.push('Facility has multiple gateways — confirm which one owns the lock (`--gateway <id>`).');
  }
  parts.push(nextStepsSection(steps));
  parts.push(commandsSection('Follow-up commands', accessNextCommands(context)));

  return parts.join('\n');
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node investigate-incident.mjs --session <uuid> [--report] [--out report.md]
  node investigate-incident.mjs --user "email or name"
  node investigate-incident.mjs --user-id <uuid> [--facility <uuid>] [--gateway <uuid>]
`);
    process.exit(0);
  }

  if (!options.sessionId && !options.userId && !options.userSearch) {
    console.error('Provide --session, --user-id, or --user');
    process.exit(1);
  }

  const context = await investigate(options);

  if (options.json) {
    printJson({ ...context, config: sanitizeConfig(context.config) });
    return;
  }

  const markdown = renderIncidentReport(context);
  if (options.report !== false) writeReport(markdown, options.out);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
