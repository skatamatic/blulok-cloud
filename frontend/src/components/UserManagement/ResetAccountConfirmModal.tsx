import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/Modal/Modal';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ResetAccountConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  userName: string;
}

export function ResetAccountConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  userName,
}: ResetAccountConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={() => !isLoading && onClose()} size="md">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Reset account &amp; re-invite
          </h3>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          This will wipe sign-in credentials for <strong>{userName}</strong> and send a new invite.
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <p className="font-medium text-red-700 dark:text-red-300 mb-1">Will be destroyed</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
              <li>Password and login session state</li>
              <li>All registered app devices and public keys</li>
              <li>Outstanding invites, OTPs, and password-reset tokens</li>
              <li>Stale device keys will be denylisted on locks</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-green-700 dark:text-green-300 mb-1">Will be preserved</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
              <li>Unit assignments and facility associations</li>
              <li>Shared keys and FMS identity mapping</li>
            </ul>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isLoading} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isLoading ? 'Resetting…' : 'Reset & Re-invite'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
