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


