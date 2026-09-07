import {
  isGatewayLockStateAccessEventEcho,
  lockStateEchoPolarity,
} from '@/utils/access-event-lock-state-echo.utils';
import type { AccessEventPayload } from '@/services/access/access-event.types';

function event(overrides: Partial<AccessEventPayload> = {}): AccessEventPayload {
  return {
    event_id: 'gateway-echo',
    occurred_at: '2026-09-05T01:23:44.000Z',
    facility_id: 'fac-1',
    device_id: 'hw-lock-1',
    action: 'access_granted',
    method: 'mobile_key',
    success: true,
    actor: { role: 'unknown', name: 'user' },
    metadata: {
      source: 'gateway_lock_state',
      lock: 'closed',
      event: 'none',
      reason: 'none',
      hardware_lock_id: 'hw-lock-1',
      lock_number: 15,
      placeholder_fields: true,
      unit_id: 'unknown-unit-id',
    },
    ...overrides,
  };
}

describe('isGatewayLockStateAccessEventEcho', () => {
  it('flags lock-state heartbeats wrapped as mobile_key grants', () => {
    expect(isGatewayLockStateAccessEventEcho(event())).toBe(true);
  });

  it('does not flag a real grant (event granted + user)', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({
          event_id: 'app-real',
          actor: { role: 'tenant', user_id: 'user-1', name: 'Tester Two' },
          metadata: {
            source: 'gateway_lock_state',
            lock: 'closed',
            event: 'granted',
            hardware_lock_id: 'hw-lock-1',
          },
        }),
      ),
    ).toBe(false);
  });

  it('does not flag event granted without a user (keep the credential row)', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({
          metadata: {
            source: 'gateway_lock_state',
            lock: 'closed',
            event: 'granted',
            hardware_lock_id: 'hw-lock-1',
          },
        }),
      ),
    ).toBe(false);
  });

  it('does not flag keypad attempts', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({
          action: 'keypad_attempt',
          method: 'keypad',
          keypad: { entered_code: '1234' },
        }),
      ),
    ).toBe(false);
  });

  it('does not flag a plain mobile_key grant with no lock-state envelope', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({
          actor: { role: 'tenant', user_id: 'user-1', name: 'Casey' },
          metadata: undefined,
        }),
      ),
    ).toBe(false);
  });

  it('does not flag a route-pass grant', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({
          method: 'route_pass',
          route_pass: { route_pass_id: 'rp-1' },
        }),
      ),
    ).toBe(false);
  });

  it('flags access_denied lock-state heartbeats the same way', () => {
    expect(
      isGatewayLockStateAccessEventEcho(
        event({ action: 'access_denied', success: false }),
      ),
    ).toBe(true);
  });
});

describe('lockStateEchoPolarity', () => {
  it('maps closed/open lock fields', () => {
    expect(lockStateEchoPolarity(event())).toBe('locked');
    expect(
      lockStateEchoPolarity(event({
        metadata: { source: 'gateway_lock_state', lock: 'opened', event: 'none', hardware_lock_id: 'hw' },
      })),
    ).toBe('unlocked');
    expect(
      lockStateEchoPolarity(event({
        metadata: { source: 'gateway_lock_state', lock: 'none', event: 'none', hardware_lock_id: 'hw' },
      })),
    ).toBe('unknown');
  });
});
