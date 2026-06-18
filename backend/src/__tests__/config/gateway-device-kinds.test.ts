import {
  ALLOWED_INVENTORY_KINDS,
  isAllowedInventoryKind,
  isNetworkInfraSyncKind,
  mapInfraStateToStatus,
} from '@/config/gateway-device-kinds';

describe('gateway-device-kinds', () => {
  it('includes operational and network infra kinds in allowlist', () => {
    expect(ALLOWED_INVENTORY_KINDS).toEqual(
      expect.arrayContaining(['lock', 'access_control', 'bridge', 'friend_node', 'gateway']),
    );
  });

  it('validates allowlisted inventory kinds', () => {
    expect(isAllowedInventoryKind('bridge')).toBe(true);
    expect(isAllowedInventoryKind('sensor')).toBe(false);
  });

  it('identifies sync-managed network infra kinds', () => {
    expect(isNetworkInfraSyncKind('bridge')).toBe(true);
    expect(isNetworkInfraSyncKind('gateway')).toBe(false);
  });

  it('maps healthy/error states to UI statuses', () => {
    expect(mapInfraStateToStatus('healthy')).toBe('online');
    expect(mapInfraStateToStatus('error')).toBe('error');
    expect(mapInfraStateToStatus(undefined)).toBe('unknown');
  });
});
