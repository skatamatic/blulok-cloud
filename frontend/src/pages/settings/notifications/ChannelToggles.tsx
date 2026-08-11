import { DevicePhoneMobileIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import type { NotificationsConfig } from '@/types/notification.types';

interface ChannelTogglesProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function ChannelToggles({ config, onChange }: ChannelTogglesProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Communication Channels</h2>
      <div className="space-y-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="sms-enabled"
            checked={config.enabledChannels?.sms !== false}
            onChange={(e) => onChange('enabledChannels.sms', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label htmlFor="sms-enabled" className="ml-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
            <DevicePhoneMobileIcon className="h-4 w-4 mr-1 text-primary-500" /> Enable SMS notifications
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="email-enabled"
            checked={config.enabledChannels?.email === true}
            onChange={(e) => onChange('enabledChannels.email', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label htmlFor="email-enabled" className="ml-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
            <EnvelopeIcon className="h-4 w-4 mr-1 text-primary-500" /> Enable email notifications
          </label>
        </div>
      </div>
    </div>
  );
}
