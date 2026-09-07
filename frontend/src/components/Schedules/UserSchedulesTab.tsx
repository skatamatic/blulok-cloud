import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import { ScheduleWithTimeWindows } from '@/types/schedule.types';
import { User, UserRole } from '@/types/auth.types';
import { SortableTableTh } from '@/components/Common/SortableTableTh';
import { MagnifyingGlassIcon, CheckIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  applyUserScheduleAssignment,
  attachSchedulesToUsers,
  defaultScheduleForUser,
  filterScheduleUsers,
  mergeFacilityScheduleUsers,
  buildUserUnitMap,
  sortScheduleUsers,
  tenantDisplayName,
  UNIT_PAGE_SIZE,
  USER_PAGE_SIZE,
  type ScheduleRoleFilter,
  type UserWithSchedule,
} from '@/components/Schedules/user-schedules.utils';

interface UserSchedulesTabProps {
  facilityId: string;
  /** When false the tab stays mounted but hidden; used to refresh the schedule catalog on show. */
  active?: boolean;
}

type SortKey = 'name' | 'role' | 'units' | 'schedule';

async function fetchAllPages<T>(
  pageSize: number,
  loadPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>,
): Promise<T[]> {
  const first = await loadPage(0, pageSize);
  const rows = [...first.rows];
  const total = first.total;
  let offset = pageSize;
  while (offset < total) {
    const next = await loadPage(offset, pageSize);
    rows.push(...next.rows);
    if (!next.rows.length) break;
    offset += pageSize;
  }
  return rows;
}

