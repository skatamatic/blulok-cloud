import type { NotificationsConfig } from '@/types/notification.types';

interface EmailMessageFieldsProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function EmailMessageFields({ config, onChange }: EmailMessageFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Invite subject
        </label>
        <input
          type="text"
          value={config.templates?.inviteEmailSubject || 'Your BluLok Invitation'}
          onChange={(e) => onChange('templates.inviteEmailSubject', e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Invite body
        </label>
        <textarea
          value={config.templates?.inviteEmail || ''}
          onChange={(e) => onChange('templates.inviteEmail', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Welcome to BluLok. Click the link below to get started: {{deeplink}} Your verification code: {{code}}"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          OTP subject
        </label>
        <input
          type="text"
          value={config.templates?.otpEmailSubject || 'Your Verification Code'}
          onChange={(e) => onChange('templates.otpEmailSubject', e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          OTP body
        </label>
        <textarea
          value={config.templates?.otpEmail || ''}
          onChange={(e) => onChange('templates.otpEmail', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Your verification code is: {{code}}"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password reset subject
        </label>
        <input
          type="text"
          value={config.templates?.passwordResetEmailSubject || 'Reset Your BluLok Password'}
          onChange={(e) => onChange('templates.passwordResetEmailSubject', e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password reset body
        </label>
        <textarea
          value={config.templates?.passwordResetEmail || ''}
          onChange={(e) => onChange('templates.passwordResetEmail', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="<p>Click to reset your password: <a href='{{deeplink}}'>{{deeplink}}</a></p>"
        />
      </div>
    </div>
  );
}
