import type { NotificationsConfig } from '@/types/notification.types';
import { SecretField } from './SecretField';

interface EmailProviderSectionProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
  onTestConnection: () => void;
  isTestingConnection: boolean;
}

export function EmailProviderSection({
  config,
  onChange,
  onTestConnection,
  isTestingConnection,
}: EmailProviderSectionProps) {
  if (!config.enabledChannels?.email) return null;

  const provider = config.defaultProvider?.email || 'console';
  const smtp = config.smtp;
  const smtpIncomplete =
    provider === 'smtp' &&
    (!smtp?.host || !smtp?.fromEmail || (smtp.authMode !== 'none' && !smtp?.username));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Email Provider Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Provider</label>
          <select
            value={provider}
            onChange={(e) => onChange('defaultProvider.email', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="console">Console (Development)</option>
            <option value="smtp">SMTP</option>
          </select>
        </div>

        {provider === 'smtp' && (
          <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">SMTP Host</label>
                <input
                  type="text"
                  value={smtp?.host || ''}
                  onChange={(e) => onChange('smtp.host', e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Port</label>
                <input
                  type="number"
                  value={smtp?.port ?? 587}
                  onChange={(e) => onChange('smtp.port', parseInt(e.target.value, 10) || 587)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Encryption</label>
                <select
                  value={smtp?.encryption || 'starttls'}
                  onChange={(e) => onChange('smtp.encryption', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="none">None</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="tls">TLS (implicit)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Auth Mode</label>
                <select
                  value={smtp?.authMode || 'plain'}
                  onChange={(e) => onChange('smtp.authMode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="none">None</option>
                  <option value="plain">PLAIN</option>
                  <option value="login">LOGIN</option>
                </select>
              </div>
            </div>

            {(smtp?.authMode || 'plain') !== 'none' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Username</label>
                  <input
                    type="text"
                    value={smtp?.username || ''}
                    onChange={(e) => onChange('smtp.username', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Email</label>
                <input
                  type="email"
                  value={smtp?.fromEmail || ''}
                  onChange={(e) => onChange('smtp.fromEmail', e.target.value)}
                  placeholder="noreply@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Name</label>
                <input
                  type="text"
                  value={smtp?.fromName || ''}
                  onChange={(e) => onChange('smtp.fromName', e.target.value)}
                  placeholder="BluLok"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reply-To (optional)</label>
              <input
                type="email"
                value={smtp?.replyTo || ''}
                onChange={(e) => onChange('smtp.replyTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="smtp-reject-unauthorized"
                checked={smtp?.rejectUnauthorized !== false}
                onChange={(e) => onChange('smtp.rejectUnauthorized', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <label htmlFor="smtp-reject-unauthorized" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Verify TLS certificates (recommended)
              </label>
            </div>

            {smtpIncomplete && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Host and From Email are required{smtp?.authMode !== 'none' ? ', plus Username when auth is enabled' : ''}.
              </p>
            )}

            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTestingConnection || smtpIncomplete}
              className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isTestingConnection ? 'Testing…' : 'Test SMTP Connection'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
