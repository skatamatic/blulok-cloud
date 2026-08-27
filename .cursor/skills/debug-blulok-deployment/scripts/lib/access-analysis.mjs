import { formatTs, sessionStartedAt, summarizeTelemetryLog } from './report-utils.mjs';

export function analyzeAccessContext(context) {
  const findings = [];
  const sessions = context.sessions ?? [];
  const session = context.sessionDetail?.session;
  const pending = sessions.filter((s) => s.state === 'pending');

  if (pending.length) {
    findings.push({
      severity: 'warning',
      code: 'pending_sessions',
      message: `${pending.length} pending session(s) — remote unlock may still be in flight or stuck.`,
    });
  }

  if (session?.state === 'pending') {
    findings.push({
      severity: 'warning',
      code: 'session_pending',
      message:
        'Focal session is pending — poll GET /access-sessions/:id and check gateway session-trace + telemetry.',
    });
  }

  if (session?.state === 'timed_out' || sessions.some((s) => s.state === 'timed_out')) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'session_timeout',
      message:
        'Session timed out waiting for device confirmation — lock may not have reported state, gateway WS lag, or hardware offline.',
    });
  }

  if (session?.state === 'denied' || (session?.denial_reason && session?.state !== 'timed_out')) {
    findings.push({
      severity: 'info',
      code: 'session_denied',
      message: `Access denied: ${session?.denial_reason ?? session?.reason ?? 'see timeline'}.`,
    });
  }

  if (session?.outcome === 'failed' && session?.state !== 'timed_out') {
    findings.push({
      severity: 'warning',
      code: 'session_failed',
      message: `Session failed (${session.state}) — ${session.reason ?? 'see event timeline'}.`,
    });
  }

  const grantWithoutUnlock = session?.events?.length === 1 &&
    session.events[0]?.action === 'access_granted' &&
    ['timed_out', 'failed'].includes(session.state);
  if (grantWithoutUnlock || (context.sessionDetail?.events?.length === 1 && session?.state === 'timed_out')) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'grant_without_confirmation',
      message:
        'Cloud recorded access_granted but session never settled open — correlator may be waiting for lock state from gateway.',
    });
  }

  if (context.gatewayTrace?.snapshot?.pending_attributions?.length) {
    findings.push({
      severity: 'warning',
      code: 'pending_gateway_commands',
      message: `${context.gatewayTrace.snapshot.pending_attributions.length} pending gateway command(s) in correlator memory on this Cloud Run instance.`,
    });
  }

  if (context.wsStatus?.connected === false) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'gateway_disconnected',
      message: 'Gateway WebSocket disconnected — unlock commands will not reach hardware.',
    });
  }

  if (context.gateways?.length > 1) {
    const names = context.gateways.map((g) => `${g.name ?? g.id} (${g.status ?? 'unknown'})`).join(', ');
    findings.push({
      severity: 'info',
      code: 'multi_gateway_facility',
      message: `Facility has ${context.gateways.length} gateways: ${names}. Reports use primary \`${context.gateway?.id ?? 'unknown'}\` unless --gateway is set.`,
    });
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = f.code ?? f.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderAccessReport(context) {
  const lines = [];
  const session = context.sessionDetail?.session;

  if (session) {
    lines.push(`## Session: \`${session.id}\``);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|--------|');
    lines.push(`| State | **${session.state}** (${session.outcome ?? '—'}) |`);
    lines.push(`| User | ${session.user_name ?? session.user_id ?? '—'} |`);
    lines.push(`| Unit | ${session.unit_number ?? '—'} @ ${session.facility_name ?? session.facility_id ?? '—'} |`);
    lines.push(`| Method | ${session.method ?? '—'} (${session.origin ?? '—'}) |`);
    lines.push(`| Device | ${session.device_serial ?? session.device_name ?? session.device_id ?? '—'} |`);
    lines.push(`| Started | ${formatTs(sessionStartedAt(session))} |`);
    if (session.settled_at) lines.push(`| Settled | ${formatTs(session.settled_at)} |`);
    if (session.open_duration_sec != null) lines.push(`| Open duration | ${session.open_duration_sec}s |`);
    if (session.denial_reason || session.reason) {
      lines.push(`| Reason | ${session.denial_reason ?? session.reason} |`);
    }
    lines.push('');

    const meta = session.metadata ?? {};
    if (meta.tenant_unlock_override) {
      lines.push('**Tenant unlock override:**');
      lines.push(`- ${meta.tenant_unlock_override.reason_label ?? meta.tenant_unlock_override.reason}`);
      lines.push('');
    }
  }

  const events = context.sessionDetail?.events ?? [];
  if (events.length) {
    lines.push('### Event timeline');
    lines.push('');
    lines.push('| Time | Action | Method | OK |');
    lines.push('|------|--------|--------|-----|');
    for (const ev of events) {
      lines.push(
        `| ${formatTs(ev.occurred_at ?? ev.created_at)} | ${ev.action ?? '—'} | ${ev.method ?? '—'} | ${ev.success ?? '—'} |`,
      );
    }
    lines.push('');
  }

  if (context.sessions?.length) {
    lines.push(`## Recent sessions (${context.sessionTotal ?? context.sessions.length} total)`);
    lines.push('');
    lines.push('| State | Outcome | User | Unit | Method | Started |');
    lines.push('|-------|---------|------|------|--------|---------|');
    for (const s of context.sessions.slice(0, 15)) {
      lines.push(
        `| ${s.state} | ${s.outcome ?? '—'} | ${s.user_name ?? '—'} | ${s.unit_number ?? '—'} | ${s.method ?? '—'} | ${formatTs(sessionStartedAt(s))} |`,
      );
    }
    lines.push('');
  }

  if (context.gatewayTrace?.snapshot) {
    lines.push(renderTraceSummary(context.gatewayTrace.snapshot));
  }

  if (context.wsStatus) {
    lines.push('## Gateway WebSocket');
    lines.push('');
    lines.push(`- Connected: **${context.wsStatus.connected ?? 'unknown'}**`);
    if (context.wsStatus.lastPongAt) {
      lines.push(`- Last pong: ${formatTs(context.wsStatus.lastPongAt)}`);
    }
    lines.push('');
  }

  if (context.gateways?.length) {
    lines.push(`## Facility gateways (${context.gateways.length})`);
    lines.push('');
    lines.push('| Name | Status | Last seen | ID |');
    lines.push('|------|--------|-----------|-----|');
    for (const g of context.gateways) {
      const mark = g.id === context.gateway?.id ? ' ← primary' : '';
      lines.push(
        `| ${g.name ?? '—'} | ${g.status ?? '—'} | ${formatTs(g.last_seen)} | \`${g.id}\`${mark} |`,
      );
    }
    lines.push('');
  }

  if (context.telemetry?.logs?.length) {
    lines.push('## Gateway telemetry (near session window)');
    lines.push('');
    for (const log of context.telemetry.logs.slice(0, 12)) {
      const s = summarizeTelemetryLog(log);
      const gw = log._gateway_id && context.gateways?.length > 1
        ? ` gw:${String(log._gateway_id).slice(0, 8)}`
        : '';
      lines.push(`- ${s.at} [${s.source}${gw}] ${s.summary}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderTraceSummary(snapshot) {
  const lines = ['## Gateway session trace (Cloud Run instance snapshot)', ''];
  lines.push(`Captured: ${formatTs(snapshot.captured_at)}`);
  if (snapshot.process?.note) lines.push(`> ${snapshot.process.note}`);
  lines.push('');

  const debug = snapshot.debug ?? {};
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Live sessions | ${debug.live_session_count ?? snapshot.live_sessions?.length ?? 0} |`);
  lines.push(`| Recent sessions | ${debug.recent_session_count ?? snapshot.recent_sessions?.length ?? 0} |`);
  lines.push(`| Raw events | ${debug.raw_event_count ?? snapshot.raw_events?.length ?? 0} |`);
  lines.push(`| Pending commands (memory) | ${debug.pending_memory_count ?? 0} |`);
  lines.push(`| Pending commands (durable) | ${debug.pending_durable_count ?? 0} |`);
  lines.push('');

  const pending = snapshot.pending_attributions ?? [];
  if (pending.length) {
    lines.push('### Pending gateway commands');
    lines.push('');
    for (const p of pending.slice(0, 8)) {
      lines.push(
        `- \`${p.command_id}\` → ${p.requested_status} on device \`${p.device_id}\`${p.session_id ? ` (session \`${p.session_id}\`)` : ''}`,
      );
    }
    lines.push('');
  }

  const decisions = snapshot.correlator_decisions ?? [];
  if (decisions.length) {
    lines.push('### Recent correlator decisions');
    lines.push('');
    for (const d of decisions.slice(-10)) {
      lines.push(
        `- ${formatTs(d.at)} **${d.hook ?? d.kind}** — ${d.decision ?? JSON.stringify(d.payload ?? {}).slice(0, 80)}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function accessNextCommands(context) {
  const session = context.sessionDetail?.session;
  const facilityId = session?.facility_id ?? context.facilityId;
  const gatewayId = context.gateway?.id;
  const userId = context.user?.id ?? session?.user_id;
  const cmds = [];
  if (session?.id) {
    cmds.push(
      `node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs incident --session ${session.id} --report`,
    );
  }
  if (facilityId) {
    cmds.push(
      `node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs gateway --facility ${facilityId} --trace --telemetry --ws-status --report`,
    );
  }
  if (gatewayId && session?.device_id) {
    cmds.push(
      `node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs gateway --gateway ${gatewayId} --trace --device ${session.device_id} --report`,
    );
  }
  if (userId) {
    cmds.push(
      `node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs access --user ${userId} --raw --limit 20`,
    );
    if (['tenant', 'maintenance'].includes(context.user?.role ?? session?.actor_role)) {
      cmds.push(
        `node .cursor/skills/debug-blulok-deployment/scripts/blulok-debug.mjs route-pass --user ${userId} --report`,
      );
    }
  }
  return cmds;
}
