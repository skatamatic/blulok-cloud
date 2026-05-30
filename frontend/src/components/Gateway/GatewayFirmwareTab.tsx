import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  StopIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CpuChipIcon,
  ExclamationCircleIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import {
  FirmwareTargetType,
  FirmwareImage,
  FirmwarePush,
  FirmwarePushWithEvents,
  FirmwarePushProgress,
  FirmwarePushEvent,
  FirmwareDeviceStatus,
  TARGET_TYPE_LABELS,
  TARGET_TYPE_COLORS,
  TERMINAL_STATUSES,
  PHASE_ORDER,
  PHASE_LABELS,
  STEP_LABELS,
  DEVICE_STATUS_CONFIG,
} from '@/types/firmware.types';

interface GatewayFirmwareTabProps {
  gatewayId: string;
  currentFirmwareVersion?: string;
  gatewayModel?: string;
}

const HISTORY_PAGE_SIZE = 10;

const toReadableLabel = (value: string): string =>
  value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizeLiveDevices = (devices?: FirmwareDeviceStatus[]): FirmwareDeviceStatus[] => {
  if (!Array.isArray(devices) || devices.length === 0) return [];
  const byDeviceId = new Map<string, FirmwareDeviceStatus>();
  for (const device of devices) {
    if (!device?.device_id) continue;
    byDeviceId.set(device.device_id, device);
  }
  return Array.from(byDeviceId.values());
};

