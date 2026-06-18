import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  WrenchScrewdriverIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Facility, DeviceHierarchy, AccessControlDevice, BluLokDevice, NetworkInfraDevice, Unit, DeviceFilters, UnitFilters, DeviceGroup } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { UserRole } from '@/types/auth.types';
import { AddDeviceModal } from '@/components/Devices/AddDeviceModal';
import { AddUnitModal } from '@/components/Units/AddUnitModal';
import { MapCard } from '@/components/GoogleMaps/MapCard';
import { FacilityFMSTab } from '@/components/FMS/FacilityFMSTab';
import { FacilityLockTimeoutSetting } from '@/components/Facility/FacilityLockTimeoutSetting';
import FacilityGatewayTab from '@/components/Gateway/FacilityGatewayTab';
import { SchedulesHubTab } from '@/components/Schedules/SchedulesHubTab';
import { AccessCodeManagementTab } from '@/components/AccessCodes/AccessCodeManagementTab';
import { MyAccessCodes } from '@/components/AccessCodes/MyAccessCodes';
import { DeviceGroupManager } from '@/components/AccessCodes/DeviceGroupManager';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { useToast } from '@/contexts/ToastContext';
import { AccessControlDeviceCard as ACDeviceCardShared, BluLokDeviceCard as BluLokDeviceCardShared, NetworkInfraDeviceCard } from '@/components/Devices/DeviceCards';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import {
  DetailsPageHeader,
  DetailsPageNotFound,
  DetailsPagePrimaryAction,
  DetailsPageShell,
  DetailsTabNav,
} from '@/components/Common/DetailsPageLayout';
import { useDetailsBackNavigation, withReturnPath } from '@/hooks/useBackNavigation';
import { formatDateTime } from '@/utils/datetime.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { resolveLockTimeoutMsForFacility } from '@/utils/facilityLockTimeout.utils';
import { formatAccessDeviceListSubtitle } from '@/utils/accessDeviceDisplay.utils';
import {
  formatBluLokDeviceSubtitle,
  formatBluLokLockNumberLabel,
} from '@/utils/blulokDeviceDisplay.utils';
import { canRequestRemoteUnlock } from '@/utils/unitLock.utils';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { useFacilityGatewayLiveStatus } from '@/hooks/useFacilityGatewayLiveStatus';
import { gatewayOperationalStatusColors } from '@/utils/facility-gateway-live-status.utils';
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
    if (key === 'device_type' && value === 'all') return;
    if (key === 'device_scope' && value === 'operational') return;
    sanitized[key] = value;
  });
  return sanitized;
};

export default function FacilityDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ showWithoutFromPath: false });
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { selectedFacilityId, setSelectedFacilityId, isAllFacilitiesSelected, facilities } = useGlobalFacility();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [deviceHierarchy, setDeviceHierarchy] = useState<DeviceHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  
const FACILITY_TAB_KEYS = [
  'facility',
  'devices',
  'units',
  'schedules',
  'access-codes',
  'device-groups',
  'fms',
  'gateway',
] as const;

type FacilityTab = (typeof FACILITY_TAB_KEYS)[number];

const isFacilityTab = (value: string | null): value is FacilityTab =>
  !!value && (FACILITY_TAB_KEYS as readonly string[]).includes(value);

