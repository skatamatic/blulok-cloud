import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { generateHighlightId, navigateAndHighlightWithAutoPagination } from '@/utils/navigation.utils';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { useHighlight } from '@/hooks/useHighlight';
import { ListPageHeader } from '@/components/Common/DetailsPageLayout';
import { SortableTableTh } from '@/components/Common/SortableTableTh';
import { useToast } from '@/contexts/ToastContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { useAccessHistoryLiveUpdates } from '@/hooks/useAccessHistoryLiveUpdates';
import {
  AccessHistoryFilters,
  AccessHistoryFilterState,
  defaultAccessHistoryDateFilters,
} from '@/components/AccessHistory/AccessHistoryFilters';
import { AccessHistoryExportMenu } from '@/components/AccessHistory/AccessHistoryExportMenu';
import { AccessHistoryTableRow } from '@/components/AccessHistory/AccessHistoryTableRow';
import { buildLocalDateRangeQuery } from '@/utils/datetime.utils';
import { toLocalDateInputValue } from '@/utils/datetime.utils';
import { ClockIcon } from '@heroicons/react/24/outline';

type SortableColumn = 'occurred_at' | 'action' | 'user_name' | 'success' | 'method';

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
  const [unitFilterLabel, setUnitFilterLabel] = useState<string>();
  const [userFilterLabel, setUserFilterLabel] = useState<string>();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableColumn>('occurred_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<AccessHistoryFilterState>(() => {
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
      user_id: filters.user_id,
      action: filters.action,
      method: filters.method,
      success: filters.success,
      search: filters.search,
      date_from: filters.date_from,
      date_to: filters.date_to,
    };
  }, [filters, isFacilityScoped, selectedFacilityId]);

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
      const queryFilters: Omit<AccessHistoryFilterState, 'date_from' | 'date_to'> & {
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
        response = await apiService.getAccessHistory(queryFilters);
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

  useAccessHistoryLiveUpdates({
    enabled: Boolean(authState.user),
    subscriptionFilters: activityWsFilters,
    liveFilters: liveAccessFilters,
    maxRows: filters.limit || 50,
    canPrepend: canPrependLiveRows,
    onPrepend: setLogs,
    onPrepended: () => setTotal((prev) => prev + 1),
    onFallbackRefresh: (options) => loadAccessHistoryRef.current(options),
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

  const handleFilterChange = (key: keyof AccessHistoryFilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(defaultAccessHistoryDateFilters());
    setUnitFilterLabel(undefined);
    setUserFilterLabel(undefined);
    setIsCustomDateRange(false);
    setCurrentPage(1);
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
      } else if (targetType === 'user') {
        navigate(`/users/${targetId}/details`, { state: withReturnPath(location) });
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

  const totalPages = Math.ceil(total / (filters.limit || 50));

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Access History"
        subtitle="Monitor and track all access events across your facilities"
        actions={
          <AccessHistoryExportMenu
            loading={loading}
            open={showExportDropdown}
            onOpenChange={setShowExportDropdown}
            onExport={exportData}
            dropdownRef={exportDropdownRef}
          />
        }
      />

      {/* Filters */}
      <AccessHistoryFilters
        filters={filters}
        filtersExpanded={filtersExpanded}
        isCustomDateRange={isCustomDateRange}
        unitFilterLabel={unitFilterLabel}
        userFilterLabel={userFilterLabel}
        selectedFacilityId={
          selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID
            ? selectedFacilityId
            : undefined
        }
        onFilterChange={handleFilterChange}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        onClearFilters={clearFilters}
        onSetCustomDateRange={setIsCustomDateRange}
        onSetUnitFilterLabel={setUnitFilterLabel}
        onSetUserFilterLabel={setUserFilterLabel}
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
          <div className="overflow-x-auto lg:overflow-hidden">
            <table className="w-full min-w-[720px] table-fixed divide-y divide-gray-200 dark:divide-gray-700 lg:min-w-0">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-10" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <SortableTableTh
                    label="Action"
                    columnKey="action"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <SortableTableTh
                    label="User"
                    columnKey="user_name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isFacilityScoped ? 'Unit / Device' : 'Unit / Access Point'}
                  </th>
                  <SortableTableTh
                    label="Method"
                    columnKey="method"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <SortableTableTh
                    label="Status"
                    columnKey="success"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <SortableTableTh
                    label="Time"
                    columnKey="occurred_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <th className="relative px-2 py-3 w-10">
                    <span className="sr-only">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <AccessHistoryTableRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedRow === log.id}
                    hideFacility={isFacilityScoped}
                    onToggle={toggleRowExpansion}
                    onNavigate={handleNavigation}
                  />
                ))}
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
