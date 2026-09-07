import { AppError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';

export type NotificationDeliveryChannel = 'SMS' | 'email';

/** User-facing copy for failed outbound invite/OTP/reset delivery. */
export function notificationDeliveryUserMessage(channel: NotificationDeliveryChannel): string {
  if (channel === 'email') {
    return 'Failed to send email. Check your SMTP settings under Settings → Notifications.';
  }
  return 'Failed to send text. Check your SMS settings under Settings → Notifications.';
}

/**
 * Log provider detail server-side and throw an operational error with a calm UI message.
 * Avoids leaking raw SMTP/Twilio text to clients and skips critical backend_error fan-out.
 */
export function throwNotificationDeliveryError(
  channel: NotificationDeliveryChannel,
  cause: unknown,
): never {
  const detail = cause instanceof Error ? cause.message : String(cause);
  logger.error(`Notifications: ${channel} delivery failed: ${detail}`);
  throw new AppError(notificationDeliveryUserMessage(channel), 502);
}
