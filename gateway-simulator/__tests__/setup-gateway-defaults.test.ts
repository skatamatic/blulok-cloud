import { describe, expect, it } from 'vitest';
import {
  buildExistingGatewayDefaults,
  buildNewGatewayDefaults,
} from '../src/renderer/utils/setup-gateway-defaults';

describe('setup-gateway-defaults', () => {
  it('builds numbered defaults for a new gateway', () => {
    const defaults = buildNewGatewayDefaults({ facilityName: 'North Site', tabIndex: 2 });
    expect(defaults.label).toBe('Gateway 3');
    expect(defaults.gatewayName).toBe('North Site Sim 3');
    expect(defaults.gatewaySerial).toMatch(/^SIM-GW-[A-F0-9]{8}$/);
  });

  it('prefills from an existing gateway record', () => {
    const defaults = buildExistingGatewayDefaults(
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        facility_id: 'fac-1',
        name: 'Lobby GW',
        mac_address: 'SN-LOBBY-1',
      },
      0,
    );
    expect(defaults.label).toBe('Lobby GW');
    expect(defaults.gatewayName).toBe('Lobby GW');
    expect(defaults.gatewaySerial).toBe('SN-LOBBY-1');
  });
});
