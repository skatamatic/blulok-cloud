import { NotificationDebugService } from '@/services/notifications/notification-debug.service';

describe('NotificationDebugService', () => {
  it('publishes events only when enabled', () => {
    const svc = NotificationDebugService.getInstance();
    svc.disable();
    const handler = jest.fn();
    const unsubscribe = svc.subscribe(handler);

    svc.publish({
      kind: 'invite',
      delivery: 'sms',
      toPhone: '+15551230000',
      body: 'Test',
      meta: {},
      createdAt: new Date(),
    });
    expect(handler).not.toHaveBeenCalled();

    svc.enable();
    const evtTime = new Date();
    svc.publish({
      kind: 'otp',
      delivery: 'sms',
      toPhone: '+15551230000',
      body: 'Code 123456',
      meta: { code: '123456' },
      createdAt: evtTime,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    const arg = handler.mock.calls[0][0];
    expect(arg.kind).toBe('otp');
    expect(arg.meta.code).toBe('123456');

    unsubscribe();
  });
});


