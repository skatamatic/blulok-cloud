export interface NotificationTemplatesConfig {
  inviteSms?: string;
  inviteEmail?: string;
  inviteEmailSubject?: string;
  otpSms?: string;
  otpEmail?: string;
  otpEmailSubject?: string;
  passwordResetSms?: string;
  passwordResetEmail?: string;
  passwordResetEmailSubject?: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export type SmtpEncryption = 'none' | 'starttls' | 'tls';
export type SmtpAuthMode = 'none' | 'plain' | 'login';

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
  rejectUnauthorized?: boolean;
}

export interface NotificationsConfig {
  enabledChannels: {
    sms: boolean;
    email: boolean;
  };
  channelPreference?: NotificationChannelPreference;
  defaultProvider: {
    sms: 'twilio' | 'console';
    email: 'console' | 'smtp';
  };
  twilio?: TwilioConfig;
  smtp?: SmtpConfig;
  templates: NotificationTemplatesConfig;
  deeplinkBaseUrl?: string;
}

/** Sentinel returned by API for stored secrets (keep on save = unchanged). */
export const SECRET_MASK = '••••••';
