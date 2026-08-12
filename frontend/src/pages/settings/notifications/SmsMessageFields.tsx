import type { NotificationsConfig } from '@/types/notification.types';

interface SmsMessageFieldsProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function SmsMessageFields({ config, onChange }: SmsMessageFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Invite
        </label>
        <textarea
          value={config.templates?.inviteSms || ''}
          onChange={(e) => onChange('templates.inviteSms', e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Use {'{{deeplink}}'} for the invitation link and {'{{code}}'} for the 6-digit verification
          code
        </p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          OTP
        </label>
        <textarea
          value={config.templates?.otpSms || ''}
          onChange={(e) => onChange('templates.otpSms', e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Your verification code is: {{code}}"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password reset
        </label>
        <textarea
          value={config.templates?.passwordResetSms || ''}
          onChange={(e) => onChange('templates.passwordResetSms', e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Reset your BluLok password: {{deeplink}}"
        />
      </div>
    </div>
  );
}
