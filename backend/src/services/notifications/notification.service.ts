import { SystemSettingsModel } from '@/models/system-settings.model';
import { NotificationsConfig, SendInviteParams, SendOtpParams } from '@/types/notification.types';
import { logger } from '@/utils/logger';
import { NotificationDebugService } from './notification-debug.service';

interface SmsProvider {
  sendSms(to: string, body: string): Promise<void>;
}

interface EmailProvider {
  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void>;
}

class ConsoleSmsProvider implements SmsProvider {
  async sendSms(to: string, body: string): Promise<void> {
    console.log(`[ConsoleSMS] -> ${to}: ${body}`);
  }
}

class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, html: string, _text?: string): Promise<void> {
    console.log(`[ConsoleEmail] -> ${to}: ${subject} | ${html}`);
  }
}

class TwilioSmsProvider implements SmsProvider {
  private client: any;
  private from: string;
  constructor(accountSid: string, authToken: string, fromNumber: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.from = fromNumber;
    } catch (_e) {
      throw new Error('Twilio SDK not installed. Please add dependency if using Twilio.');
    }
  }
  async sendSms(to: string, body: string): Promise<void> {
    await this.client.messages.create({ from: this.from, to, body });
  }
}

export class NotificationService {
  private static instance: NotificationService;
  private settingsModel = new SystemSettingsModel();

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async loadConfig(): Promise<NotificationsConfig> {
    const raw = await this.settingsModel.get('notifications.config');
    if (!raw) {
      return {
        enabledChannels: { sms: true, email: false },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {
          inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
          otpSms: 'Your verification code is: {{code}}',
        },
        deeplinkBaseUrl: 'blulok://invite',
      };
    }
    try {
      return JSON.parse(raw) as NotificationsConfig;
    } catch {
      return {
        enabledChannels: { sms: true, email: false },
        defaultProvider: { sms: 'console', email: 'console' },
        templates: {
          inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
          otpSms: 'Your verification code is: {{code}}',
        },
        deeplinkBaseUrl: 'blulok://invite',
      };
    }
  }

  private getSmsProvider(config: NotificationsConfig): SmsProvider {
    const provider = config.defaultProvider?.sms || 'console';
    if (provider === 'twilio') {
      const tw = config.twilio;
      if (!tw?.accountSid || !tw.authToken || !tw.fromNumber) {
        throw new Error('Twilio SMS provider selected but configuration is incomplete');
      }
      return new TwilioSmsProvider(tw.accountSid, tw.authToken, tw.fromNumber);
    }
    return new ConsoleSmsProvider();
  }

  private getEmailProvider(_config: NotificationsConfig): EmailProvider {
    // Placeholder: extend with real email providers later
    return new ConsoleEmailProvider();
  }

  public async sendInvite(params: SendInviteParams): Promise<void> {
    const config = await this.loadConfig();
    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    const smsTemplate = config.templates?.inviteSms || 'Welcome to BluLok. Tap to get started: {{deeplink}}';
    const emailTemplate = config.templates?.inviteEmail || 'Welcome to BluLok. Open {{deeplink}}';

    const debug = NotificationDebugService.getInstance();
    // When debug test mode is enabled, publish events instead of calling real providers
    if (debug.isEnabled()) {
      const createdAt = new Date();
      if (smsEnabled && params.toPhone) {
        const body = smsTemplate.replace('{{deeplink}}', params.deeplink);
        debug.publish({
          kind: 'invite',
          delivery: 'sms',
          toPhone: params.toPhone,
          body,
          meta: { deeplink: params.deeplink },
          createdAt,
        });
      }
      if (emailEnabled && params.toEmail) {
        const html = emailTemplate.replace('{{deeplink}}', params.deeplink);
        debug.publish({
          kind: 'invite',
          delivery: 'email',
          toEmail: params.toEmail,
          body: html,
          meta: { deeplink: params.deeplink },
          createdAt,
        });
      }
      return;
    }

    if (smsEnabled && params.toPhone) {
      const provider = this.getSmsProvider(config);
      const body = smsTemplate.replace('{{deeplink}}', params.deeplink);
      await provider.sendSms(params.toPhone, body);
    }

    if (emailEnabled && params.toEmail) {
      const provider = this.getEmailProvider(config);
      const subject = 'Your BluLok Invitation';
      const html = emailTemplate.replace('{{deeplink}}', params.deeplink);
      await provider.sendEmail(params.toEmail, subject, html, html);
    }
  }

