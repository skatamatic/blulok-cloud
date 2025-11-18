import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectBadRequest, expectSuccess } from '@/__tests__/utils/mock-test-helpers';
import { SystemSettingsModel } from '@/models/system-settings.model';

jest.mock('@/models/system-settings.model');

describe('System Settings Routes', () => {
  let app: any;
  let testData: ReturnType<typeof createMockTestData>;
  let mockSettingsModel: jest.Mocked<SystemSettingsModel>;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockSettingsModel = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;
    (SystemSettingsModel as jest.MockedClass<typeof SystemSettingsModel>).mockImplementation(() => mockSettingsModel);
  });

  describe('PUT /api/v1/system-settings', () => {
    it('allows DEV_ADMIN to set max devices to 0 (unlimited)', async () => {
      const response = await request(app)
        .put('/api/v1/system-settings')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ 'security.max_devices_per_user': 0 })
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalledWith('security.max_devices_per_user', '0');
    });

    it('rejects values greater than 250', async () => {
      const response = await request(app)
        .put('/api/v1/system-settings')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ 'security.max_devices_per_user': 300 })
        .expect(400);

      expectBadRequest(response);
      expect(mockSettingsModel.set).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/system-settings', () => {
    it('returns stored value including 0 (unlimited)', async () => {
      mockSettingsModel.get.mockResolvedValue('0');

      const response = await request(app)
        .get('/api/v1/system-settings')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.settings['security.max_devices_per_user']).toBe(0);
      expect(mockSettingsModel.get).toHaveBeenCalledWith('security.max_devices_per_user');
    });
  });
});


