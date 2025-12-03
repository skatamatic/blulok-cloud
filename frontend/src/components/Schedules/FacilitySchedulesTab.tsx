import React, { useState, useEffect } from 'react';
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
import { ScheduleEditor } from './ScheduleEditor';
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { UserRole } from '@/types/auth.types';

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

    try {
      const data: CreateScheduleRequest = {
        name: newScheduleName,
        schedule_type: 'custom',
        is_active: true,
        time_windows: newScheduleTimeWindows,
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

  const handleUpdateSchedule = async (scheduleId: string, data: UpdateScheduleRequest) => {
    try {
      await apiService.updateSchedule(facilityId, scheduleId, data);
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

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await apiService.deleteSchedule(facilityId, scheduleId);
      addToast({ type: 'success', title: 'Schedule deleted successfully' });
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
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your Schedule</h3>
          <ScheduleVisualizer schedule={userSchedule} />
        </div>
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Schedules</h3>
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
            timeWindows={newScheduleTimeWindows}
            onChange={setNewScheduleTimeWindows}
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
                    {editingSchedule === schedule.id ? (
                      <button
                        onClick={() => setEditingSchedule(null)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Cancel editing"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingSchedule(schedule.id)}
                        className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                        title="Edit schedule (cannot be deleted)"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {editingSchedule === schedule.id ? (
                <div>
                  <ScheduleEditor
                    timeWindows={schedule.time_windows}
                    onChange={(timeWindows) => {
                      handleUpdateSchedule(schedule.id, { time_windows: timeWindows });
                    }}
                  />
                </div>
              ) : (
                <ScheduleVisualizer schedule={schedule} />
              )}
            </div>
          ))}

        {/* Custom schedules */}
        {schedules.filter(s => s.schedule_type === 'custom').length > 0 && (
          <div className="mb-2 mt-6">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custom Schedules</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">User-created schedules that can be edited or deleted</p>
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
                    {editingSchedule === schedule.id ? (
                      <button
                        onClick={() => setEditingSchedule(null)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Cancel editing"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingSchedule(schedule.id)}
                          className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                          title="Edit schedule"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Delete schedule"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {editingSchedule === schedule.id ? (
                <div>
                  <ScheduleEditor
                    timeWindows={schedule.time_windows}
                    onChange={(timeWindows) => {
                      handleUpdateSchedule(schedule.id, { time_windows: timeWindows });
                    }}
                  />
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
    </div>
  );
};

