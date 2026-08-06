import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import {
  UserIcon,
  BuildingOfficeIcon,
  DevicePhoneMobileIcon,
  KeyIcon,
  TrashIcon,
  NoSymbolIcon,
  ClockIcon,
  PaperAirplaneIcon,
  PencilIcon,
  CheckCircleIcon,
  LinkIcon,
  TicketIcon
} from '@heroicons/react/24/outline';
import { useDetailsBackNavigation, withReturnPath } from '@/hooks/useBackNavigation';
import {
  DetailsPageHeader,
  DetailsPageNotFound,
  DetailsPageShell,
  DetailsTabNav,
} from '@/components/Common/DetailsPageLayout';
import { formatDateTime, buildLocalDateRangeQuery } from '@/utils/datetime.utils';

interface UserDetails {
  id: string;
  email: string;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  /** Presentation-only; facility admins. Not an API authorization boundary. */
  simplifiedUi?: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  facilities: Facility[];
  devices: UserDevice[];
  accessControlDevices?: UserAccessControlDevice[];
}

interface Facility {
  id: string;
  facility_id?: string;
  name?: string;
  facility_name?: string;
  address?: string;
  facility_address?: string;
  units: Unit[];
}

interface Unit {
  id: string;
  unitNumber: string;
  unitType?: string;
  isPrimary: boolean;
  device?: {
    id: string;
    device_serial: string;
    lock_status?: string;
    device_status?: string;
    battery_level?: number;
  };
}

interface UserDevice {
  id: string;
  app_device_id: string;
  platform: string;
  device_name?: string;
  public_key: string;
  status: string;
  last_used_at?: string;
  created_at: string;
  associatedLocks: LockInfo[];
}

interface LockInfo {
  lock_id: string;
  device_serial: string;
  unit_number: string;
  facility_name: string;
  key_status: string;
}

interface UserAccessControlCode {
  code: string;
  valid_from: string;
  valid_until: string;
  schedule_id?: string | null;
  schedule_name?: string | null;
}

interface UserAccessControlDevice {
  id: string;
  facility_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string | null;
  access_methods?: string[];
  codes?: UserAccessControlCode[];
}

interface RoutePassHistoryEntry {
  id: string;
  issuedAt: string;
  expiresAt: string;
  deviceId: string | null;
  audiences: string[];
  isExpired: boolean;
}

type TabType = 'summary' | 'facilities' | 'devices' | 'invites' | 'route-passes' | 'edit';

