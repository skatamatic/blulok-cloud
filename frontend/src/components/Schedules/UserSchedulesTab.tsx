import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import {
  ScheduleWithTimeWindows,
  UserScheduleResponse,
} from '@/types/schedule.types';
import { User, UserRole } from '@/types/auth.types';
import {
  MagnifyingGlassIcon, 
  UserIcon,
  ClockIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  HomeIcon
} from '@heroicons/react/24/outline';

interface UserSchedulesTabProps {
  facilityId: string;
}

interface UserWithSchedule extends User {
  currentSchedule?: ScheduleWithTimeWindows | null;
  unitNumbers?: string[];
}

/**
 * User Schedules Tab Component
 *
 * Allows admins to assign schedules to tenants and maintenance users
 * for a specific facility. Users can have different schedules per facility.
 */
export const UserSchedulesTab: React.FC<UserSchedulesTabProps> = ({ facilityId }) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<UserWithSchedule[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithTimeWindows[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'tenant' | 'maintenance'>('all');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');

  const canEdit = authState.user?.role === 'admin' || 
                  authState.user?.role === 'dev_admin' || 
                  authState.user?.role === 'facility_admin';

  useEffect(() => {
    if (canEdit) {
      loadData();
    }
  }, [facilityId, canEdit, roleFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersResponse, schedulesResponse, unitsResponse] = await Promise.all([
        apiService.getUsers({ 
          facility: facilityId,
        }),
        apiService.getFacilitySchedules(facilityId),
        apiService.getUnits({ facility_id: facilityId }),
      ]);

      const facilityUsers: User[] = usersResponse.users || [];
      const units: any[] = unitsResponse.units || [];
      
      // Create a map of user ID to unit numbers (for primary tenants)
      const userUnitMap = new Map<string, string[]>();
      units.forEach((unit: any) => {
        if (unit.primary_tenant?.id) {
          const userId = unit.primary_tenant.id;
          if (!userUnitMap.has(userId)) {
            userUnitMap.set(userId, []);
          }
          userUnitMap.get(userId)!.push(unit.unit_number);
        }
      });
      
      // Filter to only tenants and maintenance users
      let filteredUsers = facilityUsers.filter(
        u => u.role === UserRole.TENANT || u.role === UserRole.MAINTENANCE
      );

      // Apply role filter if not 'all'
      if (roleFilter !== 'all') {
        filteredUsers = filteredUsers.filter(u => u.role === roleFilter);
      }

      // Load schedule for each user
      const usersWithSchedules = await Promise.all(
        filteredUsers.map(async (user) => {
          try {
            const scheduleResponse: UserScheduleResponse = await apiService.getUserScheduleForFacility(
              user.id,
              facilityId
            );
            return {
              ...user,
              currentSchedule: scheduleResponse.schedule,
              unitNumbers: userUnitMap.get(user.id) || [],
            };
          } catch (error: any) {
            // User may not have a schedule assigned yet
            if (error?.response?.status !== 404) {
              console.error(`Failed to load schedule for user ${user.id}:`, error);
            }
            return {
              ...user,
              currentSchedule: null,
              unitNumbers: userUnitMap.get(user.id) || [],
            };
          }
        })
      );

      setUsers(usersWithSchedules);
      setSchedules(schedulesResponse.schedules || []);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to load user schedules',
        message: error?.response?.data?.message || 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignSchedule = async (userId: string) => {
    if (!selectedScheduleId) {
      addToast({ type: 'error', title: 'Please select a schedule' });
      return;
    }

    try {
      await apiService.setUserScheduleForFacility(userId, facilityId, selectedScheduleId);
      addToast({ type: 'success', title: 'Schedule assigned successfully' });
      setEditingUserId(null);
      setSelectedScheduleId('');
      await loadData();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to assign schedule',
        message: error?.response?.data?.message || 'An error occurred',
      });
    }
  };

  const getDefaultSchedule = (user: UserWithSchedule): ScheduleWithTimeWindows | undefined => {
    if (user.role === UserRole.TENANT) {
      return schedules.find(s => s.name === 'Default Tenant Schedule' && s.schedule_type === 'precanned');
    } else if (user.role === UserRole.MAINTENANCE) {
      return schedules.find(s => s.name === 'Maintenance Schedule' && s.schedule_type === 'precanned');
    }
    return undefined;
  };

  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const email = user.email?.toLowerCase() || '';
        const unitNumbers = (user.unitNumbers || []).join(' ').toLowerCase();
        return fullName.includes(query) || email.includes(query) || unitNumbers.includes(query);
      });
    }

    // Role filter is already applied in loadData, so we don't need to filter again here
    return filtered;
  }, [users, searchQuery]);

  if (!canEdit) {
    return (
      <div className="text-center p-8 text-gray-500 dark:text-gray-400">
        You do not have permission to manage user schedules.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium mb-1">Schedule changes may take up to 24 hours to take effect</p>
            <p className="text-xs">Existing route passes remain valid until they expire. New route passes will use the updated schedule immediately.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or unit number..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Role Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              roleFilter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            All Users
          </button>
          <button
            onClick={() => setRoleFilter('tenant')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              roleFilter === 'tenant'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Tenants
          </button>
          <button
            onClick={() => setRoleFilter('maintenance')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              roleFilter === 'maintenance'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Maintenance
          </button>
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="text-center p-8 text-gray-500 dark:text-gray-400">
            {searchQuery || roleFilter !== 'all'
              ? 'No users found matching your filters.'
              : 'No tenants or maintenance users found in this facility.'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const defaultSchedule = getDefaultSchedule(user);
            const currentSchedule = user.currentSchedule || defaultSchedule;
            const isEditing = editingUserId === user.id;

            return (
              <div
                key={user.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  {/* User Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <UserIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {user.firstName} {user.lastName}
                          </h4>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            user.role === UserRole.TENANT
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          }`}>
                            {user.role === UserRole.TENANT ? 'Tenant' : 'Maintenance'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {user.email}
                        </p>
                        {/* Unit Numbers */}
                        {user.unitNumbers && user.unitNumbers.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <HomeIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              Units: {user.unitNumbers.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Current Schedule */}
                    {!isEditing && (
                      <div className="mt-3 ml-13 flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Schedule:</span>{' '}
                          {currentSchedule ? (
                            <span className="text-gray-900 dark:text-white">
                              {currentSchedule.name}
                              {currentSchedule === defaultSchedule && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(default)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400 italic">Not assigned</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Schedule Selector (when editing) */}
                    {isEditing && (
                      <div className="mt-3 ml-13 space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Select Schedule
                        </label>
                        <select
                          value={selectedScheduleId || currentSchedule?.id || ''}
                          onChange={(e) => setSelectedScheduleId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          <option value="">-- Select a schedule --</option>
                          {schedules
                            .filter(s => s.is_active)
                            .map(schedule => (
                              <option key={schedule.id} value={schedule.id}>
                                {schedule.name} {schedule.schedule_type === 'precanned' ? '(System)' : '(Custom)'}
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleAssignSchedule(user.id)}
                            disabled={!selectedScheduleId && !currentSchedule?.id}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                          >
                            <CheckIcon className="h-4 w-4" />
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingUserId(null);
                              setSelectedScheduleId('');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm"
                          >
                            <XMarkIcon className="h-4 w-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <button
                      onClick={() => {
                        setEditingUserId(user.id);
                        setSelectedScheduleId(currentSchedule?.id || '');
                      }}
                      className="ml-4 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                    >
                      {currentSchedule ? 'Change' : 'Assign'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      {filteredUsers.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {filteredUsers.length} of {users.length} {roleFilter === 'all' ? 'users' : roleFilter === 'tenant' ? 'tenants' : 'maintenance users'}
        </div>
      )}
    </div>
  );
};