  public async sendOtp(params: SendOtpParams): Promise<void> {
    const config = await this.loadConfig();
    const smsTemplate = config.templates?.otpSms || 'Your verification code is: {{code}}';
    const emailTemplate = config.templates?.otpEmail || 'Your verification code is: {{code}}';

    const debug = NotificationDebugService.getInstance();
    if (debug.isEnabled()) {
      const createdAt = new Date();
      if (params.toPhone) {
        const body = smsTemplate.replace('{{code}}', params.code);
        debug.publish({
          kind: 'otp',
          delivery: 'sms',
          toPhone: params.toPhone,
          body,
          meta: { code: params.code },
          createdAt,
        });
        return;
      }
      if (params.toEmail) {
        const html = emailTemplate.replace('{{code}}', params.code);
        debug.publish({
          kind: 'otp',
          delivery: 'email',
          toEmail: params.toEmail,
          body: html,
          meta: { code: params.code },
          createdAt,
        });
        return;
      }
    }

    if (params.toPhone) {
      const provider = this.getSmsProvider(config);
      const body = smsTemplate.replace('{{code}}', params.code);
      await provider.sendSms(params.toPhone, body);
      return;
    }
    if (params.toEmail) {
      const provider = this.getEmailProvider(config);
      const subject = 'Your Verification Code';
      const html = emailTemplate.replace('{{code}}', params.code);
      await provider.sendEmail(params.toEmail, subject, html, html);
      return;
    }
    throw new Error('sendOtp requires toPhone or toEmail');
  }

  /**
   * Send one test message per template and channel configured.
   * Prefixes content with 'TEST - ' so recipients can identify non-production messages.
   */
  public async sendTestNotifications(
    params: { toEmail?: string; toPhone?: string },
    configOverride?: NotificationsConfig
  ): Promise<{ sent: string[]; errors: { channel: string; message: string }[] }> {
    const config = configOverride ?? await this.loadConfig();
    const sent: string[] = [];
    const errors: { channel: string; message: string }[] = [];

    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    // Prepare providers when needed (gracefully skip if provider not available)
    let smsProvider: SmsProvider | undefined;
    if (smsEnabled) {
      try {
        smsProvider = this.getSmsProvider(config);
      } catch (e: any) {
        logger.warn(`Notifications: SMS provider unavailable: ${e?.message || e}`);
        errors.push({ channel: 'sms', message: e?.message || 'SMS provider unavailable' });
        smsProvider = undefined;
      }
    }
    const emailProvider = emailEnabled ? this.getEmailProvider(config) : undefined;

    // INVITE
    const deeplink = (config.deeplinkBaseUrl || 'blulok://invite') + (config.deeplinkBaseUrl?.includes('?') ? '&' : '?') + 'test=1';
    const inviteSmsTpl = config.templates?.inviteSms || 'Welcome to BluLok. Tap to get started: {{deeplink}}';
    const inviteEmailTpl = config.templates?.inviteEmail || 'Welcome to BluLok. Open {{deeplink}}';
    const inviteEmailSubject = config.templates?.inviteEmailSubject || 'Your BluLok Invitation';

    if (smsProvider && params.toPhone) {
      try {
        await smsProvider.sendSms(params.toPhone, `TEST - ` + inviteSmsTpl.replace('{{deeplink}}', deeplink));
        sent.push('sms_invite');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send SMS invite: ${e?.message || e}`);
        errors.push({ channel: 'sms_invite', message: e?.message || 'Failed to send SMS invite' });
      }
    }
    if (emailEnabled && params.toEmail) {
      try {
        const html = `TEST - ` + inviteEmailTpl.replace('{{deeplink}}', deeplink);
        await emailProvider!.sendEmail(params.toEmail, `TEST - ${inviteEmailSubject}`, html, html);
        sent.push('email_invite');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send Email invite: ${e?.message || e}`);
        errors.push({ channel: 'email_invite', message: e?.message || 'Failed to send Email invite' });
      }
    }

    // OTP
    const otpCode = '123456 TEST';
    const otpSmsTpl = config.templates?.otpSms || 'Your verification code is: {{code}}';
    const otpEmailTpl = config.templates?.otpEmail || 'Your verification code is: {{code}}';
    const otpEmailSubject = config.templates?.otpEmailSubject || 'Your Verification Code';

    if (smsProvider && params.toPhone) {
      try {
        await smsProvider.sendSms(params.toPhone, `TEST - ` + otpSmsTpl.replace('{{code}}', otpCode));
        sent.push('sms_otp');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send SMS OTP: ${e?.message || e}`);
        errors.push({ channel: 'sms_otp', message: e?.message || 'Failed to send SMS OTP' });
      }
    }
    if (emailEnabled && params.toEmail) {
      try {
        const html = `TEST - ` + otpEmailTpl.replace('{{code}}', otpCode);
        await emailProvider!.sendEmail(params.toEmail, `TEST - ${otpEmailSubject}`, html, html);
        sent.push('email_otp');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send Email OTP: ${e?.message || e}`);
        errors.push({ channel: 'email_otp', message: e?.message || 'Failed to send Email OTP' });
      }
    }

    return { sent, errors };
  }
}


