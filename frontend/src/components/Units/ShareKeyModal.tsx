import { Modal } from '@/components/Modal/Modal';
import { ShareKeyInviteForm } from '@/components/Units/ShareKeyInviteForm';

interface ShareKeyModalProps {
  isOpen: boolean;
  unitId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShareKeyModal({ isOpen, unitId, onClose, onSuccess }: ShareKeyModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Share Key Access</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Invite a user by phone to access this unit.
        </p>
      </div>
      <div className="px-6 py-6">
        {isOpen && (
          <ShareKeyInviteForm
            key={unitId}
            unitId={unitId}
            onSuccess={onSuccess}
            onCancel={onClose}
            submitLabel="Send Invite"
          />
        )}
      </div>
    </Modal>
  );
}
