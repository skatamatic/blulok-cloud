import type { NotificationsConfig } from '@/types/notification.types';
import { SecretField } from './SecretField';

interface EmailSetupFieldsProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
  onTestConnection: () => void;
  isTestingConnection: boolean;
}

export function EmailSetupFields({
  config,
  onChange,
  onTestConnection,
  isTestingConnection,
}: EmailSetupFieldsProps) {
  const provider = config.defaultProvider?.email || 'console';
  const smtp = config.smtp;
  const smtpIncomplete =
    provider === 'smtp' &&
    (!smtp?.host || !smtp?.fromEmail || (smtp.authMode !== 'none' && !smtp?.username));

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Email provider
        </label>
        <select
          value={provider}
          onChange={(e) => onChange('defaultProvider.email', e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="console">Console (Development)</option>
          <option value="smtp">SMTP</option>
        </select>
      </div>

      {provider === 'smtp' ? (
        <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                SMTP host
              </label>
              <input
                type="text"
                value={smtp?.host || ''}
                onChange={(e) => onChange('smtp.host', e.target.value)}
                placeholder="smtp.example.com"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Port
              </label>
              <input
                type="number"
                value={smtp?.port ?? 587}
                onChange={(e) => onChange('smtp.port', parseInt(e.target.value, 10) || 587)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Encryption
              </label>
              <select
                value={smtp?.encryption || 'starttls'}
                onChange={(e) => onChange('smtp.encryption', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="none">None</option>
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS (implicit)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Auth mode
              </label>
              <select
                value={smtp?.authMode || 'plain'}
                onChange={(e) => onChange('smtp.authMode', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="none">None</option>
                <option value="plain">PLAIN</option>
                <option value="login">LOGIN</option>
              </select>
            </div>
          </div>

          {(smtp?.authMode || 'plain') !== 'none' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Username
                </label>
                <input
                  type="text"
                  value={smtp?.username || ''}
                  onChange={(e) => onChange('smtp.username', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  autoComplete="off"
                />
              </div>
              <SecretField
                id="smtp-password"
                label="Password"
                value={smtp?.password || ''}
                onChange={(v) => onChange('smtp.password', v)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              From email
            </label>
            <input
              type="email"
              value={smtp?.fromEmail || ''}
              onChange={(e) => onChange('smtp.fromEmail', e.target.value)}
              placeholder="noreply@example.com"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Must be an address your SMTP login is allowed to send as (often the same as
              Username). Providers reject mismatched From addresses with 553.
            </p>
          </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                From name
              </label>
              <input
                type="text"
                value={smtp?.fromName || ''}
                onChange={(e) => onChange('smtp.fromName', e.target.value)}
                placeholder="BluLok"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reply-To (optional)
            </label>
            <input
              type="email"
              value={smtp?.replyTo || ''}
              onChange={(e) => onChange('smtp.replyTo', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="smtp-reject-unauthorized"
              checked={smtp?.rejectUnauthorized !== false}
              onChange={(e) => onChange('smtp.rejectUnauthorized', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
            />
            <label
              htmlFor="smtp-reject-unauthorized"
              className="ml-2 text-sm text-gray-700 dark:text-gray-300"
            >
              Verify TLS certificates (recommended)
            </label>
          </div>

          {smtpIncomplete ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Host and From Email are required
              {smtp?.authMode !== 'none' ? ', plus Username when auth is enabled' : ''}.
            </p>
          ) : null}

          <button
            type="button"
            onClick={onTestConnection}
            disabled={isTestingConnection || smtpIncomplete}
            className="btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTestingConnection ? 'Testing…' : 'Test SMTP connection'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Connection probe only — does not send a message. Use <span className="font-medium">Send test
            notifications</span> below to deliver TEST invite/OTP email and SMS.
          </p>
        </div>
      ) : null}
    </div>
  );
}
