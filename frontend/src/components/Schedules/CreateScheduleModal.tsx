import { useEffect, useRef, useState } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Modal, ModalFooter } from '@/components/Modal/Modal';
import { ScheduleEditor, ScheduleEditorRef } from '@/components/Schedules/ScheduleEditor';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import type { CreateScheduleRequest } from '@/types/schedule.types';

interface CreateScheduleModalProps {
  isOpen: boolean;
  facilityId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

export function CreateScheduleModal({
  isOpen,
  facilityId,
  onClose,
  onCreated,
}: CreateScheduleModalProps) {
  const { addToast } = useToast();
  const editorRef = useRef<ScheduleEditorRef>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSaving(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (saving) return;
    setName('');
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      addToast({ type: 'error', title: 'Schedule name is required' });
      return;
    }
    if (!editorRef.current) {
      addToast({ type: 'error', title: 'Schedule editor not ready' });
      return;
    }
    if (editorRef.current.hasValidationErrors()) {
      const errors = editorRef.current.getValidationErrors();
      const errorCount = Object.values(errors).flat().length;
      addToast({
        type: 'error',
        title: 'Cannot create schedule',
        message: `Please fix ${errorCount} overlapping time window${errorCount !== 1 ? 's' : ''} before saving.`,
      });
      return;
    }

    try {
      setSaving(true);
      const timeWindows = editorRef.current.getValue().map((window) => ({
        day_of_week: window.day_of_week,
        start_time: window.start_time,
        end_time: window.end_time,
      }));
      const data: CreateScheduleRequest = {
        name: name.trim(),
        schedule_type: 'custom',
        is_active: true,
        time_windows: timeWindows,
      };
      await apiService.createSchedule(facilityId, data);
      addToast({ type: 'success', title: 'Schedule created successfully' });
      setName('');
      await onCreated();
      onClose();
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      addToast({
        type: 'error',
        title: 'Failed to create schedule',
        message: message || 'An error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="3xl" title="Add Schedule">
      <div className="max-h-[min(80vh,52rem)] space-y-4 overflow-x-auto overflow-y-auto pr-1">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Name the schedule, then set access hours for each day. Use Always for 24/7 access.
        </p>
        <div>
          <label
            htmlFor="create-schedule-name"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Schedule Name
          </label>
          <input
            id="create-schedule-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter schedule name"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div className="min-w-[64rem]">
          <ScheduleEditor ref={editorRef} timeWindows={[]} />
        </div>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          <XMarkIcon className="h-5 w-5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          <CheckIcon className="h-5 w-5" />
          {saving ? 'Creating…' : 'Create'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
