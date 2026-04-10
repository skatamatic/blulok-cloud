import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  BuildingOfficeIcon, 
  MapPinIcon, 
  PhoneIcon, 
  EnvelopeIcon,
  PencilIcon,
  SignalIcon,
  HomeIcon,
  CubeIcon,
  ServerIcon,
  LockClosedIcon,
  LockOpenIcon,
  BoltIcon,
  UserIcon,
  CloudIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  ClockIcon,
  KeyIcon,
  RectangleGroupIcon,
  CpuChipIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Facility, DeviceHierarchy, AccessControlDevice, BluLokDevice, Unit, DeviceFilters, UnitFilters, DeviceGroup } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';
import { AddUnitModal } from '@/components/Units/AddUnitModal';
import { MapCard } from '@/components/GoogleMaps/MapCard';
import { FacilityFMSTab } from '@/components/FMS/FacilityFMSTab';
import FacilityGatewayTab from '@/components/Gateway/FacilityGatewayTab';
import { SchedulesHubTab } from '@/components/Schedules/SchedulesHubTab';
import { AccessCodeManagementTab } from '@/components/AccessCodes/AccessCodeManagementTab';
import { MyAccessCodes } from '@/components/AccessCodes/MyAccessCodes';
import { DeviceGroupManager } from '@/components/AccessCodes/DeviceGroupManager';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { useToast } from '@/contexts/ToastContext';
import { AccessControlDeviceCard as ACDeviceCardShared, BluLokDeviceCard as BluLokDeviceCardShared } from '@/components/Devices/DeviceCards';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { navigateAndHighlight, calculatePageForItem } from '@/utils/navigation.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useLockHardwareFeedback } from '@/hooks/useLockHardwareFeedback';
import { canRequestRemoteUnlock } from '@/utils/unitLock.utils';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { ViewModeToggle, type ListViewMode } from '@/components/Common/ViewModeToggle';
import { SortableTableTh } from '@/components/Common/SortableTableTh';

const DEVICES_PAGE_LIMIT = 30;
const UNITS_PAGE_LIMIT = 20;
const DEFAULT_UNIT_TYPES = ['Small', 'Medium', 'Large', 'Extra Large', 'XL', 'XXL'];

const deviceTypeIcons = {
  gate: BoltIcon,
  elevator: CubeIcon,
  door: KeyIcon,
  blulok: LockClosedIcon,
};

const deviceListStatusIcons = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
  maintenance: WrenchScrewdriverIcon,
  low_battery: ExclamationTriangleIcon,
};

const deviceListStatusColors: Record<string, string> = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

const statusColors = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
};

const sanitizeFilters = (filters: Record<string, unknown>) => {
  const sanitized: Record<string, unknown> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    sanitized[key] = value;
  });
  return sanitized;
};

