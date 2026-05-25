import { AccessControlService } from '@/services/access-control.service';
import { DeviceModel, AccessControlDevice } from '@/models/device.model';
import { UserRole } from '@/types/auth.types';

// Mock dependencies
jest.mock('@/models/device.model');

describe('AccessControlService', () => {
  let service: AccessControlService;
  let mockDeviceModel: jest.Mocked<DeviceModel>;

  const mockAccessControlDevice: AccessControlDevice = {
    id: 'device-1',
    gateway_id: 'gateway-1',
    name: 'Main Gate',
    device_serial: 'SN-gateway-1-1',
    device_type: 'gate',
    location_description: 'Facility entrance',
    relay_channel: 1,
    status: 'online',
    is_locked: true,
    last_activity: new Date(),
    device_settings: undefined,
    metadata: undefined,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockDoorDevice: AccessControlDevice = {
    ...mockAccessControlDevice,
    id: 'device-2',
    name: 'Front Door',
    device_type: 'door',
    location_description: 'Building A entrance',
    relay_channel: 2,
  };

  const mockElevatorDevice: AccessControlDevice = {
    ...mockAccessControlDevice,
    id: 'device-3',
    name: 'Main Elevator',
    device_type: 'elevator',
    location_description: 'Building A elevator',
    relay_channel: 3,
    status: 'offline',
  };

  const mockGateway = {
    id: 'gateway-1',
    facility_id: 'facility-1',
    name: 'Test Gateway',
  };

  const mockFacility = {
    id: 'facility-1',
    name: 'Test Facility',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDeviceModel = {
      findAccessControlDevices: jest.fn().mockResolvedValue([mockAccessControlDevice]),
      countAccessControlDevices: jest.fn().mockResolvedValue(1),
      findAccessControlDeviceById: jest.fn().mockResolvedValue(mockAccessControlDevice),
      findAccessControlDeviceWithGateway: jest.fn().mockResolvedValue({
        ...mockAccessControlDevice,
        facility_id: 'facility-1',
        gateway_name: 'Test Gateway',
      }),
      findGatewayById: jest.fn().mockResolvedValue(mockGateway),
      getFacilityDeviceHierarchy: jest.fn().mockResolvedValue({
        facility: mockFacility,
        gateway: mockGateway,
        accessControlDevices: [mockAccessControlDevice],
        blulokDevices: [],
      }),
    } as any;

    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(() => mockDeviceModel);

    // Reset the singleton
    (AccessControlService as any).instance = undefined;
    service = AccessControlService.getInstance();
  });

  describe('getAccessControlDevices', () => {
    it('should get devices for admin user', async () => {
      const result = await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {}
      );

      expect(result.devices).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.devices[0].deviceType).toBe('gate');
      expect(result.devices[0].name).toBe('Main Gate');
      expect(result.devices[0].facilityId).toBe('facility-1');
      expect(result.devices[0].gatewayId).toBe('gateway-1');
    });

    it('should get devices for facility admin with access', async () => {
      const result = await service.getAccessControlDevices(
        'facility-1',
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1'],
        {}
      );

      expect(result.devices).toHaveLength(1);
    });

    it('should get devices for tenant with facility access', async () => {
      const result = await service.getAccessControlDevices(
        'facility-1',
        'tenant-1',
        UserRole.TENANT,
        ['facility-1'],
        {}
      );

      expect(result.devices).toHaveLength(1);
    });

    it('should throw error for unauthorized facility', async () => {
      await expect(
        service.getAccessControlDevices(
          'facility-2',
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1'],
          {}
        )
      ).rejects.toThrow('Access denied');
    });

    it('should throw error when user has no facility IDs', async () => {
      await expect(
        service.getAccessControlDevices(
          'facility-1',
          'user-1',
          UserRole.TENANT,
          undefined,
          {}
        )
      ).rejects.toThrow('Access denied');
    });

    it('should filter by device type', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([mockAccessControlDevice]);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(1);

      const result = await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        { deviceType: 'gate' }
      );

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].deviceType).toBe('gate');
      expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          access_control_type: 'gate',
        })
      );
    });

    it('should filter by status', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([mockElevatorDevice]);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(1);

      const result = await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        { status: 'offline' }
      );

      expect(result.devices).toHaveLength(1);
      expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'offline',
        })
      );
    });

    it('should pass search filter', async () => {
      await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        { search: 'Main' }
      );

      expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Main',
        })
      );
    });

    it('should pass pagination and sort options', async () => {
      await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        { sortBy: 'name', sortOrder: 'asc', limit: 10, offset: 5 }
      );

      expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'name',
          sortOrder: 'asc',
          limit: 10,
          offset: 5,
        })
      );
    });

    it('should return correct device response format', async () => {
      const result = await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {}
      );

      const device = result.devices[0];
      expect(device).toEqual({
        id: 'device-1',
        name: 'Main Gate',
        deviceType: 'gate',
        locationDescription: 'Facility entrance',
        status: 'online',
        isLocked: true,
        lastActivity: expect.any(Date),
        facilityId: 'facility-1',
        gatewayId: 'gateway-1',
      });
    });

    it('should return empty devices when none found', async () => {
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(0);

      const result = await service.getAccessControlDevices(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined,
        {}
      );

      expect(result.devices).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getFacilityAccessControlSummary', () => {
    it('should get summary for admin user', async () => {
      const result = await service.getFacilityAccessControlSummary(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result.facilityId).toBe('facility-1');
      expect(result.facilityName).toBe('Test Facility');
      expect(result.devices).toHaveLength(1);
      expect(result.summary.total).toBe(1);
      expect(result.summary.byType.gates).toBe(1);
    });

    it('should throw error for unauthorized facility', async () => {
      await expect(
        service.getFacilityAccessControlSummary(
          'facility-2',
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1']
        )
      ).rejects.toThrow('Access denied');
    });

    it('should throw error for non-existent facility', async () => {
      mockDeviceModel.getFacilityDeviceHierarchy.mockResolvedValue(null);

      await expect(
        service.getFacilityAccessControlSummary(
          'non-existent',
          'admin-1',
          UserRole.ADMIN,
          undefined
        )
      ).rejects.toThrow('Facility not found');
    });

    it('should calculate correct summary statistics for multiple device types', async () => {
      const mockDevices: AccessControlDevice[] = [
        mockAccessControlDevice,
        mockDoorDevice,
        mockElevatorDevice,
      ];

      mockDeviceModel.getFacilityDeviceHierarchy.mockResolvedValue({
        facility: mockFacility,
        gateway: mockGateway,
        accessControlDevices: mockDevices,
        blulokDevices: [],
      });

      const result = await service.getFacilityAccessControlSummary(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result.summary.total).toBe(3);
      expect(result.summary.byType.gates).toBe(1);
      expect(result.summary.byType.doors).toBe(1);
      expect(result.summary.byType.elevators).toBe(1);
      expect(result.summary.byStatus.online).toBe(2);
      expect(result.summary.byStatus.offline).toBe(1);
      expect(result.summary.byStatus.error).toBe(0);
      expect(result.summary.byStatus.maintenance).toBe(0);
    });

    it('should handle facility with no access control devices', async () => {
      mockDeviceModel.getFacilityDeviceHierarchy.mockResolvedValue({
        facility: mockFacility,
        gateway: mockGateway,
        accessControlDevices: [],
        blulokDevices: [],
      });

      const result = await service.getFacilityAccessControlSummary(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result.summary.total).toBe(0);
      expect(result.summary.byType.gates).toBe(0);
      expect(result.summary.byType.doors).toBe(0);
      expect(result.summary.byType.elevators).toBe(0);
      expect(result.devices).toHaveLength(0);
    });

    it('should handle missing facility name gracefully', async () => {
      mockDeviceModel.getFacilityDeviceHierarchy.mockResolvedValue({
        facility: { id: 'facility-1' }, // no name
        gateway: mockGateway,
        accessControlDevices: [],
        blulokDevices: [],
      });

      const result = await service.getFacilityAccessControlSummary(
        'facility-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result.facilityName).toBe('Unknown');
    });
  });

  describe('getAccessControlDeviceById', () => {
    it('should get device by ID for admin', async () => {
      const result = await service.getAccessControlDeviceById(
        'device-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('device-1');
      expect(result?.deviceType).toBe('gate');
      expect(result?.facilityId).toBe('facility-1');
    });

    it('should get device for facility admin with correct access', async () => {
      const result = await service.getAccessControlDeviceById(
        'device-1',
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1']
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('device-1');
    });

    it('should return null for non-existent device', async () => {
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue(null);

      const result = await service.getAccessControlDeviceById(
        'non-existent',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result).toBeNull();
    });

    it('should return null when device has no facility_id', async () => {
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        ...mockAccessControlDevice,
        facility_id: undefined,
      } as any);

      const result = await service.getAccessControlDeviceById(
        'device-1',
        'admin-1',
        UserRole.ADMIN,
        undefined
      );

      expect(result).toBeNull();
    });

    it('should throw error for unauthorized access', async () => {
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        ...mockAccessControlDevice,
        facility_id: 'facility-2',
        gateway_name: 'Test Gateway',
      });

      await expect(
        service.getAccessControlDeviceById(
          'device-1',
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1']
        )
      ).rejects.toThrow('Access denied');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AccessControlService.getInstance();
      const instance2 = AccessControlService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
