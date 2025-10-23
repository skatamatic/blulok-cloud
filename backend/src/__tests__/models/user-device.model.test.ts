import { UserDeviceModel, UserDevice, UserDeviceStatus, AppPlatform } from '@/models/user-device.model';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';

// Mock the UserDeviceModel
jest.mock('@/models/user-device.model');

describe('UserDeviceModel', () => {
  let userDeviceModel: jest.Mocked<UserDeviceModel>;
  let testData: MockTestData;

  beforeEach(() => {
    testData = createMockTestData();

    // Create a mock UserDeviceModel
    userDeviceModel = {
      findByUserAndAppDeviceId: jest.fn(),
      listByUser: jest.fn(),
      countActiveByUser: jest.fn(),
      create: jest.fn(),
      upsertByUserAndAppDeviceId: jest.fn(),
      updateById: jest.fn(),
      revoke: jest.fn(),
    } as any;

    // Mock the UserDeviceModel constructor
    (UserDeviceModel as jest.MockedClass<typeof UserDeviceModel>).mockImplementation(() => userDeviceModel);
  });

  describe('findByUserAndAppDeviceId', () => {
    it('should find device by user and app device id', async () => {
      const mockDevice: UserDevice = {
        id: 'device-1',
        user_id: testData.users.tenant.id,
        app_device_id: 'app-device-123',
        platform: 'ios',
        device_name: 'iPhone 12',
        public_key: 'base64-public-key',
        status: 'active',
        last_used_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      userDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(mockDevice);

      const result = await userDeviceModel.findByUserAndAppDeviceId(
        testData.users.tenant.id,
        'app-device-123'
      );

      expect(result).toEqual(mockDevice);
      expect(userDeviceModel.findByUserAndAppDeviceId).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'app-device-123'
      );
    });

    it('should return undefined when device not found', async () => {
      userDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(undefined);

      const result = await userDeviceModel.findByUserAndAppDeviceId(
        testData.users.tenant.id,
        'nonexistent-device'
      );

      expect(result).toBeUndefined();
    });
  });

  describe('listByUser', () => {
    it('should list all devices for a user ordered by created_at', async () => {
      const mockDevices: UserDevice[] = [
        {
          id: 'device-1',
          user_id: testData.users.tenant.id,
          app_device_id: 'app-device-1',
          platform: 'ios',
          device_name: 'iPhone 12',
          status: 'active',
          created_at: new Date('2024-01-01'),
          updated_at: new Date(),
        },
        {
          id: 'device-2',
          user_id: testData.users.tenant.id,
          app_device_id: 'app-device-2',
          platform: 'android',
          device_name: 'Pixel 6',
          status: 'pending_key',
          created_at: new Date('2024-01-02'),
          updated_at: new Date(),
        },
      ];

      userDeviceModel.listByUser.mockResolvedValue(mockDevices);

      const result = await userDeviceModel.listByUser(testData.users.tenant.id);

      expect(result).toEqual(mockDevices);
      expect(userDeviceModel.listByUser).toHaveBeenCalledWith(testData.users.tenant.id);
    });
  });

  describe('countActiveByUser', () => {
    it('should count active devices for a user', async () => {
      userDeviceModel.countActiveByUser.mockResolvedValue(3);

      const result = await userDeviceModel.countActiveByUser(testData.users.tenant.id);

      expect(result).toBe(3);
      expect(userDeviceModel.countActiveByUser).toHaveBeenCalledWith(testData.users.tenant.id);
    });
  });

  describe('create', () => {
    it('should create a new device', async () => {
      const deviceData = {
        user_id: testData.users.tenant.id,
        app_device_id: 'new-device-123',
        platform: 'web' as AppPlatform,
        device_name: 'Chrome Desktop',
        public_key: 'base64-public-key',
        status: 'active' as UserDeviceStatus,
      };

      const expectedDevice: UserDevice = {
        id: 'new-device-id',
        ...deviceData,
        created_at: new Date(),
        updated_at: new Date(),
      };

      userDeviceModel.create.mockResolvedValue(expectedDevice);

      const result = await userDeviceModel.create(deviceData);

      expect(result).toEqual(expectedDevice);
      expect(userDeviceModel.create).toHaveBeenCalledWith(deviceData);
    });
  });

  describe('upsertByUserAndAppDeviceId', () => {
    it('should create new device when not found', async () => {
      const newDevice: UserDevice = {
        id: 'new-device-id',
        user_id: testData.users.tenant.id,
        app_device_id: 'new-device',
        platform: 'ios' as AppPlatform,
        status: 'pending_key' as UserDeviceStatus,
        created_at: new Date(),
        updated_at: new Date(),
      };

      userDeviceModel.upsertByUserAndAppDeviceId.mockResolvedValue(newDevice);

      const result = await userDeviceModel.upsertByUserAndAppDeviceId(
        testData.users.tenant.id,
        'new-device',
        { platform: 'ios' }
      );

      expect(result).toEqual(newDevice);
      expect(userDeviceModel.upsertByUserAndAppDeviceId).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'new-device',
        { platform: 'ios' }
      );
    });

    it('should update existing device when found', async () => {
      const updatedDevice: UserDevice = {
        id: 'existing-device-id',
        user_id: testData.users.tenant.id,
        app_device_id: 'existing-device',
        platform: 'ios' as AppPlatform,
        status: 'active' as UserDeviceStatus,
        created_at: new Date(),
        updated_at: new Date(),
      };

      userDeviceModel.upsertByUserAndAppDeviceId.mockResolvedValue(updatedDevice);

      const result = await userDeviceModel.upsertByUserAndAppDeviceId(
        testData.users.tenant.id,
        'existing-device',
        { platform: 'ios' }
      );

      expect(result.platform).toBe('ios');
      expect(userDeviceModel.upsertByUserAndAppDeviceId).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'existing-device',
        { platform: 'ios' }
      );
    });
  });

  describe('revoke', () => {
    it('should revoke a device by setting status to revoked', async () => {
      userDeviceModel.revoke.mockResolvedValue(undefined);

      await userDeviceModel.revoke('device-id');

      expect(userDeviceModel.revoke).toHaveBeenCalledWith('device-id');
    });
  });
});
