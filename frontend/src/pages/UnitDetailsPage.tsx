import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { UserFilter } from '@/components/Common/UserFilter';
import { EditUnitModal } from '@/components/Units/EditUnitModal';
import { 
  ArrowLeftIcon,
  HomeIcon,
  UserIcon,
  CpuChipIcon,
  LockClosedIcon,
  LockOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  Battery50Icon,
  Battery100Icon,
  BoltIcon
} from '@heroicons/react/24/outline';

interface UnitDetails {
  id: string;
  unit_number: string;
  unit_type: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  facility_id: string;
  facility_name: string;
  facility_address: string;
  description?: string;
  features?: string[];
  blulok_device?: {
    id: string;
    device_serial: string;
    firmware_version?: string;
    lock_status: 'locked' | 'unlocked' | 'error' | 'maintenance';
    device_status: 'online' | 'offline' | 'low_battery' | 'error';
    battery_level?: number;
    last_activity?: string;
    last_seen?: string;
  };
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  shared_tenants?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    access_type: 'full' | 'shared' | 'temporary';
    access_granted_at: string;
    access_expires_at?: string;
  }>;
  created_at: string;
  updated_at: string;
}

const statusColors = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
};

const statusIcons = {
  available: CheckCircleIcon,
  occupied: HomeIcon,
  maintenance: WrenchScrewdriverIcon,
  reserved: ClockIcon
};

const deviceStatusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
};

const lockStatusColors = {
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
};


