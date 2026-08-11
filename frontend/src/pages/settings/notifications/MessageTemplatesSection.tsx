import type { NotificationsConfig } from '@/types/notification.types';

interface MessageTemplatesSectionProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function MessageTemplatesSection({ config, onChange }: MessageTemplatesSectionProps) {
  const smsOn = config.enabledChannels?.sms !== false;
  const emailOn = config.enabledChannels?.email === true;

  if (!smsOn && !emailOn) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Message Templates</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enable SMS or email above to configure message templates.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Message Templates</h2>
      <div className="space-y-6">
        {smsOn && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS Invite Template</label>
              <textarea
                value={config.templates?.inviteSms || ''}
                onChange={(e) => onChange('templates.inviteSms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{deeplink}}'} for the invitation link and {'{{code}}'} for the 6-digit verification code
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS OTP Template</label>
              <textarea
                value={config.templates?.otpSms || ''}
                onChange={(e) => onChange('templates.otpSms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Your verification code is: {{code}}"
              />
            </div>
          </>
        )}

        {emailOn && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Invite Subject</label>
              <input
                type="text"
                value={config.templates?.inviteEmailSubject || 'Your BluLok Invitation'}
                onChange={(e) => onChange('templates.inviteEmailSubject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Invite Template</label>
              <textarea
                value={config.templates?.inviteEmail || ''}
                onChange={(e) => onChange('templates.inviteEmail', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Welcome to BluLok. Click the link below to get started: {{deeplink}} Your verification code: {{code}}"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email OTP Subject</label>
              <input
                type="text"
                value={config.templates?.otpEmailSubject || 'Your Verification Code'}
                onChange={(e) => onChange('templates.otpEmailSubject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email OTP Template</label>
              <textarea
                value={config.templates?.otpEmail || ''}
                onChange={(e) => onChange('templates.otpEmail', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Your verification code is: {{code}}"
              />
            </div>
          </>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
          <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">Password Reset Templates</h3>
          {smsOn && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMS Password Reset Template</label>
              <textarea
                value={config.templates?.passwordResetSms || ''}
                onChange={(e) => onChange('templates.passwordResetSms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Reset your BluLok password: {{deeplink}}"
              />
            </div>
          )}
          {emailOn && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Password Reset Subject</label>
                <input
                  type="text"
                  value={config.templates?.passwordResetEmailSubject || 'Reset Your BluLok Password'}
                  onChange={(e) => onChange('templates.passwordResetEmailSubject', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Password Reset Template</label>
                <textarea
                  value={config.templates?.passwordResetEmail || ''}
                  onChange={(e) => onChange('templates.passwordResetEmail', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="<p>Click to reset your password: <a href='{{deeplink}}'>{{deeplink}}</a></p>"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
