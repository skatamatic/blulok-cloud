/**
 * Pure-helper coverage for access-session backfill correlation rules.
 */

import {
  asDate,
  clampBackfillDays,
  computeOpenDurationSec,
  cursorFromActivity,
  findLockInWindow,
  findLockInWindowIndexed,
  indexLocksByDevice,
  isDuplicateKeyError,
  isForeignKeyError,
  parseActivityMeta,
  parseBackfillCursor,
  pickBestHostSession,
  resolveRemoteBackfillState,
  shouldAdvanceExistingSession,
  BACKFILL_DEFAULT_DAYS,
  BACKFILL_MAX_DAYS,
} from '@/services/access/access-session-backfill.utils';

describe('access-session-backfill.utils', () => {
  describe('parseActivityMeta', () => {
    it('parses object, JSON string, and invalid input', () => {
      expect(parseActivityMeta({ a: 1 })).toEqual({ a: 1 });
      expect(parseActivityMeta('{"b":2}')).toEqual({ b: 2 });
      expect(parseActivityMeta('not-json')).toEqual({});
      expect(parseActivityMeta(null)).toEqual({});
    });
  });

  describe('clampBackfillDays', () => {
    it('defaults and caps at max', () => {
      expect(clampBackfillDays(undefined)).toBe(BACKFILL_DEFAULT_DAYS);
      expect(clampBackfillDays(0)).toBe(BACKFILL_DEFAULT_DAYS);
      expect(clampBackfillDays(999)).toBe(BACKFILL_MAX_DAYS);
      expect(clampBackfillDays(30)).toBe(30);
    });
  });

  describe('error classifiers', () => {
    it('detects duplicate and FK errors', () => {
      expect(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' })).toBe(true);
      expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
      expect(isDuplicateKeyError({ code: 'OTHER' })).toBe(false);
      expect(isForeignKeyError({ errno: 1452 })).toBe(true);
      expect(isForeignKeyError({ code: 'ER_NO_REFERENCED_ROW_2' })).toBe(true);
    });
  });

  describe('shouldAdvanceExistingSession', () => {
    it('does not downgrade pending from grant-only closed', () => {
      expect(
        shouldAdvanceExistingSession('pending', {
          state: 'closed',
          openedAt: null,
          closedAt: null,
        }),
      ).toBe(false);
    });

    it('advances pending when unlock or lock evidence exists', () => {
      expect(
        shouldAdvanceExistingSession('pending', {
          state: 'open',
          openedAt: new Date(),
          closedAt: null,
        }),
      ).toBe(true);
      expect(
        shouldAdvanceExistingSession('pending', {
          state: 'closed',
          openedAt: new Date(),
          closedAt: new Date(),
        }),
      ).toBe(true);
    });

    it('only closes open when a lock timestamp is present', () => {
      expect(
        shouldAdvanceExistingSession('open', {
          state: 'closed',
          openedAt: new Date(),
          closedAt: null,
        }),
      ).toBe(false);
      expect(
        shouldAdvanceExistingSession('open', {
          state: 'closed',
          openedAt: new Date(),
          closedAt: new Date(),
        }),
      ).toBe(true);
    });
  });

  describe('resolveRemoteBackfillState', () => {
    it('maps lock/unlock/grant-failure/grant-only correctly', () => {
      expect(resolveRemoteBackfillState({ hasUnlock: true, hasLock: true })).toEqual({
        state: 'closed',
        outcome: 'granted',
      });
      expect(resolveRemoteBackfillState({ hasUnlock: true, hasLock: false })).toEqual({
        state: 'open',
        outcome: 'granted',
      });
      expect(
        resolveRemoteBackfillState({
          hasUnlock: false,
          hasLock: false,
          grantResult: 'failure',
          grantMeta: { denial_reason: 'timeout' },
        }),
      ).toEqual({ state: 'timed_out', outcome: 'failed' });
      expect(
        resolveRemoteBackfillState({
          hasUnlock: false,
          hasLock: false,
          grantResult: 'success',
        }),
      ).toEqual({ state: 'closed', outcome: 'granted' });
    });
  });

  describe('findLockInWindow / indexed locks / pickBestHostSession', () => {
    const t0 = new Date('2026-01-01T12:00:00Z');

    it('finds the first unclaimed lock within the attach window', () => {
      const rows = [
        {
          id: 'lock-late',
          activity_type: 'lock',
          device_id: 'd1',
          occurred_at: new Date(t0.getTime() + 25 * 60 * 60 * 1000),
        },
        {
          id: 'lock-ok',
          activity_type: 'lock',
          device_id: 'd1',
          occurred_at: new Date(t0.getTime() + 60_000),
        },
      ];
      const found = findLockInWindow(rows, 'd1', t0, new Set());
      expect(found?.id).toBe('lock-ok');
      expect(findLockInWindow(rows, 'd1', t0, new Set(['lock-ok']))).toBeUndefined();
    });

    it('indexLocksByDevice sorts and findLockInWindowIndexed binary-searches', () => {
      const rows = [];
      for (let i = 0; i < 50; i++) {
        rows.push({
          id: `lock-${i}`,
          activity_type: 'lock' as const,
          device_id: 'd1',
          occurred_at: new Date(t0.getTime() + i * 60_000),
        });
      }
      rows.push({
        id: 'other',
        activity_type: 'lock' as const,
        device_id: 'd2',
        occurred_at: new Date(t0.getTime() + 10_000),
      });
      const index = indexLocksByDevice(rows);
      expect(index.get('d1')).toHaveLength(50);
      expect(index.get('d1')![0].id).toBe('lock-0');
      const unlockAt = new Date(t0.getTime() + 10 * 60_000);
      const found = findLockInWindowIndexed(index, 'd1', unlockAt, new Set(['lock-10']));
      expect(found?.id).toBe('lock-11');
      expect(findLockInWindowIndexed(index, 'd2', t0, new Set())).toMatchObject({ id: 'other' });
    });

    it('prefers open hosts over pending/closed', () => {
      const best = pickBestHostSession([
        {
          id: 'closed',
          device_id: 'd1',
          kind: 'access',
          state: 'closed',
          started_at: new Date('2026-01-01T13:00:00Z'),
        },
        {
          id: 'open',
          device_id: 'd1',
          kind: 'access',
          state: 'open',
          started_at: new Date('2026-01-01T11:00:00Z'),
        },
        {
          id: 'pending',
          device_id: 'd1',
          kind: 'access',
          state: 'pending',
          started_at: new Date('2026-01-01T12:00:00Z'),
        },
      ]);
      expect(best?.id).toBe('open');
    });
  });

  describe('cursor helpers', () => {
    it('serializes and parses resume cursors', () => {
      const row = { id: 'abc', occurred_at: '2026-06-01T10:00:00.000Z' };
      const cursor = cursorFromActivity(row);
      expect(cursor).toEqual({
        afterOccurredAt: '2026-06-01T10:00:00.000Z',
        afterId: 'abc',
      });
      const parsed = parseBackfillCursor(cursor);
      expect(parsed?.afterId).toBe('abc');
      expect(parsed?.afterOccurredAt.toISOString()).toBe('2026-06-01T10:00:00.000Z');
      expect(parseBackfillCursor(null)).toBeNull();
      expect(parseBackfillCursor({ afterOccurredAt: 'nope', afterId: 'x' })).toBeNull();
    });
  });

  describe('computeOpenDurationSec / asDate', () => {
    it('computes non-negative duration seconds', () => {
      const opened = asDate('2026-01-01T12:00:00Z');
      const closed = asDate('2026-01-01T12:01:30Z');
      expect(computeOpenDurationSec(opened, closed)).toBe(90);
      expect(computeOpenDurationSec(null, closed, 12)).toBe(12);
    });
  });
});
