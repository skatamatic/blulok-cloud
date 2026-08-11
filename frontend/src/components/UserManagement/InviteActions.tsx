import { useState } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { ResetAccountConfirmModal } from './ResetAccountConfirmModal';

export interface InviteActionsUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  lastLogin?: string | Date | null;
  isPlaceholder?: boolean;
  /** When set, preferred over lastLogin for choosing Resend vs Reset */
  inviteStatus?: 'never_invited' | 'invite_pending' | 'active' | 'placeholder';
}

interface InviteActionsProps {
  user: InviteActionsUser;
  /** compact = smaller padding/labels for widget panels; default = details page */
  size?: 'default' | 'compact';
  /** Stretch to container width (matches Units Manager Unlock button) */
  fullWidth?: boolean;
  onComplete?: () => void;
  className?: string;
}

export function InviteActions({
  user,
  size = 'default',
  fullWidth = false,
  onComplete,
  className,
}: InviteActionsProps) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showResendModal, setShowResendModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const displayName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.email ||
    user.phoneNumber ||
    'this user';

  const btnBase =
    size === 'compact'
      ? 'inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap'
      : 'inline-flex items-center justify-center px-4 py-2 rounded-lg transition-colors disabled:opacity-50';

  const widthClass = fullWidth ? 'w-full' : '';

  const isPlaceholder =
    user.isPlaceholder === true || user.inviteStatus === 'placeholder';
  const hasLoggedIn =
    user.inviteStatus === 'active' ||
    (user.inviteStatus == null && Boolean(user.lastLogin));

  if (isPlaceholder) {
    return (
      <span className={`text-xs text-gray-500 dark:text-gray-400 ${className || ''}`}>
        {size === 'compact' ? 'Needs contact' : 'Add email/phone to enable invites'}
      </span>
    );
  }

  const handleResend = async () => {
    setBusy(true);
    try {
      const response = await apiService.resendUserInvite(user.id);
      if (response.success) {
        addToast({ type: 'success', title: 'Invite resent successfully' });
        setShowResendModal(false);
        onComplete?.();
      } else {
        addToast({ type: 'error', title: 'Failed to resend invite' });
      }
    } catch (error) {
      console.error('Failed to resend invite:', error);
      addToast({ type: 'error', title: 'An error occurred while resending invite' });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      const response = await apiService.resetUserAccount(user.id);
      if (response.success) {
        addToast({
          type: 'success',
          title: 'Account reset',
          message: response.message || 'Invite sent',
        });
        setShowResetModal(false);
        onComplete?.();
      } else {
        addToast({ type: 'error', title: 'Failed to reset account', message: response.message });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to reset account', message });
    } finally {
      setBusy(false);
    }
  };

  const iconClass = size === 'compact' ? 'h-3.5 w-3.5 mr-1.5' : 'h-4 w-4 mr-2';

  if (!hasLoggedIn) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowResendModal(true);
          }}
          disabled={busy}
          className={`${btnBase} ${widthClass} bg-primary-600 text-white hover:bg-primary-700 ${className || ''}`}
        >
          <PaperAirplaneIcon className={iconClass} />
          {busy ? 'Sending…' : size === 'compact' ? 'Resend invite' : 'Resend Invite'}
        </button>
        <ConfirmModal
          isOpen={showResendModal}
          onClose={() => !busy && setShowResendModal(false)}
          onConfirm={() => void handleResend()}
          title="Resend invite"
          message={`Send a new invite to ${displayName}? This invalidates any previous unused invite.`}
          confirmText={busy ? 'Sending…' : 'Resend invite'}
          variant="info"
          isLoading={busy}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowResetModal(true);
        }}
        disabled={busy}
        className={`${btnBase} ${widthClass} bg-red-600 text-white hover:bg-red-700 ${className || ''}`}
      >
        <ArrowPathIcon className={iconClass} />
        {size === 'compact' ? 'Reset account' : 'Reset Account & Re-invite'}
      </button>
      <ResetAccountConfirmModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleReset}
        isLoading={busy}
        userName={displayName}
      />
    </>
  );
}
