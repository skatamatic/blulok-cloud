import {
  formatNetworkInfraStateKey,
  isEmptyNetworkInfraStatePatch,
  mapNetworkInfraStateUpdateToPatch,
} from '@/utils/gateway-network-infra-state-map.utils';

describe('gateway-network-infra-state-map.utils', () => {
  it('maps provided state fields only', () => {
    expect(
      mapNetworkInfraStateUpdateToPatch({
        kind: 'bridge',
        serial: 'BR-1',
        state: 'healthy',
        firmware_version: '2.0.0',
        last_seen: '2026-06-18T15:44:54.349684Z',
      }),
    ).toEqual({
      state: 'healthy',
      firmwareVersion: '2.0.0',
      lastSeen: expect.any(Date),
    });
  });

  it('ignores null firmware_version', () => {
    const patch = mapNetworkInfraStateUpdateToPatch({
      kind: 'friend_node',
      serial: 'FN-1',
      firmware_version: null,
      state: 'online',
    });
    expect(patch.firmwareVersion).toBeUndefined();
    expect(patch.state).toBe('online');
  });

  it('merges unknown fields into metadata', () => {
    expect(
      mapNetworkInfraStateUpdateToPatch({
        kind: 'friend_node',
        serial: '/192.168.3.176:35919',
        state: 'online',
        hop_count: 2,
      } as never),
    ).toEqual({
      state: 'online',
      metadata: { hop_count: 2 },
    });
  });

  it('detects empty patches', () => {
    expect(isEmptyNetworkInfraStatePatch({})).toBe(true);
    expect(isEmptyNetworkInfraStatePatch({ state: 'healthy' })).toBe(false);
  });

  it('formats composite keys', () => {
    expect(formatNetworkInfraStateKey('bridge', 'BR-1')).toBe('bridge:BR-1');
  });
});
