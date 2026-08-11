import type { NotificationsConfig } from '@/types/notification.types';
import type { EmailProvider, SmsProvider } from './provider.types';
import { ConsoleSmsProvider } from './console-sms.provider';
import { TwilioSmsProvider } from './twilio-sms.provider';
import { ConsoleEmailProvider } from './console-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';

export function createSmsProvider(config: NotificationsConfig): SmsProvider {
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

export function createEmailProvider(config: NotificationsConfig): EmailProvider {
  const provider = config.defaultProvider?.email || 'console';
  if (provider === 'smtp') {
    const smtp = config.smtp;
    if (!smtp?.host || !smtp.fromEmail) {
      throw new Error('SMTP email provider selected but configuration is incomplete');
    }
    return new SmtpEmailProvider(smtp);
  }
  return new ConsoleEmailProvider();
}
