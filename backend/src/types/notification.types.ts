export interface NotificationTemplatesConfig {
  inviteSms?: string;
  inviteEmail?: string;
  inviteEmailSubject?: string;
  otpSms?: string;
  otpEmail?: string;
  otpEmailSubject?: string;
  // Password reset templates (deeplink-based, similar to invite)
  passwordResetSms?: string;
  passwordResetEmail?: string;
  passwordResetEmailSubject?: string;
}

export type OtpKind = 'invite';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export type SmtpEncryption = 'none' | 'starttls' | 'tls';
export type SmtpAuthMode = 'none' | 'plain' | 'login';

/** How to choose among enabled channels that can both reach the account. */
export type NotificationChannelPreference = 'both' | 'prefer_sms' | 'prefer_email';

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  authMode: SmtpAuthMode;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  /** TLS certificate validation; default true */
  rejectUnauthorized?: boolean;
}

export interface NotificationsConfig {
  enabledChannels: {
    sms: boolean;
    email: boolean;
  };
  /**
   * When both SMS and email are enabled and the account has both contacts.
   * Ignored when only one channel is on. Default: both.
   */
  channelPreference?: NotificationChannelPreference;
  defaultProvider: {
    sms: 'twilio' | 'console';
    email: 'console' | 'smtp';
  };
  twilio?: TwilioConfig;
  smtp?: SmtpConfig;
  templates: NotificationTemplatesConfig;
  deeplinkBaseUrl?: string; // e.g., blulok:// or https://app.blulok.com/
}

export interface SendInviteParams {
  toPhone?: string;
  toEmail?: string;
  deeplink: string;
  code?: string; // OTP code to include in the invite notification
  templateId?: string; // reserved for future use
}

export interface SendOtpParams {
  toPhone?: string;
  toEmail?: string;
  code: string;
  kind?: OtpKind; // 'invite' (default)
  templateId?: string; // reserved for future use
}

export interface SendPasswordResetParams {
  toPhone?: string;
  toEmail?: string;
  token: string;
  templateId?: string; // reserved for future use
}