const normalizeFacilityTab = (value: string | null): FacilityTab | null => {
  if (value === 'overview') return 'facility';
  return isFacilityTab(value) ? value : null;
};
  type FacilityDeviceListItem =
    | ((AccessControlDevice | BluLokDevice) & { device_category: string })
    | NetworkInfraDevice;

  // Get initial tab from URL query parameter or location state
  const getInitialTab = (): FacilityTab => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = normalizeFacilityTab(urlParams.get('tab'));
    if (tabParam) {
      return tabParam;
    }
    const locationState = location.state as { tab?: string } | null;
    const stateTab = locationState?.tab ? normalizeFacilityTab(locationState.tab) : null;
    if (stateTab) {
      return stateTab;
    }
    return 'facility';
  };
  
  const [activeTab, setActiveTab] = useState<FacilityTab>(getInitialTab());
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [showCreateDeviceGroup, setShowCreateDeviceGroup] = useState(false);
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
    device_scope: 'operational',
    status: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [showDeleteInfraConfirm, setShowDeleteInfraConfirm] = useState<NetworkInfraDevice | null>(null);
  const [deletingInfraDevice, setDeletingInfraDevice] = useState(false);
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

  const { requestUnlock, isSubmitting, syncLockStatus } = useRemoteUnlockAction({
    timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
  });

  useEffect(() => {
    for (const unit of facilityUnitsPageData) {
      if (unit.blulok_device?.lock_status) {
        syncLockStatus(unit.id, unit.blulok_device.lock_status);
      }
    }
  }, [facilityUnitsPageData, syncLockStatus]);

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const canEditFacilitySettings = (() => {
    if (!canManage || !id) return false;
    if (authState.user?.role === UserRole.FACILITY_ADMIN) {
      return facilities.some((f) => f.id === id);
    }
    return true;
  })();
  const canEditFMS = ['admin', 'dev_admin'].includes(authState.user?.role || '');
  const canManageGateway = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');
  const isTenant = authState.user?.role === 'tenant';
  const facilityGatewayLiveStatus = useFacilityGatewayLiveStatus(facility?.id, {
    enabled: !isTenant && !!facility?.id,
  });
  const canDelete = ['admin', 'dev_admin'].includes(authState.user?.role || '');
  const isNetworkInfraDeviceScope = deviceFilters.device_scope === 'network_infra';

  // Refs for debouncing WebSocket-triggered refreshes
  const loadDevicesRef = useRef<(opts?: { background?: boolean }) => void | Promise<void>>(async () => {});
  const loadUnitsRef = useRef<(opts?: { background?: boolean }) => void | Promise<void>>(async () => {});
  const loadFacilityDataRef = useRef<
    (facilityId?: string, options?: { background?: boolean }) => void | Promise<void>
  >(async () => {});
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
      const tabParam = normalizeFacilityTab(urlParams.get('tab')) || 'facility';
      navigate(`/facilities/${selectedFacilityId}?tab=${tabParam}`, { replace: true });
    }
  }, [selectedFacilityId, id, isAllFacilitiesSelected, navigate, location.search]);

  // Sync active tab with URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    const normalizedTab = normalizeFacilityTab(tabParam);
    if (normalizedTab) {
      setActiveTab(normalizedTab);
      if (tabParam === 'overview') {
        urlParams.set('tab', 'facility');
        navigate(`${location.pathname}?${urlParams.toString()}`, { replace: true });
      }
    } else if (!tabParam && facility) {
      urlParams.set('tab', 'facility');
      navigate(`${location.pathname}?${urlParams.toString()}`, { replace: true });
    }
  }, [location.search, location.pathname, navigate, facility]);

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

  const needsOverviewRealtime =
    (activeTab === 'facility' || activeTab === 'device-groups' || activeTab === 'access-codes') &&
    !!facility?.id;

  const debouncedOverviewWsRefresh = useCallback(() => {
    if (facility?.id) {
      void loadFacilityDataRef.current(facility.id, { background: true });
    }
  }, [facility?.id]);

  useLockDeviceRealtime({
    enabled: needsOverviewRealtime,
    facilityId: facility?.id,
    debouncedRefresh: debouncedOverviewWsRefresh,
    debounceMs: 500,
  });

  const loadFacilityData = useCallback(async (facilityId?: string, options?: { background?: boolean }) => {
    const targetId = facilityId || id;
    if (!targetId) return;

    try {
      if (!options?.background) {
        setLoading(true);
      }
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
      if (!options?.background) {
        setLoading(false);
      }
    }
  }, [id, isTenant]);

  useEffect(() => {
    loadFacilityDataRef.current = loadFacilityData;
  }, [loadFacilityData]);

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
      addToast({ type: 'error', title: 'Failed to load devices' });
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

    const previousStatus = unit.blulok_device.lock_status ?? 'locked';
    let clearTransitionalAfterRefresh = false;

    const patchUnitLockStatus = (lockStatus: string) => {
      setFacilityUnitsPageData((prev) =>
        prev.map((u) =>
          u.id === unit.id && u.blulok_device
            ? { ...u, blulok_device: { ...u.blulok_device, lock_status: lockStatus } }
            : u,
        ),
      );
    };

    const refreshAfterUnlockAttempt = async () => {
      await loadFacilityUnitsPageData();
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      setFacilityUnitsPageData((prev) =>
        prev.map((u) => {
          if (u.id !== unit.id || !u.blulok_device) return u;
          const status = u.blulok_device.lock_status;
          if (status === 'unlocking' || status === 'locking') {
            return {
              ...u,
              blulok_device: { ...u.blulok_device, lock_status: previousStatus },
            };
          }
          return u;
        }),
      );
    };

    await requestUnlock({
      deviceId: unit.blulok_device.id,
      watchKey: unit.id,
      timeoutMs: resolveLockTimeoutMsForFacility(facility),
      getLockStatus: () => {
        const cur = facilityUnitsRef.current.find((x) => x.id === unit.id);
        return cur?.blulok_device?.lock_status;
      },
      applyOptimisticUnlocking: () => {
        patchUnitLockStatus('unlocking');
      },
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchUnitLockStatus(status);
      },
      refresh: async () => {
        await refreshAfterUnlockAttempt();
        await loadFacilityData();
      },
    });
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

  const handleDeviceScopeFilter = (scope: string) => {
    setDeviceFilters(prev => ({
      ...prev,
      device_scope: scope as DeviceFilters['device_scope'],
      device_type: scope === 'network_infra' ? 'all' : prev.device_type,
    }));
    setDevicePage(1);
  };

  const handleDeleteInfraDevice = async () => {
    if (!showDeleteInfraConfirm) return;

    try {
      setDeletingInfraDevice(true);
      await apiService.removeNetworkInfraDeviceFromCloudInventory(showDeleteInfraConfirm.id);
      addToast({ type: 'success', title: 'Network device removed from inventory' });
      await loadFacilityDevices();
      setShowDeleteInfraConfirm(null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      addToast({
        type: 'error',
        title: apiError?.response?.data?.message || 'Failed to remove network device',
      });
    } finally {
      setDeletingInfraDevice(false);
    }
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

  const headerActions = useMemo(() => {
    if (!canManage) return null;
    if (activeTab === 'devices') {
      if (isNetworkInfraDeviceScope) return null;
      return (
        <DetailsPagePrimaryAction
          label="Add device"
          onClick={() => setShowAddDeviceModal(true)}
        />
      );
    }
    if (activeTab === 'units') {
      return (
        <DetailsPagePrimaryAction
          label="Add Unit"
          onClick={() => setShowAddUnitModal(true)}
        />
      );
    }
    if (activeTab === 'device-groups') {
      return (
        <DetailsPagePrimaryAction
          label="Add Group"
          onClick={() => setShowCreateDeviceGroup(true)}
        />
      );
    }
    return null;
  }, [activeTab, canManage, isNetworkInfraDeviceScope]);

  if (loading) {
    return (
      <DetailsPageShell>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-300 dark:bg-gray-600 rounded mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-300 dark:bg-gray-600 rounded"></div>
            ))}
          </div>
        </div>
      </DetailsPageShell>
    );
  }

  if (!facility) {
    return (
      <DetailsPageNotFound
        icon={<BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />}
        title="Facility not found"
        message="The facility you're looking for doesn't exist or you don't have access to it."
        onBack={showBack ? goBack : undefined}
        backLabel={backLabel}
      />
    );
  }

  // Using shared device cards for parity with Devices Management

  const UnitCard = ({ unit }: { unit: Unit }) => {
    return (
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-md hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
        onClick={() => {
          // Preserve current tab in URL when navigating to unit
          const currentTab = activeTab || 'facility';
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
                unit.blulok_device.lock_status === 'locking' ||
                isSubmitting(unit.id)
              }
              onClick={() => void handleFacilityUnitUnlock(unit)}
              className={`inline-flex items-center rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                unit.blulok_device.lock_status === 'unlocking' || isSubmitting(unit.id)
                  ? 'bg-blue-600 text-white animate-pulse'
                  : canRequestRemoteUnlock(unit.blulok_device.lock_status)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
              }`}
            >
              {unit.blulok_device.lock_status === 'unlocking' || isSubmitting(unit.id) ? (
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

  const facilityTabs = [
    { key: 'facility', label: 'Facility', icon: BuildingOfficeIcon },
    ...(!isTenant && canManage ? [{ key: 'devices', label: 'Devices', icon: ServerIcon }] : []),
    { key: 'units', label: 'Units', icon: HomeIcon },
    { key: 'schedules', label: 'Schedules', icon: ClockIcon },
    { key: 'access-codes', label: 'Access Codes', icon: KeyIcon },
    ...(!isTenant && canManage ? [{ key: 'device-groups', label: 'Device Groups', icon: RectangleGroupIcon }] : []),
    ...(!isTenant && canManage ? [{ key: 'fms', label: 'FMS Integration', icon: CloudIcon }] : []),
    ...(!isTenant && canManageGateway ? [{ key: 'gateway', label: 'Gateway', icon: SignalIcon }] : []),
  ];

  return (
    <DetailsPageShell>
      <DetailsPageHeader
        title={facility.name}
        subtitle={facility.address}
        actions={headerActions}
        media={
          facility.branding_image && facility.image_mime_type ? (
            <img
              src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
              alt={facility.name}
              className="h-16 w-16 rounded-lg object-contain bg-white dark:bg-gray-100 p-1 border border-gray-200 dark:border-gray-600 flex-shrink-0"
            />
          ) : undefined
        }
      />

      <DetailsTabNav
        tabs={facilityTabs}
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key as FacilityTab);
          const newSearchParams = new URLSearchParams(location.search);
          newSearchParams.set('tab', key);
          navigate(`${location.pathname}?${newSearchParams.toString()}`, { replace: true });
        }}
      />

      {/* Tab Content */}
      {activeTab === 'facility' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Facility profile</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Core identity and contact details for this site.
              </p>
              {facility.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-6">{facility.description}</p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                  <dd className="mt-1 font-medium text-gray-900 dark:text-white">{facility.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Facility ID</dt>
                  <dd className="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{facility.id}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 dark:text-gray-400">Address</dt>
                  <dd className="mt-1 flex items-center text-gray-900 dark:text-white">
                    <MapPinIcon className="h-4 w-4 mr-2 flex-shrink-0 text-gray-400" />
                    {facility.address}
                  </dd>
                </div>
                {facility.contact_email && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Contact email</dt>
                    <dd className="mt-1 flex items-center text-gray-900 dark:text-white">
                      <EnvelopeIcon className="h-4 w-4 mr-2 flex-shrink-0 text-gray-400" />
                      {facility.contact_email}
                    </dd>
                  </div>
                )}
                {facility.contact_phone && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Contact phone</dt>
                    <dd className="mt-1 flex items-center text-gray-900 dark:text-white">
                      <PhoneIcon className="h-4 w-4 mr-2 flex-shrink-0 text-gray-400" />
                      {facility.contact_phone}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {!isTenant && (
              <FacilityLockTimeoutSetting
                facility={facility}
                canEdit={canEditFacilitySettings}
                onUpdated={(updated) => setFacility(updated)}
              />
            )}

            {!isTenant && facilityGatewayLiveStatus.gateway && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Gateway status</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg mr-4">
                      <ServerIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">{facilityGatewayLiveStatus.gateway.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{facilityGatewayLiveStatus.gateway.ip_address}</p>
                      {facilityGatewayLiveStatus.lastActivityAt && facilityGatewayLiveStatus.effectiveStatus === 'online' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Last activity: {formatDateTime(new Date(facilityGatewayLiveStatus.lastActivityAt))}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${gatewayOperationalStatusColors[facilityGatewayLiveStatus.effectiveStatus]}`}>
                    {facilityGatewayLiveStatus.effectiveStatus}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {!isTenant && facility.stats && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Statistics</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <HomeIcon className="h-5 w-5 text-blue-500 mr-2" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total units</span>
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
                      <span className="text-sm text-gray-600 dark:text-gray-400">Devices online</span>
                    </div>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      {facility.stats.devicesOnline}/{facility.stats.devicesTotal}
                    </span>
                  </div>
                </div>
              </div>
            )}

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

            {canManage && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Edit facility</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Update name, address, branding, and contact information.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/facilities/${facility.id}/edit`, { state: withReturnPath(location) })
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit facility settings
                </button>
              </div>
            )}

            {canDelete && (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-6">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-red-900 dark:text-red-200">Delete facility</h3>
                    <p className="mt-1 text-sm text-red-800/90 dark:text-red-300/90">
                      Permanently removes this facility, all units, devices, and gateway assignments. This cannot be
                      undone.
                    </p>
                    <button
                      type="button"
                      onClick={() => void openDeleteConfirm()}
                      disabled={loadingImpact}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                      {loadingImpact ? 'Loading impact…' : 'Delete facility'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="space-y-6">
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
                device_scope: 'operational',
                status: '',
                sortBy: 'name',
                sortOrder: 'asc',
              });
              setDevicePage(1);
            }}
            sections={[
              {
                title: 'Device Scope',
                icon: <ServerIcon className="h-5 w-5" />,
                options: [
                  { key: 'operational', label: 'Access Control + Locks', color: 'primary' },
                  { key: 'network_infra', label: 'Network Infra', color: 'blue' },
                ],
                selected: deviceFilters.device_scope || 'operational',
                onSelect: handleDeviceScopeFilter,
              },
              ...(!isNetworkInfraDeviceScope ? [{
                title: 'Device Type',
                icon: <FunnelIcon className="h-5 w-5" />,
                options: [
                  { key: 'all', label: 'All Devices', color: 'primary' },
                  { key: 'access_control', label: 'Access Control', color: 'blue' },
                  { key: 'blulok', label: 'BluLok', color: 'green' },
                ],
                selected: deviceFilters.device_type || 'all',
                onSelect: handleDeviceTypeFilter,
              }] : []),
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
                {deviceFilters.search || deviceFilters.status || (!isNetworkInfraDeviceScope && deviceFilters.device_type && deviceFilters.device_type !== 'all')
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
                    if (device.device_category === 'network_infra') {
                      return (
                        <NetworkInfraDeviceCard
                          key={device.id}
                          device={device as NetworkInfraDevice}
                          canManage={canManage}
                          onDelete={(d) => setShowDeleteInfraConfirm(d)}
                          onManageGateway={() => setActiveTab('gateway')}
                        />
                      );
                    }
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
                          label={isNetworkInfraDeviceScope ? 'Gateway' : 'Location'}
                          columnKey={isNetworkInfraDeviceScope ? 'gateway_name' : 'facility_name'}
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        <SortableTableTh
                          label={isNetworkInfraDeviceScope ? 'Last Seen' : 'Last Activity'}
                          columnKey={isNetworkInfraDeviceScope ? 'last_seen' : 'last_activity'}
                          sortBy={deviceFilters.sortBy || 'name'}
                          sortOrder={deviceFilters.sortOrder === 'desc' ? 'desc' : 'asc'}
                          onSort={handleFacilityDeviceColumnSort}
                        />
                        {isNetworkInfraDeviceScope && canManage && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {facilityDevices.map((device) => {
                        if (device.device_category === 'network_infra') {
                          const infraDevice = device as NetworkInfraDevice;
                          const StatusIcon =
                            deviceListStatusIcons[infraDevice.status as keyof typeof deviceListStatusIcons] || CheckCircleIcon;
                          return (
                            <tr key={`network-infra-${infraDevice.id}`} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {infraDevice.device_kind === 'gateway' ? infraDevice.name : infraDevice.device_kind.replace('_', ' ')}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">{infraDevice.device_serial}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm capitalize">{infraDevice.device_kind.replace('_', ' ')}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${deviceListStatusColors[infraDevice.status as keyof typeof deviceListStatusColors] || deviceListStatusColors.unknown}`}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {infraDevice.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {infraDevice.device_kind === 'gateway' ? '—' : (infraDevice.gateway_name || 'N/A')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {infraDevice.last_seen ? formatDateTime(infraDevice.last_seen) : 'Never'}
                              </td>
                              {isNetworkInfraDeviceScope && canManage && (
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  {infraDevice.deletable ? (
                                    <button
                                      type="button"
                                      onClick={() => setShowDeleteInfraConfirm(infraDevice)}
                                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                      Remove
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">Read-only</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        }

                        const isBlulok = device.device_category === 'blulok';
                        const accessDevice = device as AccessControlDevice & { device_category: string };
                        const blulokDevice = device as BluLokDevice & { device_category: string };
                        const lastActivity = isBlulok ? blulokDevice.last_activity : accessDevice.last_activity;
                        const DeviceIcon = isBlulok
                          ? LockClosedIcon
                          : deviceTypeIcons[accessDevice.device_type as keyof typeof deviceTypeIcons] || ServerIcon;
                        const st = isBlulok ? blulokDevice.device_status : accessDevice.status;
                        const StatusIcon =
                          deviceListStatusIcons[st as keyof typeof deviceListStatusIcons] || CheckCircleIcon;
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
                                    {isBlulok
                                      ? formatBluLokLockNumberLabel(blulokDevice)
                                      : accessDevice.name}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {isBlulok
                                      ? `${formatBluLokDeviceSubtitle(blulokDevice)}${
                                          blulokDevice.unit_number ? ` · Unit ${blulokDevice.unit_number}` : ''
                                        }`
                                      : formatAccessDeviceListSubtitle(accessDevice)}
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {lastActivity ? formatDateTime(lastActivity) : 'Never'}
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
          liveStatus={facilityGatewayLiveStatus}
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
          createDialogOpen={showCreateDeviceGroup}
          onCreateDialogChange={setShowCreateDeviceGroup}
          hideInlineAddButton
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

      <ConfirmModal
        isOpen={!!showDeleteInfraConfirm}
        onClose={() => setShowDeleteInfraConfirm(null)}
        onConfirm={handleDeleteInfraDevice}
        title="Remove Network Device"
        message={
          showDeleteInfraConfirm
            ? `Remove ${showDeleteInfraConfirm.device_kind.replace('_', ' ')} "${showDeleteInfraConfirm.device_serial}" from cloud inventory? The gateway will be notified to stop reporting this device.`
            : ''
        }
        confirmText="Remove"
        cancelText="Cancel"
        isLoading={deletingInfraDevice}
      />
    </DetailsPageShell>
  );
}
