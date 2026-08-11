import type { NotificationsConfig } from '@/types/notification.types';
import { SecretField } from './SecretField';

interface SmsProviderSectionProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function SmsProviderSection({ config, onChange }: SmsProviderSectionProps) {
  if (!config.enabledChannels?.sms) return null;

  const provider = config.defaultProvider?.sms || 'console';
  const twilioIncomplete =
    provider === 'twilio' &&
    (!config.twilio?.accountSid || !config.twilio?.authToken || !config.twilio?.fromNumber);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">SMS Provider Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS Provider</label>
          <select
            value={provider}
            onChange={(e) => onChange('defaultProvider.sms', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="console">Console (Development)</option>
            <option value="twilio">Twilio</option>
          </select>
        </div>
        {provider === 'twilio' && (
          <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Twilio Account SID</label>
              <input
                type="text"
                value={config.twilio?.accountSid || ''}
                onChange={(e) => onChange('twilio.accountSid', e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <SecretField
              id="twilio-auth-token"
              label="Twilio Auth Token"
              value={config.twilio?.authToken || ''}
              onChange={(v) => onChange('twilio.authToken', v)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Phone Number</label>
              <input
                type="text"
                value={config.twilio?.fromNumber || ''}
                onChange={(e) => onChange('twilio.fromNumber', e.target.value)}
                placeholder="+15551234567"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Must be a Twilio-verified phone number</p>
            </div>
            {twilioIncomplete && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Complete Account SID, Auth Token, and From Number before saving.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
