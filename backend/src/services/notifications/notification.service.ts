import {
  NotificationsConfig,
  SendInviteParams,
  SendOtpParams,
  SendPasswordResetParams,
} from '@/types/notification.types';
import { logger } from '@/utils/logger';
import { NotificationDebugService } from './notification-debug.service';
import type { NotificationDebugEvent } from './notification-debug.service';
import { NotificationConfigService } from './notification-config.service';
import { renderTemplate } from './notification-template.renderer';
import {
  buildNotificationTemplateRender,
  loadRecipientTemplateContext,
  sampleRecipientTemplateContext,
  templatesUseBrandingImage,
  type RecipientTemplateContext,
} from './notification-template-context';
import {
  createEmailProvider,
  createSmsProvider,
} from './providers/notification-provider.factory';
import type { EmailInlineImage, EmailProvider, SmsProvider } from './providers/provider.types';
import {
  deliverAcrossChannels,
  normalizeChannelPreference,
  type NotificationChannelPlan,
  type NotificationDeliveryOutcome,
} from './notification-delivery';

/** Rendered message for one notification, before channel selection. */
interface NotificationMessageSpec {
  kind: NotificationDebugEvent['kind'];
  toPhone?: string | undefined;
  toEmail?: string | undefined;
  smsBody: string;
  emailSubject: string;
  emailHtml: string;
  emailInlineImages?: EmailInlineImage[];
  meta: Record<string, string>;
}

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

  /**
   * One delivery policy for every outbound message: only enabled channels,
   * then the admin's preference when both SMS and email can reach the
   * account. Debug mode swaps the provider call for a debug event but keeps
   * the same channel selection.
   */
  private buildChannelPlans(
    config: NotificationsConfig,
    spec: NotificationMessageSpec,
  ): NotificationChannelPlan[] {
    const debug = NotificationDebugService.getInstance();
    const debugEnabled = debug.isEnabled();
    const createdAt = new Date();

    return [
      {
        channel: 'SMS',
        enabled: config.enabledChannels?.sms !== false,
        recipient: spec.toPhone,
        send: async () => {
          if (debugEnabled) {
            debug.publish({
              kind: spec.kind,
              delivery: 'sms',
              toPhone: spec.toPhone!,
              body: spec.smsBody,
              meta: spec.meta,
              createdAt,
            });
            return;
          }
          await this.getSmsProvider(config).sendSms(spec.toPhone!, spec.smsBody);
        },
      },
      {
        channel: 'email',
        enabled: config.enabledChannels?.email === true,
        recipient: spec.toEmail,
        send: async () => {
          if (debugEnabled) {
            debug.publish({
              kind: spec.kind,
              delivery: 'email',
              toEmail: spec.toEmail!,
              body: spec.emailHtml,
              meta: spec.meta,
              createdAt,
            });
            return;
          }
          await this.getEmailProvider(config).sendEmail(
            spec.toEmail!,
            spec.emailSubject,
            spec.emailHtml,
            spec.emailHtml,
            spec.emailInlineImages,
          );
        },
      },
    ];
  }

  private async resolveRecipientContext(
    userId: string | undefined,
    includeBranding: boolean,
  ): Promise<RecipientTemplateContext | null> {
    if (!userId) return null;
    try {
      return await loadRecipientTemplateContext(userId, { includeBranding });
    } catch (error) {
      logger.warn(`Notifications: failed to load template context for user ${userId}`, error);
      return null;
    }
  }

  public async sendInvite(params: SendInviteParams): Promise<NotificationDeliveryOutcome> {
    const config = await this.loadConfig();
    const smsTemplate =
      config.templates?.inviteSms ||
      'Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}';
    const emailSubjectTemplate = config.templates?.inviteEmailSubject || 'Your BluLok Invitation';
    const emailTemplate =
      config.templates?.inviteEmail ||
      'Welcome to BluLok. Open {{deeplink}}. Your verification code: {{code}}';
    const recipient = await this.resolveRecipientContext(
      params.userId,
      templatesUseBrandingImage(emailSubjectTemplate, emailTemplate),
    );
    const sms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient,
      deeplink: params.deeplink,
      code: params.code,
      inviteExpiresAt: params.inviteExpiresAt,
    });
    const email = buildNotificationTemplateRender({
      channel: 'email',
      recipient,
      deeplink: params.deeplink,
      code: params.code,
      inviteExpiresAt: params.inviteExpiresAt,
    });

    const meta: Record<string, string> = { deeplink: params.deeplink };
    if (params.code) meta.code = params.code;

    return deliverAcrossChannels(
      'invite',
      this.buildChannelPlans(config, {
        kind: 'invite',
        toPhone: params.toPhone,
        toEmail: params.toEmail,
        smsBody: renderTemplate(smsTemplate, sms.vars),
        emailSubject: renderTemplate(emailSubjectTemplate, email.vars),
        emailHtml: renderTemplate(emailTemplate, email.vars),
        emailInlineImages: email.emailInlineImages,
        meta,
      }),
      normalizeChannelPreference(config.channelPreference),
    );
  }

  public async sendOtp(params: SendOtpParams): Promise<NotificationDeliveryOutcome> {
    const config = await this.loadConfig();
    const smsTemplate = config.templates?.otpSms || 'Your verification code is: {{code}}';
    const emailSubjectTemplate = config.templates?.otpEmailSubject || 'Your Verification Code';
    const emailTemplate = config.templates?.otpEmail || 'Your verification code is: {{code}}';
    const recipient = await this.resolveRecipientContext(
      params.userId,
      templatesUseBrandingImage(emailSubjectTemplate, emailTemplate),
    );
    const sms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient,
      code: params.code,
      inviteExpiresAt: params.inviteExpiresAt,
    });
    const email = buildNotificationTemplateRender({
      channel: 'email',
      recipient,
      code: params.code,
      inviteExpiresAt: params.inviteExpiresAt,
    });

    return deliverAcrossChannels(
      'OTP',
      this.buildChannelPlans(config, {
        kind: 'otp',
        toPhone: params.toPhone,
        toEmail: params.toEmail,
        smsBody: renderTemplate(smsTemplate, sms.vars),
        emailSubject: renderTemplate(emailSubjectTemplate, email.vars),
        emailHtml: renderTemplate(emailTemplate, email.vars),
        emailInlineImages: email.emailInlineImages,
        meta: { code: params.code },
      }),
      normalizeChannelPreference(config.channelPreference),
    );
  }

  public async sendPasswordReset(
    params: SendPasswordResetParams,
  ): Promise<NotificationDeliveryOutcome> {
    const config = await this.loadConfig();

    const baseUrl = this.configService.normalizeDeeplinkBase(
      config.deeplinkBaseUrl || 'blulok://',
    );
    const deeplink = `${baseUrl}reset-password?token=${encodeURIComponent(params.token)}`;

    const smsTemplate =
      config.templates?.passwordResetSms || 'Reset your BluLok password: {{deeplink}}';
    const emailSubjectTemplate =
      config.templates?.passwordResetEmailSubject || 'Reset Your BluLok Password';
    const emailTemplate =
      config.templates?.passwordResetEmail ||
      '<p>Click to reset your password: <a href="{{deeplink}}">{{deeplink}}</a></p>';
    const recipient = await this.resolveRecipientContext(
      params.userId,
      templatesUseBrandingImage(emailSubjectTemplate, emailTemplate),
    );
    const sms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient,
      deeplink,
    });
    const email = buildNotificationTemplateRender({
      channel: 'email',
      recipient,
      deeplink,
    });

    return deliverAcrossChannels(
      'password reset',
      this.buildChannelPlans(config, {
        kind: 'password_reset',
        toPhone: params.toPhone,
        toEmail: params.toEmail,
        smsBody: renderTemplate(smsTemplate, sms.vars),
        emailSubject: renderTemplate(emailSubjectTemplate, email.vars),
        emailHtml: renderTemplate(emailTemplate, email.vars),
        emailInlineImages: email.emailInlineImages,
        meta: { token: params.token, deeplink },
      }),
      normalizeChannelPreference(config.channelPreference),
    );
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
    // Sample values so placeholders substitute the same way real sends do.
    const testCode = '123456';
    const sample = sampleRecipientTemplateContext();
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const inviteSms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient: sample,
      deeplink: `${baseUrl}invite?test=1`,
      code: testCode,
      inviteExpiresAt,
    });
    const inviteEmail = buildNotificationTemplateRender({
      channel: 'email',
      recipient: sample,
      deeplink: `${baseUrl}invite?test=1`,
      code: testCode,
      inviteExpiresAt,
    });
    const otpSms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient: sample,
      code: testCode,
      inviteExpiresAt,
    });
    const otpEmail = buildNotificationTemplateRender({
      channel: 'email',
      recipient: sample,
      code: testCode,
      inviteExpiresAt,
    });
    const resetSms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient: sample,
      deeplink: `${baseUrl}reset-password?token=TEST`,
    });
    const resetEmail = buildNotificationTemplateRender({
      channel: 'email',
      recipient: sample,
      deeplink: `${baseUrl}reset-password?token=TEST`,
    });

    const messages = [
      {
        key: 'invite',
        smsBody: renderTemplate(
          config.templates?.inviteSms ||
            'Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}',
          inviteSms.vars,
        ),
        emailSubject: renderTemplate(
          config.templates?.inviteEmailSubject || 'Your BluLok Invitation',
          inviteEmail.vars,
        ),
        emailHtml: renderTemplate(
          config.templates?.inviteEmail ||
            'Welcome to BluLok. Open {{deeplink}}. Your verification code: {{code}}',
          inviteEmail.vars,
        ),
        emailInlineImages: inviteEmail.emailInlineImages,
      },
      {
        key: 'otp',
        smsBody: renderTemplate(
          config.templates?.otpSms || 'Your verification code is: {{code}}',
          otpSms.vars,
        ),
        emailSubject: renderTemplate(
          config.templates?.otpEmailSubject || 'Your Verification Code',
          otpEmail.vars,
        ),
        emailHtml: renderTemplate(
          config.templates?.otpEmail || 'Your verification code is: {{code}}',
          otpEmail.vars,
        ),
        emailInlineImages: otpEmail.emailInlineImages,
      },
      {
        key: 'password_reset',
        smsBody: renderTemplate(
          config.templates?.passwordResetSms || 'Reset your BluLok password: {{deeplink}}',
          resetSms.vars,
        ),
        emailSubject: renderTemplate(
          config.templates?.passwordResetEmailSubject || 'Reset Your BluLok Password',
          resetEmail.vars,
        ),
        emailHtml: renderTemplate(
          config.templates?.passwordResetEmail ||
            '<p>Click to reset your password: <a href="{{deeplink}}">{{deeplink}}</a></p>',
          resetEmail.vars,
        ),
        emailInlineImages: resetEmail.emailInlineImages,
      },
    ];

    for (const message of messages) {
      if (smsProvider && params.toPhone) {
        const channel = `sms_${message.key}`;
        try {
          await smsProvider.sendSms(params.toPhone, `TEST - ${message.smsBody}`);
          sent.push(channel);
        } catch (e: any) {
          logger.error(`Notifications: Failed to send ${channel}: ${e?.message || e}`);
          errors.push({ channel, message: e?.message || `Failed to send ${channel}` });
        }
      }
      if (emailProvider && params.toEmail) {
        const channel = `email_${message.key}`;
        try {
          const html = `TEST - ${message.emailHtml}`;
          await emailProvider.sendEmail(
            params.toEmail,
            `TEST - ${message.emailSubject}`,
            html,
            html,
            message.emailInlineImages,
          );
          sent.push(channel);
        } catch (e: any) {
          logger.error(`Notifications: Failed to send ${channel}: ${e?.message || e}`);
          errors.push({ channel, message: e?.message || `Failed to send ${channel}` });
        }
      }
    }

    return { sent, errors };
  }
}
