import { useState, useEffect } from 'react';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import {
  TENANT_UNLOCK_OVERRIDE_NOTES_MAX_LENGTH,
  TENANT_UNLOCK_OVERRIDE_REASONS,
  type TenantUnlockOverridePayload,
  type TenantUnlockOverrideReasonCode,
} from '@/constants/tenantUnlockOverride.constants';

type TenantUnlockOverrideDialogProps = {
  isOpen: boolean;
  isLoading?: boolean;
  unitLabel?: string;
  /** Re-hydrate reason/notes after a failed unlock attempt. */
  initialDraft?: TenantUnlockOverridePayload;
  onConfirm: (payload: TenantUnlockOverridePayload) => void;
  onCancel: () => void;
};

/**
 * Warning + reason capture before remote-unlocking a unit that has a tenant.
 * Reuses ConfirmDialog chrome (portal, blur, danger confirm).
 */
export function TenantUnlockOverrideDialog({
  isOpen,
  isLoading = false,
  unitLabel,
  initialDraft,
  onConfirm,
  onCancel,
}: TenantUnlockOverrideDialogProps) {
  const [reason, setReason] = useState<TenantUnlockOverrideReasonCode | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setReason(initialDraft?.reason ?? '');
    setNotes(initialDraft?.notes ?? '');
  }, [isOpen, initialDraft?.reason, initialDraft?.notes]);

  const canConfirm = reason !== '' && !isLoading;
  const unitText = unitLabel ? `Unit ${unitLabel}` : 'This unit';

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="Tenant unit — confirm remote unlock"
      message={`${unitText} has a tenant. Remote unlock will open their storage. Choose a reason to continue, or cancel.`}
      confirmLabel="Unlock anyway"
      cancelLabel="Cancel"
      confirmTone="danger"
      isLoading={isLoading}
      confirmDisabled={!canConfirm}
      onCancel={onCancel}
      onConfirm={() => {
        if (!reason) return;
        const trimmed = notes.trim();
        onConfirm({
          reason,
          ...(trimmed ? { notes: trimmed } : {}),
        });
      }}
      footerExtra={
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Reason <span className="text-red-500">*</span>
            </legend>
            {TENANT_UNLOCK_OVERRIDE_REASONS.map((option) => (
              <label
                key={option.code}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  reason === option.code
                    ? 'border-primary-500 bg-primary-50/80 dark:border-primary-400 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="tenant-unlock-reason"
                  className="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={reason === option.code}
                  disabled={isLoading}
                  onChange={() => setReason(option.code)}
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">{option.label}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <label
              htmlFor="tenant-unlock-notes"
              className="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Notes <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <textarea
              id="tenant-unlock-notes"
              rows={3}
              maxLength={TENANT_UNLOCK_OVERRIDE_NOTES_MAX_LENGTH}
              value={notes}
              disabled={isLoading}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context for access history…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {notes.length}/{TENANT_UNLOCK_OVERRIDE_NOTES_MAX_LENGTH}
            </p>
          </div>

          {!canConfirm && reason === '' && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Select a reason to enable unlock.
            </p>
          )}
        </div>
      }
    />
  );
}
