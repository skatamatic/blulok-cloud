import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  BoltIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { AccessControlDevice } from '@/types/facility.types';
import { getApiErrorMessage } from '@/utils/apiError.utils';
import { shouldRefreshDeviceListForPayload } from '@/utils/deviceStatusWs.utils';
import { useToast } from '@/contexts/ToastContext';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { startHardwareAckWatch, LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS } from '@/utils/lockHardwareFeedback.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { DashboardFacilityScopePlaceholder } from '@/components/Widget/DashboardFacilityScopePlaceholder';
import { formatRelativeTime, formatTime } from '@/utils/datetime.utils';

interface GateDevice {
  id: string;
  name: string;
  facility: string;
  /** Facility UUID when known; empty when the API omits `facility_id`. */
  facilityId: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  isOpen: boolean;
  /** When false, cloud must not send CLOSE / remote lock (close on site). */
  supportsRemoteLock: boolean;
  lastActivity: Date;
  holdUntil?: Date;
  deviceType: 'gate' | 'elevator' | 'door';
}

const HOLD_REMINDER_TOOLTIP =
  'Unlocks the gate. Timer is a local reminder only; re-lock behavior depends on hardware.';

const MANUAL_CLOSE_HINT = 'Close manually at the gate — remote lock is not enabled for this hardware.';

interface RemoteGateWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  facilityFilter?: string;
}

/**
 * Transform an AccessControlDevice from the API into a GateDevice for display.
 */
const transformToGateDevice = (device: AccessControlDevice): GateDevice => {
  return {
    id: device.id,
    name: device.name,
    facility: device.facility_name || 'Unknown Facility',
    facilityId: device.facility_id ?? '',
    status: device.status,
    isOpen: !device.is_locked,
    supportsRemoteLock: device.supports_remote_lock === true,
    lastActivity: device.last_activity ? new Date(device.last_activity) : new Date(),
    deviceType: device.device_type,
  };
};

