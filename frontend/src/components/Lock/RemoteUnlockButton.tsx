import React from 'react';
import { motion } from 'framer-motion';
import { LockOpenIcon } from '@heroicons/react/24/outline';
import {
  getRemoteUnlockDisabledReason,
  isLockTransitionPending,
} from '@/utils/unitLock.utils';

export type RemoteUnlockButtonProps = {
  lockStatus: string | undefined;
  isSubmitting?: boolean;
  /** When false, no BluLok device is linked to this unit. */
  hasDevice?: boolean;
  /** When false, remote unlock is not supported on this hardware. */
  remoteSupported?: boolean;
  /** BluLok connectivity — offline/error/maintenance disables unlock with a tooltip. */
  deviceStatus?: string | null;
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

function resolveRemoteUnlockLabel(
  disabledReason: string | null,
  lockStatus: string | undefined,
  hasDevice: boolean,
  deviceStatus: string | null | undefined,
  isSubmitting: boolean,
): string {
  if (isSubmitting || isLockTransitionPending(lockStatus)) return 'Unlocking…';
  if (!hasDevice) return 'No device';

  const deviceKey = (deviceStatus ?? '').toLowerCase().trim();
  if (deviceKey === 'offline') return 'Offline';
  if (deviceKey === 'error') return 'Device error';
  if (deviceKey === 'maintenance') return 'Maintenance';

  if (disabledReason === 'Already unlocked' || lockStatus === 'unlocked') return 'Unlocked';
  if (disabledReason === 'Lock reported an error') return 'Lock error';

  return 'Unlock';
}

/**
 * Remote unlock control — same states and styling as DeviceDetailsPage / UnitDetailsPage.
 */
export const RemoteUnlockButton: React.FC<RemoteUnlockButtonProps> = ({
  lockStatus,
  isSubmitting = false,
  hasDevice = true,
  remoteSupported = true,
  deviceStatus = null,
  fullWidth = false,
  size = 'md',
  className = '',
  stopPropagation = false,
  onUnlock,
}) => {
  const transitionPending = isLockTransitionPending(lockStatus);
  const busy = isSubmitting || transitionPending;

  const disabledReason = getRemoteUnlockDisabledReason({
    hasDevice,
    remoteSupported,
    lockStatus,
    deviceStatus,
    isSubmitting,
  });
  const canUnlock = disabledReason === null;
  const disabled = !canUnlock;

  const title =
    disabledReason ??
    (canUnlock ? 'Send remote unlock command' : 'Unlock unavailable');

  const label = resolveRemoteUnlockLabel(
    disabledReason,
    lockStatus,
    hasDevice,
    deviceStatus,
    isSubmitting,
  );

  const toneClass = busy
    ? 'btn-primary animate-pulse'
    : canUnlock
      ? 'btn-primary'
      : 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-transparent';

  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.98 }}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      disabled={disabled}
      title={title}
      aria-label={busy ? 'Unlocking' : canUnlock ? 'Unlock' : title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (disabled) return;
        onUnlock();
      }}
      className={`no-drag inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ${sizeClasses[size]} ${toneClass} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {canUnlock && !busy && <LockOpenIcon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {label}
    </motion.button>
  );
};
