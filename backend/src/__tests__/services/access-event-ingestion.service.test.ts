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

  it('ignores placeholder unit_id during facility consistency checks', async () => {
    resolve.mockResolvedValue({
      ...rawEvent(),
      unit_id: undefined,
      actor: {
        user_id: 'user-1',
        role: 'tenant',
        name: 'Casey Jones',
      },
    });

    await service.ingestOne(rawEvent(), {
      facilityId,
      source: 'gateway_internal_api',
    });

    expect(findUnitById).not.toHaveBeenCalledWith('unknown-unit-id');
  });
});
