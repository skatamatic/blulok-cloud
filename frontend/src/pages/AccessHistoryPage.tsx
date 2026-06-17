import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { generateHighlightId, calculatePageForItem, navigateAndHighlightWithAutoPagination, navigateAndHighlight } from '@/utils/navigation.utils';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { useHighlight } from '@/hooks/useHighlight';
import { UnitFilter } from '@/components/Common/UnitFilter';
import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { SortableTableTh } from '@/components/Common/SortableTableTh';
import { useToast } from '@/contexts/ToastContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import {
  accessLogFromActivityWsData,
  matchesAccessHistoryLiveFilters,
  parseActivityWsEnvelope,
  prependUniqueAccessLog,
} from '@/utils/access-history-live.utils';
import {
  buildAccessLogDetailItems,
  formatAccessAction,
  formatAccessMethod,
  getAccessFailureDetail,
  getAccessLocationDisplay,
  getAccessLogMetadata,
  getAccessStatusDisplay,
  getAccessUserDisplay,
} from '@/utils/access-history-display.utils';
import {
  buildLocalDateRangeQuery,
  formatDateTime,
  toLocalDateInputValue,
} from '@/utils/datetime.utils';
import {
  ArrowDownTrayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  CreditCardIcon,
  FingerPrintIcon,
  CalendarIcon,
  UserIcon,
  BuildingStorefrontIcon,
  ComputerDesktopIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  LinkIcon,
  CpuChipIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

interface FilterState {
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  action?: string;
  method?: string;
  success?: boolean;
  denial_reason?: string;
  credential_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const actionIcons = {
  unlock: LockOpenIcon,
  lock: LockClosedIcon,
  access_granted: CheckCircleIcon,
  access_denied: XCircleIcon,
  door_open: LockOpenIcon,
  door_close: LockClosedIcon,
  gate_open: LockOpenIcon,
  gate_close: LockClosedIcon,
  elevator_call: ComputerDesktopIcon,
  elevator_access: ComputerDesktopIcon,
  manual_override: KeyIcon,
  system_error: ExclamationTriangleIcon,
  timeout: ClockIcon,
  invalid_credential: XCircleIcon,
  schedule_violation: ClockIcon,
  unlock_attempt: XCircleIcon,
  lock_attempt: XCircleIcon,
};

const methodIcons = {
  app: DevicePhoneMobileIcon,
  mobile_app: DevicePhoneMobileIcon,
  keypad: KeyIcon,
  card: CreditCardIcon,
  physical_key: KeyIcon,
  mobile_key: DevicePhoneMobileIcon,
  manual: KeyIcon,
  automatic: ComputerDesktopIcon,
  local_device: ComputerDesktopIcon,
  remote_gateway: DevicePhoneMobileIcon,
  admin_remote: KeyIcon,
  route_pass: KeyIcon,
  system: ComputerDesktopIcon,
  unknown: KeyIcon,
  admin_override: KeyIcon,
  emergency: ExclamationTriangleIcon,
  scheduled: CalendarIcon,
  biometric: FingerPrintIcon,
  rfid: CreditCardIcon,
  pin: KeyIcon,
  remote: DevicePhoneMobileIcon,
};

const actionColors = {
  unlock: 'text-green-600 dark:text-green-400',
  lock: 'text-blue-600 dark:text-blue-400',
  access_granted: 'text-green-600 dark:text-green-400',
  access_denied: 'text-red-600 dark:text-red-400',
  door_open: 'text-green-600 dark:text-green-400',
  door_close: 'text-blue-600 dark:text-blue-400',
  gate_open: 'text-green-600 dark:text-green-400',
  gate_close: 'text-blue-600 dark:text-blue-400',
  elevator_call: 'text-purple-600 dark:text-purple-400',
  elevator_access: 'text-purple-600 dark:text-purple-400',
  manual_override: 'text-orange-600 dark:text-orange-400',
  system_error: 'text-red-600 dark:text-red-400',
  timeout: 'text-yellow-600 dark:text-yellow-400',
  invalid_credential: 'text-red-600 dark:text-red-400',
  schedule_violation: 'text-yellow-600 dark:text-yellow-400',
  unlock_attempt: 'text-red-600 dark:text-red-400',
  lock_attempt: 'text-red-600 dark:text-red-400',
};

const methodColors = {
  app: 'text-blue-600 dark:text-blue-400',
  mobile_app: 'text-blue-600 dark:text-blue-400',
  keypad: 'text-gray-600 dark:text-gray-400',
  card: 'text-purple-600 dark:text-purple-400',
  physical_key: 'text-gray-600 dark:text-gray-400',
  mobile_key: 'text-blue-600 dark:text-blue-400',
  manual: 'text-orange-600 dark:text-orange-400',
  automatic: 'text-green-600 dark:text-green-400',
  local_device: 'text-green-600 dark:text-green-400',
  remote_gateway: 'text-blue-600 dark:text-blue-400',
  admin_remote: 'text-orange-600 dark:text-orange-400',
  route_pass: 'text-indigo-600 dark:text-indigo-400',
  system: 'text-gray-600 dark:text-gray-400',
  unknown: 'text-gray-600 dark:text-gray-400',
  admin_override: 'text-red-600 dark:text-red-400',
  emergency: 'text-red-600 dark:text-red-400',
  scheduled: 'text-indigo-600 dark:text-indigo-400',
  biometric: 'text-pink-600 dark:text-pink-400',
  rfid: 'text-purple-600 dark:text-purple-400',
  pin: 'text-gray-600 dark:text-gray-400',
  remote: 'text-blue-600 dark:text-blue-400',
};

type SortableColumn = 'occurred_at' | 'action' | 'user_name' | 'facility_name' | 'success' | 'method';

const defaultAccessHistoryDateFilters = (): Pick<FilterState, 'date_from' | 'date_to' | 'limit'> => {
  const today = toLocalDateInputValue();
  const weekAgo = toLocalDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  return {
    date_from: weekAgo,
    date_to: today,
    limit: 50,
  };
};

export default function AccessHistoryPage() {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { selectedFacilityId } = useGlobalFacility();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(
    () => !!searchParams.get('unit_id')
  );
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableColumn>('occurred_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<FilterState>(() => {
    const unitId = searchParams.get('unit_id') ?? undefined;
    const facilityId = searchParams.get('facility_id') ?? undefined;
    return {
      ...defaultAccessHistoryDateFilters(),
      ...(unitId ? { unit_id: unitId } : {}),
      ...(facilityId ? { facility_id: facilityId } : {}),
    };
  });

  const isFacilityAdmin = authState.user?.role === 'facility_admin';
  const isTenant = authState.user?.role === 'tenant';
  const isFacilityScoped = !!selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID;

  const activityWsFilters = useMemo(() => {
    if (filters.unit_id) {
      return {
        unit_id: filters.unit_id,
        ...(filters.facility_id ? { facility_id: filters.facility_id } : {}),
      };
    }
    if (isFacilityScoped) {
      return { facility_id: selectedFacilityId };
    }
    if (filters.facility_id) {
      return { facility_id: filters.facility_id };
    }
    return undefined;
  }, [filters.unit_id, filters.facility_id, isFacilityScoped, selectedFacilityId]);

  const liveAccessFilters = useMemo(() => {
    const facilityId =
      filters.unit_id && filters.facility_id
        ? filters.facility_id
        : !filters.unit_id && isFacilityScoped
          ? selectedFacilityId
          : filters.facility_id;

    return {
      facility_id: facilityId,
      unit_id: filters.unit_id,
      user_id: isTenant ? authState.user?.id : filters.user_id,
      action: filters.action,
      method: filters.method,
      success: filters.success,
      denial_reason: filters.denial_reason,
      search: filters.search,
      date_from: filters.date_from,
      date_to: filters.date_to,
    };
  }, [filters, isFacilityScoped, selectedFacilityId, isTenant, authState.user?.id]);

  const canPrependLiveRows =
    currentPage === 1 && sortBy === 'occurred_at' && sortOrder === 'desc';

  useEffect(() => {
    const unitId = searchParams.get('unit_id') ?? undefined;
    const facilityId = searchParams.get('facility_id') ?? undefined;
    setFilters((prev) => {
      if (prev.unit_id === unitId && prev.facility_id === facilityId) return prev;
      return {
        ...prev,
        unit_id: unitId,
        facility_id: facilityId,
      };
    });
    if (unitId) {
      setFiltersExpanded(true);
      setCurrentPage(1);
    }
  }, [searchParams]);

  const loadAccessHistory = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true);
      }

      let response;
      const { date_from, date_to, ...restFilters } = filters;
      const queryFilters: Omit<FilterState, 'date_from' | 'date_to'> & {
        date_from?: string;
        date_to?: string;
        offset: number;
        sort_by: SortableColumn;
        sort_order: 'asc' | 'desc';
      } = {
        ...restFilters,
        ...buildLocalDateRangeQuery(date_from, date_to),
        offset: (currentPage - 1) * (filters.limit || 50),
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      // When scoped to a unit (e.g. from Units Manager), keep deep-link facility only if provided.
      // Otherwise apply the global facility selector.
      if (filters.unit_id) {
        if (filters.facility_id) {
          queryFilters.facility_id = filters.facility_id;
        } else {
          delete queryFilters.facility_id;
        }
      } else if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID) {
        queryFilters.facility_id = selectedFacilityId;
      }

      // Apply role-based filtering
      if (isTenant) {
        // Tenants see only their own access
        response = await apiService.getAccessHistory({
          ...queryFilters,
          user_id: authState.user?.id,
        });
      } else if (isFacilityAdmin && authState.user?.facilityIds?.length) {
        // Facility admins see only their assigned facilities (unless global context overrides)
        if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID) {
          response = await apiService.getFacilityAccessHistory(
            selectedFacilityId,
            queryFilters
          );
        } else {
          response = await apiService.getFacilityAccessHistory(
            authState.user.facilityIds[0],
            queryFilters
          );
        }
      } else {
        // Admins see everything
        response = await apiService.getAccessHistory(queryFilters);
      }

      setLogs(response.logs || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('Failed to load access history:', error);
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }, [
    authState.user?.facilityIds,
    authState.user?.id,
    currentPage,
    filters,
    isFacilityAdmin,
    isTenant,
    selectedFacilityId,
    sortBy,
    sortOrder,
  ]);

  const loadAccessHistoryRef = useRef(loadAccessHistory);
  loadAccessHistoryRef.current = loadAccessHistory;

  useEffect(() => {
    void loadAccessHistory();
  }, [loadAccessHistory]);

  const handleActivityWs = useCallback(
    (data: unknown) => {
      const { eventType, payload } = parseActivityWsEnvelope(data);
      if (eventType === 'activity_update') {
        return;
      }

      const incoming = accessLogFromActivityWsData(payload);
      if (!incoming) {
        void loadAccessHistoryRef.current({ background: true });
        return;
      }

      if (!matchesAccessHistoryLiveFilters(incoming, liveAccessFilters)) {
        return;
      }

      if (canPrependLiveRows) {
        setLogs((prev) => {
          const next = prependUniqueAccessLog(prev, incoming, filters.limit || 50);
          if (next === prev) return prev;
          setTotal((totalPrev) => totalPrev + 1);
          return next;
        });
        return;
      }

      void loadAccessHistoryRef.current({ background: true });
    },
    [canPrependLiveRows, filters.limit, liveAccessFilters],
  );

  useWebSocketSubscription('activity', handleActivityWs, {
    filters: activityWsFilters,
    enabled: Boolean(authState.user),
  });

  // Handle highlighting when page loads
  useHighlight(logs, (log) => log.id, (id) => generateHighlightId('access-log', id));

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };

    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportDropdown]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(defaultAccessHistoryDateFilters());
    setIsCustomDateRange(false);
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return !!(
      filters.search?.trim() ||
      filters.action ||
      filters.success !== undefined ||
      filters.user_id ||
      filters.unit_id ||
      filters.method ||
      (filters.date_from && filters.date_to && getCurrentDateRangeSelection() === 'custom')
    );
  };

  // Function to determine current date range selection
  const getCurrentDateRangeSelection = () => {
    // If custom date range is explicitly selected, return 'custom'
    if (isCustomDateRange) return 'custom';
    
    if (!filters.date_from || !filters.date_to) return '';
    
    const now = new Date();
    const today = toLocalDateInputValue(now);
    const weekAgo = toLocalDateInputValue(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const monthAgo = toLocalDateInputValue(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    
    if (filters.date_from === today && filters.date_to === today) return 'today';
    if (filters.date_from === weekAgo && filters.date_to === today) return 'week';
    if (filters.date_from === monthAgo && filters.date_to === today) return 'month';
    
    return 'custom';
  };

  const handleSort = (column: SortableColumn) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const toggleRowExpansion = (logId: string) => {
    setExpandedRow(prev => prev === logId ? null : logId);
  };

  const handleNavigation = async (url: string, targetId?: string, targetType?: 'user' | 'facility' | 'unit' | 'device') => {
    if (targetId && targetType) {
      if (targetType === 'unit') {
        // Navigate directly to unit details
        navigate(`/units/${targetId}`, { state: withReturnPath(location) });
      } else if (targetType === 'facility') {
        navigate(`/facilities/${targetId}`, { state: withReturnPath(location) });
      } else if (targetType === 'device') {
        // For devices, use auto-pagination to determine the correct page
        await navigateAndHighlightWithAutoPagination(navigate, {
          id: targetId,
          type: targetType
        });
      } else {
        // For users, calculate page from current logs
        let calculatedPage = 1;

        if (targetType === 'user') {
          // For users, we need to find the user in the current logs and calculate page
          const userIndex = logs.findIndex(log => log.user_id === targetId);
          if (userIndex !== -1) {
            calculatedPage = calculatePageForItem(userIndex, 50); // Access history uses 50 items per page
          }
        }

        // Use the navigation utility for highlighting
        await navigateAndHighlight(navigate, {
          id: targetId,
          type: targetType,
          page: calculatedPage
        });
      }
    } else {
      // Fallback to regular navigation
      navigate(url);
    }
  };

  const exportData = async (exportType: 'all' | 'filtered' = 'filtered') => {
    try {
      setLoading(true);
      
      // Prepare export filters based on export type
      const exportFilters = exportType === 'all' ? {
        limit: 10000,
      } : {
        ...(selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID && { facility_id: selectedFacilityId }),
        unit_id: filters.unit_id,
        user_id: filters.user_id,
        action: filters.action,
        method: filters.method,
        success: filters.success,
        denial_reason: filters.denial_reason,
        credential_type: filters.credential_type,
        ...buildLocalDateRangeQuery(filters.date_from, filters.date_to),
        limit: 10000,
      };

      // Call the export API
      const blob = await apiService.exportAccessHistory(exportFilters);
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date and export type
      const dateStr = toLocalDateInputValue();
      const facilityStr = selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? '-facility' : '';
      const filename = `access-history-${exportType}${facilityStr}-${dateStr}.csv`;
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data:', error);
      addToast({
        type: 'error',
        title: 'Export failed',
        message: 'Failed to export data. Please try again.',
      });
    } finally {
      setLoading(false);
      setShowExportDropdown(false);
    }
  };

  const formatOccurredAt = (dateString: string) => formatDateTime(dateString);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getActionIcon = (action: string) => {
    const IconComponent = actionIcons[action as keyof typeof actionIcons] || KeyIcon;
    return IconComponent;
  };

  const getMethodIcon = (method: string) => {
    const IconComponent = methodIcons[method as keyof typeof methodIcons] || KeyIcon;
    return IconComponent;
  };

  const totalPages = Math.ceil(total / (filters.limit || 50));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Access History
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Monitor and track all access events across your facilities
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative" ref={exportDropdownRef}>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 mr-2 border-b-2 border-gray-600 dark:border-gray-300"></div>
              ) : (
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              )}
              {loading ? 'Exporting...' : 'Export'}
              <ChevronDownIcon className="h-4 w-4 ml-2" />
            </button>
            
            {showExportDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                <div className="py-1">
                  <button
                    onClick={() => exportData('filtered')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export Current Filter
                  </button>
                  <button
                    onClick={() => exportData('all')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Export All Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <ExpandableFilters
        searchValue={filters.search || ''}
        onSearchChange={(value) => handleFilterChange('search', value || undefined)}
        searchPlaceholder="Search by user, facility, action, or IP..."
        isExpanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        hasActiveFilters={hasActiveFilters()}
        onClearFilters={clearFilters}
        sections={[
          // Primary filters - always visible
          {
            title: 'Status',
            icon: <CheckCircleIcon className="h-5 w-5" />,
            type: 'buttons',
            options: [
              { key: 'all', label: 'All', color: 'primary' },
              { key: 'success', label: 'Success', color: 'green' },
              { key: 'failed', label: 'Failed', color: 'red' }
            ],
            selected: filters.success === undefined ? 'all' : filters.success === true ? 'success' : 'failed',
            onSelect: (value) => {
              if (value === 'all') {
                handleFilterChange('success', undefined);
              } else if (value === 'success') {
                handleFilterChange('success', true);
              } else {
                handleFilterChange('success', false);
              }
            }
          },
          {
            title: 'Date Range',
            icon: <CalendarIcon className="h-5 w-5" />,
            type: 'select',
            options: [
              { key: '', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'custom', label: 'Custom Range' }
            ],
            selected: getCurrentDateRangeSelection(),
            onSelect: (value) => {
              if (value === 'custom') {
                setIsCustomDateRange(true);
                // Don't clear existing dates, let user modify them
              } else if (value === '') {
                setIsCustomDateRange(false);
                handleFilterChange('date_from', undefined);
                handleFilterChange('date_to', undefined);
              } else {
                setIsCustomDateRange(false);
                const now = new Date();
                let dateFrom = '';
                const dateTo = toLocalDateInputValue(now);

                switch (value) {
                  case 'today': {
                    dateFrom = toLocalDateInputValue(now);
                    break;
                  }
                  case 'week': {
                    dateFrom = toLocalDateInputValue(
                      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                    );
                    break;
                  }
                  case 'month': {
                    dateFrom = toLocalDateInputValue(
                      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                    );
                    break;
                  }
                }
                
                handleFilterChange('date_from', dateFrom);
                handleFilterChange('date_to', dateTo);
              }
            }
          },
          // Additional filters for expanded view
          ...(filtersExpanded ? [
            {
              title: 'Action',
              icon: <KeyIcon className="h-5 w-5" />,
              type: 'select' as const,
              options: [
                { key: '', label: 'All Actions' },
                { key: 'unlock', label: 'Unlock' },
                { key: 'lock', label: 'Lock' },
                { key: 'access_granted', label: 'Access Granted' },
                { key: 'unlock_attempt', label: 'Unlock Attempt Denied' },
                { key: 'lock_attempt', label: 'Lock Attempt Failed' },
                { key: 'manual_override', label: 'Manual Override' },
                { key: 'schedule_violation', label: 'Schedule Violation' }
              ],
              selected: filters.action || '',
              onSelect: (value: string) => handleFilterChange('action', value || undefined)
            },
            {
              title: 'Method',
              icon: <DevicePhoneMobileIcon className="h-5 w-5" />,
              type: 'select' as const,
              options: [
                { key: '', label: 'All Methods' },
                { key: 'app', label: 'Mobile App' },
                { key: 'keypad', label: 'Keypad' },
                { key: 'card', label: 'Card' },
                { key: 'physical_key', label: 'Physical Key' },
                { key: 'manual', label: 'Manual Override' },
                { key: 'remote_gateway', label: 'Remote via Gateway' },
                { key: 'admin_remote', label: 'Remote (Admin)' },
                { key: 'local_device', label: 'Local Device' },
                { key: 'route_pass', label: 'Route Pass' },
                { key: 'automatic', label: 'Local Device (legacy)' }
              ],
              selected: filters.method || '',
              onSelect: (value: string) => handleFilterChange('method', value || undefined)
            },
            {
              title: 'User',
              icon: <UserIcon className="h-5 w-5" />,
              type: 'user' as const,
              options: [],
              selected: filters.user_id || '',
              onSelect: (value: string) => handleFilterChange('user_id', value || undefined),
              placeholder: 'Search users...'
            },
            {
              title: 'Unit',
              icon: <HomeIcon className="h-5 w-5" />,
              type: 'custom' as const,
              options: [],
              selected: filters.unit_id || '',
              onSelect: () => {},
              customContent: (
                <UnitFilter
                  value={filters.unit_id || ''}
                  onChange={(unitId) => handleFilterChange('unit_id', unitId || undefined)}
                  placeholder="Search units..."
                  facilityId={selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? selectedFacilityId : undefined}
                  className="w-full"
                />
              )
            },
            // Only show custom date range when "custom" is selected
            ...(getCurrentDateRangeSelection() === 'custom' ? [{
              title: 'Custom Date Range',
              icon: <CalendarIcon className="h-5 w-5" />,
              type: 'custom' as const,
              options: [],
              selected: '',
              onSelect: () => {},
              customContent: (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={filters.date_from || ''}
                      onChange={(e) => handleFilterChange('date_from', e.target.value || undefined)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={filters.date_to || ''}
                      onChange={(e) => handleFilterChange('date_to', e.target.value || undefined)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )
            }] : [])
          ] : [])
        ]}
      />


      {/* Results summary */}
      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {logs.length} out of {total} access items
        </p>
      </div>

      {/* Access Logs Table */}
      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading access history...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No access logs found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Try adjusting your filters or date range to see more results.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <SortableTableTh
                    label="Action"
                    columnKey="action"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                  />
                  <SortableTableTh
                    label="User"
                    columnKey="user_name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                  />
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isFacilityScoped ? 'Unit / Device' : 'Unit / Access Point'}
                  </th>
                  <SortableTableTh
                    label="Method"
                    columnKey="method"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                  />
                  <SortableTableTh
                    label="Status"
                    columnKey="success"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                  />
                  <SortableTableTh
                    label="Time"
                    columnKey="occurred_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                  />
                  <th className="relative px-4 py-3 w-10">
                    <span className="sr-only">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => {
                  const ActionIcon = getActionIcon(log.action);
                  const MethodIcon = getMethodIcon(log.method);
                  const isExpanded = expandedRow === log.id;
                  const metadata = getAccessLogMetadata(log);
                  const userDisplay = getAccessUserDisplay(log);
                  const locationDisplay = getAccessLocationDisplay(log, { hideFacility: isFacilityScoped });
                  const detailItems = buildAccessLogDetailItems(log, isFacilityScoped);
                  const failureDetail = getAccessFailureDetail(log);
                  const statusDisplay = getAccessStatusDisplay(log);
                  
                  return (
                    <Fragment key={log.id}>
                      <tr 
                        id={generateHighlightId('access-log', log.id)}
                        className="group transition-all duration-200 cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-900/10"
                        onClick={() => toggleRowExpansion(log.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 mr-3">
                              <ActionIcon className={`h-5 w-5 ${actionColors[log.action as keyof typeof actionColors] || 'text-gray-400'}`} />
                            </div>
                            <div>
                              <div className={`text-sm font-medium ${actionColors[log.action as keyof typeof actionColors] || 'text-gray-900 dark:text-white'}`}>
                                {formatAccessAction(log.action)}
                              </div>
                              {!log.success && failureDetail && (
                                <div className="text-xs text-red-600 dark:text-red-400">
                                  {failureDetail}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <div>
                              {metadata.user ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigation(metadata.user!.navigation_url, metadata.user!.id, 'user');
                                  }}
                                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200 flex items-center"
                                >
                                  {userDisplay.primary}
                                  <LinkIcon className="h-3 w-3 ml-1" />
                                </button>
                              ) : metadata.initiated_by?.navigation_url ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigation(metadata.initiated_by!.navigation_url!, metadata.initiated_by!.id, 'user');
                                  }}
                                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200 flex items-center"
                                >
                                  {userDisplay.primary}
                                  <LinkIcon className="h-3 w-3 ml-1" />
                                </button>
                              ) : (
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {userDisplay.primary}
                                </div>
                              )}
                              {userDisplay.secondary && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {userDisplay.secondary}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {log.device_type === 'blulok' ? (
                              <BuildingStorefrontIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            ) : (
                              <CpuChipIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            )}
                            <div>
                              {!isFacilityScoped && metadata.facility ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigation(metadata.facility!.navigation_url, metadata.facility!.id, 'facility');
                                  }}
                                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200 flex items-center"
                                >
                                  {locationDisplay.primary}
                                  <LinkIcon className="h-3 w-3 ml-1" />
                                </button>
                              ) : (
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {metadata.unit ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNavigation(metadata.unit!.navigation_url, metadata.unit!.id, 'unit');
                                      }}
                                      className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200 inline-flex items-center"
                                    >
                                      {locationDisplay.primary}
                                      <LinkIcon className="h-3 w-3 ml-1" />
                                    </button>
                                  ) : metadata.device ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleNavigation(metadata.device!.navigation_url, metadata.device!.id, 'device');
                                      }}
                                      className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200 inline-flex items-center"
                                    >
                                      {locationDisplay.primary}
                                      <LinkIcon className="h-3 w-3 ml-1" />
                                    </button>
                                  ) : (
                                    locationDisplay.primary
                                  )}
                                </div>
                              )}
                              {locationDisplay.secondary && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {locationDisplay.secondary}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <MethodIcon className={`h-4 w-4 shrink-0 ${methodColors[log.method as keyof typeof methodColors] || 'text-gray-400'}`} />
                            <span className="text-sm text-gray-900 dark:text-white">
                              {formatAccessMethod(log.method)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            statusDisplay.tone === 'success'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : statusDisplay.tone === 'pending'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {statusDisplay.tone === 'success' ? (
                              <CheckCircleIcon className="h-3.5 w-3.5 mr-1" />
                            ) : statusDisplay.tone === 'pending' ? (
                              <ClockIcon className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <XCircleIcon className="h-3.5 w-3.5 mr-1" />
                            )}
                            {statusDisplay.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {formatOccurredAt(log.occurred_at)}
                          </div>
                          {log.duration_seconds ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Duration: {formatDuration(log.duration_seconds)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {isExpanded ? (
                            <ChevronUpIcon className="h-4 w-4 text-gray-400 mx-auto" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4 text-gray-400 mx-auto" />
                          )}
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr className="bg-gray-50/80 dark:bg-gray-900/40">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {detailItems.map((item) => (
                                  <div key={item.label} className="min-w-0">
                                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                      {item.label}
                                    </dt>
                                    <dd className="mt-1 text-sm text-gray-900 dark:text-white break-words">
                                      {item.href ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleNavigation(
                                              item.href!,
                                              item.navigationId,
                                              item.navigationTarget,
                                            );
                                          }}
                                          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center"
                                        >
                                          {item.value}
                                          <LinkIcon className="h-3 w-3 ml-1" />
                                        </button>
                                      ) : (
                                        item.value
                                      )}
                                    </dd>
                                  </div>
                                ))}
                              </div>
                              {metadata.device && (
                                <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNavigation(metadata.device!.navigation_url, metadata.device!.id, 'device');
                                    }}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center"
                                  >
                                    View device
                                    <LinkIcon className="h-3 w-3 ml-1" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
                  <span className="font-medium">{(currentPage - 1) * (filters.limit || 50) + 1}</span>
                  {' '}to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * (filters.limit || 50), total)}
                  </span>
                  {' '}of{' '}
                  <span className="font-medium">{total}</span>
                  {' '}results
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
      </div>

    </div>
  );
}
