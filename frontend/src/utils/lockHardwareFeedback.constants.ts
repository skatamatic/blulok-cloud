import type { Toast } from '@/types/toast.types';

export type LockHardwareFeedbackToast = Omit<Toast, 'id' | 'timestamp'>;

/**
 * Shared copy for lock / access-control hardware-ack flows (timeouts, success, errors).
 */
export const lockHardwareFeedbackToasts = {
  unlockCommandSent: (): LockHardwareFeedbackToast => ({
    type: 'success',
    title: 'Unlock command sent',
  }),

  deviceUnlockTimeout: (): LockHardwareFeedbackToast => ({
    type: 'warning',
    title: 'No confirmation yet',
    message:
      'The device did not report an unlocked state within 10 seconds. Check the hardware and refresh if needed.',
  }),

  unitUnlockTimeout: (): LockHardwareFeedbackToast => ({
    type: 'warning',
    title: 'No confirmation yet',
    message:
      'The lock did not report open within 10 seconds. Check the unit and refresh if needed.',
  }),

  accessPointOpenTimeout: (): LockHardwareFeedbackToast => ({
    type: 'warning',
    title: 'No confirmation yet',
    message:
      'The access point did not report open within 10 seconds. Check on site or refresh.',
  }),

  couldNotUnlockDevice: (): LockHardwareFeedbackToast => ({
    type: 'error',
    title: 'Could not unlock device',
  }),

  couldNotUnlockUnit: (): LockHardwareFeedbackToast => ({
    type: 'error',
    title: 'Could not unlock unit',
  }),

  failedToUpdateLockStatus: (): LockHardwareFeedbackToast => ({
    type: 'error',
    title: 'Failed to update lock status',
  }),
};
