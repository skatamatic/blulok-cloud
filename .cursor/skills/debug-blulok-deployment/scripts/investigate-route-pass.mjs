#!/usr/bin/env node
/**
 * Investigate route pass issuance against a configured BluLok deployment (HTTP API).
 */

import { apiFetch, login } from './lib/api-client.mjs';
import { loadDeployConfig } from './lib/load-deploy-config.mjs';
import { analyzeRoutePassEntitlements } from './lib/route-pass-analysis.mjs';
import { writeReport } from './lib/report-utils.mjs';
import { decodeJwt } from './decode-route-pass-jwt.mjs';

async function investigate(options) {
  const config = loadDeployConfig({ env: options.env });
  const token = await login(config);

  let userId = options.userId;
  let jwtDecoded;

  if (options.jwt) {
    jwtDecoded = decodeJwt(options.jwt);
    userId = userId ?? jwtDecoded.payload.sub;
    options.jti = options.jti ?? jwtDecoded.payload.jti;
  }

  if (!userId) {
    throw new Error('Provide --user <uuid> and/or --jwt <token>');
  }

  const context = {
    config,
    userId,
    jwtDecoded,
    jti: options.jti,
    facilityId: options.facilityId,
  };

  const userRes = await apiFetch(config.apiBase, `/users/${userId}`, { token });
  context.user = userRes.user;

  try {
    const detailsRes = await apiFetch(config.apiBase, `/users/${userId}/details`, { token });
    context.userDetails = detailsRes.user;
    context.assignmentsFromDetails = [];
    for (const fac of detailsRes.user?.facilities ?? []) {
      for (const unit of fac.units ?? []) {
        context.assignmentsFromDetails.push({
          facilityId: fac.facility_id,
          facilityName: fac.facility_name,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          isPrimary: unit.isPrimary,
          device: unit.device,
        });
      }
    }
  } catch (err) {
    context.userDetailsError = String(err.message ?? err);
  }

  try {
    context.routePassHistory = await apiFetch(
      config.apiBase,
      `/route-passes/users/${userId}?limit=20`,
      { token },
    );
  } catch (err) {
    context.routePassHistoryError = String(err.message ?? err);
  }

  context.unitTimelines = [];
  for (const assignment of context.assignmentsFromDetails ?? []) {
    try {
      const unitRes = await apiFetch(config.apiBase, `/units/${assignment.unitId}`, { token });
      const unit = unitRes.unit;
      const shared = (unit.shared_tenants ?? []).find((t) => t.id === userId);
      let lockCreatedAt = null;
      const lockId = unit.blulok_device?.id ?? assignment.device?.id;
      if (lockId) {
        try {
          const lockRes = await apiFetch(config.apiBase, `/devices/blulok/${lockId}`, { token });
          lockCreatedAt = lockRes.device?.created_at ?? null;
        } catch {
          // optional
        }
      }
      context.unitTimelines.push({
        unitId: assignment.unitId,
        unitNumber: unit.unit_number,
        facilityName: unit.facility_name,
        lockSerial: unit.blulok_device?.device_serial ?? assignment.device?.device_serial,
        lockCreatedAt,
        coTenantGrantedAt: shared?.access_granted_at ?? null,
        primaryTenantId: unit.primary_tenant?.id ?? null,
      });
    } catch {
      // unit fetch optional
    }
  }

  const analyzed = analyzeRoutePassEntitlements({
    user: context.user,
    userDetails: context.userDetails,
    routePassHistory: context.routePassHistory,
    jwtDecoded,
  });
  context.expectedAudToday = analyzed.expectedAud;
  context.findings = [
    ...analyzed.findings,
    ...analyzeTimelineFindings(context, jwtDecoded),
  ];

  return context;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    env: undefined,
    userId: undefined,
    jwt: undefined,
    jti: undefined,
    facilityId: undefined,
    report: false,
    json: false,
    outFile: undefined,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--env') {
      out.env = args[++i];
      continue;
    }
    if (arg === '--user') {
      out.userId = args[++i];
      continue;
    }
    if (arg === '--jwt') {
      out.jwt = args[++i];
      continue;
    }
    if (arg === '--jti') {
      out.jti = args[++i];
      continue;
    }
    if (arg === '--facility') {
      out.facilityId = args[++i];
      continue;
    }
    if (arg === '--report') {
      out.report = true;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--out') {
      out.outFile = args[++i];
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function analyzeTimelineFindings(context, jwtDecoded) {
  const findings = [];
  const issuedAt = jwtDecoded?.payload?.iat_iso
    ? new Date(jwtDecoded.payload.iat_iso)
    : null;
  if (!issuedAt) return findings;

  for (const unit of context.unitTimelines ?? []) {
    if (unit.lockCreatedAt && issuedAt < new Date(unit.lockCreatedAt)) {
      findings.push({
        severity: 'likely_root_cause',
        code: 'pass_before_lock',
        message: `Pass issued before lock on unit ${unit.unitNumber} was created ${unit.lockCreatedAt}.`,
      });
    }
    if (unit.coTenantGrantedAt && issuedAt < new Date(unit.coTenantGrantedAt)) {
      findings.push({
        severity: 'likely_root_cause',
        code: 'pass_before_co_tenant',
        message: `Pass issued before co-tenant access on unit ${unit.unitNumber} (${unit.coTenantGrantedAt}).`,
      });
    }
  }
  return findings;
}

function renderReport(context) {
  const lines = [];
  const p = context.jwtDecoded?.payload;

  lines.push('# Route pass investigation report');
  lines.push('');
  lines.push(`**Deployment:** ${context.config.label} (\`${context.config.envName}\`)`);
  lines.push(`**API:** ${context.config.apiBase}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  if (p) {
    lines.push('## JWT summary');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|--------|');
    lines.push(`| sub | \`${p.sub}\` |`);
    lines.push(`| user_role | \`${p.user_role ?? '—'}\` |`);
    lines.push(`| jti | \`${p.jti ?? '—'}\` |`);
    lines.push(`| issued | ${p.iat_iso ?? '—'} |`);
    lines.push(`| expires | ${p.exp_iso ?? '—'} |`);
    lines.push(`| aud count | ${Array.isArray(p.aud) ? p.aud.length : 0} |`);
    if (Array.isArray(p.aud) && p.aud.length) {
      lines.push(`| aud | ${p.aud.map((a) => `\`${a}\``).join(', ')} |`);
    }
    lines.push('');
  }

  if (context.user) {
    lines.push('## User');
    lines.push('');
    lines.push(`- **Name:** ${context.user.firstName} ${context.user.lastName}`);
    lines.push(`- **Email:** ${context.user.email ?? '—'}`);
    lines.push(`- **Role:** ${context.user.role}`);
    lines.push(`- **Active:** ${context.user.isActive}`);
    lines.push('');
  }

  const expected = context.expectedAudToday ?? [];
  if (expected.length) {
    lines.push('## Expected aud today');
    lines.push('');
    for (const entry of expected) lines.push(`- \`${entry}\``);
    lines.push('');
  }

  const history = context.routePassHistory?.data ?? [];
  if (history.length) {
    lines.push('## Issuance log');
    lines.push('');
    lines.push('| Issued | jti | audiences |');
    lines.push('|--------|-----|-----------|');
    for (const row of history.slice(0, 10)) {
      const aud = row.audiences?.length ? row.audiences.join(', ') : '[]';
      lines.push(`| ${row.issuedAt} | \`${row.jti}\` | ${aud} |`);
    }
    lines.push('');
  }

  if (context.findings?.length) {
    lines.push('## Findings');
    lines.push('');
    for (const f of context.findings) {
      lines.push(`- **${f.severity}** (\`${f.code}\`): ${f.message}`);
    }
    lines.push('');
  }

  lines.push('## Next steps');
  lines.push('');
  lines.push('1. Re-fetch route pass on an **active** registered device after entitlements exist.');
  lines.push('2. For DB checks: `node run-sql.mjs "..."` or `backend/scripts/diagnose-route-pass-audience.js`.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(`Usage:
  node investigate-route-pass.mjs --jwt '<token>' [--report] [--out report.md] [--json]
  node investigate-route-pass.mjs --user <uuid> [--env develop] [--report] [--out report.md]
`);
    process.exit(0);
  }

  const context = await investigate(options);

  if (options.report) {
    writeReport(renderReport(context), options.outFile);
  }

  if (!options.report || options.json) {
    console.log(
      JSON.stringify(
        {
          deployment: context.config.envName,
          userId: context.userId,
          user: context.user,
          jwt: context.jwtDecoded,
          expectedAudToday: context.expectedAudToday,
          findings: context.findings,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