export const RemoteGateWidget: React.FC<RemoteGateWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  currentSize,
  availableSizes = ['medium', 'large'],
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  facilityFilter
}) => {
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
  const [gates, setGates] = useState<GateDevice[]>([]);
  const [selectedGate, setSelectedGate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isOperating, setIsOperating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdDuration, setHoldDuration] = useState<number>(5); // minutes

  const { isConnected } = useWebSocket();
  const { addToast } = useToast();
  const loadGatesRef = useRef<() => Promise<void>>(async () => {});
  const gateIdsRef = useRef<Set<string>>(new Set());
  const gatesRef = useRef<GateDevice[]>([]);
  gatesRef.current = gates;
  const gateOpenAckCancelRef = useRef<(() => void) | null>(null);
  const pendingGateOpenIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => gateOpenAckCancelRef.current?.();
  }, []);

  useEffect(() => {
    if (!pendingGateOpenIdRef.current) return;
    const g = gates.find((x) => x.id === pendingGateOpenIdRef.current);
    if (g?.isOpen) {
      gateOpenAckCancelRef.current?.();
      gateOpenAckCancelRef.current = null;
      pendingGateOpenIdRef.current = null;
    }
  }, [gates]);

  const loadGates = useCallback(async () => {
    if (!facilityFilter) {
      gateIdsRef.current = new Set();
      setGates([]);
      setIsLoading(false);
      return;
    }

    setError(null);
    
    try {
      const response = await apiService.getDevices({
        device_type: 'access_control',
        limit: 200,
        ...(facilityFilter ? { facility_id: facilityFilter } : {}),
      });

      if (response.devices) {
        // Filter for gate/door/elevator types and transform
        const accessControlDevices = response.devices.filter(
          (d: AccessControlDevice) => ['gate', 'elevator', 'door'].includes(d.device_type)
        );
        const transformedGates = accessControlDevices.map(transformToGateDevice);
        gateIdsRef.current = new Set(transformedGates.map((g: GateDevice) => g.id));
        setGates(transformedGates);
      } else {
        gateIdsRef.current = new Set();
        setGates([]);
      }
    } catch (err) {
      console.error('Failed to load access control devices:', err);
      setError('Failed to load gates');
      gateIdsRef.current = new Set();
      setGates([]);
    } finally {
      setIsLoading(false);
    }
  }, [facilityFilter]);

  useEffect(() => {
    loadGatesRef.current = loadGates;
  }, [loadGates]);

  useEffect(() => {
    void loadGates();
  }, [loadGates]);

  useLockDeviceRealtime({
    enabled: isConnected,
    debouncedRefresh: () => {
      void loadGatesRef.current();
    },
    debounceRefreshFilter: (p) => shouldRefreshDeviceListForPayload(p, gateIdsRef.current),
    debounceMs: 450,
    subscribeUnitsForRefresh: false,
  });

  useEffect(() => {
    if (gates.length === 0) {
      if (selectedGate) setSelectedGate('');
      return;
    }
    if (selectedGate && !gates.some((g) => g.id === selectedGate)) {
      setSelectedGate('');
    }
  }, [gates, selectedGate]);

  useEffect(() => {
    // Prefer first online gate; otherwise show the first gate (offline still visible).
    if (gates.length > 0 && !selectedGate) {
      const preferred = gates.find((g) => g.status === 'online') ?? gates[0];
      setSelectedGate(preferred.id);
    }
  }, [gates, selectedGate]);

  const showLargeStats = useMemo(
    () => size === 'large' || size === 'huge' || `${size}`.includes('wide'),
    [size]
  );

  const handleGateOperation = async (operation: 'open' | 'close' | 'hold') => {
    const gate = gates.find(g => g.id === selectedGate);
    if (!gate || gate.status !== 'online') return;
    if ((operation === 'open' || operation === 'hold') && gate.isOpen) return;
    if (operation === 'close' && !gate.supportsRemoteLock) {
      addToast({
        type: 'info',
        title: 'Close manually',
        message: 'Remote lock is not enabled for this device; close at the gate.',
      });
      return;
    }

    setIsOperating(true);
    setError(null);

    try {
      const lockStatus =
        operation === 'close' ? 'locked' : 'unlocked';
      await apiService.updateAccessControlLockStatus(selectedGate, lockStatus);
      await loadGates();

      if (operation === 'open' || operation === 'hold') {
        const gateId = selectedGate;
        pendingGateOpenIdRef.current = gateId;
        gateOpenAckCancelRef.current?.();
        gateOpenAckCancelRef.current = startHardwareAckWatch(
          () => {
            if (pendingGateOpenIdRef.current !== gateId) return false;
            const g = gatesRef.current.find((x) => x.id === gateId);
            return !!g && !g.isOpen;
          },
          () => {
            addToast(lockHardwareFeedbackToasts.accessPointOpenTimeout());
            pendingGateOpenIdRef.current = null;
            gateOpenAckCancelRef.current = null;
          },
          LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS,
        );
      }

      if (operation === 'hold') {
        setGates((prev) =>
          prev.map((g) =>
            g.id === selectedGate
              ? {
                  ...g,
                  holdUntil: new Date(Date.now() + holdDuration * 60 * 1000),
                }
              : g
          )
        );
      }
    } catch (err: unknown) {
      gateOpenAckCancelRef.current?.();
      gateOpenAckCancelRef.current = null;
      pendingGateOpenIdRef.current = null;
      console.error('Gate operation failed:', err);
      setError(getApiErrorMessage(err, 'Failed to operate gate'));
    } finally {
      setIsOperating(false);
    }
  };

  const handleRetry = async () => {
    setIsLoading(true);
    await loadGates();
  };

  const selectedGateData = gates.find(g => g.id === selectedGate);
  const onlineGates = gates.filter(g => g.status === 'online');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'offline':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      case 'maintenance':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      default:
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Widget
      id={id}
      title={title}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={handleSizeChange}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      enhancedMenu={
        <div className="space-y-1">
          <div className="px-3 py-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hold Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={holdDuration}
              onChange={(e) => setHoldDuration(parseInt(e.target.value) || 5)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      }
    >
      {/* All-facilities mode requires a single facility selection */}
      {!facilityFilter ? (
        <DashboardFacilityScopePlaceholder
          icon={BoltIcon}
          title="Select a facility"
          message="Choose a facility from the header to view and control gates at that site."
        />
      ) : isLoading && gates.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <ArrowPathIcon className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading gates...</p>
          </div>
        </div>
      ) : error && gates.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            Try again
          </button>
        </div>
      ) : size === 'medium' ? (
        /* Compact gate control for medium widgets */
        <div className="h-full flex flex-col min-h-0 justify-center gap-2">
          {gates.length > 1 && (
            <select
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
            >
              <option value="">Choose a gate</option>
              {gates.map((gate) => (
                <option key={gate.id} value={gate.id}>
                  {gate.name} ({gate.status})
                </option>
              ))}
            </select>
          )}

          {selectedGateData ? (
            selectedGateData.status === 'online' ? (
            <div className="text-center space-y-2">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedGateData.name}
              </div>
              <div className={`text-xs px-2 py-1 rounded-full inline-block ${
                selectedGateData.isOpen 
                  ? 'bg-green-600 text-white dark:bg-green-600'
                  : 'bg-gray-600 text-white dark:bg-gray-600'
              }`}>
                {selectedGateData.isOpen ? 'Open' : 'Closed'}
              </div>
              <button
                onClick={() =>
                  handleGateOperation(selectedGateData.isOpen ? 'close' : 'open')
                }
                disabled={
                  isOperating ||
                  (selectedGateData.isOpen && !selectedGateData.supportsRemoteLock)
                }
                className={`w-full py-2 px-3 text-xs font-medium rounded-lg transition-colors text-white ${
                  selectedGateData.isOpen
                    ? selectedGateData.supportsRemoteLock
                      ? 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
                      : 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                } disabled:cursor-not-allowed`}
              >
                {isOperating
                  ? '...'
                  : selectedGateData.isOpen
                    ? selectedGateData.supportsRemoteLock
                      ? 'Close'
                      : 'Closed (on site)'
                    : 'Open'}
              </button>
            </div>
            ) : (
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5">
                  {getStatusIcon(selectedGateData.status)}
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedGateData.name}
                  </span>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 capitalize">
                  Gate {selectedGateData.status}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Remote control unavailable while offline
                </p>
              </div>
            )
          ) : (
            <div className="text-center">
              <BoltIcon className="h-6 w-6 text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {gates.length === 0 ? 'No gates found' : 'Select a gate'}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Full gate control for large widgets */
        <div className="h-full flex flex-col min-h-0 gap-2">
        {/* Gate Selection */}
        <div className="flex-shrink-0">
          <select
            value={selectedGate}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">Choose a gate</option>
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id}>
                {gate.name} - {gate.facility} ({gate.deviceType})
              </option>
            ))}
          </select>
        </div>

        {/* Gate status — compact; last activity stays visible */}
        {selectedGateData && (
          <div className="flex-shrink-0 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {getStatusIcon(selectedGateData.status)}
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {selectedGateData.name}
                </span>
              </div>
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                selectedGateData.isOpen 
                  ? 'bg-green-600 text-white dark:bg-green-600'
                  : 'bg-gray-600 text-white dark:bg-gray-600'
              }`}>
                {selectedGateData.isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            <p
              className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate"
              title={formatRelativeTime(selectedGateData.lastActivity, {
                absoluteAfterHours: 24,
                absoluteStyle: 'date',
              })}
            >
              Last activity:{' '}
              {formatRelativeTime(selectedGateData.lastActivity, {
                absoluteAfterHours: 24,
                absoluteStyle: 'date',
              })}
            </p>
            {selectedGateData.holdUntil && (
              <p
                className="mt-0.5 text-[10px] text-blue-600 dark:text-blue-400 truncate"
                title={`Local reminder until ${formatTime(selectedGateData.holdUntil)}`}
              >
                Reminder until {formatTime(selectedGateData.holdUntil)}
              </p>
            )}
          </div>
        )}

        {/* Controls — scroll if the grid cell is short */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {selectedGateData ? (
            selectedGateData.status === 'online' ? (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => handleGateOperation('open')}
                  disabled={isOperating || selectedGateData.isOpen}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  <PlayIcon className="h-4 w-4 shrink-0" />
                  <span>{isOperating ? 'Opening...' : 'Open Once'}</span>
                </button>

                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => handleGateOperation('hold')}
                    disabled={isOperating || selectedGateData.isOpen}
                    title={HOLD_REMINDER_TOOLTIP}
                    className="min-w-0 flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed"
                  >
                    <ClockIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {isOperating ? 'Setting...' : `Unlock & remind (${holdDuration}m)`}
                    </span>
                  </button>
                  <span
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500"
                    title={HOLD_REMINDER_TOOLTIP}
                    aria-label={HOLD_REMINDER_TOOLTIP}
                  >
                    <InformationCircleIcon className="h-4 w-4" aria-hidden />
                  </span>
                </div>

                {selectedGateData.isOpen && selectedGateData.supportsRemoteLock && (
                  <button
                    onClick={() => handleGateOperation('close')}
                    disabled={isOperating}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed"
                  >
                    <StopIcon className="h-4 w-4 shrink-0" />
                    <span>{isOperating ? 'Closing...' : 'Close Gate'}</span>
                  </button>
                )}
                {selectedGateData.isOpen && !selectedGateData.supportsRemoteLock && (
                  <p
                    className="text-center text-[10px] leading-snug text-gray-400 dark:text-gray-500 italic"
                    title={MANUAL_CLOSE_HINT}
                  >
                    Close on site — remote lock unavailable
                  </p>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center py-2">
                <ExclamationTriangleIcon className="h-7 w-7 text-red-400 mb-1" />
                <p className="text-sm text-red-600 dark:text-red-400 capitalize">
                  Gate {selectedGateData.status}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Remote control unavailable
                </p>
              </div>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center py-2">
              <BoltIcon className="h-7 w-7 text-gray-400 mb-1" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a gate to control</p>
              {gates.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  No access control devices found
                </p>
              )}
              {gates.length > 0 && onlineGates.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  All gates offline
                </p>
              )}
            </div>
          )}
        </div>

        {/* Quick Stats for larger widgets */}
        {showLargeStats && gates.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-base font-bold text-gray-900 dark:text-white">
                  {gates.length}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Total</div>
              </div>
              <div>
                <div className="text-base font-bold text-green-600 dark:text-green-400">
                  {onlineGates.length}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Online</div>
              </div>
              <div>
                <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                  {gates.filter(g => g.isOpen).length}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Open</div>
              </div>
            </div>
          </div>
        )}
        </div>
      )}
    </Widget>
  );
};
