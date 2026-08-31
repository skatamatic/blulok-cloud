import { resolveSessionRecordOnce } from '@/services/access/access-session-record-resolver';
import type { AccessSessionReadService } from '@/services/access/access-session-read.service';
import type { AccessSessionUpsertEvent } from '@/services/events/access-session-events.service';

const makeEvent = (sessionId = 'sess-1'): AccessSessionUpsertEvent =>
  ({
    sessionId,
    facilityId: 'facility-1',
    unitId: 'unit-1',
    deviceId: 'device-1',
    state: 'open',
    changed: ['state'],
    session: { id: sessionId } as never,
    timestamp: new Date('2026-01-01T00:00:00Z'),
  }) as AccessSessionUpsertEvent;

const makeReadService = (result: unknown = { id: 'sess-1', state: 'open' }) => {
  const findSessionRecordById = jest.fn().mockResolvedValue(result);
  return {
    service: { findSessionRecordById } as unknown as AccessSessionReadService,
    findSessionRecordById,
  };
};

describe('resolveSessionRecordOnce', () => {
  it('returns the enriched record from the read service', async () => {
    const event = makeEvent();
    const { service, findSessionRecordById } = makeReadService();

    await expect(resolveSessionRecordOnce(event, service)).resolves.toEqual({
      id: 'sess-1',
      state: 'open',
    });
    expect(findSessionRecordById).toHaveBeenCalledWith('sess-1');
  });

  it('queries once when several consumers handle the same event', async () => {
    const event = makeEvent();
    const { service, findSessionRecordById } = makeReadService();

    const [dashboard, app] = await Promise.all([
      resolveSessionRecordOnce(event, service),
      resolveSessionRecordOnce(event, service),
    ]);

    expect(findSessionRecordById).toHaveBeenCalledTimes(1);
    expect(dashboard).toBe(app);
  });

  it('shares the in-flight promise rather than waiting for the first to settle', () => {
    const event = makeEvent();
    const { service } = makeReadService();

    expect(resolveSessionRecordOnce(event, service)).toBe(
      resolveSessionRecordOnce(event, service),
    );
  });

  it('memoises per event, so a later event triggers its own read', async () => {
    const { service, findSessionRecordById } = makeReadService();

    await resolveSessionRecordOnce(makeEvent('sess-1'), service);
    await resolveSessionRecordOnce(makeEvent('sess-2'), service);

    expect(findSessionRecordById).toHaveBeenCalledTimes(2);
    expect(findSessionRecordById).toHaveBeenNthCalledWith(1, 'sess-1');
    expect(findSessionRecordById).toHaveBeenNthCalledWith(2, 'sess-2');
  });

  it('propagates a missing row as null to every consumer', async () => {
    const event = makeEvent();
    const { service } = makeReadService(null);

    await expect(resolveSessionRecordOnce(event, service)).resolves.toBeNull();
    await expect(resolveSessionRecordOnce(event, service)).resolves.toBeNull();
  });
});
