import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/Modal/Modal';
import type { NotificationsConfig } from '@/types/notification.types';

interface TestNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: NotificationsConfig;
  testToEmail: string;
  testToPhone: string;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onConfirm: () => void;
  isTesting: boolean;
}

export function TestNotificationsModal({
  isOpen,
  onClose,
  config,
  testToEmail,
  testToPhone,
  onEmailChange,
  onPhoneChange,
  onConfirm,
  isTesting,
}: TestNotificationsModalProps) {
  const emailOn = config.enabledChannels?.email === true;
  const smsOn = config.enabledChannels?.sms !== false;
  const smsProvider = config.defaultProvider?.sms || 'console';
  const emailMissing = emailOn && !testToEmail.trim();
  const phoneMissing = smsOn && !testToPhone.trim();
  const canSend = !emailMissing && !phoneMissing;

  return (
    <Modal isOpen={isOpen} onClose={() => !isTesting && onClose()} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send Test Notifications</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Sends a TEST invite and TEST OTP on each enabled channel. Use a real phone number in E.164
          form (e.g. +15551234567) to verify SMS delivery.
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {emailOn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                To Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={testToEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}
          {smsOn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                To Phone (E.164) <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={testToPhone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+15551234567"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {smsProvider === 'console' && (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                  SMS provider is Console — test texts are logged on the server only, not delivered to
                  a handset. Switch to Twilio and Save settings to receive real SMS.
                </p>
              )}
            </div>
          )}
          {(emailMissing || phoneMissing) && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {emailMissing && phoneMissing
                ? 'Enter both an email and a phone number to test each enabled channel.'
                : emailMissing
                  ? 'Enter an email address to test the email channel.'
                  : 'Enter a phone number to test the SMS channel.'}
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isTesting} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isTesting || !canSend}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isTesting ? 'Sending...' : 'Send Tests'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
