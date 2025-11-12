import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import {
  ArrowLeftIcon,
  UserIcon,
  BuildingOfficeIcon,
  DevicePhoneMobileIcon,
  KeyIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  PaperAirplaneIcon,
  PencilIcon,
  CheckCircleIcon,
  LinkIcon,
  TicketIcon
} from '@heroicons/react/24/outline';

interface UserDetails {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  facilities: Facility[];
  devices: UserDevice[];
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

type TabType = 'summary' | 'facilities' | 'devices' | 'invites' | 'route-passes' | 'edit';

export default function UserDetailsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { authState, canManageUsers } = useAuth();
  const { addToast } = useToast();

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
  const [deletingUser, setDeletingUser] = useState(false);
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [initialFacilityIds, setInitialFacilityIds] = useState<string[]>([]);
  const [updatingFacilities, setUpdatingFacilities] = useState(false);
  const [_editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    role: '' as UserRole | '',
    isActive: true
  });

  const canViewDevices = authState.user?.role === UserRole.DEV_ADMIN;
  const canViewRoutePasses = authState.user?.role === UserRole.DEV_ADMIN;

  const [routePassHistory, setRoutePassHistory] = useState<any[]>([]);
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
    if (userDetails && canManageUsers()) {
      loadFacilities();
      // Set current user's facilities (use facility_id if available, otherwise id)
      const currentFacilityIds = userDetails.facilities.map(f => f.facility_id || f.id);
      setSelectedFacilityIds(currentFacilityIds);
      setInitialFacilityIds(currentFacilityIds);
    }
  }, [userDetails]);

  useEffect(() => {
    if (userId && activeTab === 'route-passes' && canViewRoutePasses) {
      loadRoutePassHistory();
    }
  }, [userId, activeTab, routePassFilters]);

  const loadRoutePassHistory = async () => {
    if (!userId) return;
    try {
      setRoutePassLoading(true);
      const filters: any = {
        limit: routePassPagination.limit,
        offset: routePassPagination.offset,
      };
      if (routePassFilters.startDate) filters.startDate = routePassFilters.startDate;
      if (routePassFilters.endDate) filters.endDate = routePassFilters.endDate;
      
      const response = await apiService.getUserRoutePassHistory(userId, filters);
      if (response.success) {
        setRoutePassHistory(response.data || []);
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

  const handleSaveEdit = async () => {
    if (!userDetails) return;

    try {
      const response = await apiService.updateUser(userDetails.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        role: editForm.role,
        isActive: editForm.isActive
      });

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
          title: 'User deleted successfully',
        });
        navigate('/users');
      } else {
        addToast({
          type: 'error',
          title: 'Failed to delete user',
          message: response.message || 'An unexpected error occurred'
        });
      }
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      addToast({
        type: 'error',
        title: 'Failed to delete user',
        message: error?.response?.data?.message || 'An unexpected error occurred'
      });
    } finally {
      setDeletingUser(false);
      setDeleteUserModal(false);
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-6"></div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !userDetails) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Error Loading User Details</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{error}</p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/users')}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <ArrowLeftIcon className="mr-2 h-4 w-4" />
                  Back to Users
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/users')}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors mb-4"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to Users
          </button>
            <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {userDetails.firstName} {userDetails.lastName}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">{userDetails.email}</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getRoleBadgeColor(userDetails.role)}`}>
                {userDetails.role}
              </span>
              <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                userDetails.isActive
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {userDetails.isActive ? 'Active' : 'Inactive'}
              </span>
              {canManageUsers() && (
                <>
                  <button
                    onClick={() => {
                      setEditing(true);
                      setEditForm({
                        firstName: userDetails.firstName,
                        lastName: userDetails.lastName,
                        role: userDetails.role,
                        isActive: userDetails.isActive
                      });
                      setActiveTab('edit');
                    }}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteUserModal(true)}
                    disabled={userDetails.id === authState.user?.id}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('summary')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'summary'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <UserIcon className="mr-2 h-4 w-4 inline" />
                Summary
              </button>
              <button
                onClick={() => setActiveTab('facilities')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'facilities'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <BuildingOfficeIcon className="mr-2 h-4 w-4 inline" />
                Facilities ({userDetails.facilities.length})
              </button>
              {canViewDevices && (
                <button
                  onClick={() => setActiveTab('devices')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'devices'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <DevicePhoneMobileIcon className="mr-2 h-4 w-4 inline" />
                  Devices ({userDetails.devices.length})
                </button>
              )}
              {canManageUsers() && (
                <button
                  onClick={() => setActiveTab('invites')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'invites'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <PaperAirplaneIcon className="mr-2 h-4 w-4 inline" />
                  Invites & OTP
                </button>
              )}
              {canViewRoutePasses && (
                <button
                  onClick={() => setActiveTab('route-passes')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'route-passes'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <TicketIcon className="mr-2 h-4 w-4 inline" />
                  Route Passes
                </button>
              )}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
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
                        {userDetails.lastLogin ? new Date(userDetails.lastLogin).toLocaleString() : 'Never logged in'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account Created</label>
                      <p className="text-sm text-gray-900 dark:text-white">{new Date(userDetails.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Updated</label>
                      <p className="text-sm text-gray-900 dark:text-white">{new Date(userDetails.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Facilities Tab */}
          {activeTab === 'facilities' && (
            <div className="space-y-6">
              {canManageUsers() && (userDetails.role === UserRole.ADMIN || userDetails.role === UserRole.DEV_ADMIN) ? (
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
              ) : canManageUsers() ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Manage Facility Access</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Choose which facilities this user can access. Users without facility assignments will have no access.
                  </p>

                  <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                    {facilities.length > 0 ? (
                      facilities.map((facility) => {
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
                      })
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
              ) : null}

              {/* Display assigned facilities */}
              {userDetails.facilities.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assigned Facilities</h3>
                  {userDetails.facilities.map((facility) => {
                    const facilityId = facility.facility_id || facility.id;
                    const facilityName = facility.facility_name || facility.name;
                    return (
                      <div key={facilityId} className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/facilities/${facilityId}`);
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
                                            navigate(`/units/${unit.id}`);
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
                                                navigate(`/devices/${unit.device!.id}`);
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {userDetails.facilities.length === 0 && !canManageUsers() && (
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
          {activeTab === 'edit' && canManageUsers() && (
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
                    Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
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
                        <button
                          onClick={() => handleDeleteDevice(device)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Delete device"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
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
                            {device.last_used_at ? new Date(device.last_used_at).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Registered</label>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {new Date(device.created_at).toLocaleString()}
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
          {activeTab === 'invites' && canManageUsers() && (
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
                          Account setup complete - Last login: {new Date(userDetails.lastLogin).toLocaleString()}
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
                              {new Date(pass.issuedAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {new Date(pass.expiresAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {pass.deviceId}
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

        {/* Delete User Confirmation Modal */}
        <ConfirmModal
          isOpen={deleteUserModal}
          onClose={() => setDeleteUserModal(false)}
          onConfirm={handleDeleteUser}
          title="Delete User"
          message={
            userDetails
              ? `Are you sure you want to delete the user "${userDetails.firstName} ${userDetails.lastName}"? This will deactivate their account and revoke all access. This action cannot be undone.`
              : ''
          }
          confirmText="Delete User"
          variant="danger"
          isLoading={deletingUser}
        />
      </div>
    </div>
  );
}
