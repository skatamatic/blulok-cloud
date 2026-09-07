import fs from 'node:fs';
import { formatTelemetryLine } from './telemetry-headers.mjs';

export function formatTs(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && value > 1e12) return new Date(value).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function sessionStartedAt(session) {
  return session?.started_at ?? session?.occurred_at ?? session?.created_at ?? null;
}

export function userDisplayName(user) {
  if (!user) return '—';
  const first = user.firstName ?? user.first_name ?? '';
  const last = user.lastName ?? user.last_name ?? '';
  const name = `${first} ${last}`.trim();
  return name || user.email || user.id || '—';
}

export function reportHeader(title, config, extra = {}) {
  const lines = [`# ${title}`, ''];
  lines.push(`**Deployment:** ${config.label} (\`${config.envName}\`)`);
  lines.push(`**API:** ${config.apiBase}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  for (const [key, value] of Object.entries(extra)) {
    if (value != null) lines.push(`**${key}:** ${value}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function findingsSection(findings) {
  if (!findings?.length) return '';
  const lines = ['## Findings', ''];
  for (const f of findings) {
    const code = f.code ? ` (\`${f.code}\`)` : '';
    lines.push(`- **${f.severity}**${code}: ${f.message}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function nextStepsSection(steps) {
  if (!steps?.length) return '';
  const lines = ['## Recommended next steps', ''];
  steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push('');
  return lines.join('\n');
}

export function commandsSection(title, commands) {
  if (!commands?.length) return '';
  const lines = [`## ${title}`, ''];
  for (const cmd of commands) {
    lines.push('```bash');
    lines.push(cmd);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

export function writeReport(content, outFile) {
  if (outFile) {
    fs.writeFileSync(outFile, content, 'utf8');
    console.error(`Report written to ${outFile}`);
    return;
  }
  console.log(content);
}

export function summarizeTelemetryLog(log) {
  const line = formatTelemetryLine(log);
  return {
    at: formatTs(log?.logged_at ?? log?.created_at ?? log?.timestamp),
    source: log?.source ?? '—',
    header: line.header,
    headerLabel: line.headerLabel,
    summary: line.summary,
  };
}

export function summarizeSyncLog(log) {
  const summary = log?.summary;
  if (typeof summary === 'string') return summary;
  if (!summary || typeof summary !== 'object') return log?.sync_kind ?? 'sync';
  const parts = [];
  for (const [kind, stats] of Object.entries(summary)) {
    if (!stats || typeof stats !== 'object') continue;
    const errors = stats.errors?.length ?? 0;
    const changed = (stats.added ?? 0) + (stats.updated ?? 0) + (stats.removed ?? 0);
    parts.push(`${kind}: +${stats.added ?? 0}/~${stats.updated ?? 0}/-${stats.removed ?? 0}${errors ? ` (${errors} err)` : ''}`);
    if (!changed && !errors) parts[parts.length - 1] = `${kind}: unchanged ${stats.unchanged ?? 0}`;
  }
  return `${log.sync_kind ?? 'sync'} — ${parts.join('; ') || 'ok'}`;
}

export function pickInterestingSession(sessions) {
  if (!sessions?.length) return null;
  const rank = { pending: 0, open: 1, denied: 2, timed_out: 3, failed: 4, closed: 5 };
  return [...sessions].sort((a, b) => {
    const ra = rank[a.state] ?? 99;
    const rb = rank[b.state] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(sessionStartedAt(b) ?? 0) - new Date(sessionStartedAt(a) ?? 0);
  })[0];
}
