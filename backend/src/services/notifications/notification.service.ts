import {
  NotificationsConfig,
  SendInviteParams,
  SendOtpParams,
  SendPasswordResetParams,
} from '@/types/notification.types';
import { logger } from '@/utils/logger';
import { AppError } from '@/middleware/error.middleware';
import { NotificationDebugService } from './notification-debug.service';
import { NotificationConfigService } from './notification-config.service';
import { renderTemplate } from './notification-template.renderer';
import {
  createEmailProvider,
  createSmsProvider,
} from './providers/notification-provider.factory';
import type { EmailProvider, SmsProvider } from './providers/provider.types';
import {
  throwNotificationDeliveryError,
  type NotificationDeliveryChannel,
} from './notification-delivery-error.utils';

export class NotificationService {
  private static instance: NotificationService;
  private configService = NotificationConfigService.getInstance();

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async loadConfig(): Promise<NotificationsConfig> {
    return this.configService.loadConfig();
  }

  private getSmsProvider(config: NotificationsConfig): SmsProvider {
    return createSmsProvider(config);
  }

  private getEmailProvider(config: NotificationsConfig): EmailProvider {
    return createEmailProvider(config);
  }

  /**
   * Map provider transport failures to operational 502s with a calm UI message.
   * Technical SMTP/Twilio detail is logged only.
   */
  private async deliver(
    channel: NotificationDeliveryChannel,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (e: unknown) {
      if (e instanceof AppError) throw e;
      throwNotificationDeliveryError(channel, e);
    }
  }

  public async getConfig(): Promise<NotificationsConfig> {
    return this.loadConfig();
  }

