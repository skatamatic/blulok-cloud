import React from 'react';
import { motion } from 'framer-motion';
import { LockOpenIcon } from '@heroicons/react/24/outline';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';

export type RemoteUnlockButtonProps = {
  lockStatus: string | undefined;
  isSubmitting?: boolean;
  /** When false, no BluLok device is linked to this unit. */
  hasDevice?: boolean;
  /** When false, remote unlock is not supported on this hardware. */
  remoteSupported?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  stopPropagation?: boolean;
  onUnlock: () => void;
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const;

/**
 * Remote unlock control — same states and styling as DeviceDetailsPage / UnitDetailsPage.
 */
export const RemoteUnlockButton: React.FC<RemoteUnlockButtonProps> = ({
  lockStatus,
  isSubmitting = false,
  hasDevice = true,
  remoteSupported = true,
  fullWidth = false,
  size = 'md',
  className = '',
  stopPropagation = false,
  onUnlock,
}) => {
  const transitionPending = isLockTransitionPending(lockStatus);
  const canUnlock = hasDevice && remoteSupported && canRequestRemoteUnlock(lockStatus);
  const busy = isSubmitting || transitionPending;

  const title = !hasDevice
    ? 'No BluLok device linked'
    : !remoteSupported
      ? 'Remote unlock not supported on this lock'
    : busy
      ? 'Unlock in progress'
      : canUnlock
        ? 'Send remote unlock command'
        : lockStatus === 'unlocked'
          ? 'Already unlocked'
          : 'Unlock unavailable';

  const label = !hasDevice
    ? 'No device'
    : busy
      ? 'Unlocking…'
      : canUnlock
        ? 'Unlock'
        : lockStatus === 'unlocked'
          ? 'Unlocked'
          : 'Unlock';

  const disabled = !hasDevice || !remoteSupported || busy || !canUnlock;

  const toneClass = busy
    ? 'bg-[#147FD4] text-white animate-pulse'
    : canUnlock
      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
      : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500';

  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.98 }}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      disabled={disabled}
      title={title}
      aria-label={busy ? 'Unlocking' : canUnlock ? 'Unlock' : label}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (disabled) return;
        onUnlock();
      }}
      className={`no-drag inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizeClasses[size]} ${toneClass} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {canUnlock && !busy && <LockOpenIcon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {label}
    </motion.button>
  );
};
