export interface NotificationTemplatesConfig {
  inviteSms?: string;
  inviteEmail?: string;
  inviteEmailSubject?: string;
  otpSms?: string;
  otpEmail?: string;
  otpEmailSubject?: string;
}

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

