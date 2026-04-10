import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { shouldRefreshDeviceListForPayload } from '@/utils/deviceStatusWs.utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateHighlightId } from '@/utils/navigation.utils';
import { useHighlightWithPagination } from '@/hooks/useHighlightWithPagination';
import { navigateAndHighlight, calculatePageForItem } from '@/utils/navigation.utils';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { useToast } from '@/contexts/ToastContext';
import { 
  ServerIcon,
  FunnelIcon,
  BoltIcon,
  CubeIcon,
  KeyIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessControlDevice, BluLokDevice, DeviceFilters } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';
import { AccessControlDeviceCard as ACDeviceCardShared, BluLokDeviceCard as BluLokDeviceCardShared } from '@/components/Devices/DeviceCards';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { ViewModeToggle } from '@/components/Common/ViewModeToggle';
import { SortableTableTh } from '@/components/Common/SortableTableTh';

const statusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
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
  initialCommandQueue?: { items: CommandQueueItem[]; total: number };
}

type DeviceListItem = (AccessControlDevice | BluLokDevice) & { device_category: string };

interface CommandQueueItem {
  id: string;
  facility_id?: string;
  device_id?: string;
  command_type?: string;
  status?: string;
  attempt_count?: number;
  next_attempt_at?: string | null;
}

