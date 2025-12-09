import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import {
  ScheduleWithTimeWindows,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  UserScheduleResponse,
} from '@/types/schedule.types';
import { ScheduleVisualizer } from './ScheduleVisualizer';
import { ScheduleEditor, ScheduleEditorRef } from './ScheduleEditor';
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { UserRole } from '@/types/auth.types';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';

interface FacilitySchedulesTabProps {
  facilityId: string;
  userId?: string; // For viewing user's own schedule
}

/**
 * Facility Schedules Tab Component
 *
 * Main component for managing schedules in a facility.
 * Supports role-based UI:
 * - Admin/Dev-Admin/Facility-Admin: Full CRUD interface
 * - Tenant/Maintenance: Read-only view of their own schedule
 */
export const FacilitySchedulesTab: React.FC<FacilitySchedulesTabProps> = ({ facilityId, userId }) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState<ScheduleWithTimeWindows[]>([]);
  const [userSchedule, setUserSchedule] = useState<ScheduleWithTimeWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleTimeWindows, setNewScheduleTimeWindows] = useState<any[]>([]);
  const scheduleEditorRef = useRef<ScheduleEditorRef>(null);
  const newScheduleEditorRef = useRef<ScheduleEditorRef>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);
  const [scheduleUsage, setScheduleUsage] = useState<{ tenantCount: number; maintenanceCount: number; totalCount: number } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const userRole = authState.user?.role as UserRole;
  const currentUserId = userId || authState.user?.id;
  const canEdit = userRole === 'admin' || userRole === 'dev_admin' || userRole === 'facility_admin';
  const isReadOnly = !canEdit;

  useEffect(() => {
    loadSchedules();
    if (currentUserId) {
      loadUserSchedule();
    }
  }, [facilityId, currentUserId]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const response = await apiService.getFacilitySchedules(facilityId);
      const loadedSchedules = response.schedules || [];
      
      // Ensure precanned schedules exist (they should be initialized on facility creation)
      // If they don't exist, they'll be created on next facility operation
      // For now, just display what we have
      setSchedules(loadedSchedules);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to load schedules',
        message: error?.response?.data?.message || 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserSchedule = async () => {
    if (!currentUserId) return;

    try {
      const response: UserScheduleResponse = await apiService.getUserScheduleForFacility(
        currentUserId,
        facilityId
      );
      setUserSchedule(response.schedule);
    } catch (error: any) {
      // User may not have a schedule assigned yet
      if (error?.response?.status !== 404) {
        addToast({
          type: 'error',
          title: 'Failed to load user schedule',
          message: error?.response?.data?.message || 'An error occurred',
        });
      }
    }
  };

  const handleCreateSchedule = async () => {
    if (!newScheduleName.trim()) {
      addToast({ type: 'error', title: 'Schedule name is required' });
      return;
    }

    if (!newScheduleEditorRef.current) {
      addToast({ type: 'error', title: 'Schedule editor not ready' });
      return;
    }

    // Check for validation errors
    if (newScheduleEditorRef.current.hasValidationErrors()) {
      const errors = newScheduleEditorRef.current.getValidationErrors();
      const errorCount = Object.values(errors).flat().length;
      addToast({
        type: 'error',
        title: 'Cannot create schedule',
        message: `Please fix ${errorCount} overlapping time window${errorCount !== 1 ? 's' : ''} before saving.`,
      });
      return;
    }

    try {
      const timeWindows = newScheduleEditorRef.current.getValue();
      // Strip out id fields - backend generates them
      const cleanTimeWindows = timeWindows.map(tw => ({
        day_of_week: tw.day_of_week,
        start_time: tw.start_time,
        end_time: tw.end_time,
      }));

      const data: CreateScheduleRequest = {
        name: newScheduleName,
        schedule_type: 'custom',
        is_active: true,
        time_windows: cleanTimeWindows,
      };

      await apiService.createSchedule(facilityId, data);
      addToast({ type: 'success', title: 'Schedule created successfully' });
      setCreatingSchedule(false);
      setNewScheduleName('');
      setNewScheduleTimeWindows([]);
      await loadSchedules();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to create schedule',
        message: error?.response?.data?.message || 'An error occurred',
      });
    }
  };

  const handleSaveSchedule = async (scheduleId: string) => {
    if (!scheduleEditorRef.current) return;

    // Check for validation errors
    if (scheduleEditorRef.current.hasValidationErrors()) {
      const errors = scheduleEditorRef.current.getValidationErrors();
      const errorCount = Object.values(errors).flat().length;
      addToast({
        type: 'error',
        title: 'Cannot save schedule',
        message: `Please fix ${errorCount} overlapping time window${errorCount !== 1 ? 's' : ''} before saving.`,
      });
      return;
    }

    try {
      const timeWindows = scheduleEditorRef.current.getValue();
      // Strip out id fields - backend generates them
      const cleanTimeWindows = timeWindows.map(tw => ({
        day_of_week: tw.day_of_week,
        start_time: tw.start_time,
        end_time: tw.end_time,
      }));

      await apiService.updateSchedule(facilityId, scheduleId, { time_windows: cleanTimeWindows });
      addToast({ type: 'success', title: 'Schedule updated successfully' });
      setEditingSchedule(null);
      await loadSchedules();
      if (userSchedule?.id === scheduleId) {
        await loadUserSchedule();
      }
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to update schedule',
        message: error?.response?.data?.message || 'An error occurred',
      });
    }
  };

  const handleDeleteClick = async (scheduleId: string) => {
    setScheduleToDelete(scheduleId);
    setLoadingUsage(true);
    
    try {
      const response = await apiService.getScheduleUsage(facilityId, scheduleId);
      setScheduleUsage(response.usage);
      setDeleteConfirmOpen(true);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to load schedule usage',
        message: error?.response?.data?.message || 'An error occurred',
      });
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!scheduleToDelete) return;

    try {
      await apiService.deleteSchedule(facilityId, scheduleToDelete);
      addToast({ type: 'success', title: 'Schedule deleted successfully' });
      setDeleteConfirmOpen(false);
      setScheduleToDelete(null);
      setScheduleUsage(null);
      await loadSchedules();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to delete schedule',
        message: error?.response?.data?.message || 'An error occurred',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Read-only view for tenants/maintenance
  if (isReadOnly && userSchedule) {
    return (
      <div className="space-y-6">
        <ScheduleVisualizer schedule={userSchedule} />
      </div>
    );
  }

  if (isReadOnly && !userSchedule) {
    return (
      <div className="text-center p-8 text-gray-500 dark:text-gray-400">
        No schedule assigned. Please contact your facility administrator.
      </div>
    );
  }

  // Full CRUD interface for admins
  return (
    <div className="space-y-6">

      {creatingSchedule && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule Name
            </label>
            <input
              type="text"
              value={newScheduleName}
              onChange={(e) => setNewScheduleName(e.target.value)}
              placeholder="Enter schedule name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <ScheduleEditor
            ref={newScheduleEditorRef}
            timeWindows={newScheduleTimeWindows}
            className="mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              <CheckIcon className="h-5 w-5" />
              Create
            </button>
            <button
              onClick={() => {
                setCreatingSchedule(false);
                setNewScheduleName('');
                setNewScheduleTimeWindows([]);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Pre-canned schedules first - always shown */}
        {schedules.filter(s => s.schedule_type === 'precanned').length > 0 && (
          <div className="mb-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">System Schedules</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pre-configured schedules that cannot be deleted</p>
          </div>
        )}
        {schedules
          .filter(s => s.schedule_type === 'precanned')
          .map((schedule) => (
            <div
              key={schedule.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-md font-semibold text-gray-900 dark:text-white">{schedule.name}</h4>
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                    System
                  </span>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingSchedule(schedule.id)}
                      className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                      title="Edit schedule (cannot be deleted)"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {editingSchedule === schedule.id ? (
                <div>
                  {/* Warning about schedule changes */}
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-medium mb-1">Schedule changes may take up to 24 hours to take effect</p>
                        <p className="text-xs">Existing route passes remain valid until they expire. New route passes will use the updated schedule immediately.</p>
                      </div>
                    </div>
                  </div>
                  <ScheduleEditor
                    ref={scheduleEditorRef}
                    timeWindows={schedule.time_windows}
                  />
                  <div className="mt-4 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingSchedule(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5" />
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveSchedule(schedule.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                    >
                      <CheckIcon className="h-5 w-5" />
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <ScheduleVisualizer schedule={schedule} />
              )}
            </div>
          ))}

        {/* Custom schedules */}
        {schedules.filter(s => s.schedule_type === 'custom').length > 0 && (
          <div className="mb-2 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custom Schedules</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">User-created schedules that can be edited or deleted</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => setCreatingSchedule(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  Create Schedule
                </button>
              )}
            </div>
          </div>
        )}
        {schedules.filter(s => s.schedule_type === 'custom').length === 0 && canEdit && (
          <div className="mb-2 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custom Schedules</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">User-created schedules that can be edited or deleted</p>
              </div>
              <button
                onClick={() => setCreatingSchedule(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                Create Schedule
              </button>
            </div>
          </div>
        )}
        {schedules
          .filter(s => s.schedule_type === 'custom')
          .map((schedule) => (
            <div
              key={schedule.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-md font-semibold text-gray-900 dark:text-white">{schedule.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Custom Schedule</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingSchedule(schedule.id)}
                      className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                      title="Edit schedule"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(schedule.id)}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Delete schedule"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {editingSchedule === schedule.id ? (
                <div>
                  {/* Warning about schedule changes */}
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <p className="font-medium mb-1">Schedule changes may take up to 24 hours to take effect</p>
                        <p className="text-xs">Existing route passes remain valid until they expire. New route passes will use the updated schedule immediately.</p>
                      </div>
                    </div>
                  </div>
                  <ScheduleEditor
                    ref={scheduleEditorRef}
                    timeWindows={schedule.time_windows}
                  />
                  <div className="mt-4 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingSchedule(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="h-5 w-5" />
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveSchedule(schedule.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                    >
                      <CheckIcon className="h-5 w-5" />
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <ScheduleVisualizer schedule={schedule} />
              )}
            </div>
          ))}

        {schedules.length === 0 && (
          <div className="text-center p-8 text-gray-500 dark:text-gray-400">
            No schedules found. Create one to get started.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setScheduleToDelete(null);
          setScheduleUsage(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Schedule"
        message={
          loadingUsage
            ? 'Loading schedule usage...'
            : scheduleUsage && scheduleUsage.totalCount > 0
            ? `This schedule is in use by ${scheduleUsage.tenantCount} tenant${scheduleUsage.tenantCount !== 1 ? 's' : ''} and ${scheduleUsage.maintenanceCount} maintenance user${scheduleUsage.maintenanceCount !== 1 ? 's' : ''}. They will be automatically reassigned to their default schedules if this schedule is deleted.`
            : 'Are you sure you want to delete this schedule? This action cannot be undone.'
        }
        confirmText="Delete Schedule"
        cancelText="Cancel"
        variant="danger"
        isLoading={loadingUsage}
      />
    </div>
  );
};

