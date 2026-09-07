import type { AccessSessionUpsertEvent } from '@/services/events/access-session-events.service';
import type {
  AccessSessionReadService,
  AccessSessionRecord,
} from '@/services/access/access-session-read.service';

/**
 * A single access session upsert fans out to several independent WebSocket
 * consumers (dashboard `/ws` and app `/ws/app`), each of which needs the same
 * join-enriched record. The emitter hands every listener the same event object,
 * so memoising the lookup against it collapses those reads into one query per
 * event. The entry dies with the event, so nothing is ever served stale.
 */
const recordByEvent = new WeakMap<
  AccessSessionUpsertEvent,
  Promise<AccessSessionRecord | null>
>();

export function resolveSessionRecordOnce(
  event: AccessSessionUpsertEvent,
  readService: AccessSessionReadService,
): Promise<AccessSessionRecord | null> {
  const memoised = recordByEvent.get(event);
  if (memoised) return memoised;

  const lookup = readService.findSessionRecordById(event.sessionId);
  recordByEvent.set(event, lookup);
  return lookup;
}
