#!/usr/bin/env node
/**
 * Inspect a user's current route pass from the issuance log.
 * Cloud does not store the compact JWT — default is metadata only.
 * Pass --issue to mint a new token, or --jwt to decode a captured one.
 */

import { ApiError, apiFetch, login } from './lib/api-client.mjs';
import { parseFlagArgs, printJson } from './lib/cli-utils.mjs';
import { loadDeployConfig } from './lib/load-deploy-config.mjs';
import { analyzeRoutePassEntitlements, pickLiveIssuance } from './lib/route-pass-analysis.mjs';
import { findingsSection, reportHeader, userDisplayName, writeReport } from './lib/report-utils.mjs';
import { classifyAudience, decodeJwt, formatJwtDecodeMarkdown } from './decode-route-pass-jwt.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SPEC = {
  defaults: {
    env: undefined,
    user: undefined,
    userId: undefined,
    device: undefined,
    facilityId: undefined,
    password: undefined,
    jwt: undefined,
    issue: false,
    json: false,
    report: false,
    out: undefined,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--user': { key: 'user', takesValue: true },
    '--user-id': { key: 'userId', takesValue: true },
    '--device': { key: 'device', takesValue: true },
    '--facility-id': { key: 'facilityId', takesValue: true },
    '--password': { key: 'password', takesValue: true },
    '--jwt': { key: 'jwt', takesValue: true },
    '--issue': { key: 'issue' },
    '--json': { key: 'json' },
    '--report': { key: 'report' },
    '--out': { key: 'out', takesValue: true },
  },
};

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function pickUser(matches, term) {
  if (!matches?.length) return null;
  const q = String(term ?? '').trim().toLowerCase();
  const exactEmail = matches.find((u) => String(u.email ?? '').toLowerCase() === q);
  if (exactEmail) return exactEmail;
  if (matches.length === 1) return matches[0];
  throw new Error(
    `Ambiguous user search "${term}" (${matches.length} matches). Use --user-id or a unique email.\n` +
      matches
        .slice(0, 8)
        .map((u) => `  - ${u.id}  ${u.email ?? ''}  ${u.firstName ?? u.first_name ?? ''} ${u.lastName ?? u.last_name ?? ''}`.trim())
        .join('\n'),
  );
}

function pickDevice(devices, requested, { detailsUnavailable = false } = {}) {
  const list = devices ?? [];
  if (requested) {
    const match = list.find((d) => d.app_device_id === requested || d.id === requested);
    if (match) return match;
    if (detailsUnavailable && !list.length) {
      return { app_device_id: requested, status: 'unknown' };
    }
    const known = list.map((d) => `${d.app_device_id} (${d.status ?? 'unknown'})`).join(', ') || 'none';
    throw new Error(`Device "${requested}" not found for this user. Known: ${known}`);
  }
  const active = list.filter((d) => String(d.status).toLowerCase() === 'active');
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    return [...active].sort((a, b) => {
      const ta = new Date(a.updated_at ?? a.last_seen_at ?? 0).getTime();
      const tb = new Date(b.updated_at ?? b.last_seen_at ?? 0).getTime();
      return tb - ta;
    })[0];
  }
  return list[0] ?? null;
}

async function resolveUser(api, options) {
  if (options.userId) {
    if (!isUuid(options.userId)) throw new Error(`--user-id must be a UUID, got "${options.userId}"`);
    const res = await api(`/users/${options.userId}`);
    return res.user ?? res;
  }

  const term = options.user;
  if (!term) throw new Error('Provide --user <email|name|uuid> or --user-id <uuid>');
  if (isUuid(term)) {
    const res = await api(`/users/${term}`);
    return res.user ?? res;
  }

  const search = await api(`/users?search=${encodeURIComponent(term)}&limit=20`);
  const matches = search.users ?? search.data ?? [];
  const user = pickUser(matches, term);
  if (!user) throw new Error(`No user matched "${term}"`);
  return user;
}

async function issueViaAdmin(api, { userId, appDeviceId, facilityId }) {
  return api('/admin/dev-tools/issue-route-pass', {
    method: 'POST',
    body: {
      userId,
      ...(appDeviceId ? { appDeviceId } : {}),
      ...(facilityId ? { facilityId } : {}),
    },
  });
}

async function issueViaSession(config, token, { appDeviceId, facilityId }) {
  return apiFetch(config.apiBase, '/passes/request', {
    token,
    method: 'POST',
    body: facilityId ? { facility_id: facilityId } : {},
    headers: appDeviceId ? { 'X-App-Device-Id': appDeviceId } : {},
  });
}

