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

  describe('PUT /api/v1/system-settings/notifications', () => {
    it('allows saving notification config with all template fields', async () => {
      const notificationConfig = {
        enabledChannels: { sms: true, email: true },
        defaultProvider: { sms: 'twilio', email: 'console' },
        templates: {
          inviteSms: 'Welcome! {{deeplink}}',
          inviteEmail: '<p>Welcome! {{deeplink}}</p>',
          inviteEmailSubject: 'Welcome to BluLok',
          otpSms: 'Your code is {{code}}',
          otpEmail: '<p>Your code is {{code}}</p>',
          otpEmailSubject: 'Your Verification Code',
          passwordResetSms: 'Reset your password: {{deeplink}}',
          passwordResetEmail: '<p>Reset your password: <a href="{{deeplink}}">{{deeplink}}</a></p>',
          passwordResetEmailSubject: 'Reset Your BluLok Password',
        },
        deeplinkBaseUrl: 'https://app.blulok.com',
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalledWith(
        'notifications.config',
        JSON.stringify(notificationConfig)
      );
    });

    it('allows saving notification config with only password reset templates', async () => {
      const notificationConfig = {
        enabledChannels: { sms: true, email: false },
        templates: {
          passwordResetSms: 'Reset your password: {{deeplink}}',
        },
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalled();
    });

    it('accepts unknown template field names (stripped during validation)', async () => {
      const notificationConfig = {
        enabledChannels: { sms: true },
        templates: {
          invalidTemplateField: 'This should be allowed and stripped',
        },
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      // Unknown fields are stripped, so they won't be in the saved config
      expect(mockSettingsModel.set).toHaveBeenCalled();
    });

    it('allows partial updates (e.g., just deeplinkBaseUrl)', async () => {
      const notificationConfig = {
        deeplinkBaseUrl: 'blulok://',
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalled();
    });

    it('allows partial updates (e.g., just templates without enabledChannels)', async () => {
      const notificationConfig = {
        templates: {
          passwordResetSms: 'Reset: {{deeplink}}',
        },
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalled();
    });

    it('allows partial enabledChannels (e.g., just sms without email)', async () => {
      const notificationConfig = {
        enabledChannels: { sms: true },
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(notificationConfig)
        .expect(200);

      expectSuccess(response);
      expect(mockSettingsModel.set).toHaveBeenCalled();
    });

    it('denies access to non-admin users', async () => {
      const notificationConfig = {
        enabledChannels: { sms: true },
      };

      const response = await request(app)
        .put('/api/v1/system-settings/notifications')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(notificationConfig)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(mockSettingsModel.set).not.toHaveBeenCalled();
    });
  });
});


