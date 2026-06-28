import { describe, expect, it } from 'vitest';
import type { GatewayInstanceState } from '../src/protocol/ipc-channels';
import {
  groupGatewaysByFacility,
  resolveGatewayFacilityLabel,
} from '../src/renderer/utils/gateway-sidebar.utils';

function gateway(
  overrides: Partial<GatewayInstanceState> & Pick<GatewayInstanceState, 'id' | 'facilityId'>,
): GatewayInstanceState {
  return {
    label: overrides.id,
    backendUrl: 'http://localhost',
    gatewayId: overrides.id,
    connectionStatus: 'disconnected',
    devices: [],
    deviceSimByKey: {},
    behavior: { liveStateSync: false, autoRespondLock: true, autoRespondUnlock: true },
    events: [],
    ...overrides,
  };
}

describe('gateway sidebar utils', () => {
  it('resolves facility label from name or id', () => {
    expect(
      resolveGatewayFacilityLabel(
        gateway({ id: 'gw-1', facilityId: 'fac-1', facilityName: 'North Site' }),
      ),
    ).toBe('North Site');
    expect(resolveGatewayFacilityLabel(gateway({ id: 'gw-1', facilityId: 'fac-1' }))).toBe('fac-1');
  });

  it('groups gateways by facility and sorts groups by label', () => {
    const groups = groupGatewaysByFacility([
      gateway({ id: 'gw-a', facilityId: 'fac-z', facilityName: 'Zulu Yard' }),
      gateway({ id: 'gw-b', facilityId: 'fac-a', facilityName: 'Alpha Storage' }),
      gateway({ id: 'gw-c', facilityId: 'fac-a', facilityName: 'Alpha Storage' }),
    ]);

    expect(groups.map((g) => g.facilityLabel)).toEqual(['Alpha Storage', 'Zulu Yard']);
    expect(groups[0]?.gateways.map((g) => g.id)).toEqual(['gw-b', 'gw-c']);
    expect(groups[1]?.gateways.map((g) => g.id)).toEqual(['gw-a']);
  });
});
