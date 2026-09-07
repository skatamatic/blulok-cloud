/** Summarize /ws/app messages for the simulator event log (pure, testable). */

export function summarizeAppRealtimeMessage(msg: unknown): {
  summary: string;
  eventName?: string;
} {
  if (!msg || typeof msg !== 'object') return { summary: String(msg) };
  const typed = msg as {
    type?: unknown;
    event?: unknown;
    subscriptionType?: unknown;
    data?: { message?: unknown; facility_id?: unknown; unreadCount?: unknown };
    facilityId?: unknown;
  };
  const type = typeof typed.type === 'string' ? typed.type : 'unknown';

  if (type === 'heartbeat') {
    const message = typed.data?.message;
    return {
      summary: typeof message === 'string' ? `heartbeat — ${message}` : 'heartbeat',
    };
  }

  if (type === 'app_event') {
    const eventName = typeof typed.event === 'string' ? typed.event : 'unknown';
    const facilityId = typeof typed.facilityId === 'string' ? typed.facilityId.slice(0, 8) : undefined;
    const extra =
      eventName === 'notifications_count_update' && typeof typed.data?.unreadCount === 'number'
        ? ` unread=${typed.data.unreadCount}`
        : '';
    return {
      summary: facilityId ? `${eventName} · fac ${facilityId}…${extra}` : `${eventName}${extra}`,
      eventName,
    };
  }

  if (type === 'subscription' || type === 'unsubscription') {
    const subType = typeof typed.subscriptionType === 'string' ? typed.subscriptionType : '';
    const message = typed.data?.message;
    const facilityId = typed.data?.facility_id;
    const parts = [type, subType].filter(Boolean);
    if (typeof message === 'string') parts.push(message);
    if (typeof facilityId === 'string') parts.push(`facility=${facilityId.slice(0, 8)}…`);
    return { summary: parts.join(' · ') };
  }

  if (type === 'error') {
    const code = (msg as { code?: unknown }).code;
    const message = (msg as { message?: unknown }).message;
    const error = (msg as { error?: unknown }).error;
    const detail =
      (typeof error === 'string' && error) ||
      (typeof message === 'string' && message) ||
      '';
    return {
      summary: `error${typeof code === 'string' ? ` ${code}` : ''}${detail ? `: ${detail}` : ''}`,
    };
  }

  return { summary: type };
}

export function isAppRealtimeHeartbeat(entry: { summary: string; payload?: unknown }): boolean {
  if (entry.summary.startsWith('heartbeat')) return true;
  if (entry.payload && typeof entry.payload === 'object' && 'type' in entry.payload) {
    return (entry.payload as { type?: string }).type === 'heartbeat';
  }
  return false;
}
