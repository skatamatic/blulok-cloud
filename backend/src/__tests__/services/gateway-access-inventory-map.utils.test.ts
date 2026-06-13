import {
  mapGatewayAccessInventoryFieldsToDbUpdate,
  mapGatewayAccessInventoryPropertiesToDbUpdate,
} from '@/utils/gateway-access-inventory-map.utils';

describe('mapGatewayAccessInventoryPropertiesToDbUpdate', () => {
  it('returns only changed property fields', () => {
    const update = mapGatewayAccessInventoryPropertiesToDbUpdate(
      { name: 'New Gate', location_description: 'North', device_type: 'gate' },
      { name: 'Old Gate', location_description: 'North', device_type: 'door' }
    );
    expect(update).toEqual({
      name: 'New Gate',
      device_type: 'gate',
    });
  });

  it('returns empty object when properties are unchanged', () => {
    const update = mapGatewayAccessInventoryPropertiesToDbUpdate(
      { name: 'Main Gate' },
      { name: 'Main Gate' }
    );
    expect(update).toEqual({});
  });
});

describe('mapGatewayAccessInventoryFieldsToDbUpdate', () => {
  it('maps name and telemetry fields together', () => {
    const update = mapGatewayAccessInventoryFieldsToDbUpdate({
      name: 'Main Gate',
      location_description: 'North entrance',
      device_type: 'gate',
      online: true,
      locked: false,
      last_seen: '2026-06-12T12:00:00.000Z',
    });

    expect(update).toEqual({
      name: 'Main Gate',
      location_description: 'North entrance',
      device_type: 'gate',
      status: 'online',
      is_locked: false,
      last_activity: new Date('2026-06-12T12:00:00.000Z'),
    });
  });
});