export default function DevicesPage({ initialCommandQueue }: DevicesPageProps = {}) {
  const ws = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { selectedFacilityId } = useGlobalFacility();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  /** Full ordered ids for highlight / pagination math; may be id-only from API when projection=id. */
  const [allDevices, setAllDevices] = useState<Array<{ id: string; device_category?: string }>>([]);
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
    limit: 30,
    offset: 0
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'grid' | 'table' | 'commands'>(initialCommandQueue ? 'commands' : 'grid');
  const [commandQueue, setCommandQueue] = useState<{ items: CommandQueueItem[]; total: number } | null>(initialCommandQueue || null);
  const [cmdFilters, setCmdFilters] = useState<{ status: string }>({ status: '' });
  const [showUnassignConfirm, setShowUnassignConfirm] = useState<{ deviceId: string; deviceSerial: string } | null>(null);
  const [unassigningDevice, setUnassigningDevice] = useState(false);

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  // Ref to track the latest loadDevices function for WebSocket callback
  const loadDevicesRef = useRef<() => void>(() => {});
  const deviceIdsRef = useRef<Set<string>>(new Set());
  deviceIdsRef.current = new Set(allDevices.map((d) => d.id));

  useLockDeviceRealtime({
    enabled: activeTab !== 'commands',
    debouncedRefresh: () => loadDevicesRef.current(),
    debounceRefreshFilter: (p) => shouldRefreshDeviceListForPayload(p, deviceIdsRef.current),
    debounceMs: 500,
  });

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      const normalize = (obj: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        Object.entries(obj).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          if (typeof v === 'string' && v.trim() === '') return;
          if (k === 'device_type' && v === 'all') return;
          out[k] = v;
        });
        return out;
      };

      const cardSortOverlay =
        activeTab === 'grid' ? { sortBy: 'name' as const, sortOrder: 'asc' as const } : {};
      const queryFilters = normalize({
        ...filters,
        ...cardSortOverlay,
        offset: (currentPage - 1) * (filters.limit || 30),
        // Add facility_id from global context if not "All Facilities"
        ...(selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID && { facility_id: selectedFacilityId }),
      });
      const response = await apiService.getDevices(queryFilters);
      setDevices(response.devices || []);
      setTotal(response.total || 0);
      setTotalPages(Math.ceil((response.total || 0) / (filters.limit || 30)));

      // Also load full dataset for pagination calculations
      try {
        const fullDatasetFilters = normalize({
          ...filters,
          ...cardSortOverlay,
          projection: 'id' as const,
          // Remove pagination parameters to get all data
          offset: undefined,
          limit: undefined,
          // Add facility_id from global context if not "All Facilities"
          ...(selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID && { facility_id: selectedFacilityId }),
        });
        
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
  }, [filters, currentPage, selectedFacilityId, activeTab]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Command queue subscription
  useEffect(() => {
    if (activeTab !== 'commands') return;
    const subId = ws.subscribe(
      'command_queue',
      (data: unknown) => {
        const payload = (data || {}) as { items?: CommandQueueItem[]; total?: number };
        setCommandQueue({ items: payload.items || [], total: payload.total || 0 });
      },
      undefined // no error handler needed
    );
    // initial fetch
    apiService.getCommandQueue({ status: cmdFilters.status || undefined })
      .then(data => setCommandQueue({ items: data.items || [], total: data.total || 0 }))
      .catch(() => {});
    return () => {
      if (subId) ws.unsubscribe(subId);
    };
  }, [activeTab, cmdFilters.status, ws]);

  // Keep ref updated for WebSocket callback
  useEffect(() => {
    loadDevicesRef.current = loadDevices;
  });

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setCurrentPage(1);
  };

  const handleTypeFilter = (type: string) => {
    setFilters(prev => ({ ...prev, device_type: type as DeviceFilters['device_type'] }));
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status === prev.status ? '' : status }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleDeviceColumnSort = (columnKey: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: columnKey as DeviceFilters['sortBy'],
      sortOrder:
        prev.sortBy === columnKey ? (prev.sortOrder === 'asc' ? 'desc' : 'asc') : 'asc',
    }));
    setCurrentPage(1);
  };

  const getFacilityId = (device: DeviceListItem): string | undefined => {
    const value = (device as { facility_id?: unknown }).facility_id;
    return typeof value === 'string' ? value : undefined;
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

  const handleUnassignDevice = async () => {
    if (!showUnassignConfirm) return;

    try {
      setUnassigningDevice(true);
      await apiService.unassignDeviceFromUnit(showUnassignConfirm.deviceId);
      addToast({ type: 'success', title: 'Device unassigned successfully' });
      await loadDevices(); // Refresh data
      setShowUnassignConfirm(null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      console.error('Failed to unassign device:', error);
      addToast({ 
        type: 'error', 
        title: apiError?.response?.data?.message || 'Failed to unassign device from unit' 
      });
    } finally {
      setUnassigningDevice(false);
    }
  };

  // Use shared cards to unify UI with Facility Devices and Device Management


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
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <ViewModeToggle
              value={activeTab === 'table' ? 'table' : 'grid'}
              onChange={(m) => setActiveTab(m)}
              showText={false}
              noneSelected={activeTab === 'commands'}
            />
            <button
              type="button"
              onClick={() => setActiveTab('commands')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'commands'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              title="Command queue"
              aria-label="Command queue"
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
              {(commandQueue?.items || []).map((cmd) => (
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
        <div className={activeTab === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
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
      ) : activeTab === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            device.device_category === 'blulok' ? (
              <BluLokDeviceCardShared
                key={`blulok-${device.id}`}
                device={device as BluLokDevice & { device_category: string }}
                onViewDevice={() => navigate(`/devices/${device.id}`, { state: withReturnPath(location, { from: 'devices' }) })}
              />
            ) : (
              <ACDeviceCardShared
                key={`access-${device.id}`}
                device={device as AccessControlDevice & { device_category: string }}
                onViewDevice={() => navigate(`/devices/${device.id}`, { state: withReturnPath(location, { from: 'devices' }) })}
              />
            )
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <SortableTableTh
                  label="Device"
                  columnKey="name"
                  sortBy={filters.sortBy || 'name'}
                  sortOrder={filters.sortOrder === 'desc' ? 'desc' : 'asc'}
                  onSort={handleDeviceColumnSort}
                />
                <SortableTableTh
                  label="Type"
                  columnKey="device_type"
                  sortBy={filters.sortBy || 'name'}
                  sortOrder={filters.sortOrder === 'desc' ? 'desc' : 'asc'}
                  onSort={handleDeviceColumnSort}
                />
                <SortableTableTh
                  label="Status"
                  columnKey="status"
                  sortBy={filters.sortBy || 'name'}
                  sortOrder={filters.sortOrder === 'desc' ? 'desc' : 'asc'}
                  onSort={handleDeviceColumnSort}
                />
                <SortableTableTh
                  label="Location"
                  columnKey="facility_name"
                  sortBy={filters.sortBy || 'name'}
                  sortOrder={filters.sortOrder === 'desc' ? 'desc' : 'asc'}
                  onSort={handleDeviceColumnSort}
                />
                <SortableTableTh
                  label="Last Activity"
                  columnKey="last_activity"
                  sortBy={filters.sortBy || 'name'}
                  sortOrder={filters.sortOrder === 'desc' ? 'desc' : 'asc'}
                  onSort={handleDeviceColumnSort}
                />
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {devices.map((device) => {
                const isBlulok = device.device_category === 'blulok';
                const accessDevice = device as AccessControlDevice & { device_category: string };
                const blulokDevice = device as BluLokDevice & { device_category: string };
                const DeviceIcon = isBlulok ? LockClosedIcon : deviceTypeIcons[accessDevice.device_type as keyof typeof deviceTypeIcons] || ServerIcon;
                const StatusIcon = statusIcons[isBlulok ? blulokDevice.device_status as keyof typeof statusIcons : accessDevice.status as keyof typeof statusIcons] || CheckCircleIcon;
                
                return (
                  <tr 
                    key={`${device.device_category}-${device.id}`}
                    id={generateHighlightId('device', device.id)}
                    onClick={() => navigate(`/devices/${device.id}`, { state: withReturnPath(location, { from: 'devices' }) })}
                    className="group transition-all duration-200 cursor-pointer hover:shadow-sm border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                  >
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${isBlulok ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-primary-100 dark:bg-primary-900/20'}`}>
                          <DeviceIcon className={`h-4 w-4 ${isBlulok ? 'text-blue-600 dark:text-blue-400' : 'text-primary-600 dark:text-primary-400'}`} />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {isBlulok ? `Unit ${blulokDevice.unit_number}` : accessDevice.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {isBlulok ? blulokDevice.device_serial : accessDevice.location_description || 'N/A'}
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
                        {isBlulok ? 'BluLok Device' : accessDevice.device_type?.replace('_', ' ').toUpperCase() || 'Access Control'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[isBlulok ? blulokDevice.device_status as keyof typeof statusColors : accessDevice.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {isBlulok ? blulokDevice.device_status : accessDevice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {isBlulok
                        ? blulokDevice.facility_name || 'N/A'
                        : accessDevice.facility_name || accessDevice.location_description || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      {device.last_activity ? new Date(device.last_activity).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors duration-200">
                      <div className="flex items-center justify-end space-x-2">
                        {isBlulok && getFacilityId(device) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const facilityId = getFacilityId(device);
                              if (facilityId) {
                                const facilityIndex = devices.findIndex(d => getFacilityId(d) === facilityId);
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
                            onClick={(e) => {
                              e.stopPropagation();
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

      {/* Unassign Device Confirmation Modal */}
      <ConfirmModal
        isOpen={!!showUnassignConfirm}
        onClose={() => setShowUnassignConfirm(null)}
        onConfirm={handleUnassignDevice}
        title="Unassign Device"
        message={
          showUnassignConfirm
            ? `Are you sure you want to unassign device "${showUnassignConfirm.deviceSerial}" from its unit? The device will become available for other units.`
            : ''
        }
        confirmText="Unassign"
        cancelText="Cancel"
        isLoading={unassigningDevice}
      />
    </div>
  );
}