export const UserSchedulesTab: React.FC<UserSchedulesTabProps> = ({ facilityId, active = true }) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<UserWithSchedule[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithTimeWindows[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<ScheduleRoleFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const toastRef = useRef(addToast);
  toastRef.current = addToast;
  const loadGeneration = useRef(0);
  const hasRoster = useRef(false);

  const canEdit =
    authState.user?.role === 'admin' ||
    authState.user?.role === 'dev_admin' ||
    authState.user?.role === 'facility_admin';

  useEffect(() => {
    if (!canEdit) return;

    const generation = ++loadGeneration.current;
    setLoading(true);
    setUsers([]);
    setSchedules([]);
    hasRoster.current = false;

    void (async () => {
      try {
        const [listedUsers, units, schedulesResponse, assignmentsResponse] = await Promise.all([
          fetchAllPages<User>(USER_PAGE_SIZE, async (offset, limit) => {
            const res = await apiService.getUsers({
              facility: facilityId,
              limit,
              offset,
              sortBy: 'name',
              sortOrder: 'asc',
            });
            return { rows: res.users || [], total: res.total ?? (res.users || []).length };
          }),
          fetchAllPages<any>(UNIT_PAGE_SIZE, async (offset, limit) => {
            const res = await apiService.getUnits({ facility_id: facilityId, limit, offset });
            return { rows: res.units || [], total: res.total ?? (res.units || []).length };
          }),
          apiService.getFacilitySchedules(facilityId),
          apiService.getFacilityUserScheduleAssignments(facilityId),
        ]);

        if (generation !== loadGeneration.current) return;

        const facilitySchedules: ScheduleWithTimeWindows[] = schedulesResponse.schedules || [];
        const assignmentMap = new Map<string, string>(
          (assignmentsResponse.assignments || []).map((row: { userId: string; scheduleId: string }) => [
            row.userId,
            row.scheduleId,
          ]),
        );
        setUsers(
          attachSchedulesToUsers(
            mergeFacilityScheduleUsers(listedUsers, units),
            facilitySchedules,
            assignmentMap,
            buildUserUnitMap(units),
          ),
        );
        setSchedules(facilitySchedules);
        hasRoster.current = true;
      } catch (error: any) {
        if (generation !== loadGeneration.current) return;
        toastRef.current({
          type: 'error',
          title: 'Failed to load user schedules',
          message: error?.response?.data?.message || 'An error occurred',
        });
      } finally {
        if (generation === loadGeneration.current) {
          setLoading(false);
        }
      }
    })();
  }, [canEdit, facilityId]);

  useEffect(() => {
    if (!active || !canEdit || !hasRoster.current) return;
    let cancelled = false;
    void apiService
      .getFacilitySchedules(facilityId)
      .then((response) => {
        if (!cancelled) setSchedules(response.schedules || []);
      })
      .catch(() => {
        /* roster is already on screen; catalog refresh is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [active, canEdit, facilityId]);

  const handleAssignSchedule = async (userId: string) => {
    if (!selectedScheduleId) {
      toastRef.current({ type: 'error', title: 'Please select a schedule' });
      return;
    }

    const nextSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
    if (!nextSchedule) {
      toastRef.current({ type: 'error', title: 'Please select a schedule' });
      return;
    }

    const previousUsers = users;
    setUsers(applyUserScheduleAssignment(users, userId, nextSchedule));
    setEditingUserId(null);
    setSelectedScheduleId('');
    setSavingUserId(userId);

    try {
      await apiService.setUserScheduleForFacility(userId, facilityId, nextSchedule.id);
      toastRef.current({ type: 'success', title: 'Schedule assigned successfully' });
    } catch (error: any) {
      setUsers(previousUsers);
      toastRef.current({
        type: 'error',
        title: 'Failed to assign schedule',
        message: error?.response?.data?.message || 'An error occurred',
      });
    } finally {
      setSavingUserId((current) => (current === userId ? null : current));
    }
  };

  const handleSort = (columnKey: string) => {
    const key = columnKey as SortKey;
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortOrder('asc');
  };

  const visibleUsers = useMemo(() => {
    return sortScheduleUsers(filterScheduleUsers(users, searchQuery, roleFilter), sortBy, sortOrder);
  }, [users, searchQuery, roleFilter, sortBy, sortOrder]);

  if (!canEdit) {
    return (
      <div className="text-center p-8 text-gray-500 dark:text-gray-400">
        You do not have permission to manage user schedules.
      </div>
    );
  }

  const showInitialSpinner = loading && users.length === 0;

  if (showInitialSpinner) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium mb-1">Schedule changes may take up to 24 hours to take effect</p>
            <p className="text-xs">
              Existing route passes remain valid until they expire. New route passes will use the
              updated schedule immediately.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
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
        <div className="flex gap-2">
          {([
            ['all', 'All Users'],
            ['tenant', 'Tenants'],
            ['maintenance', 'Maintenance'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                roleFilter === value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleUsers.length === 0 ? (
        <div className="text-center p-8 text-gray-500 dark:text-gray-400">
          {searchQuery || roleFilter !== 'all'
            ? 'No users found matching your filters.'
            : 'No tenants or maintenance users found in this facility.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <SortableTableTh
                  label="User"
                  columnKey="name"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableTableTh
                  label="Role"
                  columnKey="role"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableTableTh
                  label="Units"
                  columnKey="units"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableTableTh
                  label="Schedule"
                  columnKey="schedule"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {visibleUsers.map((user) => {
                const defaultSchedule = defaultScheduleForUser(user, schedules);
                const currentSchedule = user.currentSchedule || defaultSchedule;
                const isDefault = Boolean(currentSchedule && currentSchedule === defaultSchedule && !user.currentSchedule);
                const isEditing = editingUserId === user.id;

                return (
                  <tr key={user.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {tenantDisplayName(user)}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">{user.email || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === UserRole.TENANT
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}
                      >
                        {user.role === UserRole.TENANT ? 'Tenant' : 'Maintenance'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {user.unitNumbers?.length ? user.unitNumbers.join(', ') : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {isEditing ? (
                        <select
                          value={selectedScheduleId || currentSchedule?.id || ''}
                          onChange={(e) => setSelectedScheduleId(e.target.value)}
                          className="w-full min-w-[12rem] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          <option value="">— Select a schedule —</option>
                          {schedules
                            .filter((s) => s.is_active)
                            .map((schedule) => (
                              <option key={schedule.id} value={schedule.id}>
                                {schedule.name}{' '}
                                {schedule.schedule_type === 'precanned' ? '(System)' : '(Custom)'}
                              </option>
                            ))}
                        </select>
                      ) : currentSchedule ? (
                        <span>
                          {currentSchedule.name}
                          {isDefault && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(default)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={savingUserId === user.id}
                            onClick={() => void handleAssignSchedule(user.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                          >
                            <CheckIcon className="h-4 w-4" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(null);
                              setSelectedScheduleId('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg"
                          >
                            <XMarkIcon className="h-4 w-4" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUserId(user.id);
                            setSelectedScheduleId(currentSchedule?.id || '');
                          }}
                          className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
                        >
                          {currentSchedule ? 'Change' : 'Assign'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleUsers.length > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Showing {visibleUsers.length} of {users.length}{' '}
          {roleFilter === 'all' ? 'users' : roleFilter === 'tenant' ? 'tenants' : 'maintenance users'}
        </div>
      )}
    </div>
  );
};