export default function UserDetailsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { authState, canManageUsers, isAdmin } = useAuth();
  const { addToast } = useToast();
  const canManageUsersScope = canManageUsers();
  const canSetSimplifiedUi = isAdmin();
  const location = useLocation();
  const backPath = canManageUsersScope ? '/users' : '/dashboard';
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ fallbackPath: backPath });

  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [deleteDeviceModal, setDeleteDeviceModal] = useState<{
    isOpen: boolean;
    device: UserDevice | null;
  }>({ isOpen: false, device: null });
  const [deletingDevice, setDeletingDevice] = useState(false);
  const [deleteUserModal, setDeleteUserModal] = useState(false);
  const [activateUserModal, setActivateUserModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [initialFacilityIds, setInitialFacilityIds] = useState<string[]>([]);
  const [updatingFacilities, setUpdatingFacilities] = useState(false);
  const [, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    role: '' as UserRole | '',
    isActive: true,
    simplifiedUi: false,
  });
  const [togglingSimplifiedUi, setTogglingSimplifiedUi] = useState(false);

  const canViewDevices = authState.user?.role === UserRole.DEV_ADMIN;
  const canDeleteDevices = authState.user?.role === UserRole.DEV_ADMIN;
  const canViewRoutePasses = authState.user?.role === UserRole.DEV_ADMIN;

  const [routePassHistory, setRoutePassHistory] = useState<RoutePassHistoryEntry[]>([]);
  const [routePassLoading, setRoutePassLoading] = useState(false);
  const [routePassPagination, setRoutePassPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  const [routePassFilters, setRoutePassFilters] = useState({
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

  useEffect(() => {
    if (userDetails && canManageUsersScope) {
      loadFacilities();
      // Set current user's facilities (use facility_id if available, otherwise id)
      const currentFacilityIds = userDetails.facilities.map(f => f.facility_id || f.id);
      setSelectedFacilityIds(currentFacilityIds);
      setInitialFacilityIds(currentFacilityIds);
    }
  }, [userDetails, canManageUsersScope]);

  useEffect(() => {
    if (userId && activeTab === 'route-passes' && canViewRoutePasses) {
      loadRoutePassHistory();
    }
  }, [
    userId,
    activeTab,
    canViewRoutePasses,
    routePassFilters.startDate,
    routePassFilters.endDate,
    routePassPagination.limit,
    routePassPagination.offset,
  ]);

  const loadRoutePassHistory = async () => {
    if (!userId) return;
    try {
      setRoutePassLoading(true);
      const filters: Record<string, string | number> = {
        limit: routePassPagination.limit,
        offset: routePassPagination.offset,
      };
      const dateRange = buildLocalDateRangeQuery(
        routePassFilters.startDate || undefined,
        routePassFilters.endDate || undefined,
      );
      if (dateRange.date_from) filters.startDate = dateRange.date_from;
      if (dateRange.date_to) filters.endDate = dateRange.date_to;
      
      const response = await apiService.getUserRoutePassHistory(userId, filters);
      if (response.success) {
        const normalized = ((response.data || []) as any[]).map((entry) => {
          const issuedAt = String(entry.issuedAt || entry.issued_at || '');
          const expiresAt = String(entry.expiresAt || entry.expires_at || '');
          const audiences = Array.isArray(entry.audiences) ? entry.audiences : [];
          const isExpired = typeof entry.isExpired === 'boolean'
            ? entry.isExpired
            : (expiresAt ? new Date(expiresAt).getTime() <= Date.now() : true);
          return {
            id: String(entry.id || `${issuedAt}-${expiresAt}`),
            issuedAt,
            expiresAt,
            deviceId: entry.deviceId || entry.device_id || null,
            audiences,
            isExpired,
          } as RoutePassHistoryEntry;
        });
        setRoutePassHistory(normalized);
        setRoutePassPagination(response.pagination || {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        });
      }
    } catch (error: any) {
      console.error('Failed to load route pass history:', error);
      addToast({
        type: 'error',
        title: 'Failed to load route pass history',
        message: error?.response?.data?.message || 'An error occurred',
      });
    } finally {
      setRoutePassLoading(false);
    }
  };

  const loadFacilities = async () => {
    try {
      const response = await apiService.getFacilities();
      if (response.success) {
        setFacilities(response.facilities || []);
      }
    } catch (err) {
      console.error('Failed to load facilities:', err);
    }
  };

  const loadUserDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiService.getUserDetails(userId!);
      setUserDetails(response.user);
    } catch (error: any) {
      console.error('Failed to load user details:', error);
      setError(error?.response?.data?.message || 'Failed to load user details');
      addToast({
        type: 'error',
        title: 'Failed to load user details',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (device: UserDevice) => {
    if (!canDeleteDevices) return;
    setDeleteDeviceModal({ isOpen: true, device });
  };

  const confirmDeleteDevice = async () => {
    if (!deleteDeviceModal.device) return;

    try {
      setDeletingDevice(true);
      await apiService.deleteUserDevice(deleteDeviceModal.device.id);
      addToast({
        type: 'success',
        title: 'Device deleted successfully',
        message: 'The device has been deleted and keys have been revoked from associated locks.'
      });
      // Reload user details to refresh the device list
      await loadUserDetails();
    } catch (error: any) {
      console.error('Failed to delete device:', error);
      addToast({
        type: 'error',
        title: 'Failed to delete device',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    } finally {
      setDeletingDevice(false);
      setDeleteDeviceModal({ isOpen: false, device: null });
    }
  };

  const formatDevicePlatform = (platform: string) => {
    switch (platform) {
      case 'ios': return 'iOS';
      case 'android': return 'Android';
      case 'web': return 'Web';
      case 'other': return 'Other';
      default: return platform;
    }
  };

  const formatKeyStatus = (status: string) => {
    switch (status) {
      case 'added': return { text: 'Active', color: 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200' };
      case 'pending_add': return { text: 'Adding', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-200' };
      case 'pending_remove': return { text: 'Removing', color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200' };
      case 'removed': return { text: 'Removed', color: 'text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-200' };
      case 'failed': return { text: 'Failed', color: 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200' };
      default: return { text: status, color: 'text-gray-600 bg-gray-100 dark:bg-gray-900 dark:text-gray-200' };
    }
  };

  const handleUpdateFacilities = async () => {
    if (!userDetails) return;

    setUpdatingFacilities(true);
    try {
      const response = await apiService.setUserFacilities(userDetails.id, selectedFacilityIds);
      if (response.success) {
        addToast({
          type: 'success',
          title: 'Facilities updated successfully',
        });
        // Update initial facility IDs to match current selection
        setInitialFacilityIds([...selectedFacilityIds]);
        await loadUserDetails();
      } else {
        addToast({
          type: 'error',
          title: 'Failed to update facilities',
          message: response.message || 'An unexpected error occurred'
        });
      }
    } catch (error: any) {
      console.error('Failed to update facilities:', error);
      addToast({
        type: 'error',
        title: 'Failed to update facilities',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    } finally {
      setUpdatingFacilities(false);
    }
  };

  const handleFacilityToggle = (facilityId: string) => {
    setSelectedFacilityIds(prev => 
      prev.includes(facilityId)
        ? prev.filter(id => id !== facilityId)
        : [...prev, facilityId]
    );
  };

  const handleAllFacilitiesToggle = () => {
    if (selectedFacilityIds.length === facilities.length) {
      setSelectedFacilityIds([]);
      return;
    }
    setSelectedFacilityIds(facilities.map((facility) => facility.id));
  };

  const handleToggleSimplifiedUi = async (nextValue: boolean) => {
    if (!userDetails || !canSetSimplifiedUi || userDetails.role !== UserRole.FACILITY_ADMIN) {
      return;
    }
    if (Boolean(userDetails.simplifiedUi) === nextValue || togglingSimplifiedUi) {
      return;
    }

    const previous = Boolean(userDetails.simplifiedUi);
    setTogglingSimplifiedUi(true);
    setUserDetails({ ...userDetails, simplifiedUi: nextValue });
    setEditForm((prev) => ({ ...prev, simplifiedUi: nextValue }));

    try {
      const response = await apiService.updateUser(userDetails.id, { simplifiedUi: nextValue });
      if (response.success) {
        addToast({
          type: 'success',
          title: nextValue ? 'Simplified UI enabled' : 'Simplified UI disabled',
          message: nextValue
            ? 'This facility admin will see the simplified Cloud experience on next profile refresh.'
            : 'This facility admin will see the full facility-admin Cloud UI on next profile refresh.',
        });
        await loadUserDetails();
      } else {
        setUserDetails({ ...userDetails, simplifiedUi: previous });
        setEditForm((prev) => ({ ...prev, simplifiedUi: previous }));
        addToast({
          type: 'error',
          title: 'Failed to update Simplified UI',
          message: response.message || 'An unexpected error occurred',
        });
      }
    } catch (error: any) {
      setUserDetails({ ...userDetails, simplifiedUi: previous });
      setEditForm((prev) => ({ ...prev, simplifiedUi: previous }));
      addToast({
        type: 'error',
        title: 'Failed to update Simplified UI',
        message: error?.response?.data?.message || 'An unexpected error occurred',
      });
    } finally {
      setTogglingSimplifiedUi(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!userDetails) return;

    try {
      const payload: Record<string, unknown> = {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        phoneNumber: editForm.phoneNumber.trim() === '' ? '' : editForm.phoneNumber.trim(),
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (canSetSimplifiedUi && editForm.role === UserRole.FACILITY_ADMIN) {
        payload.simplifiedUi = editForm.simplifiedUi;
      }

      const response = await apiService.updateUser(userDetails.id, payload);

      if (response.success) {
        addToast({
          type: 'success',
          title: 'User updated successfully',
        });
        setEditing(false);
        await loadUserDetails();
      } else {
        addToast({
          type: 'error',
          title: 'Failed to update user',
          message: response.message || 'An unexpected error occurred'
        });
      }
    } catch (error: any) {
      console.error('Failed to update user:', error);
      addToast({
        type: 'error',
        title: 'Failed to update user',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userDetails) return;

    setDeletingUser(true);
    try {
      const response = await apiService.deactivateUser(userDetails.id);
      if (response.success) {
        addToast({
          type: 'success',
          title: 'User deactivated',
          message: 'Their access has been revoked. You can reactivate them later from this page or Add User.',
        });
        navigate('/users');
      } else {
        addToast({
          type: 'error',
          title: 'Failed to deactivate user',
          message: response.message || 'An unexpected error occurred'
        });
      }
    } catch (error: any) {
      console.error('Failed to deactivate user:', error);
      addToast({
        type: 'error',
        title: 'Failed to deactivate user',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    } finally {
      setDeletingUser(false);
      setDeleteUserModal(false);
    }
  };

  const handleActivateUser = async () => {
    if (!userDetails) return;

    setDeletingUser(true);
    try {
      const response = await apiService.activateUser(userDetails.id);
      if (response.success) {
        addToast({
          type: 'success',
          title: 'User activated',
          message: 'Their account is active again.',
        });
        await loadUserDetails();
      } else {
        addToast({
          type: 'error',
          title: 'Failed to activate user',
          message: response.message || 'An unexpected error occurred',
        });
      }
    } catch (error: any) {
      console.error('Failed to activate user:', error);
      addToast({
        type: 'error',
        title: 'Failed to activate user',
        message: error?.response?.data?.message || 'An unexpected error occurred',
      });
    } finally {
      setDeletingUser(false);
      setActivateUserModal(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case UserRole.DEV_ADMIN:
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case UserRole.FACILITY_ADMIN:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case UserRole.TENANT:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case UserRole.MAINTENANCE:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <DetailsPageShell>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-6"></div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </DetailsPageShell>
    );
  }

  if (error || !userDetails) {
    return (
      <DetailsPageNotFound
        title="Error loading user"
        message={error || 'User not found'}
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
      />
    );
  }

  const userTabs = [
    { key: 'summary', label: 'Summary', icon: UserIcon },
    { key: 'facilities', label: `Facilities (${userDetails.facilities.length})`, icon: BuildingOfficeIcon },
    ...(canViewDevices
      ? [{ key: 'devices', label: `Devices (${userDetails.devices.length})`, icon: DevicePhoneMobileIcon }]
      : []),
    ...(canManageUsersScope
      ? [{ key: 'invites', label: 'Invites & OTP', icon: PaperAirplaneIcon }]
      : []),
    ...(canViewRoutePasses
      ? [{ key: 'route-passes', label: 'Route Passes', icon: TicketIcon }]
      : []),
  ];

  return (
    <DetailsPageShell>
      <DetailsPageHeader
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
        title={`${userDetails.firstName} ${userDetails.lastName}`}
        subtitle={userDetails.email}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {userDetails.phoneNumber ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">{userDetails.phoneNumber}</span>
            ) : null}
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBadgeColor(userDetails.role)}`}>
              {userDetails.role}
            </span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              userDetails.isActive
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
              {userDetails.isActive ? 'Active' : 'Inactive'}
            </span>
            {userDetails.role === UserRole.FACILITY_ADMIN && (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  userDetails.simplifiedUi
                    ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {userDetails.simplifiedUi ? 'Simplified UI' : 'Advanced UI'}
              </span>
            )}
          </div>
        }
        actions={
          canManageUsersScope ? (
            <>
              <button
                onClick={() => {
                  setEditing(true);
                  setEditForm({
                    firstName: userDetails.firstName,
                    lastName: userDetails.lastName,
                    phoneNumber: userDetails.phoneNumber || '',
                    role: userDetails.role,
                    isActive: userDetails.isActive,
                    simplifiedUi: Boolean(userDetails.simplifiedUi),
                  });
                  setActiveTab('edit');
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <PencilIcon className="h-4 w-4 mr-2" />
                Edit
              </button>
              {userDetails.isActive ? (
                <button
                  onClick={() => setDeleteUserModal(true)}
                  disabled={userDetails.id === authState.user?.id}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <NoSymbolIcon className="h-4 w-4 mr-2" />
                  Deactivate
                </button>
              ) : (
                <button
                  onClick={() => setActivateUserModal(true)}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <CheckCircleIcon className="h-4 w-4 mr-2" />
                  Activate
                </button>
              )}
            </>
          ) : undefined
        }
      />

      <DetailsTabNav
        tabs={userTabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabType)}
      />

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {canSetSimplifiedUi && userDetails.role === UserRole.FACILITY_ADMIN && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                        Simplified UI
                      </h2>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-xl">
                        Hide advanced Facility Setup surfaces (Gateway, Access Groups, FMS configuration).
                        Does not change API permissions. Takes effect when this user refreshes their session.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(userDetails.simplifiedUi)}
                      aria-label="Simplified UI"
                      disabled={togglingSimplifiedUi}
                      onClick={() => void handleToggleSimplifiedUi(!userDetails.simplifiedUi)}
                      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 ${
                        userDetails.simplifiedUi
                          ? 'bg-primary-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                          userDetails.simplifiedUi ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mt-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Currently:{' '}
                    <span className="text-gray-900 dark:text-white">
                      {userDetails.simplifiedUi ? 'Simplified' : 'Advanced'}
                    </span>
                  </p>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">User Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Basic Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Full Name</label>
                        <p className="text-sm text-gray-900 dark:text-white">{userDetails.firstName} {userDetails.lastName}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</label>
                        <p className="text-sm text-gray-900 dark:text-white">{userDetails.email}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</label>
                        <p className="text-sm text-gray-900 dark:text-white">{userDetails.role}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</label>
                        <p className="text-sm text-gray-900 dark:text-white">{userDetails.isActive ? 'Active' : 'Inactive'}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Account Activity</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Login</label>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {userDetails.lastLogin ? formatDateTime(userDetails.lastLogin) : 'Never logged in'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account Created</label>
                        <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(userDetails.createdAt)}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Updated</label>
                        <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(userDetails.updatedAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Facilities Tab */}
          {activeTab === 'facilities' && (
            <div className="space-y-6">
              {canManageUsersScope && (userDetails.role === UserRole.ADMIN || userDetails.role === UserRole.DEV_ADMIN) ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                  <div className="text-gray-500 dark:text-gray-400 mb-2">
                    <BuildingOfficeIcon className="mx-auto h-12 w-12" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Global Access
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    This user has {userDetails.role === UserRole.DEV_ADMIN ? 'development admin' : 'global admin'} privileges and can access all facilities automatically.
                  </p>
                </div>
              ) : canManageUsersScope && userDetails.role === UserRole.FACILITY_ADMIN ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Manage Facility Access</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Choose which facilities this facility admin can manage. Route passes are rebuilt from current associations on each request (not from the login token).
                  </p>

                  <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                    {facilities.length > 0 ? (
                      <>
                        <label className="flex items-start space-x-3 p-3 rounded-lg border border-primary-200 dark:border-primary-700 bg-primary-50/70 dark:bg-primary-900/20 hover:bg-primary-100/70 dark:hover:bg-primary-900/30 cursor-pointer transition-colors duration-200">
                          <input
                            type="checkbox"
                            checked={selectedFacilityIds.length === facilities.length}
                            onChange={handleAllFacilitiesToggle}
                            className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              All Facilities
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Grant this user access to every facility in the system.
                            </div>
                          </div>
                        </label>
                        {facilities.map((facility) => {
                        const isChecked = selectedFacilityIds.includes(facility.id);
                        return (
                          <label
                            key={facility.id}
                            className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-200"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleFacilityToggle(facility.id)}
                              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                            />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {facility.name}
                            </div>
                            {facility.description && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {facility.description}
                              </div>
                            )}
                          </div>
                        </label>
                        );
                        })}
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1 mt-2">
                          No Facilities Available
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Create facilities first before assigning users to them.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Selected:</strong> {selectedFacilityIds.length} of {facilities.length} facilities
                    </div>
                    <button
                      onClick={handleUpdateFacilities}
                      disabled={updatingFacilities || JSON.stringify([...selectedFacilityIds].sort()) === JSON.stringify([...initialFacilityIds].sort())}
                      className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updatingFacilities ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Updating...
                        </>
                      ) : (
                        'Update Assignments'
                      )}
                    </button>
                  </div>
                </div>
              ) : canManageUsersScope && (userDetails.role === UserRole.TENANT || userDetails.role === UserRole.MAINTENANCE) ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Facility Access</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {userDetails.role === UserRole.TENANT ? 'Tenants' : 'Maintenance users'} receive facility access automatically through unit assignments and key sharing. Route passes include only the locks they can actually use.
                  </p>
                </div>
              ) : null}

              {/* Display assigned facilities */}
              {userDetails.facilities.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assigned Facilities</h3>
                  {userDetails.facilities.map((facility) => {
                    const facilityId = facility.facility_id || facility.id;
                    const facilityName = facility.facility_name || facility.name;
                    const facilityAccessControlDevices = (userDetails.accessControlDevices || [])
                      .filter((device) => device.facility_id === facilityId);
                    return (
                      <div key={facilityId} className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/facilities/${facilityId}`, {
                                      state: withReturnPath(location),
                                    });
                                  }}
                                  className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline flex items-center"
                                >
                                  {facilityName}
                                  <LinkIcon className="h-4 w-4 ml-1" />
                                </button>
                              </h3>
                              {(facility.facility_address || facility.address) && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">{facility.facility_address || facility.address}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-6">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Assigned Units ({facility.units.length})</h4>
                          {facility.units.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No units assigned in this facility.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {facility.units.map((unit) => (
                                <div key={unit.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/units/${unit.id}`, {
                                              state: withReturnPath(location),
                                            });
                                          }}
                                          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline flex items-center"
                                        >
                                          Unit {unit.unitNumber}
                                          <LinkIcon className="h-3 w-3 ml-1" />
                                        </button>
                                        {unit.unitType && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400">{unit.unitType}</p>
                                        )}
                                      </div>
                                      {unit.isPrimary && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                          Primary
                                        </span>
                                      )}
                                    </div>
                                    {unit.device && (
                                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Device</p>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/devices/${unit.device!.id}`, {
                                                  state: withReturnPath(location),
                                                });
                                              }}
                                              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline flex items-center mt-1"
                                            >
                                              {unit.device.device_serial}
                                              <LinkIcon className="h-3 w-3 ml-1" />
                                            </button>
                                          </div>
                                          <div className="text-right">
                                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                              unit.device.device_status === 'online'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : unit.device.device_status === 'low_battery'
                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                            }`}>
                                              {unit.device.device_status || 'offline'}
                                            </span>
                                          </div>
                                        </div>
                                        {unit.device.battery_level !== undefined && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Battery: {unit.device.battery_level}%
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                              Access Control Devices ({facilityAccessControlDevices.length})
                            </h4>
                            {facilityAccessControlDevices.length === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                No app-entry access control devices for this facility.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {facilityAccessControlDevices.map((device) => (
                                  <div key={device.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{device.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {device.device_type}{device.location_description ? ` • ${device.location_description}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {(device.access_methods || []).map((method) => (
                                          <span
                                            key={`${device.id}-${method}`}
                                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 uppercase"
                                          >
                                            {method}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    {device.codes && device.codes.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        {device.codes.map((codeEntry) => (
                                          <div
                                            key={`${device.id}-${codeEntry.code}-${codeEntry.schedule_id || 'default'}`}
                                            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {codeEntry.code}
                                              </span>
                                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {codeEntry.schedule_name || 'Always'}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {userDetails.facilities.length === 0 && !canManageUsersScope && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                  <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Facilities Assigned</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    This user has not been assigned access to any facilities.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Edit Tab */}
          {activeTab === 'edit' && canManageUsersScope && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Edit User</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Phone number <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="E.164 or 10-digit US"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Clear the field to remove the phone number from this account.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setEditForm({
                        ...editForm,
                        role,
                        simplifiedUi: role === UserRole.FACILITY_ADMIN ? editForm.simplifiedUi : false,
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value={UserRole.TENANT}>Tenant</option>
                    <option value={UserRole.FACILITY_ADMIN}>Facility Admin</option>
                    <option value={UserRole.MAINTENANCE}>Maintenance</option>
                    <option value={UserRole.BLULOK_TECHNICIAN}>BluLok Technician</option>
                    {authState.user?.role === UserRole.DEV_ADMIN && (
                      <>
                        <option value={UserRole.ADMIN}>Admin</option>
                        <option value={UserRole.DEV_ADMIN}>Dev Admin</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                </div>
                {canSetSimplifiedUi && editForm.role === UserRole.FACILITY_ADMIN && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Simplified UI</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          Same as the Summary toggle — saved with this form or instantly from Summary.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editForm.simplifiedUi}
                        aria-label="Simplified UI"
                        onClick={() =>
                          setEditForm({ ...editForm, simplifiedUi: !editForm.simplifiedUi })
                        }
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                          editForm.simplifiedUi
                            ? 'bg-primary-600'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            editForm.simplifiedUi ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setActiveTab('summary');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Devices Tab (Dev Admin Only) */}
          {activeTab === 'devices' && canViewDevices && (
            <div className="space-y-6">
              {userDetails.devices.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                  <DevicePhoneMobileIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Devices Registered</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    This user has not registered any mobile devices.
                  </p>
                </div>
              ) : (
                userDetails.devices.map((device) => (
                  <div key={device.id} className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {device.device_name || 'Unnamed Device'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDevicePlatform(device.platform)} • ID: {device.app_device_id}
                        </p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          device.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {device.status}
                        </span>
                        {canDeleteDevices && (
                          <button
                            onClick={() => handleDeleteDevice(device)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                            title="Delete device"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Public Key</label>
                          <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                            <code className="text-xs text-gray-900 dark:text-gray-100 break-all">
                              {device.public_key}
                            </code>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Used</label>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {device.last_used_at ? formatDateTime(device.last_used_at) : 'Never'}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Registered</label>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {formatDateTime(device.created_at)}
                          </p>
                        </div>
                        {device.associatedLocks.length > 0 && (
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Associated Locks ({device.associatedLocks.length})</label>
                            <div className="mt-2 space-y-2">
                              {device.associatedLocks.map((lock) => (
                                <div key={lock.lock_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                                  <div className="flex items-center space-x-3">
                                    <KeyIcon className="h-4 w-4 text-gray-400" />
                                    <div>
                                      <p className="text-sm text-gray-900 dark:text-white">
                                        {lock.facility_name} - Unit {lock.unit_number}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Serial: {lock.device_serial}
                                      </p>
                                    </div>
                                  </div>
                                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${formatKeyStatus(lock.key_status).color}`}>
                                    {formatKeyStatus(lock.key_status).text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Invites & OTP Tab (Admin/Facility Admin/Dev Admin Only) */}
          {activeTab === 'invites' && canManageUsersScope && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Invites & OTP Management</h2>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">User Status</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {userDetails.isActive ? 'Active account' : 'Inactive account'}
                    </p>
                    {userDetails.lastLogin ? (
                      <div className="mt-2 flex items-center space-x-2">
                        <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                          Account setup complete - Last login: {formatDateTime(userDetails.lastLogin)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center space-x-2">
                        <ClockIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                          Account setup pending - No login recorded
                        </span>
                      </div>
                    )}
                  </div>
                  {!userDetails.lastLogin && (
                    <button
                      onClick={async () => {
                        try {
                          const response = await apiService.resendUserInvite(userId!);
                          if (response.success) {
                            addToast({ type: 'success', title: 'Invite resent successfully' });
                          } else {
                            addToast({ type: 'error', title: 'Failed to resend invite' });
                          }
                        } catch (error) {
                          console.error('Failed to resend invite:', error);
                          addToast({ type: 'error', title: 'An error occurred while resending invite' });
                        }
                      }}
                      className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                      Resend Invite
                    </button>
                  )}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <ClockIcon className="h-4 w-4 mr-2" />
                    <span>
                      {userDetails.lastLogin 
                        ? 'This user has already set up their account. Invites cannot be resent for active accounts.'
                        : 'Invites are sent automatically when users are created via FMS sync. The resend button invalidates any previous invites and sends a new one.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Route Passes Tab (Dev Admin Only) */}
          {activeTab === 'route-passes' && canViewRoutePasses && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Route Pass History</h2>

              {/* Filters */}
              <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={routePassFilters.startDate}
                    onChange={(e) => {
                      setRoutePassFilters({ ...routePassFilters, startDate: e.target.value });
                      setRoutePassPagination({ ...routePassPagination, offset: 0 });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={routePassFilters.endDate}
                    onChange={(e) => {
                      setRoutePassFilters({ ...routePassFilters, endDate: e.target.value });
                      setRoutePassPagination({ ...routePassPagination, offset: 0 });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setRoutePassFilters({ startDate: '', endDate: '' });
                      setRoutePassPagination({ ...routePassPagination, offset: 0 });
                    }}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Table */}
              {routePassLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading route pass history...</p>
                </div>
              ) : routePassHistory.length === 0 ? (
                <div className="text-center py-8">
                  <TicketIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Route Passes Found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    This user has not been issued any route passes yet.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Issued At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Expires At
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Device ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Audiences
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {routePassHistory.map((pass) => (
                          <tr key={pass.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {formatDateTime(pass.issuedAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {formatDateTime(pass.expiresAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {pass.deviceId || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {Array.isArray(pass.audiences) ? pass.audiences.length : 0} locks
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                pass.isExpired
                                  ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                  : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              }`}>
                                {pass.isExpired ? 'Expired' : 'Active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {routePassPagination.total > 0 && (
                    <div className="mt-6 flex items-center justify-between">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        Showing {routePassPagination.offset + 1} to {Math.min(routePassPagination.offset + routePassPagination.limit, routePassPagination.total)} of {routePassPagination.total} entries
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            const newOffset = Math.max(0, routePassPagination.offset - routePassPagination.limit);
                            setRoutePassPagination({ ...routePassPagination, offset: newOffset });
                          }}
                          disabled={routePassPagination.offset === 0}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            const newOffset = routePassPagination.offset + routePassPagination.limit;
                            setRoutePassPagination({ ...routePassPagination, offset: newOffset });
                          }}
                          disabled={!routePassPagination.hasMore}
                          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Delete Device Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteDeviceModal.isOpen}
          onClose={() => setDeleteDeviceModal({ isOpen: false, device: null })}
          onConfirm={confirmDeleteDevice}
          title="Delete Device"
          message={
            deleteDeviceModal.device
              ? `Are you sure you want to delete the device "${deleteDeviceModal.device.device_name || 'Unnamed Device'}"? This will revoke all keys associated with this device from the locks it has access to. This action cannot be undone.`
              : ''
          }
          confirmText="Delete Device"
          variant="danger"
          isLoading={deletingDevice}
        />

        {/* Deactivate User Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteUserModal}
          onClose={() => setDeleteUserModal(false)}
          onConfirm={handleDeleteUser}
          title="Deactivate User"
          message={
            userDetails
              ? `Deactivate "${userDetails.firstName} ${userDetails.lastName}"? They will lose access immediately. You can reactivate them later from this page or via Add User.`
              : ''
          }
          confirmText="Deactivate User"
          variant="danger"
          isLoading={deletingUser}
        />

        {/* Activate User Confirmation Modal */}
        <ConfirmModal
          isOpen={activateUserModal}
          onClose={() => setActivateUserModal(false)}
          onConfirm={handleActivateUser}
          title="Activate User"
          message={
            userDetails
              ? `Activate "${userDetails.firstName} ${userDetails.lastName}"? They will be able to sign in and regain access according to their current assignments.`
              : ''
          }
          confirmText="Activate User"
          variant="info"
          isLoading={deletingUser}
        />
    </DetailsPageShell>
  );
}
