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
  return (
    <Modal isOpen={isOpen} onClose={() => !isTesting && onClose()} size="md">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send Test Notifications</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Specify recipient addresses to receive test messages.
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {config.enabledChannels?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To Email</label>
              <input
                type="email"
                value={testToEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}
          {config.enabledChannels?.sms !== false && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To Phone (E.164)</label>
              <input
                type="tel"
                value={testToPhone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+15551234567"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
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
          disabled={isTesting}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isTesting ? 'Sending...' : 'Send Tests'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
