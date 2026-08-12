import { AppError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import {
  notificationDeliveryUserMessage,
  type NotificationDeliveryChannel,
} from './notification-delivery-error.utils';

export type NotificationDeliveryKind = 'invite' | 'OTP' | 'password reset';

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
  /** True when the only reachable channel was one the admin had disabled. */
  usedDisabledChannelFallback: boolean;
}

/**
 * Channels that have a recipient, preferring the ones the admin enabled.
 *
 * A contactable account must never be skipped just because its only channel is
 * toggled off — that produced invites and password resets that reported success
 * while delivering nothing.
 */
export function selectDeliveryChannels<T extends { enabled: boolean; recipient?: string | null }>(
  plans: T[],
): { targets: T[]; usedDisabledChannelFallback: boolean } {
  const contactable = plans.filter((plan) => Boolean(plan.recipient));
  const enabled = contactable.filter((plan) => plan.enabled);
  if (enabled.length > 0) {
    return { targets: enabled, usedDisabledChannelFallback: false };
  }
  return { targets: contactable, usedDisabledChannelFallback: contactable.length > 0 };
}

/**
 * Send on every selected channel independently, so a failing email cannot
 * discard an SMS that already went out (retrying would invalidate its token).
 *
 * Throws when there is no recipient at all, or when every channel failed.
 */
export async function deliverAcrossChannels(
  kind: NotificationDeliveryKind,
  plans: NotificationChannelPlan[],
): Promise<NotificationDeliveryOutcome> {
  const { targets, usedDisabledChannelFallback } = selectDeliveryChannels(plans);

  if (targets.length === 0) {
    throw new AppError(
      `Cannot send ${kind}: the account has no phone number or email address.`,
      400,
    );
  }

  if (usedDisabledChannelFallback) {
    logger.warn(
      `Notifications: no enabled channel can reach this ${kind} recipient; ` +
        `falling back to ${targets.map((t) => t.channel).join(', ')}`,
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
    // targets is non-empty and every target either delivered or recorded an error.
    throw new AppError(errors[0]?.message ?? `Failed to send ${kind}.`, 502);
  }

  return { delivered, errors, usedDisabledChannelFallback };
}

/** Short summary for logs / API warnings, e.g. "SMS" or "SMS, email". */
export function describeDelivery(outcome: NotificationDeliveryOutcome): string {
  return outcome.delivered.join(', ');
}
