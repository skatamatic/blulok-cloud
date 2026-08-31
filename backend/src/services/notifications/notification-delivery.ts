import { AppError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import {
  notificationDeliveryUserMessage,
  type NotificationDeliveryChannel,
} from './notification-delivery-error.utils';

export type NotificationDeliveryKind = 'invite' | 'OTP' | 'password reset';

/** How to choose among enabled channels that can both reach the account. */
export type NotificationChannelPreference = 'both' | 'prefer_sms' | 'prefer_email';

export interface NotificationChannelPlan {
  channel: NotificationDeliveryChannel;
  /** Admin toggle for this channel in Settings → Notifications. */
  enabled: boolean;
  recipient?: string | null | undefined;
  send: () => Promise<void>;
}

export interface NotificationDeliveryOutcome {
  delivered: NotificationDeliveryChannel[];
  errors: { channel: NotificationDeliveryChannel; message: string }[];
}

export function normalizeChannelPreference(value: unknown): NotificationChannelPreference {
  if (value === 'prefer_sms' || value === 'prefer_email' || value === 'both') return value;
  return 'both';
}

/**
 * Enabled channels that have a recipient, then apply the admin preference.
 *
 * A disabled channel is never used — even if it is the only way to reach the
 * account. That would ignore Settings → Notifications.
 */
export function selectDeliveryChannels<
  T extends { channel: NotificationDeliveryChannel; enabled: boolean; recipient?: string | null },
>(
  plans: T[],
  preference: NotificationChannelPreference = 'both',
): T[] {
  const reachable = plans.filter((plan) => plan.enabled && Boolean(plan.recipient));
  if (reachable.length <= 1 || preference === 'both') return reachable;

  const preferredChannel: NotificationDeliveryChannel =
    preference === 'prefer_sms' ? 'SMS' : 'email';
  const preferred = reachable.find((plan) => plan.channel === preferredChannel);
  return preferred ? [preferred] : reachable;
}

/**
 * Send on every selected channel independently, so a failing email cannot
 * discard an SMS that already went out (retrying would invalidate its token).
 *
 * Throws when there is no recipient at all, or when every selected channel failed,
 * or when the only contacts sit on disabled channels.
 */
export async function deliverAcrossChannels(
  kind: NotificationDeliveryKind,
  plans: NotificationChannelPlan[],
  preference: NotificationChannelPreference = 'both',
): Promise<NotificationDeliveryOutcome> {
  const targets = selectDeliveryChannels(plans, preference);

  if (targets.length === 0) {
    const hasAnyRecipient = plans.some((plan) => Boolean(plan.recipient));
    throw new AppError(
      hasAnyRecipient
        ? `Cannot send ${kind}: no enabled notification channel can reach this account.`
        : `Cannot send ${kind}: the account has no phone number or email address.`,
      400,
    );
  }

  const delivered: NotificationDeliveryChannel[] = [];
  const errors: { channel: NotificationDeliveryChannel; message: string }[] = [];

  for (const target of targets) {
    try {
      await target.send();
      delivered.push(target.channel);
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      logger.error(`Notifications: ${target.channel} ${kind} delivery failed: ${detail}`);
      errors.push({
        channel: target.channel,
        message: notificationDeliveryUserMessage(target.channel),
      });
    }
  }

  if (delivered.length === 0) {
    throw new AppError(errors[0]?.message ?? `Failed to send ${kind}.`, 502);
  }

  return { delivered, errors };
}

/** Short summary for logs / API warnings, e.g. "SMS" or "SMS, email". */
export function describeDelivery(outcome: NotificationDeliveryOutcome): string {
  return outcome.delivered.join(', ');
}
