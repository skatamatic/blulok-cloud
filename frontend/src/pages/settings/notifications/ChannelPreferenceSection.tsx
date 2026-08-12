import { SegmentedTabs } from '@/components/Common/SegmentedTabs';
import type {
  NotificationChannelPreference,
  NotificationsConfig,
} from '@/types/notification.types';

const PREFERENCE_TABS = [
  { key: 'prefer_sms', label: 'Prefer SMS' },
  { key: 'prefer_email', label: 'Prefer email' },
  { key: 'both', label: 'Always send both' },
] as const;

const HINTS: Record<NotificationChannelPreference, string> = {
  prefer_sms: 'SMS when the account has a phone number. Email only if there is no phone.',
  prefer_email: 'Email when the account has an address. SMS only if there is no email.',
  both: 'Send on every enabled channel that can reach the account.',
};

interface ChannelPreferenceSectionProps {
  config: NotificationsConfig;
  visible: boolean;
  onChange: (path: string, value: unknown) => void;
}

/**
 * Shown only when both SMS and email are enabled. Disabled channels are never
 * used as a fallback, so this is the only place dual-channel behavior is chosen.
 */
export function ChannelPreferenceSection({
  config,
  visible,
  onChange,
}: ChannelPreferenceSectionProps) {
  if (!visible) return null;

  const preference: NotificationChannelPreference =
    config.channelPreference === 'prefer_sms' || config.channelPreference === 'prefer_email'
      ? config.channelPreference
      : 'both';

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        When both channels can reach someone
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Applies to invites, OTP, and password resets. A channel that is switched off is never used.
      </p>
      <div className="mt-3">
        <SegmentedTabs
          size="sm"
          ariaLabel="Channel preference"
          tabs={[...PREFERENCE_TABS]}
          activeTab={preference}
          onChange={(key) => onChange('channelPreference', key)}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{HINTS[preference]}</p>
    </section>
  );
}
