import { SystemSettingsModel } from '@/models/system-settings.model';
import { NotificationsConfig, SendInviteParams, SendOtpParams } from '@/types/notification.types';

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
}


