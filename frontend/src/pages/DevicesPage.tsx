import { useState, useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlightWithPagination } from '@/hooks/useHighlightWithPagination';
import { navigateAndHighlight, calculatePageForItem } from '@/utils/navigation.utils';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { 
  ServerIcon,
  FunnelIcon,
  BoltIcon,
  CubeIcon,
  KeyIcon,
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  UserIcon,
  EyeIcon,
  ArrowTopRightOnSquareIcon,
  HomeIcon,
  Squares2X2Icon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessControlDevice, BluLokDevice, DeviceFilters } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';

const statusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
};

const deviceTypeIcons = {
  gate: BoltIcon,
  elevator: CubeIcon,
  door: KeyIcon,
  blulok: LockClosedIcon
};

const statusIcons = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
  maintenance: WrenchScrewdriverIcon,
  low_battery: ExclamationTriangleIcon
};

interface DevicesPageProps {
  initialCommandQueue?: { items: any[]; total: number };
}

export default function DevicesPage({ initialCommandQueue }: DevicesPageProps = {}) {
  const ws = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { authState } = useAuth();
  const [devices, setDevices] = useState<(AccessControlDevice & { device_category: string } | BluLokDevice & { device_category: string })[]>([]);
  const [allDevices, setAllDevices] = useState<(AccessControlDevice & { device_category: string } | BluLokDevice & { device_category: string })[]>([]); // Store full dataset for pagination calculations
  const [loading, setLoading] = useState(true);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [selectedDeviceType, setSelectedDeviceType] = useState<'access_control' | 'blulok'>('access_control');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState<DeviceFilters>({
    search: '',
    device_type: 'all',
    status: '',
    sortBy: 'name',
    sortOrder: 'asc',
    facility_id: location.state?.facilityFilter || '',
    limit: 30,
    offset: 0
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'grid' | 'list' | 'commands'>(initialCommandQueue ? 'commands' : 'grid');
  const [commandQueue, setCommandQueue] = useState<{ items: any[]; total: number } | null>(initialCommandQueue || null);
  const [cmdFilters, setCmdFilters] = useState<{ status: string }>({ status: '' });

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    loadDevices();
  }, [filters, currentPage]);

  // Command queue subscription
  useEffect(() => {
    if (activeTab !== 'commands') return;
    const subId = ws.subscribe('command_queue', (data: any) => {
      setCommandQueue({ items: data.items || [], total: data.total || 0 });
    });
    // initial fetch
    apiService.getCommandQueue({ status: cmdFilters.status || undefined }).then(data => setCommandQueue({ items: data.items || [], total: data.total || 0 })).catch(() => {});
    return () => {
      if (subId) ws.unsubscribe(subId);
    };
  }, [activeTab, cmdFilters.status]);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const queryFilters = {
        ...filters,
        offset: (currentPage - 1) * (filters.limit || 30),
      };
      const response = await apiService.getDevices(queryFilters);
      setDevices(response.devices || []);
      setTotal(response.total || 0);
      setTotalPages(Math.ceil((response.total || 0) / (filters.limit || 30)));

      // Also load full dataset for pagination calculations
      try {
        const fullDatasetFilters = {
          ...filters,
          // Remove pagination parameters to get all data
          offset: undefined,
          limit: undefined
        };
        
        const fullResponse = await apiService.getDevices(fullDatasetFilters);
        setAllDevices(fullResponse.devices || []);
      } catch (error) {
        console.warn('Failed to load full dataset for pagination:', error);
        // Fallback to current page data
        setAllDevices(response.devices || []);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setCurrentPage(1);
  };

  const handleTypeFilter = (type: string) => {
    setFilters(prev => ({ ...prev, device_type: type as any }));
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status === prev.status ? '' : status }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Helper function to safely access device properties
  const getDeviceProperty = (device: any, property: string) => {
    if ('facility_id' in device) {
      // BluLok device
      return device[property];
    } else {
      // AccessControl device - doesn't have these properties
      return null;
    }
  };

  // Handle highlighting when page loads - use allDevices for proper pagination calculation
  useHighlightWithPagination(
    allDevices, 
    (device) => device.id, 
    (id) => generateHighlightId('device', id),
    currentPage,
    filters.limit || 30,
    handlePageChange
  );

  const handleLockToggle = async (device: BluLokDevice & { device_category: string }) => {
    if (device.device_category !== 'blulok') return;
    
    try {
      const newStatus = device.lock_status === 'locked' ? 'unlocked' : 'locked';
      await apiService.updateLockStatus(device.id, newStatus);
      await loadDevices(); // Refresh data
    } catch (error) {
      console.error('Failed to toggle lock:', error);
    }
  };

  const AccessControlDeviceCard = ({ device }: { device: AccessControlDevice & { device_category: string } }) => {
    const DeviceIcon = deviceTypeIcons[device.device_type];
    const StatusIcon = statusIcons[device.status];
    
    return (
      <div 
        id={generateHighlightId('device', device.id)}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg mr-4">
              <DeviceIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{device.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{device.device_type} Controller</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[device.status]}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {device.status}
            </span>
          </div>
        </div>

        {device.location_description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{device.location_description}</p>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Relay Channel</span>
            <span className="font-medium text-gray-900 dark:text-white">#{device.relay_channel}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
            <span className={`font-medium ${device.is_locked ? 'text-red-600' : 'text-green-600'}`}>
              {device.is_locked ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          {device.last_activity && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Last Activity</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {new Date(device.last_activity).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const facilityIndex = devices.findIndex(d => d.gateway_id === device.gateway_id);
                const calculatedPage = facilityIndex !== -1 ? calculatePageForItem(facilityIndex, 20) : 1;
                navigateAndHighlight(navigate, { id: device.gateway_id, type: 'facility', page: calculatedPage });
              }}
              className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              <BuildingOfficeIcon className="h-4 w-4 mr-1" />
              View Facility
              <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
            </button>
            {canManage && (
              <button className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/20 dark:text-primary-400 rounded-md transition-colors">
                <EyeIcon className="h-4 w-4 mr-1" />
                Manage
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const BluLokDeviceCard = ({ device }: { device: BluLokDevice & { device_category: string } }) => {
    const StatusIcon = statusIcons[device.device_status];
    const batteryColor = device.battery_level && device.battery_level < 20 ? 'text-red-500' : 
                        device.battery_level && device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500';
    
    return (
      <div 
        id={generateHighlightId('device', device.id)}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg mr-4">
              <LockClosedIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Unit {device.unit_number}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{device.device_serial}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[device.device_status]}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {device.device_status}
            </span>
          </div>
        </div>

        {device.primary_tenant && (
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span>
              {device.primary_tenant.first_name} {device.primary_tenant.last_name}
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[device.lock_status]}`}>
              {device.lock_status === 'locked' ? <LockClosedIcon className="h-3 w-3 mr-1" /> : <LockOpenIcon className="h-3 w-3 mr-1" />}
              {device.lock_status}
            </span>
          </div>
          {device.battery_level && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Battery Level</span>
              <span className={`font-medium ${batteryColor}`}>
                {device.battery_level}%
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Facility</span>
            <span className="font-medium text-gray-900 dark:text-white">{device.facility_name}</span>
          </div>
          {device.last_activity && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Last Activity</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {new Date(device.last_activity).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between space-x-2">
            <div className="flex space-x-3">
              <button
                onClick={() => navigate(`/units/${device.unit_id}`)}
                className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <HomeIcon className="h-4 w-4 mr-1" />
                View Unit
                <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
              </button>
              <button
                onClick={() => {
                  const facilityId = getDeviceProperty(device, 'facility_id');
                  if (facilityId) {
                    const facilityIndex = devices.findIndex(d => getDeviceProperty(d, 'facility_id') === facilityId);
                    const calculatedPage = facilityIndex !== -1 ? calculatePageForItem(facilityIndex, 20) : 1;
                    navigateAndHighlight(navigate, { id: facilityId, type: 'facility', page: calculatedPage });
                  }
                }}
                className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                View Facility
                <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
              </button>
            </div>
            {canManage && (
              <button
                onClick={() => handleLockToggle(device)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  device.lock_status === 'locked'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                {device.lock_status === 'locked' ? 'Unlock' : 'Lock'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Devices</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Monitor and manage all facility devices
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => { setActiveTab('grid'); setViewMode('grid'); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'grid'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setActiveTab('list'); setViewMode('list'); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'list'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setActiveTab('commands')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'commands'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <KeyIcon className="h-4 w-4" />
            </button>
          </div>
          
          {canManage && (
            <div className="relative">
              <button
                onClick={() => {
                  setSelectedDeviceType('access_control');
                  setShowAddDeviceModal(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
              >
                <ServerIcon className="h-4 w-4 mr-2" />
                Add Device
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <ExpandableFilters
        searchValue={filters.search || ''}
        onSearchChange={handleSearch}
        searchPlaceholder="Search devices..."
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        onClearFilters={() => {
          setFilters({
            search: '',
            device_type: 'all' as const,
            status: '',
            facility_id: '',
            sortBy: 'name',
            sortOrder: 'asc',
            limit: 30,
            offset: 0
          });
        }}
        sections={[
          {
            title: 'Device Type',
            icon: <FunnelIcon className="h-5 w-5" />,
            options: [
              { key: 'all', label: 'All Devices', color: 'primary' },
              { key: 'access_control', label: 'Access Control', color: 'blue' },
              { key: 'blulok', label: 'BluLok', color: 'green' }
            ],
            selected: filters.device_type || '',
            onSelect: handleTypeFilter
          },
          {
            title: 'Status',
            icon: <BoltIcon className="h-5 w-5" />,
            options: [
              { key: '', label: 'All Status', color: 'primary' },
              { key: 'online', label: 'Online', color: 'green' },
              { key: 'offline', label: 'Offline', color: 'red' },
              { key: 'maintenance', label: 'Maintenance', color: 'yellow' },
              { key: 'error', label: 'Error', color: 'red' }
            ],
            selected: filters.status || '',
            onSelect: handleStatusFilter
          }
        ]}
      />

      {/* Results */}
      <div className="flex items-center justify-between mt-6">
        {activeTab !== 'commands' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Showing {devices.length} out of {total} devices</p>
        ) : (
          <div className="flex items-center space-x-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Pending Commands: {commandQueue?.total || 0}</p>
            <select
              value={cmdFilters.status}
              onChange={(e) => setCmdFilters({ status: e.target.value })}
              className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="in_progress">In Progress</option>
              <option value="failed">Failed</option>
              <option value="dead_letter">Dead Letter</option>
              <option value="cancelled">Cancelled</option>
              <option value="succeeded">Succeeded</option>
            </select>
          </div>
        )}
      </div>

      {/* Devices */}
      {activeTab === 'commands' ? (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Facility</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Command</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attempts</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Next Retry</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {(commandQueue?.items || []).map((cmd: any) => (
                <tr key={cmd.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <td className="px-6 py-3 text-sm">{cmd.facility_id}</td>
                  <td className="px-6 py-3 text-sm">{cmd.device_id}</td>
                  <td className="px-6 py-3 text-sm">{cmd.command_type}</td>
                  <td className="px-6 py-3 text-sm">{cmd.status}</td>
                  <td className="px-6 py-3 text-sm">{cmd.attempt_count}</td>
                  <td className="px-6 py-3 text-sm">{cmd.next_attempt_at ? new Date(cmd.next_attempt_at).toLocaleString() : '-'}</td>
                  <td className="px-6 py-3 text-sm text-right space-x-2">
                    <button onClick={() => apiService.retryCommand(cmd.id)} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Retry</button>
                    <button onClick={() => apiService.cancelCommand(cmd.id)} className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300">Cancel</button>
                    {cmd.status === 'dead_letter' && (
                      <button onClick={() => apiService.requeueDeadCommand(cmd.id)} className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">Requeue</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-12 w-12 bg-gray-300 dark:bg-gray-600 rounded-lg"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded"></div>
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12">
          <ServerIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No devices found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {filters.search || filters.status || filters.device_type !== 'all' 
              ? 'Try adjusting your filters.' 
              : 'No devices are configured yet.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            device.device_category === 'blulok' ? (
              <BluLokDeviceCard key={`blulok-${device.id}`} device={device as BluLokDevice & { device_category: string }} />
            ) : (
              <AccessControlDeviceCard key={`access-${device.id}`} device={device as AccessControlDevice & { device_category: string }} />
            )
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Device
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Activity
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {devices.map((device) => {
                const isBlulok = device.device_category === 'blulok';
                const DeviceIcon = isBlulok ? LockClosedIcon : deviceTypeIcons[(device as any).device_type as keyof typeof deviceTypeIcons] || ServerIcon;
                const StatusIcon = statusIcons[isBlulok ? (device as any).device_status as keyof typeof statusIcons : (device as any).status as keyof typeof statusIcons] || CheckCircleIcon;
                
                return (
                  <tr 
                    key={`${device.device_category}-${device.id}`}
                    id={generateHighlightId('device', device.id)}
                    className="group transition-all duration-200 cursor-pointer hover:shadow-sm border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                  >
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${isBlulok ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-primary-100 dark:bg-primary-900/20'}`}>
                          <DeviceIcon className={`h-4 w-4 ${isBlulok ? 'text-blue-600 dark:text-blue-400' : 'text-primary-600 dark:text-primary-400'}`} />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {isBlulok ? `Unit ${(device as any).unit_number}` : (device as any).name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {isBlulok ? (device as any).device_serial : (device as any).location_description || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isBlulok 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400'
                      }`}>
                        {isBlulok ? 'BluLok Device' : (device as any).device_type?.replace('_', ' ').toUpperCase() || 'Access Control'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[isBlulok ? (device as any).device_status as keyof typeof statusColors : (device as any).status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {isBlulok ? (device as any).device_status : (device as any).status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {isBlulok ? (device as any).facility_name : (device as any).location_description || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {device.last_activity ? new Date(device.last_activity).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex items-center justify-end space-x-2">
                        {isBlulok && getDeviceProperty(device, 'facility_id') && (
                          <button
                            onClick={() => {
                              const facilityId = getDeviceProperty(device, 'facility_id');
                              if (facilityId) {
                                const facilityIndex = devices.findIndex(d => getDeviceProperty(d, 'facility_id') === facilityId);
                                const calculatedPage = facilityIndex !== -1 ? calculatePageForItem(facilityIndex, 20) : 1;
                                navigateAndHighlight(navigate, { id: facilityId, type: 'facility', page: calculatedPage });
                              }
                            }}
                            className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                          >
                            <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                            View Facility
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                          </button>
                        )}
                        {!isBlulok && device.gateway_id && (
                          <button
                            onClick={() => {
                              const facilityIndex = devices.findIndex(d => d.gateway_id === device.gateway_id);
                              const calculatedPage = facilityIndex !== -1 ? calculatePageForItem(facilityIndex, 20) : 1;
                              navigateAndHighlight(navigate, { id: device.gateway_id, type: 'facility', page: calculatedPage });
                            }}
                            className="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                          >
                            <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                            View Facility
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing{' '}
                <span className="font-medium">{(currentPage - 1) * (filters.limit || 30) + 1}</span>
                {' '}out of{' '}
                <span className="font-medium">{total}</span>
                {' '}devices
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === page
                          ? 'z-10 bg-primary-50 dark:bg-primary-900 border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-300'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      <AddDeviceModal
        isOpen={showAddDeviceModal}
        onClose={() => setShowAddDeviceModal(false)}
        onSuccess={() => {
          loadDevices();
          setShowAddDeviceModal(false);
        }}
        deviceType={selectedDeviceType}
      />
    </div>
  );
}
