import {
  makeWebSocketSubscriptionKey,
  parseWebSocketSubscriptionKey,
} from '@/utils/websocket-subscription.utils';

describe('websocket-subscription.utils', () => {
  it('builds stable subscription keys', () => {
    const filters = { facility_id: 'fac-1' };
    expect(makeWebSocketSubscriptionKey('activity', filters)).toBe(
      'activity:{"facility_id":"fac-1"}',
    );
    expect(makeWebSocketSubscriptionKey('units')).toBe('units');
  });

  it('parses subscription keys back into type and filters', () => {
    expect(parseWebSocketSubscriptionKey('battery_status')).toEqual({
      subscriptionType: 'battery_status',
    });
    expect(parseWebSocketSubscriptionKey('activity:{"facility_id":"fac-1"}')).toEqual({
      subscriptionType: 'activity',
      filters: { facility_id: 'fac-1' },
    });
  });
});
