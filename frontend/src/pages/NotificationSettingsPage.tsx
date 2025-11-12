import { useState, useEffect } from 'react';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { NotificationsConfig } from '@/types/notification.types';
import {
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  LinkIcon
} from '@heroicons/react/24/outline';

export default function NotificationSettingsPage() {
  const { addToast } = useToast();
  const [config, setConfig] = useState<NotificationsConfig>({
    enabledChannels: { sms: true, email: false },
    defaultProvider: { sms: 'console', email: 'console' },
    templates: {
      inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
      otpSms: 'Your verification code is: {{code}}',
    },
    deeplinkBaseUrl: 'blulok://invite',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiService.getNotificationSettings();
      if (response.success) {
        setConfig(response.config);
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      addToast({ type: 'error', title: 'Failed to load notification settings' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await apiService.updateNotificationSettings(config);
      if (response.success) {
        addToast({ type: 'success', title: 'Notification settings updated successfully' });
      } else {
        addToast({ type: 'error', title: 'Failed to update notification settings' });
      }
    } catch (error) {
      console.error('Failed to save notification settings:', error);
      addToast({ type: 'error', title: 'An error occurred while updating settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    try {
      const resp = await apiService.sendTestNotifications();
      if (resp.success) {
        const details = [
          resp.sent?.length ? `sent: ${resp.sent.join(', ')}` : undefined,
          resp.toEmail ? `email: ${resp.toEmail}` : undefined,
          resp.toPhone ? `phone: ${resp.toPhone}` : undefined,
        ].filter(Boolean).join(' | ');
        addToast({ type: 'success', title: 'Test notifications dispatched', message: details });
      } else {
        addToast({ type: 'error', title: 'Failed to send test notifications' });
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to send test notifications', message: e?.message || 'Unknown error' });
    } finally {
      setIsTesting(false);
    }
  };

  const updateConfig = (path: string, value: any) => {
    setConfig((prev: NotificationsConfig) => {
      const newConfig = { ...prev };
      const keys = path.split('.');
      let current = newConfig as any;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      return newConfig;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading notification settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center">
        <Cog6ToothIcon className="h-8 w-8 text-primary-500 mr-3" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">Configure how users receive invitations and verification codes</p>
        </div>
      </div>

      {/* Channel Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Communication Channels</h2>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="sms-enabled"
              checked={config.enabledChannels?.sms !== false}
              onChange={(e) => updateConfig('enabledChannels.sms', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="sms-enabled" className="ml-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
              <DevicePhoneMobileIcon className="h-4 w-4 mr-1 text-primary-500" />
              Enable SMS notifications
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="email-enabled"
              checked={config.enabledChannels?.email === true}
              onChange={(e) => updateConfig('enabledChannels.email', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="email-enabled" className="ml-2 flex items-center text-sm text-gray-700 dark:text-gray-300">
              <EnvelopeIcon className="h-4 w-4 mr-1 text-primary-500" />
              Enable email notifications
            </label>
          </div>
        </div>
      </div>

      {/* Provider Configuration */}
      {config.enabledChannels?.sms && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">SMS Provider Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SMS Provider
              </label>
              <select
                value={config.defaultProvider?.sms || 'console'}
                onChange={(e) => updateConfig('defaultProvider.sms', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="console">Console (Development)</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>

            {config.defaultProvider?.sms === 'twilio' && (
              <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Twilio Account SID
                  </label>
                  <input
                    type="text"
                    value={config.twilio?.accountSid || ''}
                    onChange={(e) => updateConfig('twilio.accountSid', e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Twilio Auth Token
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={config.twilio?.authToken || ''}
                      onChange={(e) => updateConfig('twilio.authToken', e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showApiKey ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    From Phone Number
                  </label>
                  <input
                    type="text"
                    value={config.twilio?.fromNumber || ''}
                    onChange={(e) => updateConfig('twilio.fromNumber', e.target.value)}
                    placeholder="+15551234567"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Must be a Twilio-verified phone number
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Message Templates</h2>

        <div className="space-y-6">
          {config.enabledChannels?.sms && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SMS Invite Template
              </label>
              <textarea
                value={config.templates?.inviteSms || ''}
                onChange={(e) => updateConfig('templates.inviteSms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Welcome to BluLok. Tap to get started: {{deeplink}}"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{deeplink}}'} placeholder for the invitation link
              </p>
            </div>
          )}

          {config.enabledChannels?.sms && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                SMS OTP Template
              </label>
              <textarea
                value={config.templates?.otpSms || ''}
                onChange={(e) => updateConfig('templates.otpSms', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Your verification code is: {{code}}"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{code}}'} placeholder for the 6-digit verification code
              </p>
            </div>
          )}

          {config.enabledChannels?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Invite Subject
              </label>
              <input
                type="text"
                value={config.templates?.inviteEmailSubject || 'Your BluLok Invitation'}
                onChange={(e) => updateConfig('templates.inviteEmailSubject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          {config.enabledChannels?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Invite Template
              </label>
              <textarea
                value={config.templates?.inviteEmail || ''}
                onChange={(e) => updateConfig('templates.inviteEmail', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Welcome to BluLok. Click the link below to get started: {{deeplink}}"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{deeplink}}'} placeholder for the invitation link
              </p>
            </div>
          )}

          {config.enabledChannels?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email OTP Subject
              </label>
              <input
                type="text"
                value={config.templates?.otpEmailSubject || 'Your Verification Code'}
                onChange={(e) => updateConfig('templates.otpEmailSubject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}

          {config.enabledChannels?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email OTP Template
              </label>
              <textarea
                value={config.templates?.otpEmail || ''}
                onChange={(e) => updateConfig('templates.otpEmail', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Your verification code is: {{code}}"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use {'{{code}}'} placeholder for the 6-digit verification code
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Deeplink Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">App Integration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Deeplink Base URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={config.deeplinkBaseUrl || ''}
                onChange={(e) => updateConfig('deeplinkBaseUrl', e.target.value)}
                placeholder="blulok://invite"
                className="w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              URL scheme for mobile app deep linking. Include query parameters for token/phone as needed.
            </p>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Security Considerations
            </h3>
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>
                SMS and email notifications contain sensitive information. Ensure your provider credentials are securely stored
                and regularly rotated. Test notifications thoroughly before enabling in production.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSendTest}
          disabled={isTesting}
          className="inline-flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Sending Tests...
            </>
          ) : (
            <>
              <ShieldCheckIcon className="h-4 w-4 mr-2" />
              Send Test Notifications
            </>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <ShieldCheckIcon className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
