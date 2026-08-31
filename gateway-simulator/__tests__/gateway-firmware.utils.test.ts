import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION,
  resolveSimulatorGatewayFirmwareVersion,
} from '../src/main/core/gateway-firmware.utils';

describe('gateway-firmware.utils', () => {
  it('prefers profile version over legacy inventory and default', () => {
    expect(
      resolveSimulatorGatewayFirmwareVersion({
        profileVersion: ' 3.0.0 ',
        legacyInventoryVersion: '9.9.9',
      }),
    ).toBe('3.0.0');
  });

  it('falls back to legacy inventory version', () => {
    expect(
      resolveSimulatorGatewayFirmwareVersion({ legacyInventoryVersion: '2.1.0' }),
    ).toBe('2.1.0');
  });

  it('uses default when no version is stored', () => {
    expect(resolveSimulatorGatewayFirmwareVersion({})).toBe(
      DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION,
    );
  });
});
