import {
  notificationDeliveryUserMessage,
  throwNotificationDeliveryError,
} from '@/services/notifications/notification-delivery-error.utils';
import { AppError } from '@/middleware/error.middleware';

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('notification-delivery-error.utils', () => {
  it('returns calm channel-specific messages', () => {
    expect(notificationDeliveryUserMessage('email')).toMatch(/Failed to send email.*SMTP/i);
    expect(notificationDeliveryUserMessage('SMS')).toMatch(/Failed to send text.*SMS/i);
  });

  it('throws AppError 502 and hides provider detail from the message', () => {
    expect(() =>
      throwNotificationDeliveryError(
        'email',
        new Error('553 Sender address rejected: not owned by user'),
      ),
    ).toThrow(AppError);

    try {
      throwNotificationDeliveryError('email', new Error('553 Sender address rejected'));
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(502);
      expect((e as AppError).isOperational).toBe(true);
      expect((e as AppError).message).not.toMatch(/553/);
      expect((e as AppError).message).toMatch(/Failed to send email/i);
    }
  });
});
