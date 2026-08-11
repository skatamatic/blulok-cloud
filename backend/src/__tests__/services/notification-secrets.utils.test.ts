import {
  maskNotificationSecrets,
  prepareNotificationsConfigForSave,
} from '@/services/notifications/notification-secrets.utils';
import { SECRET_MASK } from '@/utils/settings-secret.util';
import type { NotificationsConfig } from '@/types/notification.types';

jest.mock('@/config/environment', () => ({
  config: {
    settingsEncryptionKey: 'test-settings-encryption-key-32b!',
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const baseConfig = (): NotificationsConfig => ({
  enabledChannels: { sms: true, email: true },
  defaultProvider: { sms: 'twilio', email: 'smtp' },
  twilio: { accountSid: 'AC', authToken: 'token-plain', fromNumber: '+1' },
  smtp: {
    host: 'smtp.test',
    port: 587,
    encryption: 'starttls',
    authMode: 'plain',
    username: 'u',
    password: 'pass-plain',
    fromEmail: 'a@b.com',
  },
  templates: {},
});

describe('notification-secrets.utils', () => {
  it('masks secrets in API responses', () => {
    const masked = maskNotificationSecrets(baseConfig());
    expect(masked.twilio?.authToken).toBe(SECRET_MASK);
    expect(masked.smtp?.password).toBe(SECRET_MASK);
  });

  it('keeps existing encrypted secret when mask is submitted', () => {
    const existingStored = prepareNotificationsConfigForSave(baseConfig(), null);
    expect(existingStored.twilio?.authToken).toMatch(/^enc:v1:/);

    const incoming = maskNotificationSecrets(existingStored);
    incoming.twilio!.accountSid = 'AC-updated';
    const merged = prepareNotificationsConfigForSave(incoming, JSON.stringify(existingStored));
    expect(merged.twilio?.authToken).toBe(existingStored.twilio?.authToken);
    expect(merged.twilio?.accountSid).toBe('AC-updated');
  });
});
