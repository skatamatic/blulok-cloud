import {
  maskNotificationSecrets,
  prepareNotificationsConfigForSave,
  redactNotificationSecretsForLog,
  resolveConfigOverrideSecrets,
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

  it('keeps the stored secret when the field is submitted empty', () => {
    const stored = prepareNotificationsConfigForSave(baseConfig(), null);

    const incoming = JSON.parse(JSON.stringify(stored)) as NotificationsConfig;
    incoming.twilio!.authToken = '';
    incoming.smtp!.password = '';

    const merged = prepareNotificationsConfigForSave(incoming, JSON.stringify(stored));
    expect(merged.twilio?.authToken).toBe(stored.twilio?.authToken);
    expect(merged.smtp?.password).toBe(stored.smtp?.password);
  });

  it('never double-encrypts a secret that was left untouched', () => {
    const stored = prepareNotificationsConfigForSave(baseConfig(), null);
    const first = stored.twilio!.authToken;

    const merged = prepareNotificationsConfigForSave(
      { deeplinkBaseUrl: 'blulok://' } as NotificationsConfig,
      JSON.stringify(stored),
    );

    expect(merged.twilio?.authToken).toBe(first);
    expect(merged.twilio?.authToken?.startsWith('enc:v1:enc:v1:')).toBe(false);
  });

  describe('partial updates', () => {
    it('keeps sections that were not part of the payload', () => {
      const stored = prepareNotificationsConfigForSave(baseConfig(), null);

      const merged = prepareNotificationsConfigForSave(
        { deeplinkBaseUrl: 'https://app.blulok.com/' } as NotificationsConfig,
        JSON.stringify(stored),
      );

      expect(merged.deeplinkBaseUrl).toBe('https://app.blulok.com/');
      expect(merged.twilio?.accountSid).toBe('AC');
      expect(merged.smtp?.host).toBe('smtp.test');
      expect(merged.enabledChannels).toEqual({ sms: true, email: true });
    });

    it('merges a partial section instead of replacing it', () => {
      const stored = prepareNotificationsConfigForSave(baseConfig(), null);

      const merged = prepareNotificationsConfigForSave(
        { enabledChannels: { sms: false } } as unknown as NotificationsConfig,
        JSON.stringify(stored),
      );

      expect(merged.enabledChannels).toEqual({ sms: false, email: true });
      expect(merged.smtp?.fromEmail).toBe('a@b.com');
    });

    it('still applies explicit changes over stored values', () => {
      const stored = prepareNotificationsConfigForSave(baseConfig(), null);

      const merged = prepareNotificationsConfigForSave(
        { smtp: { host: 'smtp.new', fromEmail: 'new@b.com' } } as NotificationsConfig,
        JSON.stringify(stored),
      );

      expect(merged.smtp?.host).toBe('smtp.new');
      expect(merged.smtp?.fromEmail).toBe('new@b.com');
      expect(merged.smtp?.username).toBe('u');
      expect(merged.smtp?.password).toBe(stored.smtp?.password);
    });
  });

  it('resolves blank override secrets from stored config so tests use real credentials', () => {
    const stored = prepareNotificationsConfigForSave(baseConfig(), null);

    const resolved = resolveConfigOverrideSecrets(
      {
        ...baseConfig(),
        smtp: { ...baseConfig().smtp!, password: '' },
        twilio: { ...baseConfig().twilio!, authToken: '' },
      },
      stored,
    );

    expect(resolved.smtp?.password).toBe('pass-plain');
    expect(resolved.twilio?.authToken).toBe('token-plain');
  });

  it('redacts credentials before debug logging the request body', () => {
    const redacted = redactNotificationSecretsForLog({
      twilio: { accountSid: 'AC', authToken: 'super-secret' },
      smtp: { host: 'smtp.test', password: 'hunter2' },
      deeplinkBaseUrl: 'blulok://',
    }) as any;

    expect(JSON.stringify(redacted)).not.toContain('super-secret');
    expect(JSON.stringify(redacted)).not.toContain('hunter2');
    expect(redacted.twilio.accountSid).toBe('AC');
    expect(redacted.smtp.host).toBe('smtp.test');
  });
});
