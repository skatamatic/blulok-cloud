import { AccessEventIngestionService } from '@/services/access/access-event-ingestion.service';
import { AccessEventEntityResolverService } from '@/services/access/access-event-entity-resolver.service';
import { ActivityService } from '@/services/activity.service';
import { DeviceModel } from '@/models/device.model';
import { UnitModel } from '@/models/unit.model';
import type { AccessEventPayload } from '@/services/access/access-event.types';

jest.mock('@/services/access/access-event-entity-resolver.service');
jest.mock('@/services/activity.service');
jest.mock('@/models/device.model');
jest.mock('@/models/unit.model');

const mockPeekCommandAttribution = jest.fn().mockReturnValue(null);
jest.mock('@/services/lock-command.service', () => ({
  LockCommandService: {
    getInstance: jest.fn(() => ({
      peekCommandAttribution: (...args: unknown[]) => mockPeekCommandAttribution(...args),
    })),
  },
}));

describe('AccessEventIngestionService', () => {
  const facilityId = 'fac-1';
  let logActivity: jest.Mock;
  let resolve: jest.Mock;
  let findBluLokDeviceById: jest.Mock;
  let findAccessControlDeviceWithGateway: jest.Mock;
  let findUnitById: jest.Mock;
  let service: AccessEventIngestionService;

  const rawEvent = (): AccessEventPayload => ({
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
      unit_id: 'unknown-unit-id',
      hardware_lock_id: 'hw-lock-1',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPeekCommandAttribution.mockReturnValue(null);
    logActivity = jest.fn().mockResolvedValue({ id: 'activity-1' });
    resolve = jest.fn();
    findBluLokDeviceById = jest.fn().mockResolvedValue({
      id: 'cloud-device-1',
      facility_id: facilityId,
    });
    findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue(null);
    findUnitById = jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: facilityId });

    (ActivityService.getInstance as jest.Mock) = jest.fn().mockReturnValue({
      logActivity,
    });
    (AccessEventEntityResolverService as unknown as jest.Mock).mockImplementation(() => ({
      resolve,
    }));
    (DeviceModel as unknown as jest.Mock).mockImplementation(() => ({
      findBluLokDeviceById,
      findAccessControlDeviceWithGateway,
    }));
    (UnitModel as unknown as jest.Mock).mockImplementation(() => ({
      findById: findUnitById,
    }));

    service = new AccessEventIngestionService();
  });

  it('persists resolver output (cloud device/unit/user) instead of gateway placeholders', async () => {
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        device_id: 'cloud-device-1',
        unit_id: 'unit-1',
        actor: {
          user_id: 'user-1',
          role: 'tenant',
          name: 'Casey Jones',
        },
        metadata: {
          placeholder_fields: true,
          resolved_device_id: 'cloud-device-1',
          gateway_device_id: 'hw-lock-1',
          resolved_unit_id: 'unit-1',
        },
      },
      deviceType: 'blulok',
    });

    await service.ingestOne(rawEvent(), {
      facilityId,
      source: 'gateway_internal_api',
    });

    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ device_id: 'hw-lock-1' }), facilityId);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        actorName: 'Casey Jones',
        deviceId: 'cloud-device-1',
        unitId: 'unit-1',
        entityId: 'cloud-device-1',
        metadata: expect.objectContaining({
          actor: expect.objectContaining({
            role: 'tenant',
            name: 'Casey Jones',
          }),
          actor_role: 'tenant',
          device_type: 'blulok',
        }),
      }),
    );
  });

  it('persists access_control device_type from the resolver', async () => {
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        device_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        actor: {
          user_id: 'user-1',
          role: 'admin',
          name: 'HQ Admin',
        },
      },
      deviceType: 'access_control',
    });
    findAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
      facility_id: facilityId,
    });

    await service.ingestOne(rawEvent(), {
      facilityId,
      source: 'gateway_internal_api',
    });

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
        metadata: expect.objectContaining({
          device_type: 'access_control',
        }),
      }),
    );
  });

  it('ignores placeholder unit_id during facility consistency checks', async () => {
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        unit_id: undefined,
        actor: {
          user_id: 'user-1',
          role: 'tenant',
          name: 'Casey Jones',
        },
      },
      deviceType: 'blulok',
    });

    await service.ingestOne(rawEvent(), {
      facilityId,
      source: 'gateway_internal_api',
    });

    expect(findUnitById).not.toHaveBeenCalledWith('unknown-unit-id');
  });

  it('uses payload device_type hint when resolver does not resolve a device', async () => {
    const serial = 'f759bd50-a70e-5bba-81c5-25e9a7c695c1';
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        device_id: serial,
        device_type: 'access_control',
        relay_channel: 1,
        action: 'keypad_attempt',
        method: 'keypad',
        actor: {
          user_id: 'user-1',
          role: 'admin',
          name: 'HQ Admin',
        },
      },
      deviceType: undefined,
    });
    findBluLokDeviceById.mockResolvedValue(null);
    findAccessControlDeviceWithGateway.mockResolvedValue(null);

    await service.ingestOne(
      {
        ...rawEvent(),
        device_id: serial,
        device_type: 'access_control',
        relay_channel: 1,
        action: 'keypad_attempt',
        method: 'keypad',
      },
      {
        facilityId,
        source: 'gateway_internal_api',
      },
    );

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          device_type: 'access_control',
        }),
      }),
    );
  });

  it('skips grant-like access-events while a remote unlock is pending for the device', async () => {
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        device_id: 'cloud-device-1',
        actor: { user_id: 'user-1', role: 'tenant', name: 'Casey Jones' },
      },
      deviceType: 'blulok',
    });
    mockPeekCommandAttribution.mockReturnValue({
      commandId: 'cmd-1',
      requestedStatus: 'unlocked',
      deviceType: 'blulok',
      initiator: { userId: 'admin-1', userName: 'Admin', role: 'facility_admin' },
    });

    const result = await service.ingestOne(rawEvent(), {
      facilityId,
      source: 'gateway_internal_api',
    });

    expect(result).toBeNull();
    expect(logActivity).not.toHaveBeenCalled();
    expect(mockPeekCommandAttribution).toHaveBeenCalledWith('cloud-device-1');
  });

  it('does not skip grant-like events when pending unlock is access_control', async () => {
    resolve.mockResolvedValue({
      event: {
        ...rawEvent(),
        device_id: 'ac-1',
        actor: { user_id: 'user-1', role: 'tenant', name: 'Casey Jones' },
      },
      deviceType: 'access_control',
    });
    mockPeekCommandAttribution.mockReturnValue({
      commandId: 'cmd-ac',
      requestedStatus: 'unlocked',
      deviceType: 'access_control',
      initiator: { userId: 'admin-1', userName: 'Admin', role: 'facility_admin' },
    });
    findAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      facility_id: facilityId,
    });
    findBluLokDeviceById.mockResolvedValue(null);

    await service.ingestOne(
      { ...rawEvent(), device_id: 'ac-1' },
      { facilityId, source: 'gateway_internal_api' },
    );

    expect(logActivity).toHaveBeenCalled();
  });
});