export default function FacilityDetailsPage() {
  const ws = useWebSocket();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { selectedFacilityId, setSelectedFacilityId, isAllFacilitiesSelected } = useGlobalFacility();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [deviceHierarchy, setDeviceHierarchy] = useState<DeviceHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  
  type FacilityTab = 'overview' | 'devices' | 'units' | 'fms' | 'gateway' | 'schedules' | 'device-groups' | 'access-codes';
  type FacilityDeviceListItem = (AccessControlDevice | BluLokDevice) & { device_category: string };

  // Get initial tab from URL query parameter or location state
  const getInitialTab = (): FacilityTab => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['overview', 'devices', 'units', 'fms', 'gateway', 'schedules', 'device-groups', 'access-codes'].includes(tabParam)) {
      return tabParam as 'overview' | 'devices' | 'units' | 'fms' | 'gateway' | 'schedules' | 'device-groups' | 'access-codes';
    }
    const locationState = location.state as { tab?: FacilityTab } | null;
    if (locationState?.tab) {
      return locationState.tab;
    }
    return 'overview';
  };
  
  const [activeTab, setActiveTab] = useState<FacilityTab>(getInitialTab());
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [selectedDeviceType, setSelectedDeviceType] = useState<'access_control' | 'blulok'>('access_control');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<{ units: number; devices: number; gateways: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [facilityDevices, setFacilityDevices] = useState<FacilityDeviceListItem[]>([]);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [devicePage, setDevicePage] = useState(1);
  const [deviceTotalPages, setDeviceTotalPages] = useState(1);
  const [deviceFiltersExpanded, setDeviceFiltersExpanded] = useState(false);
  const [deviceFilters, setDeviceFilters] = useState<DeviceFilters>({
    search: '',
    device_type: 'all',
    status: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [devicesInitialLoad, setDevicesInitialLoad] = useState(true);
  const [unitFiltersExpanded, setUnitFiltersExpanded] = useState(false);
  const [unitFilters, setUnitFilters] = useState<UnitFilters>({
    search: '',
    status: '',
    unit_type: '',
    sortBy: 'unit_number',
    sortOrder: 'asc',
  });
  const [facilityUnitsPageNumber, setFacilityUnitsPageNumber] = useState(1);
  const [unitTotal, setUnitTotal] = useState(0);
  const [unitTotalPages, setUnitTotalPages] = useState(1);
  const [facilityUnitsPageData, setFacilityUnitsPageData] = useState<Unit[]>([]);
  const [unitLoading, setUnitLoading] = useState(false);
  const [unitsInitialLoad, setUnitsInitialLoad] = useState(true);
  const [deviceViewMode, setDeviceViewMode] = useState<ListViewMode>('table');
  const [unitViewMode, setUnitViewMode] = useState<ListViewMode>('table');
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [groupNamesByDeviceId, setGroupNamesByDeviceId] = useState<Record<string, string[]>>({});

  const facilityDevicesRef = useRef<FacilityDeviceListItem[]>([]);
  facilityDevicesRef.current = facilityDevices;
  const facilityUnitsRef = useRef<Unit[]>([]);
  facilityUnitsRef.current = facilityUnitsPageData;

  const unitUnlockWatchIdRef = useRef<string | null>(null);
  const { scheduleUnlockWatch: scheduleUnitUnlockWatch, cancelWatch: cancelUnitUnlockWatch } =
    useLockHardwareFeedback({
      timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
    });

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const canEditFMS = ['admin', 'dev_admin'].includes(authState.user?.role || '');
  const canManageGateway = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isTenant = authState.user?.role === 'tenant';
  const canDelete = ['admin', 'dev_admin'].includes(authState.user?.role || '');

  // Refs for debouncing WebSocket-triggered refreshes
  const loadDevicesRef = useRef<(opts?: { background?: boolean }) => void | Promise<void>>(async () => {});
  const loadUnitsRef = useRef<(opts?: { background?: boolean }) => void | Promise<void>>(async () => {});
  const hasInitialSyncRef = useRef(false);

  // Sync route ID with global context on initial mount only (one-way: route -> context)
  useEffect(() => {
    if (!hasInitialSyncRef.current && id && id !== ALL_FACILITIES_ID) {
      setSelectedFacilityId(id);
      hasInitialSyncRef.current = true;
    }
  }, [id, setSelectedFacilityId]);

  // Handle facility changes from global selector (context -> route)
  useEffect(() => {
    // Only react if we're on a facility details page (have an id in the route)
    if (!id) return;
    
    // If "All Facilities" is selected, redirect to facilities page
    if (isAllFacilitiesSelected) {
      navigate('/facilities', { replace: true });
      return;
    }
    
    // If the selected facility changed and it's different from the current route ID, navigate to it
    if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID && selectedFacilityId !== id) {
      // Preserve the current tab when navigating
      const urlParams = new URLSearchParams(location.search);
      const tabParam = urlParams.get('tab') || 'overview';
      navigate(`/facilities/${selectedFacilityId}?tab=${tabParam}`, { replace: true });
    }
  }, [selectedFacilityId, id, isAllFacilitiesSelected, navigate, location.search]);

  // Sync active tab with URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['overview', 'devices', 'units', 'fms', 'gateway', 'schedules', 'device-groups', 'access-codes'].includes(tabParam)) {
      setActiveTab(tabParam as 'overview' | 'devices' | 'units' | 'fms' | 'gateway' | 'schedules' | 'device-groups' | 'access-codes');
    } else if (!tabParam && facility) {
      // If no tab in URL and facility is loaded, add default tab to URL
      urlParams.set('tab', 'overview');
      navigate(`${location.pathname}?${urlParams.toString()}`, { replace: true });
    }
  }, [location.search, location.pathname, navigate, facility]);

  // Subscribe to gateway status updates to update overview gateway status
  useEffect(() => {
    if (!ws) return;
    const subscriptionId = ws.subscribe(
      'gateway_status',
      (data: unknown) => {
        const gateways = ((data as { gateways?: Array<{ id: string; status: 'online' | 'offline' | 'error' | 'maintenance' }> })?.gateways) || [];
        gateways.forEach((g) => {
          // Update deviceHierarchy gateway status for overview tab
          setDeviceHierarchy(prev => {
            if (!prev?.gateway || prev.gateway.id !== g.id) return prev;
            return {
              ...prev,
              gateway: {
                ...prev.gateway,
                status: g.status
              }
            };
          });
        });
      },
      undefined // no error handler needed
    );
    return () => {
      if (subscriptionId) ws.unsubscribe(subscriptionId);
    };
  }, [ws]);

  const debouncedFacilityDevicesWsRefresh = useCallback(() => {
    void loadDevicesRef.current({ background: true });
  }, []);

  const debouncedFacilityUnitsWsRefresh = useCallback(() => {
    void loadUnitsRef.current({ background: true });
  }, []);

  useLockDeviceRealtime({
    enabled: activeTab === 'devices' && !!facility?.id,
    facilityId: facility?.id,
    debouncedRefresh: debouncedFacilityDevicesWsRefresh,
    debounceMs: 500,
    subscribeUnitsForRefresh: false,
  });

  useLockDeviceRealtime({
    enabled: activeTab === 'units' && !!facility?.id,
    facilityId: facility?.id,
    debouncedRefresh: debouncedFacilityUnitsWsRefresh,
    debounceMs: 500,
  });

  useEffect(() => {
    if (!unitUnlockWatchIdRef.current) return;
    const u = facilityUnitsPageData.find((x) => x.id === unitUnlockWatchIdRef.current);
    if (u?.blulok_device?.lock_status === 'unlocked') {
      cancelUnitUnlockWatch();
      unitUnlockWatchIdRef.current = null;
    }
  }, [facilityUnitsPageData, cancelUnitUnlockWatch]);

  const loadFacilityData = useCallback(async (facilityId?: string) => {
    const targetId = facilityId || id;
    if (!targetId) return;
    
    try {
      setLoading(true);
      const [facilityResponse, unitsResponse] = await Promise.all([
        apiService.getFacility(targetId),
        apiService.getUnits({ facility_id: targetId })
      ]);
      
      setFacility(facilityResponse.facility);
      setDeviceHierarchy(facilityResponse.deviceHierarchy);
      const allUnits: Unit[] = unitsResponse.units || [];
      setFacilityUnitsPageData(isTenant ? allUnits.filter(u => String(u.facility_id) === String(targetId)) : allUnits);
    } catch (error) {
      console.error('Failed to load facility data:', error);
    } finally {
      setLoading(false);
    }
  }, [id, isTenant]);

  useEffect(() => {
    // Use global context facility ID if available, otherwise use route ID
    const facilityId = selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? selectedFacilityId : id;
    if (facilityId) {
      loadFacilityData(facilityId);
    }
  }, [id, selectedFacilityId, loadFacilityData]);

  const loadFacilityDevices = useCallback(async (options?: { background?: boolean }) => {
    if (!facility?.id) return;
    try {
      if (!options?.background) {
        setDeviceLoading(true);
      }
      const cardSort =
        deviceViewMode === 'grid' ? { sortBy: 'name' as const, sortOrder: 'asc' as const } : {};
      const params = sanitizeFilters({
        ...deviceFilters,
        ...cardSort,
        facility_id: facility.id,
        limit: DEVICES_PAGE_LIMIT,
        offset: (devicePage - 1) * DEVICES_PAGE_LIMIT,
      }) as DeviceFilters;

      const response = await apiService.getDevices(params);
      const devicesData = response.devices || [];
      const total = response.total ?? devicesData.length ?? 0;
      setFacilityDevices(devicesData);
      setDeviceTotal(total);
      setDeviceTotalPages(Math.max(1, Math.ceil(total / DEVICES_PAGE_LIMIT)));
      setDevicesInitialLoad(false);
    } catch (error) {
      console.error('Failed to load facility devices:', error);
    } finally {
      setDeviceLoading(false);
    }
  }, [facility?.id, deviceFilters, devicePage, deviceViewMode]);

  const loadFacilityUnitsPageData = useCallback(async (options?: { background?: boolean }) => {
    if (!facility?.id) return;
    try {
      if (!options?.background) {
        setUnitLoading(true);
      }
      const cardSort =
        unitViewMode === 'grid' ? { sortBy: 'unit_number' as const, sortOrder: 'asc' as const } : {};
      const params = sanitizeFilters({
        ...unitFilters,
        ...cardSort,
        facility_id: facility.id,
        limit: UNITS_PAGE_LIMIT,
        offset: (facilityUnitsPageNumber - 1) * UNITS_PAGE_LIMIT,
      }) as UnitFilters;

      const response = await apiService.getUnits(params);
      const unitsData: Unit[] = response.units || [];
      const total = response.total ?? unitsData.length ?? 0;
      setFacilityUnitsPageData(unitsData);
      setUnitTotal(total);
      setUnitTotalPages(Math.max(1, Math.ceil(total / UNITS_PAGE_LIMIT)));
      setUnitsInitialLoad(false);
    } catch (error) {
      console.error('Failed to load facility units:', error);
    } finally {
      setUnitLoading(false);
    }
  }, [facility?.id, unitFilters, facilityUnitsPageNumber, unitViewMode]);

  const loadDeviceGroups = useCallback(async () => {
    if (!facility?.id || !canManage) return;

    try {
      const groupsResponse = await apiService.getDeviceGroups(facility.id);
      const groups = groupsResponse.data || [];
      setDeviceGroups(groups);

      const groupDetails = await Promise.all(groups.map((group) => apiService.getDeviceGroup(group.id)));
      const mapped: Record<string, string[]> = {};
      groupDetails.forEach((detail) => {
        const group = detail.data;
        const groupName = group.name;
        (group.members || []).forEach((member) => {
          mapped[member.device_id] = [...(mapped[member.device_id] || []), groupName];
        });
      });

      setGroupNamesByDeviceId(mapped);
    } catch (error) {
      console.error('Failed to load device groups:', error);
      setDeviceGroups([]);
      setGroupNamesByDeviceId({});
    }
  }, [facility?.id, canManage]);

  // Keep refs updated for WebSocket callbacks
  useEffect(() => {
    loadDevicesRef.current = loadFacilityDevices;
  }, [loadFacilityDevices]);

  useEffect(() => {
    loadUnitsRef.current = loadFacilityUnitsPageData;
  }, [loadFacilityUnitsPageData]);

  useEffect(() => {
    if (activeTab !== 'devices') return;
    loadFacilityDevices();
  }, [activeTab, loadFacilityDevices]);

  useEffect(() => {
    if (!facility?.id || !canManage) return;
    if (!['devices', 'device-groups', 'access-codes'].includes(activeTab)) return;
    loadDeviceGroups();
  }, [activeTab, facility?.id, canManage, loadDeviceGroups]);

  useEffect(() => {
    if (activeTab !== 'units') return;
    loadFacilityUnitsPageData();
  }, [activeTab, loadFacilityUnitsPageData]);

  const handleFacilityUnitUnlock = async (unit: Unit) => {
    if (!unit.blulok_device || !canRequestRemoteUnlock(unit.blulok_device.lock_status)) return;
    setFacilityUnitsPageData((prev) =>
      prev.map((u) =>
        u.id === unit.id && u.blulok_device
          ? { ...u, blulok_device: { ...u.blulok_device, lock_status: 'unlocking' } }
          : u,
      ),
    );
    unitUnlockWatchIdRef.current = unit.id;
    scheduleUnitUnlockWatch(
      () => {
        const cur = facilityUnitsRef.current.find((x) => x.id === unit.id);
        return cur?.blulok_device?.lock_status;
      },
      () => {
        unitUnlockWatchIdRef.current = null;
        void loadFacilityUnitsPageData();
      },
    );
    try {
      await apiService.updateLockStatus(unit.blulok_device.id, 'unlocked');
      addToast(lockHardwareFeedbackToasts.unlockCommandSent());
      await loadFacilityUnitsPageData();
      await loadFacilityData();
    } catch (error) {
      cancelUnitUnlockWatch();
      unitUnlockWatchIdRef.current = null;
      console.error('Failed to unlock unit:', error);
      addToast(lockHardwareFeedbackToasts.couldNotUnlockUnit());
      await loadFacilityUnitsPageData();
    }
  };

  const openDeleteConfirm = async () => {
    if (!facility) return;
    try {
      setLoadingImpact(true);
      const impact = await apiService.getFacilityDeleteImpact(facility.id);
      setDeleteImpact({
        units: impact.units ?? 0,
        devices: impact.devices ?? 0,
        gateways: impact.gateways ?? 0,
      });
      setShowDeleteConfirm(true);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      addToast({ type: 'error', title: apiError?.response?.data?.message || 'Failed to load delete impact' });
    } finally {
      setLoadingImpact(false);
    }
  };

  const confirmDelete = async () => {
    if (!facility) return;
    try {
      await apiService.deleteFacility(facility.id);
      addToast({ type: 'success', title: 'Facility deleted successfully' });
      navigate('/facilities');
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      addToast({ type: 'error', title: apiError?.response?.data?.message || 'Failed to delete facility' });
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleDeviceSearch = (value: string) => {
    setDeviceFilters(prev => ({ ...prev, search: value }));
    setDevicePage(1);
  };

  const handleDeviceTypeFilter = (type: string) => {
    setDeviceFilters(prev => ({ ...prev, device_type: type as DeviceFilters['device_type'] }));
    setDevicePage(1);
  };

  const handleDeviceStatusFilter = (status: string) => {
    setDeviceFilters(prev => ({ ...prev, status: status === prev.status ? '' : status }));
    setDevicePage(1);
  };

  const handleFacilityDeviceColumnSort = (columnKey: string) => {
    setDeviceFilters((prev) => ({
      ...prev,
      sortBy: columnKey as DeviceFilters['sortBy'],
      sortOrder:
        prev.sortBy === columnKey ? (prev.sortOrder === 'asc' ? 'desc' : 'asc') : 'asc',
    }));
    setDevicePage(1);
  };

  const handleUnitSearch = (value: string) => {
    setUnitFilters(prev => ({ ...prev, search: value }));
    setFacilityUnitsPageNumber(1);
  };

  const handleUnitStatusFilter = (status: string) => {
    setUnitFilters(prev => ({ ...prev, status: status === prev.status ? '' : status }));
    setFacilityUnitsPageNumber(1);
  };

  const handleUnitTypeFilter = (type: string) => {
    setUnitFilters(prev => ({ ...prev, unit_type: type }));
    setFacilityUnitsPageNumber(1);
  };

  const handleFacilityUnitColumnSort = (columnKey: string) => {
    setUnitFilters((prev) => ({
      ...prev,
      sortBy: columnKey as UnitFilters['sortBy'],
      sortOrder:
        prev.sortBy === columnKey ? (prev.sortOrder === 'asc' ? 'desc' : 'asc') : 'asc',
    }));
    setFacilityUnitsPageNumber(1);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-300 dark:bg-gray-600 rounded mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-300 dark:bg-gray-600 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="text-center py-12">
        <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Facility not found</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The facility you're looking for doesn't exist or you don't have access to it.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Using shared device cards for parity with Devices Management

  const UnitCard = ({ unit }: { unit: Unit }) => {
    return (
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-md hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
        onClick={() => {
          // Preserve current tab in URL when navigating to unit
          const currentTab = activeTab || 'overview';
          navigate(`/units/${unit.id}`, {
            state: withReturnPath(location, { returnTab: currentTab, returnPath: `${location.pathname}?tab=${currentTab}` }),
          });
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-xl mr-4">
              <HomeIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                Unit {unit.unit_number}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{unit.unit_type}</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
            {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
          </span>
        </div>

        {/* Tenant Info */}
        {unit.primary_tenant ? (
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span className="font-medium">
              {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
            </span>
            {unit.shared_tenants && unit.shared_tenants.length > 0 && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full">
                +{unit.shared_tenants.length} shared
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center text-sm text-gray-400 dark:text-gray-500 mb-4">
            <UserIcon className="h-4 w-4 mr-2" />
            <span>No tenant assigned</span>
          </div>
        )}

        {/* Lock Status or Missing Device Warning */}
        {unit.blulok_device ? (
          <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-2">
              {unit.blulok_device.lock_status === 'locked' || unit.blulok_device.lock_status === 'locking' ? 
                <LockClosedIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : 
                unit.blulok_device.lock_status === 'unlocking' ?
                <LockOpenIcon className="h-4 w-4 text-green-600 dark:text-green-400 animate-pulse" /> :
                <LockOpenIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              }
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {unit.blulok_device.lock_status === 'unlocking'
                  ? 'Unlocking…'
                  : unit.blulok_device.lock_status === 'locked' || unit.blulok_device.lock_status === 'locking'
                    ? 'Secured'
                    : 'Unlocked'}
              </span>
            </div>
            {unit.blulok_device.battery_level && (
              <span className={`text-sm font-bold ${
                unit.blulok_device.battery_level < 20 ? 'text-red-500' : 
                unit.blulok_device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500'
              }`}>
                {unit.blulok_device.battery_level}%
              </span>
            )}
          </div>
        ) : (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center text-sm text-yellow-800 dark:text-yellow-300">
            <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
            No device attached
          </div>
        )}

        {/* Features */}
        {unit.features && unit.features.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {unit.features.slice(0, 3).map((feature, index) => (
                <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
                  {feature}
                </span>
              ))}
              {unit.features.length > 3 && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  +{unit.features.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className="mt-6 flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {unit.blulok_device && (
            <button
              type="button"
              onClick={() => {
                navigate(`/devices/${unit.blulok_device!.id}`, {
                  state: withReturnPath(location, { returnTab: activeTab || 'units', returnPath: `${location.pathname}?tab=${activeTab || 'units'}` }),
                });
              }}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              <CpuChipIcon className="h-4 w-4 mr-1.5" />
              View device
            </button>
          )}
          {canManage && unit.blulok_device && (
            <button
              type="button"
              disabled={
                !canRequestRemoteUnlock(unit.blulok_device.lock_status) ||
                unit.blulok_device.lock_status === 'unlocking' ||
                unit.blulok_device.lock_status === 'locking'
              }
              onClick={() => void handleFacilityUnitUnlock(unit)}
              className={`inline-flex items-center rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                unit.blulok_device.lock_status === 'unlocking'
                  ? 'bg-blue-600 text-white animate-pulse'
                  : canRequestRemoteUnlock(unit.blulok_device.lock_status)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
              }`}
            >
              {unit.blulok_device.lock_status === 'unlocking' ? (
                'Unlocking…'
              ) : canRequestRemoteUnlock(unit.blulok_device.lock_status) ? (
                <>
                  <LockOpenIcon className="h-4 w-4 mr-1.5" />
                  Unlock
                </>
              ) : (
                'Unlocked'
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {facility.branding_image && facility.image_mime_type ? (
            <img
              src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
              alt={facility.name}
              className="h-16 w-16 rounded-lg object-contain bg-white dark:bg-gray-100 p-1 border border-gray-200 dark:border-gray-600 flex-shrink-0"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{facility.name}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{facility.address}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {canManage && (
            <button
              onClick={() => navigate(`/facilities/${facility.id}/edit`)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={openDeleteConfirm}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview', icon: BuildingOfficeIcon },
            ...(!isTenant && canManage ? [{ key: 'devices', label: 'Devices', icon: ServerIcon }] : []),
            { key: 'units', label: 'Units', icon: HomeIcon },
            { key: 'schedules', label: 'Schedules', icon: ClockIcon },
            { key: 'access-codes', label: 'Access Codes', icon: KeyIcon },
            ...(!isTenant && canManage ? [{ key: 'device-groups', label: 'Device Groups', icon: RectangleGroupIcon }] : []),
            ...(!isTenant && canManage ? [{ key: 'fms', label: 'FMS Integration', icon: CloudIcon }] : []),
            ...(!isTenant && canManageGateway ? [{ key: 'gateway', label: 'Gateway', icon: SignalIcon }] : []),
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key as FacilityTab);
                // Update URL with tab parameter
                const newSearchParams = new URLSearchParams(location.search);
                newSearchParams.set('tab', key);
                navigate(`${location.pathname}?${newSearchParams.toString()}`, { replace: true });
              }}
              className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Icon className={`mr-2 h-5 w-5 ${
                activeTab === key ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
              }`} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Facility Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Facility Information</h3>
              
              {facility.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">{facility.description}</p>
              )}

              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <MapPinIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                  <span>{facility.address}</span>
                </div>
                {facility.contact_email && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <EnvelopeIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                    <span>{facility.contact_email}</span>
                  </div>
                )}
                {facility.contact_phone && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <PhoneIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                    <span>{facility.contact_phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Gateway Status */}
            {!isTenant && deviceHierarchy?.gateway && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Gateway Status</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg mr-4">
                      <ServerIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">{deviceHierarchy.gateway.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{deviceHierarchy.gateway.ip_address}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[deviceHierarchy.gateway.status]}`}>
                    {deviceHierarchy.gateway.status}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="space-y-6">
            {!isTenant && facility.stats && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Statistics</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <HomeIcon className="h-5 w-5 text-blue-500 mr-2" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total Units</span>
                    </div>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">{facility.stats.totalUnits}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CubeIcon className="h-5 w-5 text-green-500 mr-2" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Occupied</span>
                    </div>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">{facility.stats.occupiedUnits}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <SignalIcon className="h-5 w-5 text-primary-500 mr-2" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Devices Online</span>
                    </div>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      {facility.stats.devicesOnline}/{facility.stats.devicesTotal}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Location Map */}
            {facility.latitude !== undefined && facility.longitude !== undefined && 
             typeof facility.latitude === 'number' && typeof facility.longitude === 'number' && (
              <MapCard
                address={facility.address}
                latitude={facility.latitude}
                longitude={facility.longitude}
                facilityName={facility.name}
                height="h-64"
              />
            )}

          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="space-y-6">
          {canManage && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xl">
                Physical endpoints for this facility: access control (gates, doors, elevators) and BluLok locks.
                The{' '}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('device-groups');
                    const next = new URLSearchParams(location.search);
                    next.set('tab', 'device-groups');
                    navigate(`${location.pathname}?${next.toString()}`, { replace: true });
                  }}
                  className="text-primary-600 dark:text-primary-400 font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                >
                  Device Groups
                </button>{' '}
                tab is where you organize those devices into zones or shared keypad code scopes (it does not replace adding hardware here).
              </p>
              <div className="flex shrink-0 space-x-2">
                <button
                  onClick={() => {
                    setSelectedDeviceType('access_control');
                    setShowAddDeviceModal(true);
                  }}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                >
                  <BoltIcon className="h-4 w-4 mr-2" />
                  Add Access Control
                </button>
                <button
                  onClick={() => {
                    setSelectedDeviceType('blulok');
                    setShowAddDeviceModal(true);
                  }}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
                >
                  <LockClosedIcon className="h-4 w-4 mr-2" />
                  Add BluLok
                </button>
              </div>
            </div>
          )}

          <ExpandableFilters
            searchValue={deviceFilters.search || ''}
            onSearchChange={handleDeviceSearch}
            searchPlaceholder="Search devices..."
            isExpanded={deviceFiltersExpanded}
            onToggleExpanded={() => setDeviceFiltersExpanded(!deviceFiltersExpanded)}
            onClearFilters={() => {
              setDeviceFilters({
                search: '',
                device_type: 'all',
                status: '',
                sortBy: 'name',
                sortOrder: 'asc',
              });
              setDevicePage(1);
            }}
            sections={[
              {
                title: 'Device Type',
                icon: <FunnelIcon className="h-5 w-5" />,
                options: [
                  { key: 'all', label: 'All Devices', color: 'primary' },
                  { key: 'access_control', label: 'Access Control', color: 'blue' },
                  { key: 'blulok', label: 'BluLok', color: 'green' },
                ],
                selected: deviceFilters.device_type || 'all',
                onSelect: handleDeviceTypeFilter,
              },
              {
                title: 'Status',
                icon: <BoltIcon className="h-5 w-5" />,
                options: [
                  { key: '', label: 'All Status', color: 'primary' },
                  { key: 'online', label: 'Online', color: 'green' },
                  { key: 'offline', label: 'Offline', color: 'red' },
                  { key: 'maintenance', label: 'Maintenance', color: 'yellow' },
                  { key: 'error', label: 'Error', color: 'red' },
                ],
                selected: deviceFilters.status || '',
                onSelect: handleDeviceStatusFilter,
              },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {facilityDevices.length} of {deviceTotal} devices
            </p>
            <ViewModeToggle value={deviceViewMode} onChange={setDeviceViewMode} showText={false} />
          </div>

          {deviceLoading && devicesInitialLoad ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading devices...</p>
            </div>
          ) : facilityDevices.length === 0 && !deviceLoading ? (
            <div className="text-center py-12">
              <ServerIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No devices found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {deviceFilters.search || deviceFilters.status || (deviceFilters.device_type && deviceFilters.device_type !== 'all')
                  ? 'Try adjusting your filters.'
                  : 'This facility does not have any devices yet.'}
              </p>
            </div>
          ) : (
            <div className="relative">
              {deviceLoading && !devicesInitialLoad && (
                <div className="absolute top-0 right-0 z-10">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              )}
              {deviceViewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {facilityDevices.map((device) => {
                    if (device.device_category === 'blulok') {
                      const bluLokDevice = device as BluLokDevice;
                      return (
                        <BluLokDeviceCardShared
                          key={device.id}
                          device={bluLokDevice}
                          onViewDevice={() => navigate(`/devices/${device.id}`, {
                            state: withReturnPath(location, { from: 'facility', facilityId: facility.id }),
                          })}
                        />
                      );
                    }

                    return (
                      <ACDeviceCardShared
                        key={device.id}
                        device={device as AccessControlDevice}
                        onViewDevice={() => navigate(`/devices/${device.id}`, {
                          state: withReturnPath(location, { from: 'facility', facilityId: facility.id }),
                        })}
                        groupNames={groupNamesByDeviceId[device.id] || []}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <SortableTableTh
                          label="Device"
                          columnKey="name"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label="Type"
                          columnKey="device_type"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label="Status"
                          columnKey="status"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label="Location"
                          columnKey="facility_name"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label="Gateway"
                          columnKey="gateway_name"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label="Last Activity"
                          columnKey="last_activity"
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {facilityDevices.map((device) => {
                        const isBlulok = device.device_category === 'blulok';
                        const accessDevice = device as AccessControlDevice & { device_category: string };
                        const blulokDevice = device as BluLokDevice & { device_category: string };
                        const DeviceIcon = isBlulok
                          ? LockClosedIcon
                          : deviceTypeIcons[accessDevice.device_type as keyof typeof deviceTypeIcons] || ServerIcon;
                        const st = isBlulok ? blulokDevice.device_status : accessDevice.status;
                        const StatusIcon =
                          deviceListStatusIcons[st as keyof typeof deviceListStatusIcons] || CheckCircleIcon;
                        const groups = groupNamesByDeviceId[device.id] || [];
                        const groupsLabel = groups.length ? groups.slice(0, 2).join(', ') + (groups.length > 2 ? '…' : '') : '—';
                        const facilityId =
                          typeof (device as { facility_id?: string }).facility_id === 'string'
                            ? (device as { facility_id: string }).facility_id
                            : undefined;
                        return (
                          <tr
                            key={`${device.device_category}-${device.id}`}
                            className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                            onClick={() =>
                              navigate(`/devices/${device.id}`, {
                                state: withReturnPath(location, { from: 'facility', facilityId: facility.id }),
                              })
                            }
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className={`p-2 rounded-lg ${isBlulok ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-primary-100 dark:bg-primary-900/20'}`}>
                                  <DeviceIcon className={`h-4 w-4 ${isBlulok ? 'text-blue-600 dark:text-blue-400' : 'text-primary-600 dark:text-primary-400'}`} />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {isBlulok ? `Unit ${blulokDevice.unit_number ?? blulokDevice.device_serial}` : accessDevice.name}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {isBlulok ? blulokDevice.device_serial : accessDevice.location_description || '—'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isBlulok ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400'
                              }`}>
                                {isBlulok ? 'BluLok' : accessDevice.device_type?.replace('_', ' ') || '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${deviceListStatusColors[st] || deviceListStatusColors.unknown}`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {st}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {isBlulok
                                ? blulokDevice.facility_name || '—'
                                : accessDevice.facility_name || accessDevice.location_description || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-[10rem] truncate" title={groups.join(', ')}>
                              {groupsLabel}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {device.last_activity ? new Date(device.last_activity).toLocaleString() : 'Never'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm" onClick={(e) => e.stopPropagation()}>
                              {isBlulok && facilityId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const idx = facilityDevices.findIndex(
                                      (d) =>
                                        (typeof (d as { facility_id?: string }).facility_id === 'string'
                                          ? (d as { facility_id: string }).facility_id
                                          : undefined) === facilityId
                                    );
                                    const page = idx !== -1 ? calculatePageForItem(idx, DEVICES_PAGE_LIMIT) : 1;
                                    navigateAndHighlight(navigate, { id: facilityId, type: 'facility', page });
                                  }}
                                  className="text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                                >
                                  <BuildingOfficeIcon className="h-4 w-4" />
                                  Facility
                                </button>
                              )}
                              {!isBlulok && accessDevice.gateway_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const idx = facilityDevices.findIndex((d) => d.gateway_id === accessDevice.gateway_id);
                                    const page = idx !== -1 ? calculatePageForItem(idx, DEVICES_PAGE_LIMIT) : 1;
                                    navigateAndHighlight(navigate, { id: accessDevice.gateway_id, type: 'facility', page });
                                  }}
                                  className="text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                                >
                                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                  Gateway
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
            </div>
          )}

          {deviceTotalPages > 1 && (
            <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setDevicePage(prev => Math.max(prev - 1, 1))}
                  disabled={devicePage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setDevicePage(prev => Math.min(prev + 1, deviceTotalPages))}
                  disabled={devicePage === deviceTotalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Showing{' '}
                    <span className="font-medium">{(devicePage - 1) * DEVICES_PAGE_LIMIT + 1}</span>
                    {' '}to{' '}
                    <span className="font-medium">{Math.min(devicePage * DEVICES_PAGE_LIMIT, deviceTotal)}</span>
                    {' '}of{' '}
                    <span className="font-medium">{deviceTotal}</span>
                    {' '}devices
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setDevicePage(prev => Math.max(prev - 1, 1))}
                      disabled={devicePage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setDevicePage(prev => Math.min(prev + 1, deviceTotalPages))}
                      disabled={devicePage === deviceTotalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'units' && (
        <div className="space-y-6">
          {canManage && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddUnitModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Add Unit
              </button>
            </div>
          )}

          <ExpandableFilters
            searchValue={unitFilters.search || ''}
            onSearchChange={handleUnitSearch}
            searchPlaceholder="Search units..."
            isExpanded={unitFiltersExpanded}
            onToggleExpanded={() => setUnitFiltersExpanded(!unitFiltersExpanded)}
            onClearFilters={() => {
              setUnitFilters({
                search: '',
                status: '',
                unit_type: '',
                sortBy: 'unit_number',
                sortOrder: 'asc',
              });
              setFacilityUnitsPageNumber(1);
            }}
            sections={[
              {
                title: 'Status',
                icon: <SignalIcon className="h-5 w-5" />,
                options: [
                  { key: '', label: 'All Status', color: 'primary' },
                  { key: 'available', label: 'Available', color: 'green' },
                  { key: 'occupied', label: 'Occupied', color: 'blue' },
                  { key: 'maintenance', label: 'Maintenance', color: 'yellow' },
                  { key: 'reserved', label: 'Reserved', color: 'purple' },
                ],
                selected: unitFilters.status || '',
                onSelect: handleUnitStatusFilter,
              },
              {
                title: 'Unit Type',
                icon: <HomeIcon className="h-5 w-5" />,
                options: [
                  { key: '', label: 'All Types', color: 'primary' },
                  ...DEFAULT_UNIT_TYPES.map(type => ({
                    key: type,
                    label: type,
                    color: 'gray',
                  })),
                ],
                selected: unitFilters.unit_type || '',
                onSelect: handleUnitTypeFilter,
              },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {facilityUnitsPageData.length} of {unitTotal} units
            </p>
            <ViewModeToggle value={unitViewMode} onChange={setUnitViewMode} showText={false} />
          </div>

          {unitLoading && unitsInitialLoad ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading units...</p>
            </div>
          ) : facilityUnitsPageData.length > 0 ? (
            <div className="relative">
              {unitLoading && !unitsInitialLoad && (
                <div className="absolute top-0 right-0 z-10">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              )}
              {unitViewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {facilityUnitsPageData.map((unit) => (
                    <UnitCard key={unit.id} unit={unit} />
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <SortableTableTh
                          label="Unit"
                          columnKey="unit_number"
                          sortBy={unitFilters.sortBy || 'unit_number'}
                          sortOrder={unitFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityUnitColumnSort}
                        />
                        <SortableTableTh
                          label="Status"
                          columnKey="status"
                          sortBy={unitFilters.sortBy || 'unit_number'}
                          sortOrder={unitFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityUnitColumnSort}
                        />
                        <SortableTableTh
                          label="Tenant"
                          columnKey="tenant_last_name"
                          sortBy={unitFilters.sortBy || 'unit_number'}
                          sortOrder={unitFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityUnitColumnSort}
                        />
                        <SortableTableTh
                          label="Lock"
                          columnKey="lock_status"
                          sortBy={unitFilters.sortBy || 'unit_number'}
                          sortOrder={unitFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityUnitColumnSort}
                        />
                        <SortableTableTh
                          label="Battery"
                          columnKey="battery_level"
                          sortBy={unitFilters.sortBy || 'unit_number'}
                          sortOrder={unitFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityUnitColumnSort}
                        />
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Open
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {facilityUnitsPageData.map((unit) => (
                        <tr
                          key={unit.id}
                          className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                          onClick={() => {
                            const currentTab = activeTab || 'units';
                            navigate(`/units/${unit.id}`, {
                              state: withReturnPath(location, {
                                returnTab: currentTab,
                                returnPath: `${location.pathname}?tab=${currentTab}`,
                              }),
                            });
                          }}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                            Unit {unit.unit_number}
                            <div className="text-gray-500 dark:text-gray-400 font-normal">{unit.unit_type}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[unit.status]}`}>
                              {unit.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {unit.primary_tenant ? (
                              <>
                                <div className="font-medium">
                                  {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                                </div>
                                <div className="text-gray-500 dark:text-gray-400 text-xs">{unit.primary_tenant.email}</div>
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {unit.blulok_device ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[unit.blulok_device.lock_status as keyof typeof statusColors] || statusColors.unknown}`}>
                                {unit.blulok_device.lock_status === 'locked' ? (
                                  <LockClosedIcon className="h-3 w-3 mr-1" />
                                ) : (
                                  <LockOpenIcon className="h-3 w-3 mr-1" />
                                )}
                                {unit.blulok_device.lock_status}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {unit.blulok_device?.battery_level != null ? (
                              <span
                                className={
                                  unit.blulok_device.battery_level < 20
                                    ? 'text-red-500 font-medium'
                                    : unit.blulok_device.battery_level < 50
                                      ? 'text-yellow-500 font-medium'
                                      : 'text-green-500 font-medium'
                                }
                              >
                                {unit.blulok_device.battery_level}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                const currentTab = activeTab || 'units';
                                navigate(`/units/${unit.id}`, {
                                  state: withReturnPath(location, {
                                    returnTab: currentTab,
                                    returnPath: `${location.pathname}?tab=${currentTab}`,
                                  }),
                                });
                              }}
                              className="text-primary-600 dark:text-primary-400 hover:underline text-sm"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : !unitLoading ? (
            <div className="text-center py-12">
              <HomeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No units found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {unitFilters.search || unitFilters.status || unitFilters.unit_type
                  ? 'Try adjusting your filters.'
                  : 'This facility does not have any units yet.'}
              </p>
            </div>
          ) : null}

          {unitTotalPages > 1 && (
            <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setFacilityUnitsPageNumber(prev => Math.max(prev - 1, 1))}
                  disabled={facilityUnitsPageNumber === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFacilityUnitsPageNumber(prev => Math.min(prev + 1, unitTotalPages))}
                  disabled={facilityUnitsPageNumber === unitTotalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Showing{' '}
                    <span className="font-medium">{(facilityUnitsPageNumber - 1) * UNITS_PAGE_LIMIT + 1}</span>
                    {' '}to{' '}
                    <span className="font-medium">{Math.min(facilityUnitsPageNumber * UNITS_PAGE_LIMIT, unitTotal)}</span>
                    {' '}of{' '}
                    <span className="font-medium">{unitTotal}</span>
                    {' '}units
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setFacilityUnitsPageNumber(prev => Math.max(prev - 1, 1))}
                      disabled={facilityUnitsPageNumber === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setFacilityUnitsPageNumber(prev => Math.min(prev + 1, unitTotalPages))}
                      disabled={facilityUnitsPageNumber === unitTotalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gateway Tab */}
      {activeTab === 'gateway' && facility && (
        <FacilityGatewayTab
          facilityId={facility.id}
          facilityName={facility.name}
          canManageGateway={canManageGateway}
        />
      )}

      {/* Schedules Tab */}
      {activeTab === 'schedules' && facility && (
        <SchedulesHubTab
          facilityId={facility.id}
          userId={authState.user?.id}
          canManageUserSchedules={!isTenant && canManage}
        />
      )}

      {activeTab === 'device-groups' && facility && (
        <DeviceGroupManager
          facilityId={facility.id}
          devices={[
            ...((deviceHierarchy?.accessControlDevices || []).map((d) => ({ ...d, device_category: 'access_control' as const }))),
            ...((deviceHierarchy?.blulokDevices || []).map((d) => ({
              ...d,
              name: d.unit_number ? `Unit ${d.unit_number}` : d.device_serial,
              device_category: 'blulok' as const,
            }))),
          ]}
          groups={deviceGroups}
          onGroupsChanged={loadDeviceGroups}
        />
      )}

      {/* FMS Integration Tab */}
      {activeTab === 'fms' && facility && (
        <FacilityFMSTab
          facilityId={facility.id}
          facilityName={facility.name}
          isDevMode={localStorage.getItem('fms-simulated-enabled') === 'true'}
          canEditFMS={canEditFMS}
        />
      )}

      {activeTab === 'access-codes' && facility && (
        (isTenant || !canManage) ? (
          <MyAccessCodes facilityId={facility.id} />
        ) : (
          <AccessCodeManagementTab
            facilityId={facility.id}
            devices={deviceHierarchy?.accessControlDevices || []}
          />
        )
      )}

      {/* Add Device Modal */}
      <AddDeviceModal
        isOpen={showAddDeviceModal}
        onClose={() => setShowAddDeviceModal(false)}
        onSuccess={() => {
          loadFacilityData();
          loadFacilityDevices();
          setShowAddDeviceModal(false);
        }}
        facilityId={facility?.id}
        deviceType={selectedDeviceType}
      />

      {/* Add Unit Modal */}
      <AddUnitModal
        isOpen={showAddUnitModal}
        onClose={() => setShowAddUnitModal(false)}
        onSuccess={() => {
          loadFacilityData();
          loadFacilityUnitsPageData();
          setShowAddUnitModal(false);
        }}
        facilityId={facility?.id}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Facility"
        message={loadingImpact ? 'Loading impact...' : `This will permanently delete this facility and remove ${deleteImpact?.units ?? 0} unit(s), ${deleteImpact?.devices ?? 0} device(s), and ${deleteImpact?.gateways ?? 0} gateway(s). This action cannot be undone.`}
        confirmText="Delete Facility"
        variant="danger"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
