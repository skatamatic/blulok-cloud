#!/usr/bin/env node
/**
 * Decode a route pass JWT (header + payload) without signature verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function classifyAudience(aud) {
  const list = Array.isArray(aud) ? aud : aud != null ? [aud] : [];
  return list.map((raw) => {
    if (typeof raw !== 'string') return { type: 'unknown', raw };
    if (raw.startsWith('lock:')) {
      return { type: 'lock', serial: raw.slice('lock:'.length), raw };
    }
    if (raw.startsWith('shared_key:')) {
      const rest = raw.slice('shared_key:'.length);
      const colon = rest.lastIndexOf(':');
      return {
        type: 'shared_key',
        primaryTenantUserId: colon >= 0 ? rest.slice(0, colon) : rest,
        serial: colon >= 0 ? rest.slice(colon + 1) : null,
        raw,
      };
    }
    if (raw.startsWith('access_control:')) {
      return { type: 'access_control', deviceId: raw.slice('access_control:'.length), raw };
    }
    return { type: 'unknown', raw };
  });
}

export function decodeJwt(jwt) {
  const compact = String(jwt ?? '').trim();
  const parts = compact.split('.');
  if (parts.length < 2) throw new Error('Not a JWT');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  const enriched = { ...payload };
  for (const key of ['iat', 'exp']) {
    if (typeof payload[key] === 'number') {
      enriched[`${key}_iso`] = new Date(payload[key] * 1000).toISOString();
    }
  }
  if (typeof payload.iat === 'number' && typeof payload.exp === 'number') {
    enriched.ttl_hours = (payload.exp - payload.iat) / 3600;
  }
  return {
    compact,
    parts: {
      headerB64: parts[0],
      payloadB64: parts[1],
      signatureB64: parts[2] ?? '',
    },
    header,
    payload: enriched,
    signaturePresent: parts.length >= 3 && Boolean(parts[2]),
    aud: classifyAudience(payload.aud),
    schedules: Array.isArray(payload.schedules) ? payload.schedules : [],
  };
}

export function formatJwtDecodeMarkdown(decoded) {
  const p = decoded.payload ?? {};
  const h = decoded.header ?? {};
  const parts = decoded.parts ?? {};
  const lines = [];

  lines.push('## Compact JWT');
  lines.push('');
  lines.push('```');
  lines.push(decoded.compact);
  lines.push('```');
  lines.push('');

  lines.push('## Raw base64url parts');
  lines.push('');
  lines.push('| Part | Base64url |');
  lines.push('|------|-----------|');
  lines.push(`| header | \`${parts.headerB64 ?? ''}\` |`);
  lines.push(`| payload | \`${parts.payloadB64 ?? ''}\` |`);
  lines.push(`| signature | \`${parts.signatureB64 ?? ''}\` |`);
  lines.push('');

  lines.push('## Header');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|--------|');
  lines.push(`| alg | \`${h.alg ?? '—'}\` |`);
  lines.push(`| typ | \`${h.typ ?? '—'}\` |`);
  lines.push(`| kid | \`${h.kid ?? '—'}\` |`);
  for (const [key, value] of Object.entries(h)) {
    if (['alg', 'typ', 'kid'].includes(key)) continue;
    lines.push(`| ${key} | \`${typeof value === 'string' ? value : JSON.stringify(value)}\` |`);
  }
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(h, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Claims');
  lines.push('');
  lines.push('| Claim | Value |');
  lines.push('|-------|--------|');
  lines.push(`| iss | \`${p.iss ?? '—'}\` |`);
  lines.push(`| sub | \`${p.sub ?? '—'}\` |`);
  lines.push(`| user_role | \`${p.user_role ?? '—'}\` |`);
  lines.push(`| jti | \`${p.jti ?? '—'}\` |`);
  lines.push(`| iat | ${p.iat ?? '—'} (${p.iat_iso ?? '—'}) |`);
  lines.push(`| exp | ${p.exp ?? '—'} (${p.exp_iso ?? '—'}) |`);
  lines.push(`| ttl_hours | ${p.ttl_hours ?? '—'} |`);
  lines.push(`| device_pubkey | \`${p.device_pubkey ?? '—'}\` |`);
  lines.push(`| aud count | ${Array.isArray(p.aud) ? p.aud.length : p.aud != null ? 1 : 0} |`);
  lines.push(`| schedules count | ${decoded.schedules?.length ?? 0} |`);
  for (const [key, value] of Object.entries(p)) {
    if (
      [
        'iss',
        'sub',
        'aud',
        'iat',
        'exp',
        'jti',
        'device_pubkey',
        'user_role',
        'schedules',
        'iat_iso',
        'exp_iso',
        'ttl_hours',
      ].includes(key)
    ) {
      continue;
    }
    lines.push(`| ${key} | \`${typeof value === 'string' ? value : JSON.stringify(value)}\` |`);
  }
  lines.push('');

  lines.push('## Audience');
  lines.push('');
  if (!decoded.aud?.length) {
    lines.push('_Empty `aud[]`._');
    lines.push('');
  } else {
    lines.push('| Type | Detail | Raw |');
    lines.push('|------|--------|-----|');
    for (const entry of decoded.aud) {
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

  if (decoded.schedules?.length) {
    lines.push('## Schedules');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(decoded.schedules, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Full payload');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(p, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let jwt;
  let asJson = false;
  let report = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') {
      asJson = true;
      continue;
    }
    if (args[i] === '--report') {
      report = true;
      continue;
    }
    if (args[i] === '--file') {
      jwt = fs.readFileSync(args[i + 1], 'utf8').trim();
      i += 1;
      continue;
    }
    jwt = args[i];
  }
  if (!jwt) {
    console.error('Usage: node decode-route-pass-jwt.mjs [--json] [--report] <jwt|--file path>');
    process.exit(1);
  }
  return { jwt, asJson, report };
}

function main() {
  const { jwt, asJson, report } = parseArgs(process.argv);
  const decoded = decodeJwt(jwt);

  if (asJson) {
    console.log(JSON.stringify(decoded, null, 2));
    return;
  }

  if (report) {
    console.log(formatJwtDecodeMarkdown(decoded));
    return;
  }

  console.log('COMPACT:', decoded.compact);
  console.log('HEADER_B64:', decoded.parts.headerB64);
  console.log('PAYLOAD_B64:', decoded.parts.payloadB64);
  console.log('SIGNATURE_B64:', decoded.parts.signatureB64);
  console.log('HEADER:', JSON.stringify(decoded.header, null, 2));
  console.log('PAYLOAD:', JSON.stringify(decoded.payload, null, 2));
  const aud = decoded.payload.aud;
  const audList = Array.isArray(aud) ? aud : aud != null ? [aud] : [];
  console.log('\nSummary:');
  console.log(`  sub: ${decoded.payload.sub ?? '(missing)'}`);
  console.log(`  user_role: ${decoded.payload.user_role ?? '(missing)'}`);
  console.log(`  kid: ${decoded.header.kid ?? '(missing)'}`);
  console.log(`  aud count: ${audList.length}`);
  if (audList.length) console.log(`  aud: ${audList.join(', ')}`);
  for (const entry of decoded.aud) {
    console.log(`    - ${entry.type}: ${entry.raw}`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
