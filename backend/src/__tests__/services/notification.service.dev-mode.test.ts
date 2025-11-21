jest.mock('@/models/system-settings.model', () => ({
  SystemSettingsModel: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(JSON.stringify({
      enabledChannels: { sms: true, email: false },
      defaultProvider: { sms: 'console', email: 'console' },
      templates: {
        inviteSms: 'Welcome: {{deeplink}}',
        otpSms: 'Code: {{code}}',
      },
      deeplinkBaseUrl: 'blulok://invite',
    })),
  })),
}));

import { NotificationService } from '@/services/notifications/notification.service';
import { NotificationDebugService } from '@/services/notifications/notification-debug.service';

describe('NotificationService dev notifications test mode', () => {
  const svc = NotificationService.getInstance();

  beforeEach(() => {
    const debug = NotificationDebugService.getInstance();
    debug.disable();
  });

  it('publishes invite SMS to debug service when test mode enabled', async () => {
    const debug = NotificationDebugService.getInstance();
    debug.enable();
    const handler = jest.fn();
    const unsubscribe = debug.subscribe(handler);

    await svc.sendInvite({
      toPhone: '+15551230000',
      toEmail: undefined,
      deeplink: 'blulok://invite?token=abc',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0];
    expect(evt.kind).toBe('invite');
    expect(evt.delivery).toBe('sms');
    expect(evt.toPhone).toBe('+15551230000');
    expect(evt.body).toContain('blulok://invite?token=abc');

    unsubscribe();
    debug.disable();
  });

  it('publishes OTP SMS to debug service when test mode enabled', async () => {
    const debug = NotificationDebugService.getInstance();
    debug.enable();
    const handler = jest.fn();
    const unsubscribe = debug.subscribe(handler);

    await svc.sendOtp({
      toPhone: '+15551230001',
      toEmail: undefined,
      code: '654321',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0];
    expect(evt.kind).toBe('otp');
    expect(evt.delivery).toBe('sms');
    expect(evt.toPhone).toBe('+15551230001');
    expect(evt.meta.code).toBe('654321');

    unsubscribe();
    debug.disable();
  });
});


