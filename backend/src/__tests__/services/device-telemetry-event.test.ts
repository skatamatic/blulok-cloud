/**
 * Device Telemetry Event Emission Tests
 *
 * Tests that device state updates properly emit events for:
 * - Lock status changes (emits LOCK_STATUS_CHANGED)
 * - Device status changes (emits DEVICE_STATUS_CHANGED)
 * - Telemetry-only updates (emits DEVICE_TELEMETRY_UPDATED)
 */

import { DeviceEventService, DeviceEvent } from '@/services/device-event.service';

describe('Device Telemetry Event Emission', () => {
  let eventService: DeviceEventService;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset the singleton instance for testing
    (DeviceEventService as any).instance = undefined;
    eventService = DeviceEventService.getInstance();
    emitSpy = jest.spyOn(eventService, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  describe('emitDeviceTelemetryUpdated', () => {
    it('should emit DEVICE_TELEMETRY_UPDATED event with deviceId and gatewayId', () => {
      const event = {
        deviceId: 'device-1',
        gatewayId: 'gateway-1',
        facilityId: 'facility-1',
      };

      eventService.emitDeviceTelemetryUpdated(event);

      expect(emitSpy).toHaveBeenCalledWith(DeviceEvent.DEVICE_TELEMETRY_UPDATED, event);
    });

    it('should emit event with only deviceId when gatewayId is undefined', () => {
      const event = {
        deviceId: 'device-1',
      };

      eventService.emitDeviceTelemetryUpdated(event);

      expect(emitSpy).toHaveBeenCalledWith(DeviceEvent.DEVICE_TELEMETRY_UPDATED, event);
    });
  });

  describe('emitLockStatusChanged', () => {
    it('should emit LOCK_STATUS_CHANGED event', () => {
      const event = {
        deviceId: 'device-1',
        oldStatus: 'locked' as const,
        newStatus: 'unlocked' as const,
        gatewayId: 'gateway-1',
        unitId: 'unit-1',
      };

      eventService.emitLockStatusChanged(event);

      expect(emitSpy).toHaveBeenCalledWith(DeviceEvent.LOCK_STATUS_CHANGED, event);
    });
  });

  describe('emitDeviceStatusChanged', () => {
    it('should emit DEVICE_STATUS_CHANGED event', () => {
      const event = {
        deviceId: 'device-1',
        deviceType: 'blulok' as const,
        oldStatus: 'online',
        newStatus: 'offline',
        gatewayId: 'gateway-1',
      };

      eventService.emitDeviceStatusChanged(event);

      expect(emitSpy).toHaveBeenCalledWith(DeviceEvent.DEVICE_STATUS_CHANGED, event);
    });
  });

  describe('DeviceEvent enum', () => {
    it('should have DEVICE_TELEMETRY_UPDATED event type', () => {
      expect(DeviceEvent.DEVICE_TELEMETRY_UPDATED).toBe('deviceTelemetryUpdated');
    });

    it('should have all required event types', () => {
      expect(DeviceEvent.LOCK_STATUS_CHANGED).toBe('lockStatusChanged');
      expect(DeviceEvent.DEVICE_STATUS_CHANGED).toBe('deviceStatusChanged');
      expect(DeviceEvent.DEVICE_ADDED).toBe('deviceAdded');
      expect(DeviceEvent.DEVICE_REMOVED).toBe('deviceRemoved');
      expect(DeviceEvent.DEVICE_ASSIGNED).toBe('deviceAssigned');
      expect(DeviceEvent.DEVICE_UNASSIGNED).toBe('deviceUnassigned');
    });
  });
});
