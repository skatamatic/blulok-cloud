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
import { FMSSyncProgressModal } from '@/components/FMS/FMSSyncProgressModal';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import { FMSSyncLog, FMSChange } from '@/types/fms.types';

interface FMSSyncStatus {
  facilityId: string;
  facilityName?: string;
  lastSyncTime: string | null;
  status: 'completed' | 'failed' | 'partial' | 'never_synced';
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
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge'],
  onGridSizeChange,
  onRemove
}) => {
  const { authState } = useAuth();
  const { addToast } = useToast();
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
  
  // Modals
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<FMSChange[]>([]);
  const [currentSyncLogId, setCurrentSyncLogId] = useState<string>('');
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
  const userFacilities = isAdminUser 
    ? Object.keys(facilityNamesMap) // Admin sees all facilities
    : (authState.user?.facilityIds || []); // Facility Admin sees their assigned facilities
  
  const hasMultipleFacilities = userFacilities.length > 1;

  // Create a mapping of facility ID to name
  const getFacilityName = (facilityId: string) => {
    // For admin users, use the fetched facility names map
    if (isAdminUser && facilityNamesMap[facilityId]) {
      return facilityNamesMap[facilityId];
    }
    
    // For facility admin, use the names from auth state
    const index = (authState.user?.facilityIds || []).indexOf(facilityId);
    return index >= 0 && facilityNamesFromAuth[index] ? facilityNamesFromAuth[index] : facilityId;
  };

  // Check if a facility has FMS configured
  const hasFMSConfigured = (facilityId: string) => {
    return fmsStatuses.some(s => s.facilityId === facilityId);
  };

  // Subscribe to FMS sync status updates via WebSocket
  useEffect(() => {
    if (!authState.user) return;

    // Set a timeout to stop loading if no data is received
    const loadingTimeout = setTimeout(() => {
      console.log('🔄 FMS sync status: No data received after 5 seconds, stopping loading state');
      setLoading(false);
    }, 5000);

    const handleFMSSyncUpdate = (data: FMSSyncStatusData) => {
      console.log('🔄 FMS sync status update received:', data);
      clearTimeout(loadingTimeout);
      setFmsStatuses(data.facilities);
      setLoading(false);
    };

    const handleError = (error: string) => {
      console.error('🔄 FMS sync status error:', error);
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

  // Debug logging
  useEffect(() => {
    console.log('🔄 FMS Widget State:', {
      selectedFacilityId,
      userFacilities,
      fmsStatuses,
      currentFacilityStatus,
      fmsConfigured,
      loading
    });
  }, [selectedFacilityId, userFacilities, fmsStatuses, currentFacilityStatus, fmsConfigured, loading]);

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

    try {
      setSyncing(true);
      setShowProgressModal(true);

      const result = await fmsService.triggerSync(selectedFacilityId);
      setCurrentSyncLogId(result.syncLogId);

      setShowProgressModal(false);

      if (result.changesDetected && result.changesDetected.length > 0) {
        setPendingChanges(result.changesDetected);

        if (autoApprove) {
          // Auto-approve all changes
          const changeIds = result.changesDetected.map(c => c.id);
          await fmsService.applyChanges(result.syncLogId, changeIds);
          
          addToast({
            type: 'success',
            title: 'Changes Applied',
            message: `${changeIds.length} changes applied automatically`,
          });
        } else {
          // Show review modal
          setShowReviewModal(true);
        }
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

  const handleApplyChanges = async (changeIds: string[]) => {
    try {
      await fmsService.applyChanges(currentSyncLogId, changeIds);
      
      addToast({
        type: 'success',
        title: 'Changes Applied',
        message: `${changeIds.length} changes applied successfully`,
      });

      setShowReviewModal(false);
      setPendingChanges([]);

      // Refresh history
      const history = await fmsService.getSyncHistory(selectedFacilityId, { limit: 5 });
      setSyncHistory(history.logs);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Apply Failed',
        message: error.message || 'Failed to apply changes',
      });
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

  // Render tiny size - just a sync button with dropdown
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
        >
          <div className="h-full flex items-center justify-center p-2">
            {hasMultipleFacilities ? (
              <Menu as="div" className="relative w-full">
                <Menu.Button
                  disabled={syncing || loading}
                  className="w-full flex items-center justify-center space-x-1 py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
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
                  <Menu.Items className="absolute z-50 mt-2 w-56 origin-top-right rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
                                className={`${
                                  active && configured ? 'bg-gray-100 dark:bg-gray-700' : ''
                                } ${
                                  !configured ? 'opacity-50 cursor-not-allowed' : ''
                                } group flex w-full items-center rounded-md px-3 py-2 text-sm`}
                                title={!configured ? 'FMS not configured for this facility' : undefined}
                              >
                                <ArrowPathIcon className="mr-2 h-4 w-4" />
                                <span className="flex-1 text-left">{getFacilityName(facilityId)}</span>
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
                disabled={syncing || loading || !fmsConfigured}
                className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!fmsConfigured ? 'FMS not configured' : undefined}
              >
                <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </Widget>
        <FMSSyncProgressModal
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
        />
        <FMSChangeReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          changes={pendingChanges}
          onApply={handleApplyChanges}
          syncResult={null}
        />
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
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Facility
              </label>
              <select
                value={selectedFacilityId || ''}
                onChange={(e) => setSelectedFacilityId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {userFacilities.map((facilityId) => {
                  const configured = hasFMSConfigured(facilityId);
                  return (
                    <option key={facilityId} value={facilityId}>
                      {getFacilityName(facilityId)} {!configured ? '(No FMS)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          
          {/* Compact facility selector for small size */}
          {hasMultipleFacilities && size === 'small' && (
            <select
              value={selectedFacilityId || ''}
              onChange={(e) => setSelectedFacilityId(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {userFacilities.map((facilityId) => {
                const configured = hasFMSConfigured(facilityId);
                return (
                  <option key={facilityId} value={facilityId}>
                    {getFacilityName(facilityId)} {!configured ? '(No FMS)' : ''}
                  </option>
                );
              })}
            </select>
          )}

          {/* FMS Not Configured Message */}
          {!fmsConfigured && !loading && (
            <div className={`flex-1 flex flex-col items-center justify-center text-center ${size === 'small' ? 'p-2' : 'p-4'}`}>
              <CloudIcon className={`${size === 'small' ? 'h-8 w-8' : 'h-12 w-12'} text-gray-400 dark:text-gray-600 mb-2`} />
              <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 mb-1`}>
                FMS Not Configured
              </p>
              {size !== 'small' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure FMS integration in Facility Details
                </p>
              )}
            </div>
          )}

          {/* Last Sync Status */}
          {currentFacilityStatus && (
            <div className={`${size === 'small' ? 'p-2' : 'p-3'} rounded-lg border ${getStatusColor(currentFacilityStatus.status)}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(currentFacilityStatus.status)}
                  <span className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium`}>
                    {size === 'small' ? (
                      currentFacilityStatus.status === 'completed' ? 'Success' :
                      currentFacilityStatus.status === 'failed' ? 'Failed' :
                      currentFacilityStatus.status === 'never_synced' ? 'Never' :
                      'Partial'
                    ) : (
                      currentFacilityStatus.status === 'completed' ? 'Last Sync Successful' :
                      currentFacilityStatus.status === 'failed' ? 'Last Sync Failed' :
                      currentFacilityStatus.status === 'never_synced' ? 'Never Synced' :
                      'Partial Sync'
                    )}
                  </span>
                </div>
              </div>
              
              <div className="text-xs space-y-0.5">
                {currentFacilityStatus.lastSyncTime ? (
                  <>
                    <div>{formatTimeAgo(currentFacilityStatus.lastSyncTime)}</div>
                    {size !== 'small' && currentFacilityStatus.changesDetected !== undefined && (
                      <div>{currentFacilityStatus.changesDetected} changes detected</div>
                    )}
                    {size !== 'small' && currentFacilityStatus.changesApplied !== undefined && (
                      <div>{currentFacilityStatus.changesApplied} changes applied</div>
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
          )}

          {/* Sync History (for larger widgets) */}
          {(size === 'large' || size === 'large-wide' || size === 'huge' || size === 'medium-tall') && syncHistory.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Syncs</h4>
              <div className="space-y-2">
                {syncHistory.slice(0, size === 'medium-tall' ? 3 : 5).map((sync) => (
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
                      {sync.changes_detected || 0} changes
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Sync Button */}
          {fmsConfigured && (
            <div className={`${size === 'small' ? 'pt-1' : 'pt-2'} border-t border-gray-200 dark:border-gray-700`}>
              <button
                onClick={handleManualSync}
                disabled={syncing || !fmsConfigured}
                className={`w-full flex items-center justify-center space-x-2 ${size === 'small' ? 'py-1.5 px-2 text-xs' : 'py-2 px-3 text-sm'} bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <ArrowPathIcon className={`${size === 'small' ? 'h-3 w-3' : 'h-4 w-4'} ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : (size === 'small' ? 'Sync' : 'Sync Now')}</span>
              </button>
            </div>
          )}
        </div>
      </Widget>

      {/* Modals */}
      <FMSSyncProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
      />

      {showReviewModal && (
        <FMSChangeReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          changes={pendingChanges}
          onApply={handleApplyChanges}
          syncResult={null}
        />
      )}
    </>
  );
};
