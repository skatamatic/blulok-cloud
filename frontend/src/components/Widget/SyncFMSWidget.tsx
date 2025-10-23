import { useState, useEffect, Fragment } from 'react';
import { 
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  CloudIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { fmsService } from '@/services/fms.service';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { FMSSyncLog } from '@/types/fms.types';

interface FMSSyncStatus {
  facilityId: string;
  facilityName?: string;
  lastSyncTime: string | null;
  status: 'completed' | 'failed' | 'partial' | 'never_synced' | 'not_configured';
  changesDetected?: number;
  changesApplied?: number;
  errorMessage?: string;
}

interface FMSSyncStatusData {
  facilities: FMSSyncStatus[];
  lastUpdated: string;
  updatedFacilityId?: string;
}

interface SyncFMSWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

export const SyncFMSWidget: React.FC<SyncFMSWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  availableSizes = ['medium', 'large', 'large-wide', 'huge'],
  onGridSizeChange,
  onRemove
}) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
  const { startSync, completeSync, canStartNewSync } = useFMSSync();
  const { subscribe, unsubscribe } = useWebSocket();
  const [size, setSize] = useState<WidgetSize>(initialSize);
  
  // FMS state
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [fmsStatuses, setFmsStatuses] = useState<FMSSyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  
  // Sync history
  const [syncHistory, setSyncHistory] = useState<FMSSyncLog[]>([]);

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [facilityNamesMap, setFacilityNamesMap] = useState<Record<string, string>>({});

  // Get user's facilities
  const isAdminUser = authState.user?.role === 'admin' || authState.user?.role === 'dev_admin';
  const facilityNamesFromAuth = authState.user?.facilityNames || [];
  
  // Fetch all facilities for admin users
  useEffect(() => {
    const fetchFacilities = async () => {
      if (!isAdminUser) return;

      try {
        const response = await fetch('/api/v1/facilities', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const namesMap: Record<string, string> = {};
          data.facilities?.forEach((facility: any) => {
            namesMap[facility.id] = facility.name;
          });
          setFacilityNamesMap(namesMap);
        }
      } catch (error) {
        console.error('Failed to fetch facilities:', error);
      }
    };

    fetchFacilities();
  }, [isAdminUser]);

  // Determine which facilities to show
  // Admin: All facilities from API, Facility Admin: Their assigned facilities
  const apiFacilities = isAdminUser
    ? Object.keys(facilityNamesMap) // Admin sees all facilities
    : (authState.user?.facilityIds || []); // Facility Admin sees their assigned facilities

  // For admin users, fall back to WebSocket data if API hasn't loaded yet
  const userFacilities = isAdminUser && apiFacilities.length === 0 && fmsStatuses.length > 0
    ? fmsStatuses.map(s => s.facilityId)
    : apiFacilities;

  const hasMultipleFacilities = userFacilities.length > 1;

  // Create a mapping of facility ID to name
  const getFacilityName = (facilityId: string) => {
    // For admin users, use the fetched facility names map first
    if (isAdminUser && facilityNamesMap[facilityId]) {
      return facilityNamesMap[facilityId];
    }

    // Fall back to WebSocket data facility name
    const wsFacility = fmsStatuses.find(s => s.facilityId === facilityId);
    if (wsFacility?.facilityName) {
      return wsFacility.facilityName;
    }

    // For facility admin, use the names from auth state
    const index = (authState.user?.facilityIds || []).indexOf(facilityId);
    return index >= 0 && facilityNamesFromAuth[index] ? facilityNamesFromAuth[index] : facilityId;
  };

  // Check if a facility has FMS configured
  const hasFMSConfigured = (facilityId: string) => {
    const status = fmsStatuses.find(s => s.facilityId === facilityId);
    // FMS is configured if we have a status that's not "not_configured"
    return status && status.status !== 'not_configured';
  };

  // Check if any facility has FMS configured
  const hasAnyFMSConfigured = userFacilities.some(facilityId => hasFMSConfigured(facilityId));

  // Find facility with oldest sync time for tiny view
  const getOldestSyncFacility = () => {
    if (!hasAnyFMSConfigured) return null;

    let oldestFacility = null;
    let oldestTime = new Date();

    for (const facilityId of userFacilities) {
      const status = fmsStatuses.find(s => s.facilityId === facilityId);
      if (status && hasFMSConfigured(facilityId) && status.lastSyncTime) {
        const syncTime = new Date(status.lastSyncTime);
        if (syncTime < oldestTime) {
          oldestTime = syncTime;
          oldestFacility = facilityId;
        }
      }
    }

    return oldestFacility;
  };

  const oldestSyncFacilityId = getOldestSyncFacility();
  const oldestSyncStatus = oldestSyncFacilityId ? fmsStatuses.find(s => s.facilityId === oldestSyncFacilityId) : null;

  // Subscribe to FMS sync status updates via WebSocket
  useEffect(() => {
    if (!authState.user) return;

    // Set a timeout to stop loading if no data is received
    const loadingTimeout = setTimeout(() => {
      // Stop loading state after timeout
      setLoading(false);
    }, 5000);

    const handleFMSSyncUpdate = (data: FMSSyncStatusData) => {
      clearTimeout(loadingTimeout);
      setFmsStatuses(data.facilities);
      setLoading(false);
    };

    const handleError = (_error: string) => {
      // Error handled silently - user will see loading state end
      clearTimeout(loadingTimeout);
      setLoading(false);
    };

    // Subscribe to FMS sync status updates
    const subscriptionId = subscribe('fms_sync_status', handleFMSSyncUpdate, handleError);

    return () => {
      clearTimeout(loadingTimeout);
      if (subscriptionId) {
        unsubscribe(subscriptionId);
      }
    };
  }, [authState.user, subscribe, unsubscribe]);

  // Initialize selected facility
  useEffect(() => {
    if (!authState.user || userFacilities.length === 0) {
      return;
    }

    // Auto-select first facility if only one, or if none selected
    if (!selectedFacilityId && userFacilities.length > 0) {
      setSelectedFacilityId(userFacilities[0]);
    }
  }, [authState.user, userFacilities, selectedFacilityId]);

  // Get current facility's status from WebSocket data
  const currentFacilityStatus = fmsStatuses.find(s => s.facilityId === selectedFacilityId);
  // FMS is configured if we have a status for this facility (even if never_synced)
  const fmsConfigured = !!currentFacilityStatus;


  // Load sync history when facility changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedFacilityId) return;

      // If FMS is not configured, don't try to load history
      if (!fmsConfigured && !loading) {
        setSyncHistory([]);
        return;
      }

      try {
        const history = await fmsService.getSyncHistory(selectedFacilityId, { limit: 5 });
        setSyncHistory(history.logs);
      } catch (error: any) {
        console.error('Failed to load sync history:', error);
        // If we get a 404, it means FMS is not configured
        if (error.response?.status === 404) {
          setSyncHistory([]);
        }
      }
    };

    loadHistory();
  }, [selectedFacilityId, fmsConfigured, loading]);

  const handleManualSync = async () => {
    if (!selectedFacilityId) {
      addToast({
        type: 'error',
        title: 'No Facility Selected',
        message: 'Please select a facility to sync',
      });
      return;
    }

    // Prevent starting new sync if one is already active
    if (!canStartNewSync()) {
      addToast({
        type: 'warning',
        title: 'Sync Already in Progress',
        message: 'Please wait for the current sync to complete',
      });
      return;
    }

    try {
      setSyncing(true);

      // Start sync in global context
      const facilityName = getFacilityName(selectedFacilityId);
      startSync(selectedFacilityId, facilityName);

      const result = await fmsService.triggerSync(selectedFacilityId);

      // Complete sync in global context with the changes detected
      if (result.changesDetected && result.changesDetected.length > 0) {
        completeSync(result.changesDetected, result);
      } else {
        completeSync([], result);
      }

      if (result.changesDetected && result.changesDetected.length > 0) {
        if (autoApprove) {
          // Auto-approve all changes
          const changeIds = result.changesDetected.map(c => c.id);
          const applyResult = await fmsService.applyChanges(result.syncLogId, changeIds);

          // Generate summary message
          const details: string[] = [];
          if (applyResult.accessChanges.usersCreated.length > 0) {
            details.push(`${applyResult.accessChanges.usersCreated.length} user${applyResult.accessChanges.usersCreated.length !== 1 ? 's' : ''} created`);
          }
          if (applyResult.accessChanges.usersDeactivated.length > 0) {
            details.push(`${applyResult.accessChanges.usersDeactivated.length} user${applyResult.accessChanges.usersDeactivated.length !== 1 ? 's' : ''} deactivated`);
          }
          if (applyResult.accessChanges.accessGranted.length > 0) {
            details.push(`${applyResult.accessChanges.accessGranted.length} unit access granted`);
          }
          if (applyResult.accessChanges.accessRevoked.length > 0) {
            details.push(`${applyResult.accessChanges.accessRevoked.length} unit access revoked`);
          }

          addToast({
            type: 'success',
            title: 'Changes Applied Automatically',
            message: details.length > 0 
              ? details.join(', ')
              : `${applyResult.changesApplied} changes applied successfully`,
            duration: 6000,
          });
        }
        // Note: Review modal will be shown when user clicks the status bar, not automatically
      } else {
        addToast({
          type: 'success',
          title: 'Sync Complete',
          message: 'No changes detected',
        });
      }

      // Refresh history
      const history = await fmsService.getSyncHistory(selectedFacilityId, { limit: 5 });
      setSyncHistory(history.logs);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync with FMS',
      });
    } finally {
      setSyncing(false);
    }
  };


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      case 'partial':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ServerIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'partial':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'never_synced':
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600';
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Widget
        id={id}
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={setSize}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Widget>
    );
  }

  // Render tiny size - sync button with dropdown + oldest sync info
  if (size === 'tiny') {
    return (
      <>
        <Widget
          id={id}
          title={title}
          size={size}
          availableSizes={availableSizes}
          onSizeChange={setSize}
          onGridSizeChange={onGridSizeChange}
          onRemove={onRemove}
          suppressTitleOverlay={dropdownOpen}
        >
          <div className="h-full flex flex-col justify-center items-center space-y-1">
            {/* Sync button/dropdown and time ago grouped together */}
              {hasMultipleFacilities ? (
                <Menu as="div" className="relative z-10" onClick={(e) => e.stopPropagation()}>
                  {({ open }) => {
                    // Update dropdown state when menu opens/closes
                    useEffect(() => {
                      setDropdownOpen(open);
                    }, [open]);

                    return (
                      <>
                        <Menu.Button
                    disabled={syncing || loading || !hasAnyFMSConfigured}
                    className={`w-11 h-11 flex items-center justify-center text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      hasAnyFMSConfigured
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-400 text-gray-200'
                    }`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ArrowPathIcon className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
                    <ChevronDownIcon className="h-3 w-3" />
                  </Menu.Button>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="fixed z-[10000] mt-1 w-48 rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" onClick={(e) => e.stopPropagation()}>
                      <div className="p-1">
                        {userFacilities.map((facilityId) => {
                          const configured = hasFMSConfigured(facilityId);
                          return (
                            <Menu.Item key={facilityId} disabled={!configured}>
                              {({ active }) => (
                                <button
                                  onClick={() => {
                                    setSelectedFacilityId(facilityId);
                                    if (configured) handleManualSync();
                                  }}
                                  disabled={!configured}
                                  className={`no-drag ${
                                    active && configured ? 'bg-gray-100 dark:bg-gray-700' : ''
                                  } ${
                                    !configured ? 'opacity-50 cursor-not-allowed' : ''
                                  } group flex w-full items-center rounded-md px-2 py-1.5 text-xs`}
                                  title={!configured ? 'FMS not configured for this facility' : undefined}
                                >
                                  <ArrowPathIcon className="mr-1.5 h-3 w-3" />
                                  <span className="flex-1 text-left text-xs">{getFacilityName(facilityId)}</span>
                                  {!configured && (
                                    <span className="text-xs text-gray-400">No FMS</span>
                                  )}
                                </button>
                              )}
                            </Menu.Item>
                          );
                        })}
                      </div>
                    </Menu.Items>
                  </Transition>
                      </>
                    );
                  }}
                </Menu>
              ) : (
                <button
                  onClick={handleManualSync}
                  disabled={syncing || loading || !hasAnyFMSConfigured}
                  className={`no-drag w-11 h-11 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasAnyFMSConfigured
                      ? 'bg-primary-600 hover:bg-primary-700 text-white'
                      : 'bg-gray-400 text-gray-200'
                  }`}
                  title={!hasAnyFMSConfigured ? 'No facilities have FMS configured' : (!fmsConfigured ? 'FMS not configured for this facility' : undefined)}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ArrowPathIcon className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                </button>
              )}

              {/* Oldest sync time below button */}
              {oldestSyncStatus && (
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimeAgo(oldestSyncStatus.lastSyncTime!)}
                  </div>
                </div>
              )}
          </div>
        </Widget>
      </>
    );
  }

  return (
    <>
      <Widget
        id={id}
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={setSize}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
        enhancedMenu={
          fmsConfigured ? (
            <div className="space-y-1">
              <button
                onClick={() => setAutoApprove(!autoApprove)}
                className={`w-full px-3 py-2 text-left text-sm rounded ${
                  autoApprove
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {autoApprove ? '✓ ' : ''}Auto-approve changes
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="h-full flex flex-col space-y-3">
          {/* Facility Selector (if multiple facilities) */}
          {hasMultipleFacilities && size !== 'small' && (
            <div>
              <select
                value={selectedFacilityId || ''}
                onChange={(e) => setSelectedFacilityId(e.target.value)}
                disabled={!hasAnyFMSConfigured}
                className={`w-full px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                  !hasAnyFMSConfigured
                    ? 'border-gray-200 dark:border-gray-600 opacity-50 cursor-not-allowed'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {userFacilities.map((facilityId) => {
                  const configured = hasFMSConfigured(facilityId);
                  return (
                    <option
                      key={facilityId}
                      value={facilityId}
                      disabled={!configured}
                      className={!configured ? 'opacity-50' : ''}
                    >
                      {getFacilityName(facilityId)} {!configured ? '(No FMS)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          
          {/* Small size - button to left of time ago */}
          {size === 'small' && (
            <div className="h-full flex items-center justify-center">
              <div className="flex items-center space-x-3">
                {/* Sync button/dropdown */}
                {hasMultipleFacilities ? (
                  <Menu as="div" className="relative z-10" onClick={(e) => e.stopPropagation()}>
                    <Menu.Button
                      disabled={syncing || loading || !hasAnyFMSConfigured}
                      className={`flex items-center justify-center py-3 px-4 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        hasAnyFMSConfigured
                          ? 'bg-primary-600 hover:bg-primary-700 text-white'
                          : 'bg-gray-400 text-gray-200'
                      }`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                      <ChevronDownIcon className="ml-1 h-3 w-3" />
                    </Menu.Button>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-100"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Menu.Items className="fixed z-[10000] mt-1 w-48 rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none" onClick={(e) => e.stopPropagation()}>
                        <div className="p-1">
                          {userFacilities.map((facilityId) => {
                            const configured = hasFMSConfigured(facilityId);
                            return (
                              <Menu.Item key={facilityId} disabled={!configured}>
                                {({ active }) => (
                                  <button
                                    onClick={() => {
                                      setSelectedFacilityId(facilityId);
                                      if (configured) handleManualSync();
                                    }}
                                    disabled={!configured}
                                    className={`no-drag ${
                                      active && configured ? 'bg-gray-100 dark:bg-gray-700' : ''
                                    } ${
                                      !configured ? 'opacity-50 cursor-not-allowed' : ''
                                    } group flex w-full items-center rounded-md px-2 py-1.5 text-xs`}
                                    title={!configured ? 'FMS not configured for this facility' : undefined}
                                  >
                                    <ArrowPathIcon className="mr-1.5 h-3 w-3" />
                                    <span className="flex-1 text-left text-xs">{getFacilityName(facilityId)}</span>
                                    {!configured && (
                                      <span className="text-xs text-gray-400">No FMS</span>
                                    )}
                                  </button>
                                )}
                              </Menu.Item>
                            );
                          })}
                        </div>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                ) : (
                  <button
                    onClick={handleManualSync}
                    disabled={syncing || loading || !hasAnyFMSConfigured}
                    className={`py-3 px-4 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      hasAnyFMSConfigured
                        ? 'bg-primary-600 hover:bg-primary-700 text-white'
                        : 'bg-gray-400 text-gray-200'
                    }`}
                    title={!hasAnyFMSConfigured ? 'No facilities have FMS configured' : (!fmsConfigured ? 'FMS not configured for this facility' : undefined)}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  </button>
                )}

                {/* Oldest sync time to the right */}
                {oldestSyncStatus && (
                  <div className="text-left">
                    <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {formatTimeAgo(oldestSyncStatus.lastSyncTime!)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FMS Not Configured Messages */}
          {!hasAnyFMSConfigured && !loading && (
            <div className={`flex-1 flex flex-col items-center justify-center text-center ${size === 'small' ? 'p-2' : 'p-4'}`}>
              <CloudIcon className={`${size === 'small' ? 'h-8 w-8' : 'h-12 w-12'} text-gray-400 dark:text-gray-600 mb-2`} />
              <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 mb-1`}>
                No Facilities have an FMS setup
              </p>
              {size !== 'small' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure FMS integration in Facility Details
                </p>
              )}
            </div>
          )}

          {/* Show individual facility message only when some facilities have FMS but current one doesn't */}
          {hasAnyFMSConfigured && !fmsConfigured && !loading && (
            <div className={`flex-1 flex flex-col items-center justify-center text-center ${size === 'small' ? 'p-2' : 'p-4'}`}>
              <CloudIcon className={`${size === 'small' ? 'h-8 w-8' : 'h-12 w-12'} text-gray-400 dark:text-gray-600 mb-2`} />
              <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 mb-1`}>
                FMS Not Configured
              </p>
              {size !== 'small' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select a facility with FMS configured or configure this facility
                </p>
              )}
            </div>
          )}


          {/* Medium size horizontal layout with sync button */}
          {size === 'medium' && currentFacilityStatus && (
            <div className="flex items-center space-x-3 h-full">
              {/* Last sync status - takes 66% of width */}
              <div className="flex-1 p-3 rounded-lg border" style={{ backgroundColor: getStatusColor(currentFacilityStatus.status).split(' ')[0], borderColor: getStatusColor(currentFacilityStatus.status).split(' ')[1] }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(currentFacilityStatus.status)}
                    <span className="text-sm font-medium">
                      {currentFacilityStatus.status === 'completed' ? 'Last Sync Successful' :
                       currentFacilityStatus.status === 'failed' ? 'Last Sync Failed' :
                       currentFacilityStatus.status === 'never_synced' ? 'Never Synced' : 'Partial Sync'}
                    </span>
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  {currentFacilityStatus.lastSyncTime ? (
                    <>
                      <div className="font-medium">{formatTimeAgo(currentFacilityStatus.lastSyncTime)}</div>
                      {currentFacilityStatus.changesDetected !== undefined && (
                        <div>
                          {currentFacilityStatus.changesDetected} detected
                          {currentFacilityStatus.changesApplied !== undefined && currentFacilityStatus.changesApplied !== null && (
                            <span>
                              {currentFacilityStatus.changesApplied === currentFacilityStatus.changesDetected
                                ? ' • All Applied'
                                : ` • ${currentFacilityStatus.changesApplied} applied`
                              }
                            </span>
                          )}
                        </div>
                      )}
                      {currentFacilityStatus.errorMessage && (
                        <div className="text-red-600 dark:text-red-400 truncate">{currentFacilityStatus.errorMessage}</div>
                      )}
                    </>
                  ) : (
                    <div>No sync history</div>
                  )}
                </div>
              </div>

              {/* Sync button - takes remaining space */}
              {hasAnyFMSConfigured && (
                <div className="flex items-center">
                  <button
                    onClick={handleManualSync}
                    disabled={syncing || !fmsConfigured}
                    className="px-4 py-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowPathIcon className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Small size sync status (when not using tiny-style layout) */}
          {size === 'small' && currentFacilityStatus && !hasMultipleFacilities && (
            <div className="p-2 rounded-lg border" style={{ backgroundColor: getStatusColor(currentFacilityStatus.status).split(' ')[0], borderColor: getStatusColor(currentFacilityStatus.status).split(' ')[1] }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(currentFacilityStatus.status)}
                  <span className="text-xs font-medium">
                    {currentFacilityStatus.status === 'completed' ? 'Success' :
                     currentFacilityStatus.status === 'failed' ? 'Failed' :
                     currentFacilityStatus.status === 'never_synced' ? 'Never' : 'Partial'}
                  </span>
                </div>
              </div>
              <div className="text-xs">
                {currentFacilityStatus.lastSyncTime ? (
                  <div>{formatTimeAgo(currentFacilityStatus.lastSyncTime)}</div>
                ) : (
                  <div>No sync history</div>
                )}
              </div>
            </div>
          )}


          {/* Sync History (for large widgets) */}
          {(size === 'large' || size === 'large-wide' || size === 'huge') && syncHistory.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex-shrink-0">Recent Syncs</h4>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-2 pr-1">
                  {syncHistory.slice(0, size === 'large' ? 8 : size === 'large-wide' ? 10 : 12).map((sync) => (
                    <div
                      key={sync.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(sync.sync_status)}
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatDateTime(sync.started_at)}
                        </span>
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {sync.changes_detected || 0} detected
                        {sync.changes_applied !== undefined && sync.changes_applied !== null && (
                          <span>
                            {sync.changes_applied === sync.changes_detected && sync.changes_pending === 0
                              ? ' • Auto Accepted'
                              : sync.changes_applied === sync.changes_detected
                              ? ' • All Applied'
                              : ` • ${sync.changes_applied} applied`
                            }
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Manual Sync Button for large sizes */}
          {(size === 'large' || size === 'large-wide' || size === 'huge') && hasAnyFMSConfigured && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleManualSync}
                disabled={syncing || !fmsConfigured}
                className="w-full flex items-center justify-center space-x-2 py-2 px-3 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>
          )}
        </div>
      </Widget>
    </>
  );
};
