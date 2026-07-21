import { describe, expect, it } from 'vitest';
import {
  isAppRealtimeHeartbeat,
  summarizeAppRealtimeMessage,
} from '../src/main/net/app-realtime-message.utils';
import { wsAppUrl } from '../src/protocol/constants';

describe('app realtime message utils', () => {
  it('summarizes app_snapshot events', () => {
    const result = summarizeAppRealtimeMessage({
      type: 'app_event',
      event: 'app_snapshot',
      facilityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      data: { devices: [] },
    });
    expect(result.eventName).toBe('app_snapshot');
    expect(result.summary).toContain('app_snapshot');
    expect(result.summary).toContain('aaaaaaaa');
  });

  it('summarizes subscription ack', () => {
    const result = summarizeAppRealtimeMessage({
      type: 'subscription',
      subscriptionType: 'app',
      data: { message: 'Subscription created successfully', facility_id: 'fac-1' },
    });
    expect(result.summary).toContain('subscription');
    expect(result.summary).toContain('Subscription created successfully');
  });

  it('detects heartbeats', () => {
    expect(
      isAppRealtimeHeartbeat({
        summary: 'heartbeat — Server heartbeat',
        payload: { type: 'heartbeat' },
      }),
    ).toBe(true);
    expect(
      isAppRealtimeHeartbeat({
        summary: 'app_snapshot · fac aaaaaaaa…',
        payload: { type: 'app_event', event: 'app_snapshot' },
      }),
    ).toBe(false);
  });
});

describe('wsAppUrl', () => {
  it('builds /ws/app with token query', () => {
    expect(wsAppUrl('http://127.0.0.1:3000', 'tok.en')).toBe(
      'ws://127.0.0.1:3000/ws/app?token=tok.en',
    );
  });
});
