/**
 * @jest-environment jsdom
 */
import { isNotificationConfigValid } from '@/pages/settings/notifications/notification-settings.validation';
import { SECRET_MASK, type NotificationsConfig } from '@/types/notification.types';

describe('isNotificationConfigValid', () => {
  const base: NotificationsConfig = {
    enabledChannels: { sms: false, email: false },
    defaultProvider: { sms: 'console', email: 'console' },
    templates: {},
  };

  it('allows console-only configs', () => {
    expect(isNotificationConfigValid(base)).toBe(true);
  });

  it('requires twilio fields when twilio selected', () => {
    expect(
      isNotificationConfigValid({
        ...base,
        enabledChannels: { sms: true, email: false },
        defaultProvider: { sms: 'twilio', email: 'console' },
        twilio: { accountSid: '', authToken: '', fromNumber: '' },
      }),
    ).toBe(false);

    expect(
      isNotificationConfigValid({
        ...base,
        enabledChannels: { sms: true, email: false },
        defaultProvider: { sms: 'twilio', email: 'console' },
        twilio: { accountSid: 'AC', authToken: SECRET_MASK, fromNumber: '+1' },
      }),
    ).toBe(true);
  });

  it('requires smtp host and from when smtp selected', () => {
    expect(
      isNotificationConfigValid({
        ...base,
        enabledChannels: { sms: false, email: true },
        defaultProvider: { sms: 'console', email: 'smtp' },
        smtp: {
          host: '',
          port: 587,
          encryption: 'starttls',
          authMode: 'none',
          fromEmail: '',
        },
      }),
    ).toBe(false);

    expect(
      isNotificationConfigValid({
        ...base,
        enabledChannels: { sms: false, email: true },
        defaultProvider: { sms: 'console', email: 'smtp' },
        smtp: {
          host: 'smtp.test',
          port: 587,
          encryption: 'starttls',
          authMode: 'none',
          fromEmail: 'a@b.com',
        },
      }),
    ).toBe(true);
  });
});
