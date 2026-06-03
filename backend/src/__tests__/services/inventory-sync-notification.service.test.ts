import { InventorySyncNotificationService } from '@/services/notifications/inventory-sync-notification.service';
import { InAppNotificationDispatcher } from '@/services/notifications/in-app-notification-dispatcher.service';
import { FacilityModel } from '@/models/facility.model';
import { DatabaseService } from '@/services/database.service';

jest.mock('@/services/notifications/in-app-notification-dispatcher.service');
jest.mock('@/models/facility.model');
jest.mock('@/services/database.service');

describe('InventorySyncNotificationService', () => {
  const mockNotify = jest.fn().mockResolvedValue(undefined);
  const mockFirst = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (InventorySyncNotificationService as unknown as { instance?: unknown }).instance = undefined;
    (InAppNotificationDispatcher.getInstance as jest.Mock).mockReturnValue({
      notifyDeviceInventorySyncError: mockNotify,
    });
    (FacilityModel as jest.Mock).mockImplementation(() => ({
      findById: jest.fn().mockResolvedValue({ id: 'fac-a', name: '621 Sandbox' }),
    }));
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: {
        fn: { now: jest.fn() },
      },
    });

    const knexChain = {
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: mockFirst,
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: jest.fn(() => knexChain),
    });
  });

  it('notifies with same-facility copy when serial already exists locally', async () => {
    mockFirst.mockResolvedValueOnce({
      facility_id: 'fac-a',
      facility_name: '621 Sandbox',
      unit_id: 'unit-1',
      unit_number: 'A-101',
    });

    await InventorySyncNotificationService.getInstance().notifyInventorySyncErrors({
      facilityId: 'fac-a',
      gatewayId: 'gw-1',
      syncLogId: 'log-1',
      lockResult: {
        added: 0,
        removed: 0,
        unchanged: 0,
        errors: [
          "Failed to add device serial-abc: Duplicate entry 'serial-abc' for key 'blulok_devices.blulok_devices_device_serial_unique'",
        ],
      },
      accessResult: null,
      entries: [],
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceSerial: 'serial-abc',
        message: expect.stringContaining('already registered at this facility on unit A-101'),
      }),
    );
  });
});
