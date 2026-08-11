import { useState } from 'react';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { ResetAccountConfirmModal } from './ResetAccountConfirmModal';

export interface InviteActionsUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  lastLogin?: string | Date | null;
  isPlaceholder?: boolean;
}

interface InviteActionsProps {
  user: InviteActionsUser;
  /** compact = icon+label button for widgets; default = larger button for details page */
  size?: 'default' | 'compact';
  onComplete?: () => void;
  className?: string;
}

export function InviteActions({ user, size = 'default', onComplete, className }: InviteActionsProps) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const displayName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.email ||
    user.phoneNumber ||
    'this user';

  const btnBase =
    size === 'compact'
      ? 'inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50'
      : 'inline-flex items-center px-4 py-2 rounded-lg transition-colors disabled:opacity-50';

  if (user.isPlaceholder) {
    return (
      <span className={`text-xs text-gray-500 dark:text-gray-400 ${className || ''}`}>
        Add email/phone to enable invites
      </span>
    );
  }

  const handleResend = async () => {
    setBusy(true);
    try {
      const response = await apiService.resendUserInvite(user.id);
      if (response.success) {
        addToast({ type: 'success', title: 'Invite resent successfully' });
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

  if (!user.lastLogin) {
    return (
      <button
        type="button"
        onClick={handleResend}
        disabled={busy}
        className={`${btnBase} bg-primary-600 text-white hover:bg-primary-700 ${className || ''}`}
      >
        <PaperAirplaneIcon className={size === 'compact' ? 'h-3.5 w-3.5 mr-1' : 'h-4 w-4 mr-2'} />
        {busy ? 'Sending…' : 'Resend Invite'}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowResetModal(true)}
        disabled={busy}
        className={`${btnBase} bg-red-600 text-white hover:bg-red-700 ${className || ''}`}
      >
        <ArrowPathIcon className={size === 'compact' ? 'h-3.5 w-3.5 mr-1' : 'h-4 w-4 mr-2'} />
        Reset Account &amp; Re-invite
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