export default function GatewayFirmwareTab({ gatewayId, currentFirmwareVersion, gatewayModel }: GatewayFirmwareTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();

  const [selectedTargetType, setSelectedTargetType] = useState<FirmwareTargetType>('gateway');
  const [firmware, setFirmware] = useState<FirmwareImage[]>([]);
  const [activePush, setActivePush] = useState<FirmwarePushWithEvents | null>(null);
  const [pushHistory, setPushHistory] = useState<FirmwarePush[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [confirmPushId, setConfirmPushId] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);

  const [liveProgress, setLiveProgress] = useState<FirmwarePushProgress | null>(null);
  const [liveDevices, setLiveDevices] = useState<FirmwareDeviceStatus[]>([]);
  const [liveEvents, setLiveEvents] = useState<FirmwarePushEvent[]>([]);
  const [liveError, setLiveError] = useState<{ code?: string; message: string; severity?: 'warning' | 'critical' } | null>(null);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const [fwRes, pushStatusRes, pushHistoryRes] = await Promise.all([
        apiService.listFirmware(selectedTargetType),
        // Keep initial load lightweight; live progress arrives via websocket updates.
        apiService.getFirmwarePushStatus(gatewayId, selectedTargetType, false),
        apiService.getFirmwarePushHistory(gatewayId, selectedTargetType, HISTORY_PAGE_SIZE),
      ]);
      setFirmware(fwRes.data || []);

      const pushData = pushStatusRes.data as FirmwarePushWithEvents | null;
      setActivePush(pushData || null);

      const histData = pushHistoryRes.data || [];
      setPushHistory(histData);
      setHistoryHasMore(histData.length >= HISTORY_PAGE_SIZE);

      if (pushData && !TERMINAL_STATUSES.includes(pushData.status)) {
        setLiveProgress({
          pushId: pushData.id,
          firmwareId: pushData.firmware_id,
          gatewayId: pushData.gateway_id,
          facilityId: pushData.facility_id,
          targetType: pushData.target_type,
          step: pushData.status,
          percent: pushData.progress_percent || (pushData.chunks_total ? Math.round((pushData.chunks_sent / pushData.chunks_total) * 100) : 0),
          chunksTotal: pushData.chunks_total || undefined,
          chunksSent: pushData.chunks_sent,
          phase: pushData.phase,
          devicesTotal: pushData.devices_total,
          devicesComplete: pushData.devices_complete,
          devicesFailed: pushData.devices_failed,
        });
        setLiveDevices(normalizeLiveDevices(pushData.device_statuses || []));
        setLiveEvents(pushData.recent_events || []);
      } else {
        setLiveProgress(null);
        setLiveDevices([]);
        setLiveEvents([]);
        setLiveError(null);
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to load firmware data' });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [gatewayId, selectedTargetType, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const verifyingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const status = liveProgress?.step || activePush?.status;
    if (status !== 'verifying') {
      if (verifyingPollRef.current) {
        clearInterval(verifyingPollRef.current);
        verifyingPollRef.current = null;
      }
      return;
    }

    verifyingPollRef.current = setInterval(() => {
      void loadData({ silent: true });
    }, 8000);

    return () => {
      if (verifyingPollRef.current) {
        clearInterval(verifyingPollRef.current);
        verifyingPollRef.current = null;
      }
    };
  }, [liveProgress?.step, activePush?.status, loadData]);

  const terminalRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subId = ws.subscribe(
      'firmware_push_progress',
      (data: FirmwarePushProgress) => {
        if (data.gatewayId !== gatewayId) return;
        if (data.targetType && data.targetType !== selectedTargetType) return;

        setLiveProgress(data);

        if ((TERMINAL_STATUSES as readonly string[]).includes(data.step)) {
          setActivePush((prev) => (
            prev && prev.id === data.pushId
              ? { ...prev, status: data.step as typeof prev.status, progress_percent: data.percent }
              : prev
          ));
        }

        if (data.devices?.length) {
          setLiveDevices(normalizeLiveDevices(data.devices));
        }

        setLiveError(data.error ?? null);

        if (data.message || data.phase || data.error) {
          const severity = data.error?.severity;
          const typedSeverity: 'warning' | 'critical' | undefined =
            severity === 'warning' || severity === 'critical' ? severity : undefined;

          setLiveEvents((prev) => {
            const newEvent: FirmwarePushEvent = {
              id: `live-${Date.now()}`,
              push_id: data.pushId,
              event_type: data.error ? 'error' : 'progress',
              progress_percent: data.percent,
              phase: data.phase,
              error_message: data.error?.message,
              error_severity: typedSeverity,
              message: data.message || data.error?.message,
              reported_at: data.timestamp || new Date().toISOString(),
              created_at: new Date().toISOString(),
            };
            return [newEvent, ...prev].slice(0, 50);
          });
        }

        const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(data.step);
        if (isTerminal) {
          terminalRefreshTimer.current = setTimeout(() => loadData(), 500);
        }
      },
    );

    return () => {
      if (subId) ws.unsubscribe(subId);
      if (terminalRefreshTimer.current) clearTimeout(terminalRefreshTimer.current);
    };
  }, [ws, gatewayId, selectedTargetType, loadData]);

  const handlePush = async (firmwareId: string) => {
    setConfirmPushId(null);
    try {
      setPushing(true);
      const res = await apiService.pushFirmware(firmwareId, gatewayId);
      setActivePush(res.data);
      setLiveProgress({ pushId: res.data.id, firmwareId, gatewayId, facilityId: res.data.facility_id, targetType: selectedTargetType, step: 'pending', percent: 0 });
      setLiveDevices([]);
      setLiveEvents([]);
      setLiveError(null);
      addToast({ type: 'success', title: 'Firmware push initiated' });
    } catch (err: any) {
      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to initiate push' });
    } finally {
      setPushing(false);
    }
  };

  const handleCancel = async () => {
    if (!activePush) return;
    try {
      await apiService.cancelFirmwarePush(activePush.id);
      addToast({ type: 'info', title: 'Push cancellation requested' });
    } catch (err: any) {
      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to cancel push' });
    }
  };

  const loadMoreHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await apiService.getFirmwarePushHistory(
        gatewayId,
        selectedTargetType,
        HISTORY_PAGE_SIZE,
        pushHistory.length,
      );
      const more = res.data || [];
      setPushHistory((prev) => [...prev, ...more]);
      setHistoryHasMore(more.length >= HISTORY_PAGE_SIZE);
    } catch {
      addToast({ type: 'error', title: 'Failed to load more history' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const isActiveTransfer = activePush && !TERMINAL_STATUSES.includes(activePush.status);

  const getActivePushVersion = (): string | null => {
    if (!activePush) return null;
    const fw = firmware.find((f) => f.id === activePush.firmware_id);
    return fw ? fw.version : null;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed': return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'cancelled': return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default: return <ClockIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  const currentPhase = liveProgress?.phase || (liveProgress?.step === 'transferring' ? 'transferring' : undefined);
  const phaseIdx = currentPhase ? (PHASE_ORDER as readonly string[]).indexOf(currentPhase) : -1;
  const hasKnownPhase = phaseIdx >= 0;
  const phaseLabel = currentPhase ? (PHASE_LABELS[currentPhase] || toReadableLabel(currentPhase)) : undefined;
  const effectivePercent = liveProgress?.percent || 0;
  const isAwaitingGatewayConfirmation =
    (liveProgress?.step === 'verifying' || activePush?.status === 'verifying') && effectivePercent >= 100;
  const fallbackDevicesTotal = liveDevices.length;
  const summaryDevicesTotal = (liveProgress?.devicesTotal != null && liveProgress.devicesTotal > 0)
    ? liveProgress.devicesTotal
    : fallbackDevicesTotal;
  const derivedDevicesComplete = liveDevices.filter((d) => d.status === 'complete').length;
  const derivedDevicesFailed = liveDevices.filter((d) => d.status === 'failed').length;
  const summaryDevicesComplete = liveProgress?.devicesComplete ?? derivedDevicesComplete;
  const summaryDevicesFailed = liveProgress?.devicesFailed ?? derivedDevicesFailed;
  const summaryDevicesInProgress = Math.max(summaryDevicesTotal - summaryDevicesComplete - summaryDevicesFailed, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-0 w-fit">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse first:rounded-l-lg last:rounded-r-lg" />
          ))}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Target Type Tabs */}
      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden w-fit">
        {(['gateway', 'lock', 'friend_node', 'access_control'] as FirmwareTargetType[]).map((tt) => (
          <button
            key={tt}
            onClick={() => { setSelectedTargetType(tt); setConfirmPushId(null); }}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              selectedTargetType === tt
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {TARGET_TYPE_LABELS[tt]}
          </button>
        ))}
      </div>

      {/* Current Firmware Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Current {TARGET_TYPE_LABELS[selectedTargetType]} Firmware
        </h3>
        {selectedTargetType === 'gateway' ? (
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {currentFirmwareVersion ? `v${currentFirmwareVersion}` : 'Unknown'}
            </span>
            {gatewayModel && (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
                {gatewayModel}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {TARGET_TYPE_LABELS[selectedTargetType]} firmware version is reported by the gateway after deployment.
            Push a firmware update below to get started.
          </p>
        )}
      </div>

      {/* Active Push Progress */}
      {(isActiveTransfer || (liveProgress && !(TERMINAL_STATUSES as readonly string[]).includes(liveProgress.step))) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
          {/* Header */}
          <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                Firmware Update In Progress
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {getActivePushVersion() && (
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">v{getActivePushVersion()}</span>
                )}
                {activePush?.target_type && (
                  <span className={`text-xs font-medium ${TARGET_TYPE_COLORS[activePush.target_type]}`}>
                    {TARGET_TYPE_LABELS[activePush.target_type]}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              <StopIcon className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Live update stream status */}
            {!ws.isConnected && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs">
                <ClockIcon className="h-4 w-4" />
                <span>Live WebSocket updates are temporarily disconnected. The page will resubscribe automatically when connection returns.</span>
              </div>
            )}

            {/* Error Banner */}
            {liveError && (
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                liveError.severity === 'critical'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              }`}>
                <ExclamationCircleIcon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                  liveError.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    liveError.severity === 'critical' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                  }`}>
                    {liveError.severity === 'critical' ? 'Critical Error' : 'Warning'}
                    {liveError.code && <span className="ml-2 font-mono text-xs opacity-70">({liveError.code})</span>}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    liveError.severity === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {liveError.message}
                  </p>
                </div>
              </div>
            )}

            {/* Phase Stepper */}
            {currentPhase && hasKnownPhase && (
              <div className="flex items-center gap-1">
                {PHASE_ORDER.map((phase, idx) => {
                  const isComplete = idx < phaseIdx || (currentPhase === 'complete' && idx <= phaseIdx);
                  const isCurrent = idx === phaseIdx && currentPhase !== 'complete';
                  return (
                    <div key={phase} className="flex items-center gap-1 flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-full h-1.5 rounded-full transition-colors duration-300 ${
                          isComplete ? 'bg-green-500 dark:bg-green-400' :
                          isCurrent ? 'bg-blue-500 dark:bg-blue-400' :
                          'bg-gray-200 dark:bg-gray-700'
                        }`} />
                        <span className={`text-[10px] mt-1 font-medium transition-colors ${
                          isComplete ? 'text-green-600 dark:text-green-400' :
                          isCurrent ? 'text-blue-600 dark:text-blue-400' :
                          'text-gray-400 dark:text-gray-600'
                        }`}>
                          {PHASE_LABELS[phase] || phase}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom phase badge for non-standard gateway phases */}
            {currentPhase && !hasKnownPhase && (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                <span>Phase:</span>
                <span>{phaseLabel}</span>
              </div>
            )}

            {/* Step Label + Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {STEP_LABELS[liveProgress?.phase || liveProgress?.step || activePush?.status || 'pending']
                    || (liveProgress?.phase ? phaseLabel : undefined)
                    || liveProgress?.step
                    || 'Preparing...'}
                </span>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {liveProgress?.chunksTotal != null && (
                    <span>{liveProgress.chunksSent || 0}/{liveProgress.chunksTotal} chunks</span>
                  )}
                  <span className="font-semibold text-sm text-blue-600 dark:text-blue-400">{effectivePercent}%</span>
                </div>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ease-out relative ${
                    isAwaitingGatewayConfirmation
                      ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-400 dark:to-indigo-500 animate-pulse'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500'
                  }`}
                  style={{ width: `${Math.max(effectivePercent, 2)}%` }}
                >
                  {!isAwaitingGatewayConfirmation && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                  )}
                </div>
              </div>

              {isAwaitingGatewayConfirmation && (
                <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-2">
                  Transfer complete — waiting for the gateway to confirm installation. This can take a few minutes if the device is rebooting.
                </p>
              )}

              {liveProgress?.message && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{liveProgress.message}</p>
              )}
            </div>

            {/* Device Counts Summary */}
            {summaryDevicesTotal > 0 && (
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                  <CpuChipIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {summaryDevicesTotal} device{summaryDevicesTotal !== 1 ? 's' : ''}
                  </span>
                </div>
                {summaryDevicesComplete > 0 && (
                  <div className="flex items-center gap-1">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs text-green-600 dark:text-green-400">{summaryDevicesComplete}</span>
                  </div>
                )}
                {summaryDevicesFailed > 0 && (
                  <div className="flex items-center gap-1">
                    <XCircleIcon className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs text-red-600 dark:text-red-400">{summaryDevicesFailed}</span>
                  </div>
                )}
                {summaryDevicesInProgress > 0 && (
                  <div className="flex items-center gap-1">
                    <ArrowPathIcon className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      {summaryDevicesInProgress} in progress
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Per-Device Status Grid */}
            {liveDevices.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Device Status</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {liveDevices.map((device) => {
                    const cfg = DEVICE_STATUS_CONFIG[device.status] || DEVICE_STATUS_CONFIG.pending;
                    return (
                      <div key={device.device_id} className={`${cfg.bg} rounded-lg p-2.5 border border-gray-200/50 dark:border-gray-700/50`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <SignalIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate" title={device.device_id}>
                            {device.device_id}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                          {device.progress_percent != null && device.status !== 'complete' && device.status !== 'failed' && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">{device.progress_percent}%</span>
                          )}
                        </div>
                        {device.error && (
                          <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 truncate" title={device.error}>{device.error}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Event Timeline */}
            {liveEvents.length > 0 && (
              <div>
                <button
                  onClick={() => setEventsExpanded(!eventsExpanded)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {eventsExpanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                  Event Log ({liveEvents.length})
                </button>
                {eventsExpanded && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 pr-1">
                    {liveEvents.map((evt) => (
                      <div key={evt.id} className="flex items-start gap-2 py-1.5 text-xs">
                        <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0 tabular-nums">
                          {new Date(evt.reported_at || evt.created_at).toLocaleTimeString()}
                        </span>
                        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                          evt.event_type === 'error' ? 'bg-red-500' :
                          evt.event_type === 'device_status' ? 'bg-blue-500' :
                          'bg-gray-400'
                        }`} />
                        <span className="text-gray-700 dark:text-gray-300 min-w-0">
                          {evt.message || evt.error_message || `${evt.phase || evt.event_type} ${evt.progress_percent != null ? `(${evt.progress_percent}%)` : ''}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Available Firmware */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Available Firmware</h3>
          <button
            onClick={loadData}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
        </div>

        {firmware.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No {TARGET_TYPE_LABELS[selectedTargetType].toLowerCase()} firmware available. Ask a developer to upload firmware via DevTools.
          </p>
        ) : (
          <div className="space-y-3">
            {firmware.map((fw) => {
              const isCurrent = selectedTargetType === 'gateway' && currentFirmwareVersion === fw.version;
              return (
                <div
                  key={fw.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    isCurrent
                      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">v{fw.version}</span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatBytes(fw.size_bytes)}</span>
                      <span>{new Date(fw.created_at).toLocaleDateString()}</span>
                      {fw.description && <span className="truncate max-w-[200px]">{fw.description}</span>}
                    </div>
                    {fw.compatible_models?.length ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {fw.compatible_models.map((m) => (
                          <span key={m} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-500 dark:text-gray-400">{m}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="ml-4 shrink-0">
                    {confirmPushId === fw.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePush(fw.id)}
                          disabled={pushing || !!isActiveTransfer}
                          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmPushId(null)}
                          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmPushId(fw.id)}
                        disabled={isCurrent || !!isActiveTransfer || pushing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                        Push
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Push History */}
      {pushHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Push History</h3>
          <div className="space-y-2">
            {pushHistory.map((p) => {
              const fw = firmware.find((f) => f.id === p.firmware_id);
              return (
                <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  {statusIcon(p.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {fw ? `v${fw.version}` : 'Deleted firmware'}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        p.status === 'complete' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        p.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        p.status === 'cancelled' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                        'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.progress_percent > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{p.progress_percent}%</span>
                      )}
                      {p.phase && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{PHASE_LABELS[p.phase] || p.phase}</span>
                      )}
                      {p.devices_total != null && p.devices_total > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {p.devices_complete}/{p.devices_total} devices
                        </span>
                      )}
                      {p.chunks_total ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {p.chunks_sent}/{p.chunks_total} chunks
                        </span>
                      ) : null}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(p.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {p.error_message && (
                    <span
                      className="text-xs text-red-500 dark:text-red-400 max-w-[300px] truncate shrink-0"
                      title={p.error_message}
                    >
                      {p.error_message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {historyHasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMoreHistory}
                disabled={historyLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {historyLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                )}
                {historyLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