  /**
   * Verify the configured email provider can connect (SMTP verify + From probe).
   */
  public async testEmailConnection(
    configOverride?: NotificationsConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const config = configOverride ?? (await this.loadConfig());
    try {
      const provider = this.getEmailProvider(config);
      if (provider.verifyConnection) {
        await provider.verifyConnection();
      }
      return {
        ok: true,
        message: 'SMTP login OK and From address accepted by the server',
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Email connection failed' };
    }
  }

  public async sendInvite(params: SendInviteParams): Promise<void> {
    const config = await this.loadConfig();
    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    const smsTemplate =
      config.templates?.inviteSms ||
      'Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}';
    const emailTemplate =
      config.templates?.inviteEmail ||
      'Welcome to BluLok. Open {{deeplink}}. Your verification code: {{code}}';

    const apply = (template: string) =>
      renderTemplate(template, { deeplink: params.deeplink, code: params.code });

    const meta: Record<string, string> = { deeplink: params.deeplink };
    if (params.code) meta.code = params.code;

    const debug = NotificationDebugService.getInstance();
    if (debug.isEnabled()) {
      const createdAt = new Date();
      if (smsEnabled && params.toPhone) {
        debug.publish({
          kind: 'invite',
          delivery: 'sms',
          toPhone: params.toPhone,
          body: apply(smsTemplate),
          meta,
          createdAt,
        });
      }
      if (emailEnabled && params.toEmail) {
        debug.publish({
          kind: 'invite',
          delivery: 'email',
          toEmail: params.toEmail,
          body: apply(emailTemplate),
          meta,
          createdAt,
        });
      }
      return;
    }

    if (smsEnabled && params.toPhone) {
      await this.deliver('SMS', () =>
        this.getSmsProvider(config).sendSms(params.toPhone!, apply(smsTemplate)),
      );
    }

    if (emailEnabled && params.toEmail) {
      const subject = config.templates?.inviteEmailSubject || 'Your BluLok Invitation';
      const html = apply(emailTemplate);
      await this.deliver('email', () =>
        this.getEmailProvider(config).sendEmail(params.toEmail!, subject, html, html),
      );
    }
  }

  public async sendOtp(params: SendOtpParams): Promise<void> {
    const config = await this.loadConfig();
    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    const smsTemplate = config.templates?.otpSms || 'Your verification code is: {{code}}';
    const emailTemplate = config.templates?.otpEmail || 'Your verification code is: {{code}}';
    const emailSubject = config.templates?.otpEmailSubject || 'Your Verification Code';
    const body = renderTemplate(smsTemplate, { code: params.code });
    const html = renderTemplate(emailTemplate, { code: params.code });

    const debug = NotificationDebugService.getInstance();
    if (debug.isEnabled()) {
      const createdAt = new Date();
      if (smsEnabled && params.toPhone) {
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
      if (emailEnabled && params.toEmail) {
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
      if (params.toPhone) {
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

    if (smsEnabled && params.toPhone) {
      await this.deliver('SMS', () => this.getSmsProvider(config).sendSms(params.toPhone!, body));
      return;
    }
    if (emailEnabled && params.toEmail) {
      await this.deliver('email', () =>
        this.getEmailProvider(config).sendEmail(params.toEmail!, emailSubject, html, html),
      );
      return;
    }
    if (params.toPhone) {
      await this.deliver('SMS', () => this.getSmsProvider(config).sendSms(params.toPhone!, body));
      return;
    }
    if (params.toEmail) {
      await this.deliver('email', () =>
        this.getEmailProvider(config).sendEmail(params.toEmail!, emailSubject, html, html),
      );
      return;
    }
    throw new Error('sendOtp requires toPhone or toEmail');
  }

  public async sendPasswordReset(params: SendPasswordResetParams): Promise<void> {
    const config = await this.loadConfig();
    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    const baseUrl = this.configService.normalizeDeeplinkBase(
      config.deeplinkBaseUrl || 'blulok://',
    );
    const deeplink = `${baseUrl}reset-password?token=${encodeURIComponent(params.token)}`;

    const smsTemplate =
      config.templates?.passwordResetSms || 'Reset your BluLok password: {{deeplink}}';
    const emailTemplate =
      config.templates?.passwordResetEmail ||
      '<p>Click to reset your password: <a href="{{deeplink}}">{{deeplink}}</a></p>';
    const emailSubject =
      config.templates?.passwordResetEmailSubject || 'Reset Your BluLok Password';

    const smsBody = renderTemplate(smsTemplate, { deeplink });
    const emailHtml = renderTemplate(emailTemplate, { deeplink });

    const debug = NotificationDebugService.getInstance();
    if (debug.isEnabled()) {
      const createdAt = new Date();
      if (smsEnabled && params.toPhone) {
        debug.publish({
          kind: 'password_reset',
          delivery: 'sms',
          toPhone: params.toPhone,
          body: smsBody,
          meta: { token: params.token, deeplink },
          createdAt,
        });
      }
      if (emailEnabled && params.toEmail) {
        debug.publish({
          kind: 'password_reset',
          delivery: 'email',
          toEmail: params.toEmail,
          body: emailHtml,
          meta: { token: params.token, deeplink },
          createdAt,
        });
      }
      if (!smsEnabled && !emailEnabled) {
        if (params.toPhone) {
          debug.publish({
            kind: 'password_reset',
            delivery: 'sms',
            toPhone: params.toPhone,
            body: smsBody,
            meta: { token: params.token, deeplink },
            createdAt,
          });
        } else if (params.toEmail) {
          debug.publish({
            kind: 'password_reset',
            delivery: 'email',
            toEmail: params.toEmail,
            body: emailHtml,
            meta: { token: params.token, deeplink },
            createdAt,
          });
        }
      }
      return;
    }

    if (smsEnabled && params.toPhone) {
      await this.deliver('SMS', () => this.getSmsProvider(config).sendSms(params.toPhone!, smsBody));
    }
    if (emailEnabled && params.toEmail) {
      await this.deliver('email', () =>
        this.getEmailProvider(config).sendEmail(
          params.toEmail!,
          emailSubject,
          emailHtml,
          emailHtml,
        ),
      );
    }
    if (!smsEnabled && !emailEnabled) {
      if (params.toPhone) {
        await this.deliver('SMS', () =>
          this.getSmsProvider(config).sendSms(params.toPhone!, smsBody),
        );
      } else if (params.toEmail) {
        await this.deliver('email', () =>
          this.getEmailProvider(config).sendEmail(
            params.toEmail!,
            emailSubject,
            emailHtml,
            emailHtml,
          ),
        );
      } else {
        throw new Error('sendPasswordReset requires toPhone or toEmail');
      }
    }
  }

  public async sendTestNotifications(
    params: { toEmail?: string; toPhone?: string },
    configOverride?: NotificationsConfig,
  ): Promise<{ sent: string[]; errors: { channel: string; message: string }[] }> {
    const config = configOverride ?? (await this.loadConfig());
    const sent: string[] = [];
    const errors: { channel: string; message: string }[] = [];

    const smsEnabled = config.enabledChannels?.sms !== false;
    const emailEnabled = config.enabledChannels?.email === true;

    let smsProvider: SmsProvider | undefined;
    if (smsEnabled) {
      try {
        smsProvider = this.getSmsProvider(config);
      } catch (e: any) {
        logger.warn(`Notifications: SMS provider unavailable: ${e?.message || e}`);
        errors.push({ channel: 'sms', message: e?.message || 'SMS provider unavailable' });
      }
    }

    let emailProvider: EmailProvider | undefined;
    if (emailEnabled) {
      try {
        emailProvider = this.getEmailProvider(config);
      } catch (e: any) {
        logger.warn(`Notifications: Email provider unavailable: ${e?.message || e}`);
        errors.push({ channel: 'email', message: e?.message || 'Email provider unavailable' });
      }
    }

    const baseUrl = this.configService.normalizeDeeplinkBase(
      config.deeplinkBaseUrl || 'blulok://',
    );
    const deeplink = `${baseUrl}invite?test=1`;
    const inviteSmsTpl =
      config.templates?.inviteSms || 'Welcome to BluLok. Tap to get started: {{deeplink}}';
    const inviteEmailTpl =
      config.templates?.inviteEmail || 'Welcome to BluLok. Open {{deeplink}}';
    const inviteEmailSubject = config.templates?.inviteEmailSubject || 'Your BluLok Invitation';

    if (smsProvider && params.toPhone) {
      try {
        await smsProvider.sendSms(
          params.toPhone,
          `TEST - ${renderTemplate(inviteSmsTpl, { deeplink })}`,
        );
        sent.push('sms_invite');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send SMS invite: ${e?.message || e}`);
        errors.push({ channel: 'sms_invite', message: e?.message || 'Failed to send SMS invite' });
      }
    }
    if (emailProvider && params.toEmail) {
      try {
        const html = `TEST - ${renderTemplate(inviteEmailTpl, { deeplink })}`;
        await emailProvider.sendEmail(params.toEmail, `TEST - ${inviteEmailSubject}`, html, html);
        sent.push('email_invite');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send Email invite: ${e?.message || e}`);
        errors.push({
          channel: 'email_invite',
          message: e?.message || 'Failed to send Email invite',
        });
      }
    }

    const otpCode = '123456 TEST';
    const otpSmsTpl = config.templates?.otpSms || 'Your verification code is: {{code}}';
    const otpEmailTpl = config.templates?.otpEmail || 'Your verification code is: {{code}}';
    const otpEmailSubject = config.templates?.otpEmailSubject || 'Your Verification Code';

    if (smsProvider && params.toPhone) {
      try {
        await smsProvider.sendSms(
          params.toPhone,
          `TEST - ${renderTemplate(otpSmsTpl, { code: otpCode })}`,
        );
        sent.push('sms_otp');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send SMS OTP: ${e?.message || e}`);
        errors.push({ channel: 'sms_otp', message: e?.message || 'Failed to send SMS OTP' });
      }
    }
    if (emailProvider && params.toEmail) {
      try {
        const html = `TEST - ${renderTemplate(otpEmailTpl, { code: otpCode })}`;
        await emailProvider.sendEmail(params.toEmail, `TEST - ${otpEmailSubject}`, html, html);
        sent.push('email_otp');
      } catch (e: any) {
        logger.error(`Notifications: Failed to send Email OTP: ${e?.message || e}`);
        errors.push({ channel: 'email_otp', message: e?.message || 'Failed to send Email OTP' });
      }
    }

    return { sent, errors };
  }
}
