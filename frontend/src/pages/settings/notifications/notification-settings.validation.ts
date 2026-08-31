import { useMemo } from 'react';
import type { NotificationsConfig } from '@/types/notification.types';
import { SECRET_MASK } from '@/types/notification.types';

/**
 * Returns true when the current config is valid enough to save.
 */
export function isNotificationConfigValid(config: NotificationsConfig): boolean {
  if (config.enabledChannels?.sms !== false && config.defaultProvider?.sms === 'twilio') {
    const tw = config.twilio;
    if (!tw?.accountSid?.trim() || !tw?.fromNumber?.trim()) return false;
    // authToken may be the mask (already stored) or a new value
    if (!tw.authToken?.trim()) return false;
  }

  if (config.enabledChannels?.email === true && config.defaultProvider?.email === 'smtp') {
    const smtp = config.smtp;
    if (!smtp?.host?.trim() || !smtp?.fromEmail?.trim()) return false;
    if ((smtp.authMode || 'plain') !== 'none' && !smtp.username?.trim()) return false;
  }

  return true;
}

export function useNotificationConfigValidity(config: NotificationsConfig): boolean {
  return useMemo(() => isNotificationConfigValid(config), [config]);
}

export { SECRET_MASK };
