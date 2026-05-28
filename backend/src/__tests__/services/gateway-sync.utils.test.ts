import {
  extractAccessId,
  formatAccessDeviceKey,
  inferDeviceKind,
  inferStateUpdateKind,
  isGatewaySyncManaged,
  isValidRelayChannel,
  partitionInventoryByKind,
  partitionStateUpdatesByKind,
  resolveAccessDeviceKey,
} from '../../utils/gateway-sync.utils';

describe('gateway-sync.utils', () => {
  describe('resolveAccessDeviceKey', () => {
    it('uses device_serial when present', () => {
      expect(resolveAccessDeviceKey({ device_serial: 'KP-1', relay_channel: 2 })).toBe('KP-1::2');
    });

    it('falls back for legacy rows missing serial', () => {
      expect(resolveAccessDeviceKey({ id: 'abc-def-ghi', relay_channel: 4 })).toBe('legacy-abc-def-::4');
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

    it('returns true for legacy createdFromInventorySync rows', () => {
      expect(isGatewaySyncManaged({ createdFromInventorySync: true })).toBe(true);
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

    it('accepts device_serial alias', () => {
      expect(extractAccessId({ device_serial: 'AC-123' })).toBe('AC-123');
    });

    it('throws when missing', () => {
      expect(() => extractAccessId({ relay_channel: 1 })).toThrow(/access_id/);
    });
  });

  describe('inferDeviceKind', () => {
    it('infers lock from lock_id', () => {
      expect(inferDeviceKind({ lock_id: 'serial-1' })).toBe('lock');
    });

    it('infers access_control from access_id', () => {
      expect(inferDeviceKind({ access_id: 'KP-001', relay_channel: 2 })).toBe('access_control');
    });

    it('respects explicit kind', () => {
      expect(inferDeviceKind({ kind: 'access_control', access_id: 'KP-1', relay_channel: 1 })).toBe(
        'access_control'
      );
    });

    it('rejects ambiguous lock_id + access_id', () => {
      expect(() => inferDeviceKind({ lock_id: 'a', access_id: 'b' })).toThrow(/kind/);
    });

    it('requires lock_id or access_id', () => {
      expect(() => inferDeviceKind({ relay_channel: 2 })).toThrow(/lock_id or access_id/);
    });
  });

  describe('partitionInventoryByKind', () => {
    it('splits mixed inventory payloads', () => {
      const result = partitionInventoryByKind([
        { lock_id: 'lock-1' },
        { kind: 'access_control', access_id: 'KP-3', relay_channel: 3 },
      ]);

      expect(result.locks).toHaveLength(1);
      expect(result.accessControl).toHaveLength(1);
    });
  });

  describe('partitionStateUpdatesByKind', () => {
    it('splits mixed state payloads', () => {
      const result = partitionStateUpdatesByKind([
        { lock_id: 'lock-1', online: true },
        { kind: 'access_control', access_id: 'KP-2', relay_channel: 2, locked: true },
      ]);

      expect(result.locks).toHaveLength(1);
      expect(result.accessControl).toHaveLength(1);
    });

    it('infers access_control state updates from access_id', () => {
      const result = partitionStateUpdatesByKind([
        { access_id: 'KP-4', relay_channel: 4, online: false },
      ]);
      expect(result.accessControl).toHaveLength(1);
    });
  });

  describe('inferStateUpdateKind', () => {
    it('requires lock_id or access_id', () => {
      expect(() => inferStateUpdateKind({ online: true })).toThrow(/lock_id or access_id/);
    });
  });
});
