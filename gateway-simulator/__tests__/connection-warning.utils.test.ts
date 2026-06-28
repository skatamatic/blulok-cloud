import { describe, expect, it } from 'vitest';
import { isExpectedConnectionWarning } from '../src/renderer/utils/connection-warning.utils';
import type { GatewayInstanceState } from '../src/protocol/ipc-channels';

function gateway(partial: Partial<GatewayInstanceState>): GatewayInstanceState {
  return {
    id: 'gw-1',
    label: 'GW',
    backendUrl: 'http://127.0.0.1:3000',
    facilityId: 'fac-1',
    gatewayId: 'cloud-gw',
    connectionStatus: 'connected',
    devices: [],
    deviceSimByKey: {},
    behavior: {} as GatewayInstanceState['behavior'],
    events: [],
    ...partial,
  };
}

describe('connection-warning.utils', () => {
  it('treats swap candidate not_bound warnings as expected', () => {
    expect(
      isExpectedConnectionWarning(
        gateway({
          sessionRole: 'swap_candidate',
          connectionWarning: 'Inventory and state sync are only accepted from the bound production gateway',
        }),
      ),
    ).toBe(true);
  });

  it('still surfaces unexpected warnings on active sessions', () => {
    expect(
      isExpectedConnectionWarning(
        gateway({
          sessionRole: 'active',
          connectionWarning: 'Unexpected sync failure',
        }),
      ),
    ).toBe(false);
  });
});
