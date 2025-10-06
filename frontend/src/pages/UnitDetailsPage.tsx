import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlight } from '@/hooks/useHighlight';
import { 
  ArrowLeftIcon,
  HomeIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CalendarIcon,
  CpuChipIcon,
  BuildingOfficeIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';

interface UnitDetails {
  id: string;
  unit_number: string;
  unit_type: string;
  size_sqft: number;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  facility_id: string;
  facility_name: string;
  blulok_device?: {
    id: string;
    device_serial: string;
    firmware_version?: string;
    lock_status: 'locked' | 'unlocked' | 'error' | 'maintenance';
    device_status: 'online' | 'offline' | 'low_battery' | 'error';
    battery_level?: number;
    last_activity?: Date;
    last_seen?: Date;
  };
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  created_at: Date;
  updated_at: Date;
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

  const canViewDevices = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    if (unitId) {
      loadUnitDetails();
    }
  }, [unitId]);

  // Handle highlighting when page loads
  useHighlight(unit ? [unit] : [], (unit) => unit.id, (id) => generateHighlightId('unit', id));

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

  const handleBack = () => {
    navigate('/units');
  };

  const handleViewFacility = () => {
    if (unit?.facility_id) {
      navigate(`/facilities?highlight=${unit.facility_id}`);
    }
  };

  const handleViewDevice = () => {
    if (unit?.blulok_device?.id) {
      navigate(`/devices?highlight=${unit.blulok_device.id}`);
    }
  };

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
  const DeviceStatusIcon = unit.blulok_device?.device_status === 'online' ? CheckCircleIcon : ExclamationTriangleIcon;
  const LockStatusIcon = unit.blulok_device?.lock_status === 'locked' ? LockClosedIcon : CheckCircleIcon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Units
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Unit {unit.unit_number}
              </h1>
              <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                {unit.facility_name}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[unit.status]}`}>
                <StatusIcon className="h-4 w-4 mr-2" />
                {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Unit Information */}
            <div id={generateHighlightId('unit', unit.id)} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Unit Information</h2>
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
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Size</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">{unit.size_sqft} sq ft</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Device Information */}
            {unit.blulok_device && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">BluLok Device</h2>
                  {canViewDevices && (
                    <button
                      onClick={handleViewDevice}
                      className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      <CpuChipIcon className="h-4 w-4 mr-1" />
                      View Device Details
                      <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Serial</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{unit.blulok_device.device_serial}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Firmware Version</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{unit.blulok_device.firmware_version || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Device Status</label>
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${deviceStatusColors[unit.blulok_device.device_status]}`}>
                        <DeviceStatusIcon className="h-3 w-3 mr-1" />
                        {unit.blulok_device.device_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Lock Status</label>
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${lockStatusColors[unit.blulok_device.lock_status]}`}>
                        <LockStatusIcon className="h-3 w-3 mr-1" />
                        {unit.blulok_device.lock_status.charAt(0).toUpperCase() + unit.blulok_device.lock_status.slice(1)}
                      </span>
                    </div>
                  </div>
                  {unit.blulok_device.battery_level !== undefined && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Battery Level</label>
                      <div className="mt-1 flex items-center">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                          <div 
                            className={`h-2 rounded-full ${
                              unit.blulok_device.battery_level > 50 ? 'bg-green-500' : 
                              unit.blulok_device.battery_level > 20 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${unit.blulok_device.battery_level}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-900 dark:text-white">{unit.blulok_device.battery_level}%</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Last Activity</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                      {unit.blulok_device.last_activity ? new Date(unit.blulok_device.last_activity).toLocaleString() : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tenant Information */}
            {unit.primary_tenant && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Primary Tenant</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Name</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                      {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{unit.primary_tenant.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={handleViewFacility}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <BuildingOfficeIcon className="h-4 w-4 mr-2" />
                  View Facility
                </button>
                {canViewDevices && unit.blulok_device && (
                  <button
                    onClick={handleViewDevice}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    <CpuChipIcon className="h-4 w-4 mr-2" />
                    View Device
                  </button>
                )}
              </div>
            </div>

            {/* Unit Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Details</h3>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Created: {new Date(unit.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Updated: {new Date(unit.updated_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



