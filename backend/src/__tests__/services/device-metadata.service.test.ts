import { DeviceMetadataService } from '@/services/device-metadata.service';
import { DeviceModel } from '@/models/device.model';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessCodeService } from '@/services/access-code.service';
import { ConflictError, NotFoundError } from '@/middleware/error.middleware';

jest.mock('@/models/device.model');
jest.mock('@/models/activity-log.model');
jest.mock('@/services/access-code.service');

describe('DeviceMetadataService', () => {
  const mockFindBluLok = jest.fn();
  const mockUpdateBluLok = jest.fn();
  const mockFindAcWithGateway = jest.fn();
  const mockUpdateAc = jest.fn();
  const mockFindBluLokBySerial = jest.fn();
  const mockFindAcConflict = jest.fn();
  const mockActivityCreate = jest.fn();
  const mockPushCodes = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(
      () =>
        ({
          findBluLokDeviceById: mockFindBluLok,
          updateBluLokDevice: mockUpdateBluLok,
          findAccessControlDeviceWithGateway: mockFindAcWithGateway,
          updateAccessControlDevice: mockUpdateAc,
          findBluLokBySerial: mockFindBluLokBySerial,
          findAccessControlIdentityConflict: mockFindAcConflict,
        }) as unknown as DeviceModel
    );
    (ActivityLogModel as jest.MockedClass<typeof ActivityLogModel>).mockImplementation(
      () =>
        ({
          create: mockActivityCreate,
        }) as unknown as ActivityLogModel
    );
    (AccessCodeService.getInstance as jest.Mock).mockReturnValue({
      pushCodesToGateway: mockPushCodes,
    });
    mockActivityCreate.mockResolvedValue({ id: 'log-1' });
    mockPushCodes.mockResolvedValue(undefined);
  });

  describe('updateBluLokMetadata', () => {
    it('updates serial and sets adminIdentityOverride on identity change', async () => {
      mockFindBluLok
        .mockResolvedValueOnce({
          id: 'dev-1',
          device_serial: 'OLD-SN',
          unit_id: 'unit-1',
          gateway_facility_id: 'fac-1',
          metadata: { createdFromGatewaySync: true },
        })
        .mockResolvedValueOnce({
          id: 'dev-1',
          device_serial: 'NEW-SN',
        });
      mockFindBluLokBySerial.mockResolvedValue(null);
      mockUpdateBluLok.mockResolvedValue({ id: 'dev-1', device_serial: 'NEW-SN' });

      const svc = DeviceMetadataService.getInstance();
      const result = await svc.updateBluLokMetadata(
        'dev-1',
        { device_serial: 'NEW-SN' },
        { userId: 'admin-1', userName: 'Admin User' }
      );

      expect(result.sideEffects.identityChanged).toBe(true);
      expect(mockUpdateBluLok).toHaveBeenCalledWith(
        'dev-1',
        expect.objectContaining({
          device_serial: 'NEW-SN',
          serial: 'NEW-SN',
          metadata: expect.objectContaining({
            adminIdentityOverride: true,
            previousIdentity: expect.objectContaining({
              device_serial: 'OLD-SN',
              changedBy: 'admin-1',
            }),
          }),
        })
      );
      expect(mockActivityCreate).toHaveBeenCalled();
    });

    it('throws ConflictError when serial already exists', async () => {
      mockFindBluLok.mockResolvedValue({
        id: 'dev-1',
        device_serial: 'OLD-SN',
        metadata: {},
      });
      mockFindBluLokBySerial.mockResolvedValue({ id: 'other' });

      const svc = DeviceMetadataService.getInstance();
      await expect(
        svc.updateBluLokMetadata('dev-1', { device_serial: 'TAKEN' }, { userId: 'u1' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError when device missing', async () => {
      mockFindBluLok.mockResolvedValue(null);
      const svc = DeviceMetadataService.getInstance();
      await expect(
        svc.updateBluLokMetadata('dev-1', { device_serial: 'X' }, { userId: 'u1' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateAccessControlMetadata', () => {
    it('pushes access codes when relay changes', async () => {
      mockFindAcWithGateway.mockResolvedValue({
        id: 'ac-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        device_serial: 'KP-1',
        relay_channel: 1,
        metadata: {},
        device_settings: {},
      });
      mockFindAcConflict.mockResolvedValue(null);
      mockUpdateAc.mockResolvedValue({
        id: 'ac-1',
        device_serial: 'KP-1',
        relay_channel: 2,
      });
      mockFindAcWithGateway.mockResolvedValueOnce({
        id: 'ac-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        device_serial: 'KP-1',
        relay_channel: 1,
        metadata: {},
        device_settings: {},
      });
      mockFindAcWithGateway.mockResolvedValueOnce({
        id: 'ac-1',
        relay_channel: 2,
      });

      const svc = DeviceMetadataService.getInstance();
      const result = await svc.updateAccessControlMetadata(
        'ac-1',
        { relay_channel: 2 },
        { userId: 'admin-1' }
      );

      expect(result.sideEffects.accessCodesPushed).toBe(true);
      expect(mockPushCodes).toHaveBeenCalledWith('fac-1');
      expect(mockUpdateAc).toHaveBeenCalledWith(
        'ac-1',
        expect.objectContaining({
          relay_channel: 2,
          metadata: expect.objectContaining({
            adminIdentityOverride: true,
            device_serial: 'KP-1',
            previousIdentity: expect.objectContaining({
              device_serial: 'KP-1',
              relay_channel: 1,
            }),
          }),
          device_settings: expect.objectContaining({
            device_serial: 'KP-1',
          }),
        })
      );
    });

    it('pushes access codes when device_serial changes', async () => {
      mockFindAcWithGateway
        .mockResolvedValueOnce({
          id: 'ac-1',
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
          device_serial: 'OLD-ACCESS',
          relay_channel: 1,
          metadata: { createdFromGatewaySync: true },
          device_settings: { device_serial: 'OLD-ACCESS' },
        })
        .mockResolvedValueOnce({
          id: 'ac-1',
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
          device_serial: 'NEW-ACCESS',
          relay_channel: 1,
        });
      mockFindAcConflict.mockResolvedValue(null);
      mockUpdateAc.mockResolvedValue({
        id: 'ac-1',
        device_serial: 'NEW-ACCESS',
        relay_channel: 1,
      });

      const svc = DeviceMetadataService.getInstance();
      const result = await svc.updateAccessControlMetadata(
        'ac-1',
        { device_serial: 'NEW-ACCESS' },
        { userId: 'admin-1' }
      );

      expect(result.sideEffects.identityChanged).toBe(true);
      expect(result.sideEffects.accessCodesPushed).toBe(true);
      expect(mockPushCodes).toHaveBeenCalledWith('fac-1');
      expect(mockUpdateAc).toHaveBeenCalledWith(
        'ac-1',
        expect.objectContaining({
          device_serial: 'NEW-ACCESS',
          metadata: expect.objectContaining({
            adminIdentityOverride: true,
            device_serial: 'NEW-ACCESS',
            serial: 'NEW-ACCESS',
          }),
        })
      );
    });

    it('does not push access codes for non-identity metadata updates', async () => {
      mockFindAcWithGateway
        .mockResolvedValueOnce({
          id: 'ac-1',
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
          device_serial: 'KP-1',
          relay_channel: 1,
          metadata: {},
        })
        .mockResolvedValueOnce({
          id: 'ac-1',
          name: 'Updated Gate',
          device_serial: 'KP-1',
          relay_channel: 1,
        });
      mockUpdateAc.mockResolvedValue({
        id: 'ac-1',
        name: 'Updated Gate',
      });

      const svc = DeviceMetadataService.getInstance();
      const result = await svc.updateAccessControlMetadata(
        'ac-1',
        { name: 'Updated Gate' },
        { userId: 'admin-1' }
      );

      expect(result.sideEffects.identityChanged).toBe(false);
      expect(result.sideEffects.accessCodesPushed).toBe(false);
      expect(mockPushCodes).not.toHaveBeenCalled();
    });

    it('throws ConflictError on duplicate access_id and relay identity', async () => {
      mockFindAcWithGateway.mockResolvedValue({
        id: 'ac-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        device_serial: 'KP-1',
        relay_channel: 1,
        metadata: {},
      });
      mockFindAcConflict.mockResolvedValue({
        type: 'serial_relay',
        device: { device_serial: 'KP-1' },
      });

      const svc = DeviceMetadataService.getInstance();
      await expect(
        svc.updateAccessControlMetadata(
          'ac-1',
          { device_serial: 'KP-1', relay_channel: 3 },
          { userId: 'u1' }
        )
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
