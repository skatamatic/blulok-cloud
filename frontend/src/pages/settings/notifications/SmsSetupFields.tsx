import type { NotificationsConfig } from '@/types/notification.types';
import { SecretField } from './SecretField';

interface SmsSetupFieldsProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function SmsSetupFields({ config, onChange }: SmsSetupFieldsProps) {
  const provider = config.defaultProvider?.sms || 'console';
  const twilioIncomplete =
    provider === 'twilio' &&
    (!config.twilio?.accountSid || !config.twilio?.authToken || !config.twilio?.fromNumber);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          SMS provider
        </label>
        <select
          value={provider}
          onChange={(e) => onChange('defaultProvider.sms', e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="console">Console (Development)</option>
          <option value="twilio">Twilio</option>
        </select>
      </div>

      {provider === 'twilio' ? (
        <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Twilio Account SID
            </label>
            <input
              type="text"
              value={config.twilio?.accountSid || ''}
              onChange={(e) => onChange('twilio.accountSid', e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              From phone number
            </label>
            <input
              type="text"
              value={config.twilio?.fromNumber || ''}
              onChange={(e) => onChange('twilio.fromNumber', e.target.value)}
              placeholder="+15551234567"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Must be a Twilio-verified phone number
            </p>
          </div>
          {twilioIncomplete ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Complete Account SID, Auth Token, and From Number before saving.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
