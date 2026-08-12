/**
 * Unit tests for SMS/email channel notifications
 * (`services/notifications/notification.service.ts`).
 */
import { NotificationService as ChannelNotificationService } from '@/services/notifications/notification.service';
import { NotificationDebugService } from '@/services/notifications/notification-debug.service';
import { NotificationConfigService } from '@/services/notifications/notification-config.service';
import { SystemSettingsModel } from '@/models/system-settings.model';

jest.mock('@/models/system-settings.model');

describe('Channel NotificationService (SMS/Email)', () => {
  let getMock: jest.Mock;
  let service: ChannelNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    (ChannelNotificationService as unknown as { instance?: ChannelNotificationService }).instance = undefined;
    (NotificationDebugService as unknown as { instance?: NotificationDebugService }).instance = undefined;
    (NotificationConfigService as unknown as { instance?: NotificationConfigService }).instance = undefined;

    getMock = jest.fn();
    (SystemSettingsModel as jest.MockedClass<typeof SystemSettingsModel>).mockImplementation(
      () =>
        ({
          get: getMock,
        }) as unknown as SystemSettingsModel
    );

    service = ChannelNotificationService.getInstance();
    NotificationDebugService.getInstance().disable();
  });

  describe('getConfig / loadConfig', () => {
    it('returns defaults when settings key is missing', async () => {
      getMock.mockResolvedValue(null);
      const cfg = await service.getConfig();
      expect(cfg.enabledChannels?.sms).not.toBe(false);
      expect(cfg.defaultProvider?.sms).toBe('console');
    });

    it('returns defaults when stored JSON is invalid', async () => {
      getMock.mockResolvedValue('{not-json');
      const cfg = await service.getConfig();
      expect(cfg.deeplinkBaseUrl).toBeDefined();
    });
  });

  describe('sendInvite', () => {
    it('publishes debug events when debug mode is on', async () => {
      getMock.mockResolvedValue(null);
      const debug = NotificationDebugService.getInstance();
      debug.enable();
      const handler = jest.fn();
      debug.subscribe(handler);

      await service.sendInvite({
        toPhone: '+15550001',
        toEmail: 'a@example.com',
        deeplink: 'blulok://x',
        code: '123456',
      });

      expect(handler).toHaveBeenCalled();
      const kinds = handler.mock.calls.map((c) => c[0].kind);
      expect(kinds).toContain('invite');
    });

    it('sends SMS via console provider when not in debug mode', async () => {
      getMock.mockResolvedValue(null);
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.sendInvite({
        toPhone: '+15550001',
        deeplink: 'blulok://invite',
      });

      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('sends email when email channel is enabled', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: false, email: true },
          defaultProvider: { sms: 'console', email: 'console' },
          templates: {
            inviteEmail: 'Hi {{deeplink}}',
            inviteEmailSubject: 'Subj',
          },
        })
      );
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.sendInvite({
        toEmail: 'b@example.com',
        deeplink: 'blulok://invite',
      });

      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('throws a calm SMS settings message when Twilio config is incomplete', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: true, email: false },
          defaultProvider: { sms: 'twilio', email: 'console' },
          twilio: { accountSid: '', authToken: '', fromNumber: '' },
        })
      );

      await expect(
        service.sendInvite({ toPhone: '+15550001', deeplink: 'blulok://x' })
      ).rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringMatching(/Failed to send text\. Check your SMS settings/i),
      });
    });
  });

  describe('sendOtp', () => {
    it('throws when no destination is provided', async () => {
      getMock.mockResolvedValue(null);
      await expect(service.sendOtp({ code: '123456' } as any)).rejects.toThrow(/requires toPhone or toEmail/);
    });

    it('sends OTP SMS in normal mode', async () => {
      getMock.mockResolvedValue(null);
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      await service.sendOtp({ toPhone: '+15550001', code: '999888' });
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('covers debug OTP fallback when SMS path skipped', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: false, email: false },
          defaultProvider: { sms: 'console', email: 'console' },
        })
      );
      const debug = NotificationDebugService.getInstance();
      debug.enable();
      const handler = jest.fn();
      debug.subscribe(handler);

      await service.sendOtp({ toPhone: '+1', code: '111222' });

      expect(handler.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('sendPasswordReset', () => {
    it('normalizes https deeplink base with trailing slash', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: true, email: false },
          defaultProvider: { sms: 'console', email: 'console' },
          deeplinkBaseUrl: 'https://app.example.com',
          templates: { passwordResetSms: '{{deeplink}}' },
        })
      );
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      await service.sendPasswordReset({ toPhone: '+15550001', token: 'tok' });
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('throws when no channels enabled and no destination in non-debug path', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: false, email: false },
          defaultProvider: { sms: 'console', email: 'console' },
        })
      );
      await expect(
        service.sendPasswordReset({ token: 'x' } as any)
      ).rejects.toThrow(/requires toPhone or toEmail/);
    });
  });

  describe('sendTestNotifications', () => {
    it('records SMS provider error when Twilio config incomplete', async () => {
      getMock.mockResolvedValue(
        JSON.stringify({
          enabledChannels: { sms: true, email: false },
          defaultProvider: { sms: 'twilio', email: 'console' },
          twilio: { accountSid: 'x', authToken: '', fromNumber: '' },
        })
      );

      const result = await service.sendTestNotifications({ toPhone: '+1' });
      expect(result.errors.some((e) => e.channel === 'sms')).toBe(true);
    });

    it('sends invite and OTP test messages when providers work', async () => {
      getMock.mockResolvedValue(null);
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await service.sendTestNotifications(
        {
          toPhone: '+15550001',
          toEmail: 't@example.com',
        },
        {
          enabledChannels: { sms: true, email: true },
          defaultProvider: { sms: 'console', email: 'console' },
          templates: {
            inviteSms: 'Invite {{deeplink}} code {{code}}',
            inviteEmail: 'Invite email {{deeplink}} code {{code}}',
            otpSms: 'OTP {{code}}',
            otpEmail: 'OTP email {{code}}',
          },
          deeplinkBaseUrl: 'blulok://',
        } as any
      );

      expect(result.sent).toContain('sms_invite');
      expect(result.sent).toContain('sms_otp');
      expect(result.sent).toContain('email_invite');
      expect(result.sent).toContain('email_otp');

      const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('code 123456');
      expect(logged).not.toContain('{{code}}');
      log.mockRestore();
    });
  });
});
