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
    findBluLokDevices = jest.fn().mockResolvedValue([]);
    findUnitById = jest.fn().mockResolvedValue(null);

    (DeviceModel as unknown as jest.Mock).mockImplementation(() => ({
      findBluLokDeviceById,
      findBluLokDeviceByIdOrSerial,
      findAccessControlDeviceWithGateway,
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

    const resolved = await resolver.resolve(baseEvent(), facilityId);

    expect(resolved.actor).toEqual({
      user_id: 'user-1',
      role: 'tenant',
      name: 'Casey Jones',
      app_device_id: undefined,
    });
    expect(resolved.device_id).toBe('cloud-device-1');
    expect(resolved.unit_id).toBe('unit-1');
    expect(resolved.metadata?.resolved_device_id).toBe('cloud-device-1');
    expect(resolved.metadata?.gateway_device_id).toBe('hw-lock-1');
  });

  it('resolves access-control devices by cloud id', async () => {
    findAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      facility_id: facilityId,
    });

    const resolved = await resolver.resolve(
      {
        ...baseEvent(),
        device_id: 'ac-1',
        metadata: { placeholder_fields: true },
      },
      facilityId,
    );

    expect(resolved.device_id).toBe('ac-1');
    expect(resolved.actor?.name).toBe('Casey Jones');
  });

  it('keeps user_id but drops placeholder name when user row is missing', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue(undefined);
    findBluLokDeviceById.mockResolvedValue({
      id: 'hw-lock-1',
      facility_id: facilityId,
      unit_id: null,
    });

    const resolved = await resolver.resolve(baseEvent(), facilityId);

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

    const resolved = await resolver.resolve(baseEvent(), facilityId);

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

    const resolved = await resolver.resolve(baseEvent(), facilityId);

    expect(resolved.unit_id).toBeUndefined();
    expect(findUnitById).not.toHaveBeenCalledWith('unknown-unit-id');
  });
});
