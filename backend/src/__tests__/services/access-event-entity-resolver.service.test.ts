import { AccessEventEntityResolverService } from '@/services/access/access-event-entity-resolver.service';
import { DeviceModel } from '@/models/device.model';
import { UnitModel } from '@/models/unit.model';
import { UserModel } from '@/models/user.model';
import type { AccessEventPayload } from '@/services/access/access-event.types';

jest.mock('@/models/device.model');
jest.mock('@/models/unit.model');
jest.mock('@/models/user.model');

describe('AccessEventEntityResolverService', () => {
  const facilityId = 'fac-1';
  let resolver: AccessEventEntityResolverService;
  let findBluLokDeviceById: jest.Mock;
  let findBluLokDeviceByIdOrSerial: jest.Mock;
  let findAccessControlDeviceWithGateway: jest.Mock;
  let findAccessControlBySerialInFacility: jest.Mock;
  let findBluLokDevices: jest.Mock;
  let findUnitById: jest.Mock;

  const baseEvent = (): AccessEventPayload => ({
    event_id: 'evt-1',
    occurred_at: '2026-07-22T19:29:01.257Z',
    facility_id: facilityId,
    device_id: 'hw-lock-1',
    action: 'access_granted',
    method: 'mobile_key',
    success: true,
    actor: {
      role: 'unknown',
      user_id: 'user-1',
      name: 'Unknown User',
      app_device_id: 'unknown-app-device',
    },
    metadata: {
      placeholder_fields: true,
      lock_number: 121,
      unit_id: 'unknown-unit-id',
      hardware_lock_id: 'hw-lock-1',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findBluLokDeviceById = jest.fn().mockResolvedValue(null);
    findBluLokDeviceByIdOrSerial = jest.fn().mockResolvedValue(null);
    findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue(null);
    findAccessControlBySerialInFacility = jest.fn().mockResolvedValue(null);
    findBluLokDevices = jest.fn().mockResolvedValue([]);
    findUnitById = jest.fn().mockResolvedValue(null);

    (DeviceModel as unknown as jest.Mock).mockImplementation(() => ({
      findBluLokDeviceById,
      findBluLokDeviceByIdOrSerial,
      findAccessControlDeviceWithGateway,
      findAccessControlBySerialInFacility,
      findBluLokDevices,
    }));
    (UnitModel as unknown as jest.Mock).mockImplementation(() => ({
      findById: findUnitById,
    }));
    (UserModel.findById as jest.Mock) = jest.fn().mockResolvedValue({
      id: 'user-1',
      first_name: 'Casey',
      last_name: 'Jones',
      role: 'tenant',
    });

    resolver = new AccessEventEntityResolverService();
  });

  it('resolves user name/role from user_id and maps device+unit from hardware id', async () => {
    findBluLokDeviceByIdOrSerial.mockResolvedValue({
      id: 'cloud-device-1',
      unit_id: 'unit-1',
      gateway_id: 'gw-1',
    });
    findBluLokDeviceById.mockImplementation(async (id: string) => {
      if (id === 'cloud-device-1') {
        return {
          id: 'cloud-device-1',
          facility_id: facilityId,
          unit_id: 'unit-1',
        };
      }
      return null;
    });
    findUnitById.mockResolvedValue({ id: 'unit-1', facility_id: facilityId });

    const { event: resolved, deviceType } = await resolver.resolve(baseEvent(), facilityId);

    expect(deviceType).toBe('blulok');
    expect(resolved.actor).toEqual({
      user_id: 'user-1',
      role: 'tenant',
      name: 'Casey Jones',
      app_device_id: undefined,
    });
    expect(resolved.device_id).toBe('cloud-device-1');
    expect(resolved.unit_id).toBe('unit-1');
    expect(resolved.metadata?.resolved_device_id).toBe('cloud-device-1');
    expect(resolved.metadata?.hardware_device_id).toBe('hw-lock-1');
    expect(resolved.metadata?.gateway_device_id).toBe('hw-lock-1');
  });

  it('resolves access-control devices by cloud id', async () => {
    findAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      facility_id: facilityId,
    });

    const { event: resolved, deviceType } = await resolver.resolve(
      {
        ...baseEvent(),
        device_id: 'ac-1',
        metadata: { placeholder_fields: true },
      },
      facilityId,
    );

    expect(deviceType).toBe('access_control');
    expect(resolved.device_id).toBe('ac-1');
    expect(resolved.actor?.name).toBe('Casey Jones');
  });

  it('resolves access-control devices by hardware serial within the facility', async () => {
    findAccessControlBySerialInFacility.mockResolvedValue({
      id: 'ac-serial-1',
      facility_id: facilityId,
      device_serial: 'KP-FRONT',
    });

    const { event: resolved, deviceType } = await resolver.resolve(
      {
        ...baseEvent(),
        device_id: 'KP-FRONT',
        metadata: { relay_channel: 2 },
      },
      facilityId,
    );

    expect(findAccessControlBySerialInFacility).toHaveBeenCalledWith(facilityId, 'KP-FRONT', 2);
    expect(deviceType).toBe('access_control');
    expect(resolved.device_id).toBe('ac-serial-1');
    expect(resolved.metadata?.hardware_device_id).toBe('KP-FRONT');
  });

  it('resolves Keypad serial to cloud PK using device_type hint and top-level relay_channel', async () => {
    const serial = 'f759bd50-a70e-5bba-81c5-25e9a7c695c1';
    findAccessControlBySerialInFacility.mockResolvedValue({
      id: 'cloud-ac-keypad-1',
      facility_id: facilityId,
      device_serial: serial,
      relay_channel: 1,
    });

    const { event: resolved, deviceType } = await resolver.resolve(
      {
        ...baseEvent(),
        device_id: serial,
        device_type: 'access_control',
        relay_channel: 1,
        action: 'keypad_attempt',
        method: 'keypad',
        metadata: {},
      },
      facilityId,
    );

    expect(findAccessControlBySerialInFacility).toHaveBeenCalledWith(facilityId, serial, 1);
    expect(findBluLokDeviceById).not.toHaveBeenCalled();
    expect(deviceType).toBe('access_control');
    expect(resolved.device_id).toBe('cloud-ac-keypad-1');
    expect(resolved.metadata?.hardware_device_id).toBe(serial);
  });

  it('tries access-control before BluLok when device_type hint is access_control', async () => {
    findAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-first',
      facility_id: facilityId,
    });

    await resolver.resolve(
      {
        ...baseEvent(),
        device_id: 'shared-looking-id',
        device_type: 'access_control',
        metadata: {},
      },
      facilityId,
    );

    expect(findAccessControlDeviceWithGateway).toHaveBeenCalled();
    expect(findBluLokDeviceById).not.toHaveBeenCalled();
  });

  it('keeps user_id but drops placeholder name when user row is missing', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(undefined);
    findBluLokDeviceById.mockResolvedValue({
      id: 'hw-lock-1',
      facility_id: facilityId,
      unit_id: null,
    });

    const { event: resolved } = await resolver.resolve(baseEvent(), facilityId);

    expect(resolved.actor).toEqual({
      user_id: 'user-1',
      role: 'unknown',
      name: undefined,
      app_device_id: undefined,
    });
  });

  it('falls back to unique lock_number within the facility', async () => {
    findBluLokDevices.mockResolvedValue([
      {
        id: 'cloud-device-2',
        facility_id: facilityId,
        unit_id: 'unit-2',
        device_settings: { lockNumber: 121 },
      },
    ]);
    findUnitById.mockResolvedValue({ id: 'unit-2', facility_id: facilityId });

    const { event: resolved } = await resolver.resolve(baseEvent(), facilityId);

    expect(resolved.device_id).toBe('cloud-device-2');
    expect(resolved.unit_id).toBe('unit-2');
    expect(resolved.actor?.name).toBe('Casey Jones');
  });

  it('ignores placeholder unit ids that do not exist', async () => {
    findBluLokDeviceById.mockResolvedValue({
      id: 'hw-lock-1',
      facility_id: facilityId,
      unit_id: null,
    });

    const { event: resolved } = await resolver.resolve(baseEvent(), facilityId);

    expect(resolved.unit_id).toBeUndefined();
    expect(findUnitById).not.toHaveBeenCalledWith('unknown-unit-id');
  });
});
