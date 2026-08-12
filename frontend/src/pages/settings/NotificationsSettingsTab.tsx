import { useState, useEffect } from 'react';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { NotificationsConfig } from '@/types/notification.types';
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { ChannelHub, type ChannelHubPane } from './notifications/ChannelHub';
import { SmsSetupFields } from './notifications/SmsSetupFields';
import { EmailSetupFields } from './notifications/EmailSetupFields';
import { SmsMessageFields } from './notifications/SmsMessageFields';
import { EmailMessageFields } from './notifications/EmailMessageFields';
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
  const [smsPane, setSmsPane] = useState<ChannelHubPane>('setup');
  const [emailPane, setEmailPane] = useState<ChannelHubPane>('setup');

  const updateConfig = useConfigPathUpdater(setConfig);
  const canSave = isNotificationConfigValid(config);
  const smsEnabled = config.enabledChannels?.sms !== false;
  const emailEnabled = config.enabledChannels?.email === true;

  useEffect(() => {
    void loadSettings();
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
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading notification settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery channels</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enable a channel, then use Setup for the provider and Messages for invite / OTP / reset
          copy.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <ChannelHub
          title="SMS"
          enabled={smsEnabled}
          onEnabledChange={(on) => updateConfig('enabledChannels.sms', on)}
          pane={smsPane}
          onPaneChange={setSmsPane}
          offHint="Channel off — enable to configure Twilio (or console) delivery and SMS copy."
          setup={<SmsSetupFields config={config} onChange={updateConfig} />}
          messages={<SmsMessageFields config={config} onChange={updateConfig} />}
        />
        <ChannelHub
          title="Email"
          enabled={emailEnabled}
          onEnabledChange={(on) => updateConfig('enabledChannels.email', on)}
          pane={emailPane}
          onPaneChange={setEmailPane}
          offHint="Channel off — enable to configure SMTP (or console) delivery and email copy."
          setup={
            <EmailSetupFields
              config={config}
              onChange={updateConfig}
              onTestConnection={() => void handleTestConnection()}
              isTestingConnection={isTestingConnection}
            />
          }
          messages={<EmailMessageFields config={config} onChange={updateConfig} />}
        />
      </div>

      <DeeplinkSection config={config} onChange={updateConfig} />

      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Invite codes and reset links are sensitive. Provider credentials encrypt at rest when{' '}
          <code className="text-xs">SETTINGS_ENCRYPTION_KEY</code> is set — rotate them regularly.
        </p>
      </div>

      <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-gray-200 bg-white/95 py-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={openTestModal}
          disabled={isTesting || (!smsEnabled && !emailEnabled)}
          className="btn-secondary inline-flex items-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isTesting ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              Sending tests…
            </>
          ) : (
            <>
              <ShieldCheckIcon className="mr-2 h-4 w-4" />
              Send test notifications
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || !canSave}
          className="btn-primary inline-flex items-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              Saving…
            </>
          ) : (
            <>
              <ShieldCheckIcon className="mr-2 h-4 w-4" />
              Save settings
            </>
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
