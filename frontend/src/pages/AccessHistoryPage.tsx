import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { AccessSession } from '@/types/access-session.types';
import { generateHighlightId, navigateAndHighlightWithAutoPagination } from '@/utils/navigation.utils';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { useHighlight } from '@/hooks/useHighlight';
import { ListPageHeader } from '@/components/Common/DetailsPageLayout';
import { SortableTableTh } from '@/components/Common/SortableTableTh';
import { useToast } from '@/contexts/ToastContext';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { useAccessHistoryLiveUpdates } from '@/hooks/useAccessHistoryLiveUpdates';
import { usePendingSessionPoll } from '@/hooks/usePendingSessionPoll';
import {
  AccessHistoryFilters,
  AccessHistoryFilterState,
  defaultAccessHistoryDateFilters,
} from '@/components/AccessHistory/AccessHistoryFilters';
import { AccessHistoryExportMenu } from '@/components/AccessHistory/AccessHistoryExportMenu';
import { AccessHistoryTableRow } from '@/components/AccessHistory/AccessHistoryTableRow';
import { AccessSessionRow } from '@/components/AccessHistory/AccessSessionRow';
import { buildLocalDateRangeQuery } from '@/utils/datetime.utils';
import { toLocalDateInputValue } from '@/utils/datetime.utils';
import { ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type SortableColumn = 'occurred_at' | 'action' | 'user_name' | 'success' | 'method' | 'started_at';

export default function AccessHistoryPage() {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { selectedFacilityId } = useGlobalFacility();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [currentlyOpen, setCurrentlyOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(
    () => !!searchParams.get('unit_id')
  );
  const [unitFilterLabel, setUnitFilterLabel] = useState<string>();
  const [userFilterLabel, setUserFilterLabel] = useState<string>();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Record<string, AccessLog[]>>({});
  const [sessionEventsLoading, setSessionEventsLoading] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableColumn>('started_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<AccessHistoryFilterState>(() => {
    const unitId = searchParams.get('unit_id') ?? undefined;
    const facilityId = searchParams.get('facility_id') ?? undefined;
    const viewParam = searchParams.get('view');
    const isDevAdmin = authState.user?.role === UserRole.DEV_ADMIN;
    return {
      ...defaultAccessHistoryDateFilters(),
      view: viewParam === 'raw' && isDevAdmin ? 'raw' : 'sessions',
      ...(unitId ? { unit_id: unitId } : {}),
      ...(facilityId ? { facility_id: facilityId } : {}),
    };
  });

  const isRawView = filters.view === 'raw';
  const needsAttention = filters.state === 'open';
  const canViewRaw = authState.user?.role === UserRole.DEV_ADMIN;
  const isFacilityAdmin = authState.user?.role === 'facility_admin';
  const isTenant = authState.user?.role === 'tenant';
  const isFacilityScoped = !!selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID;
  const attentionDismissedRef = useRef(false);
  const attentionAutoAppliedRef = useRef(false);

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
      state: filters.state as AccessSession['state'] | undefined,
    };
  }, [filters, isFacilityScoped, selectedFacilityId]);

  const canPrependLiveRows =
    isRawView
    && currentPage === 1
    && (sortBy === 'occurred_at' || sortBy === 'started_at')
    && sortOrder === 'desc';

  const canUpsertSessions =
    !isRawView
    && currentPage === 1
    && (sortBy === 'started_at' || sortBy === 'occurred_at')
    && sortOrder === 'desc'
    && !filters.state;

  useEffect(() => {
    const unitId = searchParams.get('unit_id') ?? undefined;
    const facilityId = searchParams.get('facility_id') ?? undefined;
    const viewParam = searchParams.get('view');
    setFilters((prev) => {
      const nextView = viewParam === 'raw' ? 'raw' : (prev.view || 'sessions');
      if (
        prev.unit_id === unitId
        && prev.facility_id === facilityId
        && prev.view === nextView
      ) {
        return prev;
      }
      return {
        ...prev,
        unit_id: unitId,
        facility_id: facilityId,
        view: nextView,
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
      const { date_from, date_to, view: _filterView, ...restFilters } = filters;
      void _filterView;
      const effectiveSortBy = isRawView
        ? (sortBy === 'started_at' ? 'occurred_at' : sortBy)
        : (sortBy === 'occurred_at' ? 'started_at' : sortBy);

      const queryFilters: Omit<AccessHistoryFilterState, 'date_from' | 'date_to' | 'view'> & {
        date_from?: string;
        date_to?: string;
        offset: number;
        sort_by: string;
        sort_order: 'asc' | 'desc';
      } = {
        ...restFilters,
        ...buildLocalDateRangeQuery(date_from, date_to),
        offset: (currentPage - 1) * (filters.limit || 50),
        sort_by: effectiveSortBy,
        sort_order: sortOrder,
      };

      if (filters.unit_id) {
        if (filters.facility_id) {
          queryFilters.facility_id = filters.facility_id;
        } else {
          delete queryFilters.facility_id;
        }
      } else if (selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID) {
        queryFilters.facility_id = selectedFacilityId;
      }

      if (isRawView) {
        const rawFilters = { ...queryFilters, view: 'raw' as const };
        if (isTenant) {
          response = await apiService.getAccessHistory(rawFilters);
        } else if (isFacilityAdmin && authState.user?.facilityIds?.length) {
          const facilityId =
            selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID
              ? selectedFacilityId
              : authState.user.facilityIds[0];
          response = await apiService.getFacilityAccessHistory(facilityId, rawFilters);
        } else {
          response = await apiService.getAccessHistory(rawFilters);
        }
      } else {
        response = await apiService.getAccessSessions(queryFilters);
      }

      if (isRawView) {
        setLogs(response.logs || []);
        setSessions([]);
      } else {
        const nextSessions = (response.sessions || response.logs || []) as AccessSession[];
        setSessions(nextSessions);
        setLogs([]);
      }
      setTotal(response.total || 0);
      if (typeof response.currently_open === 'number') {
        setCurrentlyOpen(response.currently_open);
      }
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
    isRawView,
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
    canUpsertSessions,
    onSessionUpsert: setSessions,
    onSessionUpserted: () => {
      setTotal((prev) => prev + 1);
      setCurrentlyOpen((prev) => prev);
    },
    onFallbackRefresh: (options) => loadAccessHistoryRef.current(options),
  });

  usePendingSessionPoll(
    !isRawView && sessions.some((session) => session.state === 'pending'),
    (options) => loadAccessHistoryRef.current(options),
  );

  const highlightItems = isRawView ? logs : sessions;
  useHighlight(
    highlightItems as Array<{ id: string }>,
    (row) => row.id,
    (id) => generateHighlightId(isRawView ? 'access-log' : 'access-session', id),
  );

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
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'view') {
        if (value === 'raw' && authState.user?.role !== UserRole.DEV_ADMIN) {
          next.view = 'sessions';
          setSortBy('started_at');
        } else {
          setSortBy(value === 'raw' ? 'occurred_at' : 'started_at');
        }
        setExpandedRow(null);
      }
      return next;
    });
    setCurrentPage(1);
  };

  const toggleNeedsAttention = useCallback(() => {
    setFilters((prev) => {
      if (prev.state === 'open') {
        attentionDismissedRef.current = true;
        return {
          ...prev,
          state: undefined,
          ...defaultAccessHistoryDateFilters(),
          limit: prev.limit ?? 50,
          view: prev.view,
          unit_id: prev.unit_id,
          facility_id: prev.facility_id,
          user_id: prev.user_id,
          action: prev.action,
          method: prev.method,
          success: prev.success,
          search: prev.search,
        };
      }
      attentionDismissedRef.current = false;
      return {
        ...prev,
        state: 'open',
        date_from: undefined,
        date_to: undefined,
      };
    });
    setIsCustomDateRange(false);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    if (canViewRaw) return;
    if (filters.view !== 'raw') return;
    setFilters((prev) => ({ ...prev, view: 'sessions' }));
    setSortBy('started_at');
  }, [canViewRaw, filters.view]);

  useEffect(() => {
    if (attentionAutoAppliedRef.current || attentionDismissedRef.current) return;
    if (currentlyOpen <= 0) return;
    attentionAutoAppliedRef.current = true;
    if (filters.state === 'open') return;
    setFilters((prev) => ({
      ...prev,
      state: 'open',
      date_from: undefined,
      date_to: undefined,
    }));
    setIsCustomDateRange(false);
    setCurrentPage(1);
  }, [currentlyOpen, filters.state]);

  const clearFilters = () => {
    attentionDismissedRef.current = filters.state === 'open';
    setFilters({
      ...defaultAccessHistoryDateFilters(),
      view: 'sessions',
    });
    setUnitFilterLabel(undefined);
    setUserFilterLabel(undefined);
    setIsCustomDateRange(false);
    setSortBy('started_at');
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

  const loadSessionEvents = useCallback(async (sessionId: string) => {
    if (sessionEvents[sessionId]) return;
    setSessionEventsLoading(sessionId);
    try {
      const response = await apiService.getAccessSessionById(sessionId);
      const events = (response.events || []) as AccessLog[];
      setSessionEvents((prev) => ({ ...prev, [sessionId]: events }));
      if (response.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, ...response.session } : s)),
        );
      }
    } catch (error) {
      console.error('Failed to load session events:', error);
      setSessionEvents((prev) => ({ ...prev, [sessionId]: [] }));
    } finally {
      setSessionEventsLoading(null);
    }
  }, [sessionEvents]);

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRow(prev => {
      const next = prev === rowId ? null : rowId;
      if (next && !isRawView) {
        void loadSessionEvents(next);
      }
      return next;
    });
  };

  const handleNavigation = async (url: string, targetId?: string, targetType?: 'user' | 'facility' | 'unit' | 'device') => {
    if (targetId && targetType) {
      if (targetType === 'unit') {
        navigate(`/units/${targetId}`, { state: withReturnPath(location) });
      } else if (targetType === 'facility') {
        navigate(`/facilities/${targetId}`, { state: withReturnPath(location) });
      } else if (targetType === 'device') {
        await navigateAndHighlightWithAutoPagination(navigate, {
          id: targetId,
          type: targetType
        });
      } else if (targetType === 'user') {
        navigate(`/users/${targetId}/details`, { state: withReturnPath(location) });
      }
    } else {
      navigate(url);
    }
  };

  const exportData = async (exportType: 'all' | 'filtered' = 'filtered') => {
    try {
      setLoading(true);

      const exportFilters = exportType === 'all' ? {
        limit: 10000,
      } : {
        ...(selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID && { facility_id: selectedFacilityId }),
        unit_id: filters.unit_id,
        user_id: filters.user_id,
        action: filters.action,
        method: filters.method,
        success: filters.success,
        state: filters.state,
        ...buildLocalDateRangeQuery(filters.date_from, filters.date_to),
        limit: 10000,
      };

      const blob = isRawView
        ? await apiService.exportAccessHistory({ ...exportFilters, view: 'raw' })
        : await apiService.exportAccessSessions(exportFilters);

      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;

      const dateStr = toLocalDateInputValue();
      const facilityStr = selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID ? '-facility' : '';
      const viewStr = isRawView ? '-raw' : '-sessions';
      const filename = `access-history-${exportType}${facilityStr}${viewStr}-${dateStr}.csv`;

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
  const rowCount = isRawView ? logs.length : sessions.length;
  const empty = rowCount === 0;

  const timeSortKey: SortableColumn = isRawView ? 'occurred_at' : 'started_at';
  const outcomeSortKey: SortableColumn = isRawView ? 'success' : 'success';

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Access History"
        subtitle="Monitor and track access sessions across your facilities"
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

      <AccessHistoryFilters
        filters={filters}
        filtersExpanded={filtersExpanded}
        isCustomDateRange={isCustomDateRange}
        unitFilterLabel={unitFilterLabel}
        userFilterLabel={userFilterLabel}
        currentlyOpenCount={currentlyOpen}
        canViewRaw={canViewRaw}
        selectedFacilityId={
          selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID
            ? selectedFacilityId
            : undefined
        }
        onFilterChange={handleFilterChange}
        onToggleNeedsAttention={toggleNeedsAttention}
        onToggleExpanded={() => setFiltersExpanded(!filtersExpanded)}
        onClearFilters={clearFilters}
        onSetCustomDateRange={setIsCustomDateRange}
        onSetUnitFilterLabel={setUnitFilterLabel}
        onSetUserFilterLabel={setUserFilterLabel}
      />

      {needsAttention && !isRawView && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-500/40 dark:bg-rose-950/40">
          <div className="flex min-w-0 items-start gap-2.5">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">
                Needs attention filter on
              </p>
              <p className="mt-0.5 text-xs text-rose-800/90 dark:text-rose-200/90">
                Showing currently open locks
                {currentlyOpen > 0 ? ` (${currentlyOpen})` : ''}. Clear to return to recent history.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleNeedsAttention}
            className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {rowCount} out of {total} {isRawView ? 'events' : 'sessions'}
          {!isRawView && currentlyOpen > 0 && !needsAttention && (
            <span className="ml-2 text-rose-700 dark:text-rose-300">
              · {currentlyOpen} open now
            </span>
          )}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading access history...</p>
          </div>
        ) : empty ? (
          <div className="p-8 text-center">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {isRawView ? 'No access logs found' : 'No access sessions found'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Try adjusting your filters or date range to see more results.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto lg:overflow-hidden">
            <table className="w-full min-w-[720px] table-fixed divide-y divide-gray-200 dark:divide-white/10 lg:min-w-0">
              <colgroup>
                {isRawView ? (
                  <>
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-[20%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                    <col className="w-[15%]" />
                    <col className="w-10" />
                  </>
                ) : (
                  <>
                    <col className="w-[24%]" />
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-10" />
                  </>
                )}
              </colgroup>
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {isRawView ? (
                    <SortableTableTh
                      label="Action"
                      columnKey="action"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={(key) => handleSort(key as SortableColumn)}
                      className="!px-4 text-gray-500 dark:text-gray-400"
                    />
                  ) : (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {isFacilityScoped ? 'Unit / Device' : 'Unit / Access Point'}
                    </th>
                  )}
                  <SortableTableTh
                    label="User"
                    columnKey="user_name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  {isRawView ? (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {isFacilityScoped ? 'Unit / Device' : 'Unit / Access Point'}
                    </th>
                  ) : (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Method
                    </th>
                  )}
                  {isRawView && (
                    <SortableTableTh
                      label="Method"
                      columnKey="method"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={(key) => handleSort(key as SortableColumn)}
                      className="!px-4 text-gray-500 dark:text-gray-400"
                    />
                  )}
                  <SortableTableTh
                    label="Status"
                    columnKey={outcomeSortKey}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(key) => handleSort(key as SortableColumn)}
                    className="!px-4 text-gray-500 dark:text-gray-400"
                  />
                  <SortableTableTh
                    label="Time"
                    columnKey={timeSortKey}
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
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-white/10">
                {isRawView
                  ? logs.map((log) => (
                      <AccessHistoryTableRow
                        key={log.id}
                        log={log}
                        isExpanded={expandedRow === log.id}
                        hideFacility={isFacilityScoped}
                        onToggle={toggleRowExpansion}
                        onNavigate={handleNavigation}
                      />
                    ))
                  : sessions.map((session) => (
                      <AccessSessionRow
                        key={session.id}
                        session={session}
                        isExpanded={expandedRow === session.id}
                        hideFacility={isFacilityScoped}
                        events={sessionEvents[session.id]}
                        eventsLoading={sessionEventsLoading === session.id}
                        onToggle={toggleRowExpansion}
                        onNavigate={handleNavigation}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-white/10 sm:px-6">
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
