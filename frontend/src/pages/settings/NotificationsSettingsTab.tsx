import { useState, useEffect } from 'react';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { NotificationsConfig } from '@/types/notification.types';
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { ChannelToggles } from './notifications/ChannelToggles';
import { SmsProviderSection } from './notifications/SmsProviderSection';
import { EmailProviderSection } from './notifications/EmailProviderSection';
import { MessageTemplatesSection } from './notifications/MessageTemplatesSection';
import { DeeplinkSection } from './notifications/DeeplinkSection';
import { TestNotificationsModal } from './notifications/TestNotificationsModal';
import { useConfigPathUpdater } from './notifications/SecretField';
import { isNotificationConfigValid } from './notifications/notification-settings.validation';

const DEFAULT_CONFIG: NotificationsConfig = {
  enabledChannels: { sms: true, email: false },
  defaultProvider: { sms: 'console', email: 'console' },
  templates: {
    inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}} Your verification code: {{code}}',
    otpSms: 'Your verification code is: {{code}}',
  },
  deeplinkBaseUrl: 'blulok://',
};

export default function NotificationsSettingsTab() {
  const { addToast } = useToast();
  const [config, setConfig] = useState<NotificationsConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testToEmail, setTestToEmail] = useState('');
  const [testToPhone, setTestToPhone] = useState('');

  const updateConfig = useConfigPathUpdater(setConfig);
  const canSave = isNotificationConfigValid(config);

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
    if (!canSave) return;
    setIsSaving(true);
    try {
      const response = await apiService.updateNotificationSettings(config);
      if (response.success) {
        addToast({ type: 'success', title: 'Notification settings updated successfully' });
        // Reload so masked secrets come back from the API
        await loadSettings();
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

  const getCookie = (name: string): string => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  };
  const setCookie = (name: string, value: string, days = 180) => {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  };

  const openTestModal = () => {
    try {
      setTestToEmail(getCookie('blulok_test_to_email') || '');
      setTestToPhone(getCookie('blulok_test_to_phone') || '');
    } catch {
      // ignore cookie errors
    }
    setShowTestModal(true);
  };

  const confirmSendTests = async () => {
    setIsTesting(true);
    try {
      if (testToEmail) setCookie('blulok_test_to_email', testToEmail);
      if (testToPhone) setCookie('blulok_test_to_phone', testToPhone);

      const payload: { toEmail?: string; toPhone?: string; configOverride?: NotificationsConfig } = {};
      if (config.enabledChannels?.email && testToEmail) payload.toEmail = testToEmail;
      if (config.enabledChannels?.sms !== false && testToPhone) payload.toPhone = testToPhone;
      payload.configOverride = config;

      const resp = await apiService.sendTestNotifications(payload);
      const errorDetails = Array.isArray(resp.errors) && resp.errors.length
        ? `Errors: ${resp.errors.map((e: { channel: string; message: string }) => `${e.channel}: ${e.message}`).join('; ')}`
        : '';

      if (resp.success) {
        const details = [
          resp.sent?.length ? `Sent: ${resp.sent.join(', ')}` : undefined,
          resp.toEmail ? `Email: ${resp.toEmail}` : (payload.toEmail ? `Email: ${payload.toEmail}` : undefined),
          resp.toPhone ? `Phone: ${resp.toPhone}` : (payload.toPhone ? `Phone: ${payload.toPhone}` : undefined),
          errorDetails || undefined,
        ].filter(Boolean).join(' | ');
        addToast({ type: 'success', title: 'Test notifications result', message: details });
        setShowTestModal(false);
      } else {
        addToast({ type: 'error', title: 'Failed to send test notifications', message: errorDetails || resp.message });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to send test notifications', message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const resp = await apiService.testNotificationConnection({ configOverride: config });
      if (resp.success) {
        addToast({ type: 'success', title: 'SMTP connection verified', message: resp.message });
      } else {
        addToast({ type: 'error', title: 'SMTP connection failed', message: resp.message });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      addToast({ type: 'error', title: 'SMTP connection failed', message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading notification settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChannelToggles config={config} onChange={updateConfig} />
      <SmsProviderSection config={config} onChange={updateConfig} />
      <EmailProviderSection
        config={config}
        onChange={updateConfig}
        onTestConnection={handleTestConnection}
        isTestingConnection={isTestingConnection}
      />
      <MessageTemplatesSection config={config} onChange={updateConfig} />
      <DeeplinkSection config={config} onChange={updateConfig} />

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Security Considerations</h3>
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>
                SMS and email notifications contain sensitive information. Provider credentials are encrypted at rest
                when <code className="text-xs">SETTINGS_ENCRYPTION_KEY</code> is configured. Rotate credentials regularly.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={openTestModal}
          disabled={isTesting || (!config.enabledChannels?.sms && !config.enabledChannels?.email)}
          className="inline-flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Sending Tests...</>
          ) : (
            <><ShieldCheckIcon className="h-4 w-4 mr-2" /> Send Test Notifications</>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="inline-flex items-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Saving...</>
          ) : (
            <><ShieldCheckIcon className="h-4 w-4 mr-2" /> Save Settings</>
          )}
        </button>
      </div>

      <TestNotificationsModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        config={config}
        testToEmail={testToEmail}
        testToPhone={testToPhone}
        onEmailChange={setTestToEmail}
        onPhoneChange={setTestToPhone}
        onConfirm={confirmSendTests}
        isTesting={isTesting}
      />
    </div>
  );
}
