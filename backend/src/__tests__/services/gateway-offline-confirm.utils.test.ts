import { inboundLastSeenShowsReconnectAfterDisconnect } from '@/utils/gateway-offline-confirm.utils';

describe('inboundLastSeenShowsReconnectAfterDisconnect', () => {
  const disconnectedAt = Date.parse('2026-08-31T03:45:52.000Z');

  it('is false when last_seen is missing or invalid', () => {
    expect(inboundLastSeenShowsReconnectAfterDisconnect(null, disconnectedAt)).toBe(false);
    expect(inboundLastSeenShowsReconnectAfterDisconnect(undefined, disconnectedAt)).toBe(false);
    expect(inboundLastSeenShowsReconnectAfterDisconnect('not-a-date', disconnectedAt)).toBe(false);
  });

  it('is false when last_seen is from the previous AUTH (before disconnect)', () => {
    expect(
      inboundLastSeenShowsReconnectAfterDisconnect('2026-08-31T02:45:53.000Z', disconnectedAt),
    ).toBe(false);
  });

  it('is true when last_seen is after disconnect (other instance AUTH)', () => {
    expect(
      inboundLastSeenShowsReconnectAfterDisconnect('2026-08-31T03:45:57.000Z', disconnectedAt),
    ).toBe(true);
    expect(
      inboundLastSeenShowsReconnectAfterDisconnect(new Date('2026-08-31T03:45:57.000Z'), disconnectedAt),
    ).toBe(true);
  });

  it('treats last_seen slightly before disconnect as reconnect when within clock skew', () => {
    expect(
      inboundLastSeenShowsReconnectAfterDisconnect('2026-08-31T03:45:51.000Z', disconnectedAt),
    ).toBe(true);
  });

  it('does not treat last_seen well before disconnect as reconnect', () => {
    expect(
      inboundLastSeenShowsReconnectAfterDisconnect('2026-08-31T03:45:48.000Z', disconnectedAt),
    ).toBe(false);
  });
});
