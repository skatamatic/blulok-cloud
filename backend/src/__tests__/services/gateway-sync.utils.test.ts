import {
  extractAccessId,
  formatAccessDeviceKey,
  isGatewaySyncManaged,
  isValidRelayChannel,
  partitionInventoryByKind,
  partitionInventoryItems,
  partitionStateUpdatesByKind,
  resolveAccessDeviceKey,
  resolveAccessRelayChannel,
  resolveGatewayDeviceKind,
} from '../../utils/gateway-sync.utils';

describe('gateway-sync.utils', () => {
  describe('resolveAccessDeviceKey', () => {
    it('uses device_serial when present', () => {
      expect(resolveAccessDeviceKey({ device_serial: 'KP-1', relay_channel: 2 })).toBe('KP-1::2');
    });

    it('throws when device_serial is missing', () => {
      expect(() => resolveAccessDeviceKey({ relay_channel: 4 })).toThrow(/device_serial/);
    });
  });

  describe('resolveAccessRelayChannel', () => {
    it('defaults to 1 when omitted', () => {
      expect(resolveAccessRelayChannel(undefined)).toBe(1);
      expect(resolveAccessRelayChannel(null)).toBe(1);
    });

    it('passes through valid channel numbers', () => {
      expect(resolveAccessRelayChannel(4)).toBe(4);
    });
  });

  describe('isValidRelayChannel', () => {
    it('accepts channels 1 through 8', () => {
      expect(isValidRelayChannel(1)).toBe(true);
      expect(isValidRelayChannel(8)).toBe(true);
    });

    it('rejects out of range values', () => {
      expect(isValidRelayChannel(0)).toBe(false);
      expect(isValidRelayChannel(9)).toBe(false);
      expect(isValidRelayChannel(1.5)).toBe(false);
    });
  });

  describe('isGatewaySyncManaged', () => {
    it('returns true when createdFromGatewaySync is set', () => {
      expect(isGatewaySyncManaged({ createdFromGatewaySync: true })).toBe(true);
    });

    it('returns false for manual devices', () => {
      expect(isGatewaySyncManaged({})).toBe(false);
      expect(isGatewaySyncManaged(null)).toBe(false);
    });

    it('returns false when adminIdentityOverride is set', () => {
      expect(
        isGatewaySyncManaged({ createdFromGatewaySync: true, adminIdentityOverride: true })
      ).toBe(false);
    });
  });

  describe('formatAccessDeviceKey', () => {
    it('combines serial and relay channel', () => {
      expect(formatAccessDeviceKey('KP-001', 2)).toBe('KP-001::2');
    });
  });

  describe('extractAccessId', () => {
    it('reads access_id', () => {
      expect(extractAccessId({ access_id: ' KP-7 ' })).toBe('KP-7');
    });

    it('throws when missing', () => {
      expect(() => extractAccessId({ relay_channel: 1 })).toThrow(/access_id/);
    });
  });

  describe('resolveGatewayDeviceKind', () => {
    it('returns explicit lock kind', () => {
      expect(resolveGatewayDeviceKind({ kind: 'lock', lock_id: 'serial-1' })).toBe('lock');
    });

    it('returns explicit access_control kind', () => {
      expect(
        resolveGatewayDeviceKind({ kind: 'access_control', access_id: 'KP-1', relay_channel: 1 })
      ).toBe('access_control');
    });

    it('requires kind on every item', () => {
      expect(() => resolveGatewayDeviceKind({ lock_id: 'serial-1' })).toThrow(/kind/);
      expect(() => resolveGatewayDeviceKind({ access_id: 'KP-001', relay_channel: 2 })).toThrow(/kind/);
    });
  });

  describe('partitionInventoryByKind', () => {
    it('splits mixed inventory payloads by explicit kind', () => {
      const result = partitionInventoryByKind([
        { kind: 'lock', lock_id: 'lock-1' },
        { kind: 'access_control', access_id: 'KP-3', relay_channel: 3 },
      ]);

      expect(result.locks).toHaveLength(1);
      expect(result.accessControl).toHaveLength(1);
    });
  });

  describe('partitionInventoryItems', () => {
    it('routes network infra and gateway update items separately', () => {
      const result = partitionInventoryItems([
        { kind: 'lock', lock_id: 'lock-1' },
        { kind: 'bridge', serial: 'BR-1' },
        { kind: 'friend_node', serial: 'FN-1' },
        { kind: 'gateway', firmware_version: '1.2.3' },
      ]);

      expect(result.locks).toHaveLength(1);
      expect(result.networkInfra).toHaveLength(2);
      expect(result.gatewayUpdates).toHaveLength(1);
    });

    it('rejects unknown kinds', () => {
      expect(() => partitionInventoryItems([{ kind: 'sensor', serial: 'X' }])).toThrow(/kind must be one of/);
    });
  });

  describe('partitionStateUpdatesByKind', () => {
    it('splits mixed state payloads by explicit kind', () => {
      const result = partitionStateUpdatesByKind([
        { kind: 'lock', lock_id: 'lock-1', online: true },
        { kind: 'access_control', access_id: 'KP-2', relay_channel: 2, locked: true },
      ]);

      expect(result.locks).toHaveLength(1);
      expect(result.accessControl).toHaveLength(1);
    });
  });
});
