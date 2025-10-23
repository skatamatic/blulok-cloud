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
  ExclamationTriangleIcon
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
  name: string;
  address?: string;
  units: Unit[];
}

interface Unit {
  id: string;
  unitNumber: string;
  unitType?: string;
  isPrimary: boolean;
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

type TabType = 'summary' | 'facilities' | 'devices';

export default function UserDetailsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { authState } = useAuth();
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

  const canViewDevices = authState.user?.role === UserRole.DEV_ADMIN;

  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

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
              {userDetails.facilities.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                  <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Facilities Assigned</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    This user has not been assigned access to any facilities.
                  </p>
                </div>
              ) : (
                userDetails.facilities.map((facility) => (
                  <div key={facility.id} className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">{facility.name}</h3>
                      {facility.address && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{facility.address}</p>
                      )}
                    </div>
                    <div className="p-6">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Assigned Units ({facility.units.length})</h4>
                      {facility.units.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No units assigned in this facility.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {facility.units.map((unit) => (
                            <div key={unit.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                                    Unit {unit.unitNumber}
                                  </h5>
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
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
      </div>
    </div>
  );
}