async function issueViaUserLogin(config, { identifier, password, appDeviceId, facilityId }) {
  const loginRes = await apiFetch(config.apiBase, '/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });
  const token = loginRes.token ?? loginRes.data?.token;
  if (!token) throw new Error('User login succeeded but no token in response');
  return issueViaSession(config, token, { appDeviceId, facilityId });
}

function sessionUserId(token) {
  try {
    const payload = decodeJwt(token).payload ?? {};
    return payload.userId ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

function adminUnavailableHint(err, { hasPassword, sameUser }) {
  const status = err?.status;
  if (status === 404) {
    if (sameUser) {
      return 'Admin issue-route-pass is not deployed; issuing via this session\'s POST /passes/request.';
    }
    return hasPassword
      ? 'Admin issue-route-pass is not deployed on this API; falling back to user /passes/request.'
      : 'Admin issue-route-pass is not deployed on this API yet. Deploy the backend, or pass --password to request as the user.';
  }
  if (status === 403) {
    if (sameUser) {
      return 'Admin issue-route-pass is disabled; issuing via this session\'s POST /passes/request.';
    }
    return hasPassword
      ? 'Admin issue-route-pass is disabled (production or RBAC); falling back to user /passes/request.'
      : 'Admin issue-route-pass is disabled here (production or RBAC). Pass --password to request as the user.';
  }
  return err.message;
}

async function issuePass(api, config, token, { user, userId, appDeviceId, facilityId, password }) {
  try {
    const issued = await issueViaAdmin(api, { userId, appDeviceId, facilityId });
    return { issued, issuancePath: 'admin' };
  } catch (err) {
    const sameUser = sessionUserId(token) === userId;
    const canFallback =
      err instanceof ApiError &&
      (err.status === 403 || err.status === 404) &&
      (Boolean(password) || sameUser);
    const fallbackNote = adminUnavailableHint(err, { hasPassword: Boolean(password), sameUser });
    if (!canFallback) {
      const extra = fallbackNote && fallbackNote !== err.message ? `\n${fallbackNote}` : '';
      throw new Error(`${err.message}${extra}`);
    }
    if (sameUser) {
      return {
        issued: await issueViaSession(config, token, { appDeviceId, facilityId }),
        issuancePath: 'session',
        fallbackNote,
      };
    }
    return {
      issued: await issueViaUserLogin(config, {
        identifier: user.email ?? user.login_identifier ?? user.loginIdentifier,
        password,
        appDeviceId,
        facilityId,
      }),
      issuancePath: 'user_login',
      fallbackNote,
    };
  }
}

function deviceForIssuance(devices, issuance) {
  const deviceId = issuance?.deviceId ?? issuance?.device_id;
  if (!deviceId) return null;
  return (devices ?? []).find((d) => d.id === deviceId) ?? null;
}

async function fetchPass(options) {
  const config = loadDeployConfig({ env: options.env });
  const token = await login(config);
  const api = (pathSuffix, opts = {}) => apiFetch(config.apiBase, pathSuffix, { token, ...opts });

  const user = await resolveUser(api, options);
  const userId = user.id;
  let userDetails;
  let userDetailsError;
  try {
    const detailsRes = await api(`/users/${userId}/details`);
    userDetails = detailsRes.user ?? detailsRes;
  } catch (err) {
    userDetailsError = String(err.message ?? err);
  }

  let history;
  let historyError;
  try {
    history = await api(`/route-passes/users/${userId}?limit=20`);
  } catch (err) {
    historyError = String(err.message ?? err);
  }

  const picked = pickLiveIssuance(history, {
    appDeviceId: options.device,
    devices: userDetails?.devices,
  });
  const live = picked.live ?? (options.issue ? null : picked.latest);

  const device =
    deviceForIssuance(userDetails?.devices, live) ??
    pickDevice(userDetails?.devices, options.device, {
      detailsUnavailable: Boolean(userDetailsError),
    });
  const appDeviceId = device?.app_device_id ?? options.device ?? null;
  const facilityId = options.facilityId;

  let jwt = options.jwt ? String(options.jwt).trim() : null;
  let jwtDecoded = jwt ? decodeJwt(jwt) : null;
  let issuancePath = jwt ? 'provided_jwt' : live ? 'issuance_log' : 'none';
  let fallbackNote;

  if (options.issue) {
    const minted = await issuePass(api, config, token, {
      user,
      userId,
      appDeviceId,
      facilityId,
      password: options.password,
    });
    jwt = minted.issued.routePass ?? minted.issued.data?.routePass;
    if (!jwt || typeof jwt !== 'string') {
      throw new Error('Issuance succeeded but response had no routePass string');
    }
    jwtDecoded = decodeJwt(jwt);
    issuancePath = minted.issuancePath;
    fallbackNote = minted.fallbackNote;
  }

  const analysis = analyzeRoutePassEntitlements({
    user,
    userDetails,
    routePassHistory: history,
    jwtDecoded,
  });

  if (!jwt && !live && !historyError) {
    analysis.findings.unshift({
      severity: 'info',
      code: 'no_issuance',
      message: 'No route pass issuance log rows for this user. Use --issue to mint one.',
    });
  } else if (!jwt) {
    analysis.findings.unshift({
      severity: 'info',
      code: 'jwt_not_stored',
      message:
        'Cloud does not persist the compact JWT (only jti, audiences, timestamps, device). Pass --jwt to decode a captured token, or --issue to mint a new one.',
    });
  }

  if (picked.expiredOnly && !options.issue) {
    analysis.findings.unshift({
      severity: 'warning',
      code: 'pass_expired',
      message: 'Latest issuance is expired. The device may already have requested a newer pass, or needs --issue.',
    });
  }

  return {
    config,
    issuancePath,
    fallbackNote,
    user,
    userDetails,
    userDetailsError,
    history,
    historyError,
    live,
    expiredOnly: picked.expiredOnly,
    device,
    appDeviceId,
    facilityId: facilityId ?? null,
    jwt,
    jwtDecoded,
    findings: analysis.findings,
    expectedAud: analysis.expectedAud,
  };
}

function renderLiveIssuance(live) {
  if (!live) return '';
  const aud = classifyAudience(live.audiences ?? []);
  const lines = ['## Live issuance (metadata — JWT not stored)', ''];
  lines.push('| Field | Value |');
  lines.push('|-------|--------|');
  lines.push(`| jti | \`${live.jti ?? '—'}\` |`);
  lines.push(`| issued | ${live.issuedAt ?? live.issued_at ?? '—'} |`);
  lines.push(`| expires | ${live.expiresAt ?? live.expires_at ?? '—'} |`);
  lines.push(`| expired | ${live.isExpired ? 'yes' : 'no'} |`);
  lines.push(`| device_id | \`${live.deviceId ?? live.device_id ?? '—'}\` |`);
  lines.push(`| aud count | ${aud.length} |`);
  lines.push('');
  if (!aud.length) {
    lines.push('_Empty `aud[]` on this issuance._', '');
  } else {
    lines.push('| Type | Detail | Raw |');
    lines.push('|------|--------|-----|');
    for (const entry of aud) {
      let detail = '—';
      if (entry.type === 'lock') detail = `serial \`${entry.serial}\``;
      if (entry.type === 'shared_key') {
        detail = `primary \`${entry.primaryTenantUserId}\` · serial \`${entry.serial}\``;
      }
      if (entry.type === 'access_control') detail = `device \`${entry.deviceId}\``;
      lines.push(`| ${entry.type} | ${detail} | \`${entry.raw}\` |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderReport(ctx) {
  const lines = [
    reportHeader('Route pass', ctx.config, {
      User: `${userDisplayName(ctx.user)} (${ctx.user?.email ?? '—'})`,
      Role: ctx.user?.role,
      Source: ctx.issuancePath,
      Device: ctx.appDeviceId ?? '—',
    }),
  ];

  if (ctx.fallbackNote && (ctx.issuancePath === 'user_login' || ctx.issuancePath === 'session')) {
    lines.push(`> ${ctx.fallbackNote}`, '');
  }

  if (ctx.device) {
    lines.push('## Bound device', '');
    lines.push(`- **app_device_id:** \`${ctx.device.app_device_id}\``);
    lines.push(`- **status:** ${ctx.device.status ?? '—'}`);
    lines.push(`- **platform:** ${ctx.device.platform ?? '—'}`);
    lines.push(`- **name:** ${ctx.device.device_name ?? ctx.device.name ?? '—'}`);
    lines.push('');
  }

  if (ctx.expectedAud?.length) {
    lines.push('## Expected aud today', '');
    for (const entry of ctx.expectedAud) lines.push(`- \`${entry}\``);
    lines.push('');
  }

  if (ctx.live && !ctx.jwtDecoded) {
    lines.push(renderLiveIssuance(ctx.live));
  }

  if (ctx.jwtDecoded) {
    lines.push(formatJwtDecodeMarkdown(ctx.jwtDecoded));
  }

  lines.push(findingsSection(ctx.findings));
  return lines.filter(Boolean).join('\n');
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node fetch-route-pass.mjs --user <email|name|uuid> [--report] [--out file.md]
  node fetch-route-pass.mjs --user-id <uuid> --issue [--device <app_device_id>]
  node fetch-route-pass.mjs --user-id <uuid> --jwt '<token>' --report

Default: read the latest unexpired issuance log row (jti, aud, times, device).
The compact JWT is not stored in Cloud. Use --jwt to decode a captured token,
or --issue to mint a new one.
`);
    process.exit(0);
  }

  const ctx = await fetchPass(options);

  if (options.report) {
    writeReport(renderReport(ctx), options.out);
  }

  if (!options.report || options.json) {
    printJson({
      deployment: ctx.config.envName,
      issuancePath: ctx.issuancePath,
      userId: ctx.user?.id,
      email: ctx.user?.email,
      role: ctx.user?.role,
      appDeviceId: ctx.appDeviceId,
      facilityId: ctx.facilityId,
      live: ctx.live,
      jwt: ctx.jwt,
      parts: ctx.jwtDecoded?.parts ?? null,
      header: ctx.jwtDecoded?.header ?? null,
      payload: ctx.jwtDecoded?.payload ?? null,
      aud: ctx.jwtDecoded?.aud ?? classifyAudience(ctx.live?.audiences ?? []),
      schedules: ctx.jwtDecoded?.schedules ?? null,
      expectedAud: ctx.expectedAud,
      findings: ctx.findings,
    });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
