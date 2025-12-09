export interface NotificationTemplatesConfig {
  inviteSms?: string;
  inviteEmail?: string;
  inviteEmailSubject?: string;
  otpSms?: string;
  otpEmail?: string;
  otpEmailSubject?: string;
  // Password reset specific templates
  passwordResetOtpSms?: string;
  passwordResetOtpEmail?: string;
  passwordResetOtpEmailSubject?: string;
}

export type OtpKind = 'invite' | 'password_reset';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface NotificationsConfig {
  enabledChannels: {
    sms: boolean;
    email: boolean;
  };
  defaultProvider: {
    sms: 'twilio' | 'console';
    email: 'console';
  };
  twilio?: TwilioConfig;
  templates: NotificationTemplatesConfig;
  deeplinkBaseUrl?: string; // e.g., blulok://invite or https://app.blulok.com/invite
}

export interface SendInviteParams {
  toPhone?: string;
  toEmail?: string;
  deeplink: string;
  templateId?: string; // reserved for future use
}

export interface SendOtpParams {
  toPhone?: string;
  toEmail?: string;
  code: string;
  kind?: OtpKind; // 'invite' (default) or 'password_reset'
  templateId?: string; // reserved for future use
}


