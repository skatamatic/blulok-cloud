import {
  mapGatewayLockInventoryPropertiesToDbUpdate,
  readBluLokDisplayName,
  readBluLokLockNumber,
} from '@/utils/gateway-lock-inventory-map.utils';

describe('mapGatewayLockInventoryPropertiesToDbUpdate', () => {
  it('updates displayName when gateway name changes', () => {
    const update = mapGatewayLockInventoryPropertiesToDbUpdate(
      { name: 'Front Door' },
      { device_settings: { displayName: 'Old', lockNumber: 1 } }
    );
    expect(update).toEqual({
      device_settings: { displayName: 'Front Door', lockNumber: 1 },
    });
  });

  it('returns null when properties are unchanged', () => {
    const update = mapGatewayLockInventoryPropertiesToDbUpdate(
      { name: 'Front Door', lock_number: 1 },
      { device_settings: { displayName: 'Front Door', lockNumber: 1 } }
    );
    expect(update).toBeNull();
  });

  it('clears displayName when gateway sends empty name', () => {
    const update = mapGatewayLockInventoryPropertiesToDbUpdate(
      { name: '   ' },
      { device_settings: { displayName: 'Old', lockNumber: 2 } }
    );
    expect(update).toEqual({
      device_settings: { lockNumber: 2 },
    });
  });
});

describe('readBluLokDisplayName', () => {
  it('reads displayName from device_settings', () => {
    expect(readBluLokDisplayName({ device_settings: { displayName: 'Unit A' } })).toBe('Unit A');
  });
});

describe('readBluLokLockNumber', () => {
  it('reads lockNumber from device_settings', () => {
    expect(readBluLokLockNumber({ device_settings: { lockNumber: 2453 } })).toBe(2453);
  });
});
