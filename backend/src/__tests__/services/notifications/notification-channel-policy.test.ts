/**
 * End-to-end channel policy for the outbound notification service:
 * only enabled channels are used, dual-channel preference is honored, and
 * nothing ever reports success silently.
 */

let storedConfig: Record<string, unknown> = {};

jest.mock('@/models/system-settings.model', () => ({
  SystemSettingsModel: jest.fn().mockImplementation(() => ({
    get: jest.fn(async () => JSON.stringify(storedConfig)),
  })),
}));

const sendSms = jest.fn();
const sendEmail = jest.fn();

jest.mock('@/services/notifications/providers/notification-provider.factory', () => ({
  createSmsProvider: jest.fn(() => ({ sendSms })),
  createEmailProvider: jest.fn(() => ({ sendEmail })),
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { NotificationService } from '@/services/notifications/notification.service';

const setConfig = (overrides: Record<string, unknown> = {}) => {
  storedConfig = {
    enabledChannels: { sms: true, email: true },
    defaultProvider: { sms: 'twilio', email: 'smtp' },
    templates: {},
    deeplinkBaseUrl: 'blulok://',
    ...overrides,
  };
};

describe('NotificationService channel policy', () => {
  const service = NotificationService.getInstance();

  beforeEach(() => {
    jest.clearAllMocks();
    sendSms.mockResolvedValue(undefined);
    sendEmail.mockResolvedValue(undefined);
    setConfig();
  });

  describe('sendInvite', () => {
    it('delivers on both channels when both are enabled and the user is reachable', async () => {
      const outcome = await service.sendInvite({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
        code: '123456',
      });

      expect(outcome.delivered).toEqual(['SMS', 'email']);
      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('substitutes the verification code into both templates', async () => {
      await service.sendInvite({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
        code: '123456',
      });

      expect(sendSms.mock.calls[0][1]).toContain('123456');
      expect(sendSms.mock.calls[0][1]).not.toContain('{{code}}');
      expect(sendEmail.mock.calls[0][2]).toContain('123456');
      expect(sendEmail.mock.calls[0][2]).not.toContain('{{code}}');
    });

    it('does not send email when the email channel is disabled', async () => {
      setConfig({ enabledChannels: { sms: true, email: false } });

      await expect(
        service.sendInvite({
          toEmail: 'user@example.com',
          deeplink: 'blulok://invite?token=abc',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/no enabled notification channel/i),
      });

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
    });

    it('sends only SMS when preference is prefer_sms and both contacts exist', async () => {
      setConfig({ channelPreference: 'prefer_sms' });

      const outcome = await service.sendInvite({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
      });

      expect(outcome.delivered).toEqual(['SMS']);
      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends only email when preference is prefer_email and both contacts exist', async () => {
      setConfig({ channelPreference: 'prefer_email' });

      const outcome = await service.sendInvite({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
      });

      expect(outcome.delivered).toEqual(['email']);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendSms).not.toHaveBeenCalled();
    });

    it('falls back to email when prefer_sms but the account has no phone', async () => {
      setConfig({ channelPreference: 'prefer_sms' });

      const outcome = await service.sendInvite({
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
      });

      expect(outcome.delivered).toEqual(['email']);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('reports partial delivery instead of failing the whole invite', async () => {
      sendEmail.mockRejectedValue(new Error('SMTP 535 auth failed'));

      const outcome = await service.sendInvite({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        deeplink: 'blulok://invite?token=abc',
      });

      expect(outcome.delivered).toEqual(['SMS']);
      expect(outcome.errors).toHaveLength(1);
    });

    it('throws when every channel fails', async () => {
      sendSms.mockRejectedValue(new Error('twilio down'));
      sendEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.sendInvite({
          toPhone: '+15550001111',
          toEmail: 'user@example.com',
          deeplink: 'blulok://invite?token=abc',
        }),
      ).rejects.toMatchObject({ statusCode: 502 });
    });

    it('throws rather than silently succeeding when there is no contact', async () => {
      await expect(
        service.sendInvite({ deeplink: 'blulok://invite?token=abc' }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(sendSms).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendPasswordReset', () => {
    it('does not email an email-only user when only SMS is enabled', async () => {
      setConfig({ enabledChannels: { sms: true, email: false } });

      await expect(
        service.sendPasswordReset({
          toEmail: 'user@example.com',
          token: 'reset-token',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('respects prefer_email for password reset', async () => {
      setConfig({ channelPreference: 'prefer_email' });

      const outcome = await service.sendPasswordReset({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        token: 'reset-token',
      });

      expect(outcome.delivered).toEqual(['email']);
      const html = sendEmail.mock.calls[0][2] as string;
      expect(html).toContain('reset-password?token=reset-token');
      expect(sendSms).not.toHaveBeenCalled();
    });

    it('uses both channels for a user with a phone and an email', async () => {
      const outcome = await service.sendPasswordReset({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
        token: 'reset-token',
      });

      expect(outcome.delivered).toEqual(['SMS', 'email']);
    });
  });

  describe('sendOtp', () => {
    it('delivers the code on the reachable channel when the caller picks one', async () => {
      const outcome = await service.sendOtp({ toPhone: '+15550001111', code: '999111' });

      expect(outcome.delivered).toEqual(['SMS']);
      expect(sendSms.mock.calls[0][1]).toContain('999111');
    });

    it('throws when the code cannot be delivered anywhere', async () => {
      await expect(service.sendOtp({ code: '999111' })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('sendTestNotifications', () => {
    it('covers invite, OTP and password reset on both channels', async () => {
      setConfig({ channelPreference: 'prefer_sms' });
      const result = await service.sendTestNotifications({
        toPhone: '+15550001111',
        toEmail: 'user@example.com',
      });

      expect(result.sent).toEqual([
        'sms_invite',
        'email_invite',
        'sms_otp',
        'email_otp',
        'sms_password_reset',
        'email_password_reset',
      ]);
      expect(result.errors).toEqual([]);
    });

    it('renders template variables in the test invite', async () => {
      await service.sendTestNotifications({ toPhone: '+15550001111' });

      const inviteBody = sendSms.mock.calls[0][1] as string;
      expect(inviteBody).not.toContain('{{code}}');
      expect(inviteBody).not.toContain('{{deeplink}}');
      expect(inviteBody).toContain('123456');
    });
  });
});
