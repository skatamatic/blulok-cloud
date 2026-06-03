import React, { useEffect, useState } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import {
  DEFAULT_LOCK_COMMAND_TIMEOUT_SEC,
  MAX_LOCK_COMMAND_TIMEOUT_SEC,
  MIN_LOCK_COMMAND_TIMEOUT_SEC,
} from '@/constants/lock-command.constants';
import { normalizeLockCommandTimeoutSec } from '@/utils/facilityLockTimeout.utils';
import type { Facility } from '@/types/facility.types';

type FacilityLockTimeoutSettingProps = {
  facility: Facility;
  canEdit: boolean;
  onUpdated: (facility: Facility) => void;
};

export function FacilityLockTimeoutSetting({
  facility,
  canEdit,
  onUpdated,
}: FacilityLockTimeoutSettingProps) {
  const { addToast } = useToast();
  const [draftSec, setDraftSec] = useState(
    normalizeLockCommandTimeoutSec(facility.lock_command_timeout_sec),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftSec(normalizeLockCommandTimeoutSec(facility.lock_command_timeout_sec));
  }, [facility.id, facility.lock_command_timeout_sec]);

  const savedSec = normalizeLockCommandTimeoutSec(facility.lock_command_timeout_sec);
  const dirty = draftSec !== savedSec;

  const handleSave = async () => {
    if (!canEdit || !dirty) return;
    setSaving(true);
    try {
      const response = await apiService.updateFacility(facility.id, {
        lock_command_timeout_sec: draftSec,
      });
      if (response?.success && response.facility) {
        onUpdated(response.facility as Facility);
        addToast({
          type: 'success',
          title: 'Lock timeout updated',
          message: `Remote lock commands will wait ${draftSec} seconds for confirmation.`,
        });
      } else {
        throw new Error(response?.message || 'Failed to update facility');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update lock timeout';
      addToast({ type: 'error', title: 'Could not save setting', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-[#147FD4]/10 dark:bg-[#147FD4]/20">
          <ClockIcon className="h-5 w-5 text-[#147FD4]" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Remote lock timeout</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            How long the cloud waits for a lock or unlock confirmation from the gateway before
            reverting the UI and device state. Default is {DEFAULT_LOCK_COMMAND_TIMEOUT_SEC} seconds.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor={`lock-timeout-${facility.id}`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Timeout (seconds)
          </label>
          <input
            id={`lock-timeout-${facility.id}`}
            type="number"
            min={MIN_LOCK_COMMAND_TIMEOUT_SEC}
            max={MAX_LOCK_COMMAND_TIMEOUT_SEC}
            step={1}
            disabled={!canEdit || saving}
            value={draftSec}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) {
                setDraftSec(normalizeLockCommandTimeoutSec(next));
              }
            }}
            className="w-full sm:max-w-[10rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#147FD4] disabled:opacity-60"
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Allowed range: {MIN_LOCK_COMMAND_TIMEOUT_SEC}–{MAX_LOCK_COMMAND_TIMEOUT_SEC} seconds
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center justify-center rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#126bb3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save timeout'}
          </button>
        )}
      </div>
    </div>
  );
}