export default function UnitDetailsPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [unit, setUnit] = useState<UnitDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tenant' | 'device'>('overview');

  // Handle tab from URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['overview', 'tenant', 'device'].includes(tabParam)) {
      setActiveTab(tabParam as 'overview' | 'tenant' | 'device');
    }
  }, []);
  const [assigningTenant, setAssigningTenant] = useState(false);
  const [removingTenant, setRemovingTenant] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPrimaryTenant, setSelectedPrimaryTenant] = useState<string>('');
  const [selectedSharedTenant, setSelectedSharedTenant] = useState<string>('');
  const [showPrimaryTenantChange, setShowPrimaryTenantChange] = useState(false);

  const canManageUnits = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const canChangePrimaryTenant = canManageUnits; // Only admins can change primary tenant
  const isPrimaryTenant = unit?.primary_tenant?.id === authState.user?.id;
  const canManageSharedAccess = canManageUnits || isPrimaryTenant; // Admins or primary tenant can manage shared access

  useEffect(() => {
    if (unitId) {
      loadUnitDetails();
    }
  }, [unitId]);

  const loadUnitDetails = async () => {
    if (!unitId) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getUnitDetails(unitId);
      setUnit(response.unit);
    } catch (error) {
      console.error('Failed to load unit details:', error);
      setError('Failed to load unit details. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleAssignTenant = async (tenantId: string, isPrimary: boolean) => {
    if (!unitId) return;

    try {
      setAssigningTenant(true);
      await apiService.assignTenantToUnit(unitId, tenantId, isPrimary);
      await loadUnitDetails(); // Refresh unit data
      
      // Show success notification (you can add a toast notification here)
      console.log(`Tenant ${isPrimary ? 'assigned as primary' : 'granted shared access'} successfully`);
    } catch (error: any) {
      console.error('Failed to assign tenant:', error);
      // Show error notification
      const errorMessage = error.response?.data?.message || 'Failed to assign tenant. Please try again.';
      alert(errorMessage); // Replace with toast notification in production
    } finally {
      setAssigningTenant(false);
    }
  };

  const handleRemoveTenant = async (tenantId: string) => {
    if (!unitId) return;

    try {
      setRemovingTenant(tenantId);
      await apiService.removeTenantFromUnit(unitId, tenantId);
      await loadUnitDetails(); // Refresh unit data
      
      // Show success notification
      console.log('Tenant access removed successfully');
    } catch (error: any) {
      console.error('Failed to remove tenant:', error);
      // Show error notification
      const errorMessage = error.response?.data?.message || 'Failed to remove tenant. Please try again.';
      alert(errorMessage); // Replace with toast notification in production
    } finally {
      setRemovingTenant(null);
    }
  };

  const handleBack = () => {
    navigate('/units');
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: HomeIcon },
    { key: 'tenant', label: 'Tenant', icon: UserIcon },
    { key: 'device', label: 'Device', icon: CpuChipIcon },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Unit not found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {error || 'The unit you are looking for does not exist or you do not have access to it.'}
            </p>
            <div className="mt-6">
              <button
                onClick={handleBack}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Units
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const StatusIcon = statusIcons[unit.status];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
                className="inline-flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
                <ArrowLeftIcon className="h-5 w-5 mr-1" />
            Back to Units
          </button>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
              <Link
                to={`/facilities/${unit.facility_id}`}
                className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                {unit.facility_name}
              </Link>
            </div>
            {canManageUnits && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <PencilIcon className="h-4 w-4 mr-2" />
                  Edit Unit
                </button>
              </div>
            )}
          </div>

          {/* Unit Title */}
          <div className="mt-6">
            <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
                <StatusIcon className="h-8 w-8 text-gray-400" />
            <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{unit.unit_number}</h1>
                  <p className="text-lg text-gray-600 dark:text-gray-400 capitalize">{unit.unit_type}</p>
                </div>
            </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[unit.status]}`}>
                <StatusIcon className="h-4 w-4 mr-2" />
                {unit.status}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-visible">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.key
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mr-3 ${
                      activeTab === tab.key ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                    }`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Unit Number</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">{unit.unit_number}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Unit Type</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white capitalize">{unit.unit_type}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Unit Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${unit.primary_tenant ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'}`}>
                      {unit.primary_tenant ? 'Occupied' : 'Unoccupied'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${unit.blulok_device ? deviceStatusColors[unit.blulok_device.device_status as keyof typeof deviceStatusColors] : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'}`}>
                      {unit.blulok_device ? (
                        <>
                          {unit.blulok_device.device_status}
                          {unit.blulok_device.lock_status && (
                            <span className="ml-1">
                              ({unit.blulok_device.lock_status})
                            </span>
                          )}
                        </>
                      ) : 'No Device'}
                    </span>
                  </div>
                </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Facility</label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        <Link
                          to={`/facilities/${unit.facility_id}`}
                          className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
                        >
                          {unit.facility_name}
                        </Link>
                      </p>
                </div>
              </div>
            </div>

                {/* Sync Information */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    Added manually on {new Date(unit.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Description */}
                {unit.description && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Description</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{unit.description}</p>
                  </div>
                )}

                {/* Features */}
                {unit.features && unit.features.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Features</h3>
                    <div className="flex flex-wrap gap-2">
                      {unit.features.map((feature, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Device Status */}
                {unit.blulok_device && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Device Status</h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Serial</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{unit.blulok_device.device_serial}</p>
                  </div>
                  <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Lock Status</label>
                    <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${lockStatusColors[unit.blulok_device.lock_status as keyof typeof lockStatusColors]}`}>
                              {unit.blulok_device.lock_status === 'locked' ? <LockClosedIcon className="h-3 w-3 mr-1" /> : <LockOpenIcon className="h-3 w-3 mr-1" />}
                              {unit.blulok_device.lock_status}
                      </span>
                    </div>
                  </div>
                  <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Status</label>
                    <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${deviceStatusColors[unit.blulok_device.device_status as keyof typeof deviceStatusColors]}`}>
                              {unit.blulok_device.device_status === 'online' ? <CheckCircleIcon className="h-3 w-3 mr-1" /> : <ExclamationTriangleIcon className="h-3 w-3 mr-1" />}
                              {unit.blulok_device.device_status}
                      </span>
                    </div>
                  </div>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* Tenant Tab */}
            {activeTab === 'tenant' && (
              <div className="space-y-8">
                {/* Primary Tenant */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Primary Tenant</h3>
                    {canChangePrimaryTenant && unit.primary_tenant && !showPrimaryTenantChange && (
                      <button
                        onClick={() => setShowPrimaryTenantChange(true)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <PencilIcon className="h-4 w-4 mr-1" />
                        Change Primary
                      </button>
                    )}
                  </div>

                  {unit.primary_tenant ? (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-lg">
                              {unit.primary_tenant.first_name[0]}{unit.primary_tenant.last_name[0]}
                            </span>
                          </div>
                        </div>
                  <div>
                          <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                            {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{unit.primary_tenant.email}</p>
                  </div>
                </div>
              </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No primary tenant</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This unit is currently unassigned.</p>
                    </div>
                  )}

                  {/* Change Primary Tenant Form */}
                  {canChangePrimaryTenant && showPrimaryTenantChange && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                  <div>
                          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200">
                            {unit.primary_tenant ? 'Change Primary Tenant' : 'Assign Primary Tenant'}
                          </h4>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            Search for a tenant below and click Apply to {unit.primary_tenant ? 'change' : 'assign'} the primary tenant.
                    </p>
                  </div>
                        <button
                          onClick={() => {
                            setShowPrimaryTenantChange(false);
                            setSelectedPrimaryTenant('');
                          }}
                          className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="relative">
                        <UserFilter
                          value={selectedPrimaryTenant}
                          onChange={setSelectedPrimaryTenant}
                          placeholder="Search for tenant..."
                          className="w-full"
                          facilityId={unit.facility_id}
                          roleFilter="tenant"
                        />
                      </div>
                      <div className="mt-3 flex justify-end space-x-2">
                        <button
                          onClick={() => {
                            setShowPrimaryTenantChange(false);
                            setSelectedPrimaryTenant('');
                          }}
                          className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (selectedPrimaryTenant) {
                              handleAssignTenant(selectedPrimaryTenant, true);
                              setShowPrimaryTenantChange(false);
                              setSelectedPrimaryTenant('');
                            }
                          }}
                          disabled={!selectedPrimaryTenant || assigningTenant}
                          className="px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {assigningTenant ? 'Applying...' : 'Apply Change'}
                        </button>
                </div>
              </div>
            )}
          </div>

                {/* Shared Keys/Access */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">Shared Access</h3>
                      {canManageSharedAccess && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Share access with up to 4 additional tenants
                        </p>
                      )}
                    </div>
                    {canManageSharedAccess && unit.primary_tenant && (!unit.shared_tenants || unit.shared_tenants.length < 4) && (
                <button
                        onClick={() => setSelectedSharedTenant('')}
                        className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                >
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Add Shared Access
                </button>
                    )}
                  </div>

                  {unit.shared_tenants && unit.shared_tenants.length > 0 ? (
                    <div className="space-y-3">
                      {unit.shared_tenants.map((tenant, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                                  <span className="text-white font-medium text-sm">
                                    {tenant.first_name[0]}{tenant.last_name[0]}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {tenant.first_name} {tenant.last_name}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{tenant.email}</p>
                              </div>
                            </div>
                            {canManageSharedAccess && (
                  <button
                                onClick={() => handleRemoveTenant(tenant.id)}
                                disabled={removingTenant === tenant.id}
                                className="inline-flex items-center px-2 py-1 border border-red-300 dark:border-red-600 rounded text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {removingTenant === tenant.id ? (
                                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <XMarkIcon className="h-4 w-4 mr-1" />
                                    Remove
                                  </>
                                )}
                  </button>
                )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <KeyIcon className="mx-auto h-10 w-10 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No shared access</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {canManageSharedAccess 
                          ? 'No additional tenants have access to this unit.' 
                          : 'Only the primary tenant can access this unit.'}
                      </p>
                    </div>
                  )}

                  {/* Add Shared Access Form */}
                  {canManageSharedAccess && unit.primary_tenant && selectedSharedTenant === '' && (!unit.shared_tenants || unit.shared_tenants.length < 4) && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-medium text-green-900 dark:text-green-200 flex items-center">
                            <PlusIcon className="h-4 w-4 mr-1" />
                            Add Shared Access
                          </h4>
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                            Search for a tenant below and click Add to grant them access.
                            {unit.shared_tenants && ` (${4 - unit.shared_tenants.length} slot${4 - unit.shared_tenants.length !== 1 ? 's' : ''} remaining)`}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedSharedTenant(' ')} // Use space to hide form
                          className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="relative z-10">
                        <UserFilter
                          value=""
                          onChange={(tenantId) => {
                            if (tenantId) {
                              setSelectedSharedTenant(tenantId);
                            }
                          }}
                          placeholder="Search for tenant..."
                          className="w-full"
                          facilityId={unit.facility_id}
                          roleFilter="tenant"
                        />
                      </div>
                      {selectedSharedTenant && selectedSharedTenant !== '' && selectedSharedTenant !== ' ' && (
                        <div className="mt-3 flex justify-end space-x-2">
                          <button
                            onClick={() => setSelectedSharedTenant('')}
                            className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              handleAssignTenant(selectedSharedTenant, false);
                              setSelectedSharedTenant(' '); // Hide form after adding
                            }}
                            disabled={assigningTenant}
                            className="px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {assigningTenant ? 'Adding...' : 'Add Access'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Max limit reached message */}
                  {canManageSharedAccess && unit.primary_tenant && unit.shared_tenants && unit.shared_tenants.length >= 4 && (
                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Maximum shared access limit reached (4 tenants). Remove a tenant to add another.
                      </p>
                    </div>
                  )}

                  {/* No primary tenant message */}
                  {!unit.primary_tenant && canManageSharedAccess && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        Assign a primary tenant before adding shared access.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Device Tab */}
            {activeTab === 'device' && (
              <div className="space-y-8">
                {unit.blulok_device ? (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Device Information</h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Serial</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{unit.blulok_device.device_serial}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Firmware Version</label>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">{unit.blulok_device.firmware_version || 'Unknown'}</p>
                  </div>
                  <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Battery Level</label>
                          <div className="mt-1 flex items-center space-x-2">
                            {unit.blulok_device.battery_level !== null && unit.blulok_device.battery_level !== undefined && (
                              <>
                                {unit.blulok_device.battery_level >= 50 ? (
                                  <Battery100Icon className="h-4 w-4 text-green-500" />
                                ) : unit.blulok_device.battery_level >= 20 ? (
                                  <Battery50Icon className="h-4 w-4 text-yellow-500" />
                                ) : (
                                  <BoltIcon className="h-4 w-4 text-red-500" />
                                )}
                                <span className="text-sm text-gray-900 dark:text-white">{unit.blulok_device.battery_level}%</span>
                              </>
                            )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Lock Status</label>
                    <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${lockStatusColors[unit.blulok_device.lock_status as keyof typeof lockStatusColors]}`}>
                              {unit.blulok_device.lock_status === 'locked' ? <LockClosedIcon className="h-3 w-3 mr-1" /> : <LockOpenIcon className="h-3 w-3 mr-1" />}
                              {unit.blulok_device.lock_status}
                      </span>
                    </div>
                  </div>
                    <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Status</label>
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${deviceStatusColors[unit.blulok_device.device_status as keyof typeof deviceStatusColors]}`}>
                              {unit.blulok_device.device_status === 'online' ? <CheckCircleIcon className="h-3 w-3 mr-1" /> : <ExclamationTriangleIcon className="h-3 w-3 mr-1" />}
                              {unit.blulok_device.device_status}
                            </span>
                      </div>
                    </div>
                  <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Last Seen</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                            {unit.blulok_device.last_seen ? new Date(unit.blulok_device.last_seen).toLocaleString() : 'Never'}
                    </p>
              </div>
            </div>

                      {/* Device Actions */}
                      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between">
                  <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Device Controls</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Manage lock status and device settings</p>
                </div>
                          <div className="flex items-center space-x-3">
                            {canManageUnits && (
                              <>
                                <button className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                                  Refresh Status
                </button>
                                <Link
                                  to={`/devices?highlight=${unit.blulok_device.id}`}
                                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                  >
                    <CpuChipIcon className="h-4 w-4 mr-2" />
                                  View Device Details
                                </Link>
                              </>
                )}
                </div>
              </div>
            </div>
          </div>
            </div>
                ) : (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Device Assignment</h3>
                    <div className="text-center py-12">
                      <CpuChipIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No device assigned</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This unit does not have a BluLok device assigned to it.</p>
                      {canManageUnits && (
                        <div className="mt-6">
                          <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Assign Device
                </button>
                        </div>
                )}
              </div>
            </div>
                )}
                </div>
            )}
        </div>
      </div>
      </div>

      {/* Edit Unit Modal */}
      <EditUnitModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false);
          loadUnitDetails(); // Refresh unit data
        }}
        unit={unit}
      />
    </div>
  );
}

