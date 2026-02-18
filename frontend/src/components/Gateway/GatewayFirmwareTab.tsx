import { useState, useEffect, useCallback } from 'react';
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  StopIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';

type FirmwareTargetType = 'gateway' | 'lock' | 'friend_node';

const TARGET_TYPE_LABELS: Record<FirmwareTargetType, string> = {
  gateway: 'Gateway',
  lock: 'Lock',
  friend_node: 'Friend Node',
};

const TARGET_TYPE_COLORS: Record<FirmwareTargetType, string> = {
  gateway: 'text-blue-600 dark:text-blue-400',
  lock: 'text-emerald-600 dark:text-emerald-400',
  friend_node: 'text-purple-600 dark:text-purple-400',
};

interface FirmwareImage {
  id: string;
  version: string;
  target_type: FirmwareTargetType;
  filename: string;
  sha256_hash: string;
  size_bytes: number;
  description?: string;
  compatible_models?: string[];
  minimum_version?: string;
  created_at: string;
}

interface FirmwarePush {
  id: string;
  firmware_id: string;
  gateway_id: string;
  facility_id: string;
  target_type: FirmwareTargetType;
  status: 'pending' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  chunks_total: number | null;
  chunks_sent: number;
  error_message?: string;
  initiated_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface GatewayFirmwareTabProps {
  gatewayId: string;
  currentFirmwareVersion?: string;
  gatewayModel?: string;
}

const HISTORY_PAGE_SIZE = 10;

export default function GatewayFirmwareTab({ gatewayId, currentFirmwareVersion, gatewayModel }: GatewayFirmwareTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();

  const [selectedTargetType, setSelectedTargetType] = useState<FirmwareTargetType>('gateway');
  const [firmware, setFirmware] = useState<FirmwareImage[]>([]);
  const [activePush, setActivePush] = useState<FirmwarePush | null>(null);
  const [pushHistory, setPushHistory] = useState<FirmwarePush[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [confirmPushId, setConfirmPushId] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Progress state from WS subscription
  const [liveProgress, setLiveProgress] = useState<{
    step: string;
    percent: number;
    chunksTotal?: number;
    chunksSent?: number;
    message?: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fwRes, pushStatusRes, pushHistoryRes] = await Promise.all([
        apiService.listFirmware(selectedTargetType),
        apiService.getFirmwarePushStatus(gatewayId, selectedTargetType),
        apiService.getFirmwarePushHistory(gatewayId, selectedTargetType, HISTORY_PAGE_SIZE),
      ]);
      setFirmware(fwRes.data || []);
      setActivePush(pushStatusRes.data || null);

      const histData = pushHistoryRes.data || [];
      setPushHistory(histData);
      setHistoryHasMore(histData.length >= HISTORY_PAGE_SIZE);

      // Hydrate live progress from active push (handles browser reload)
      if (pushStatusRes.data && !['complete', 'failed', 'cancelled'].includes(pushStatusRes.data.status)) {
        const p = pushStatusRes.data as FirmwarePush;
        setLiveProgress({
          step: p.status,
          percent: p.chunks_total ? Math.round((p.chunks_sent / p.chunks_total) * 100) : 0,
          chunksTotal: p.chunks_total || undefined,
          chunksSent: p.chunks_sent,
        });
      } else {
        setLiveProgress(null);
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to load firmware data' });
    } finally {
      setLoading(false);
    }
  }, [gatewayId, selectedTargetType, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to firmware push progress -- filters by gatewayId AND selectedTargetType
  useEffect(() => {
    const subId = ws.subscribe(
      'firmware_push_progress',
      (data: any) => {
        if (data.gatewayId !== gatewayId) return;
        // Filter by target type to prevent cross-type progress bleed during concurrent pushes
        if (data.targetType && data.targetType !== selectedTargetType) return;

        setLiveProgress({
          step: data.step,
          percent: data.percent,
          chunksTotal: data.chunksTotal,
          chunksSent: data.chunksSent,
          message: data.message,
        });

        if (['complete', 'failed', 'cancelled'].includes(data.step)) {
          setTimeout(() => loadData(), 500);
        }
      },
    );

    return () => {
      if (subId) ws.unsubscribe(subId);
    };
  }, [ws, gatewayId, selectedTargetType, loadData]);

  const handlePush = async (firmwareId: string) => {
    setConfirmPushId(null);
    try {
      setPushing(true);
      const res = await apiService.pushFirmware(firmwareId, gatewayId);
      setActivePush(res.data);
      setLiveProgress({ step: 'pending', percent: 0 });
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
      setPushHistory(prev => [...prev, ...more]);
      setHistoryHasMore(more.length >= HISTORY_PAGE_SIZE);
    } catch {
      addToast({ type: 'error', title: 'Failed to load more history' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const isActiveTransfer = activePush && !['complete', 'failed', 'cancelled'].includes(activePush.status);

  // Resolve firmware version for push (from current list or from push data)
  const getActivePushVersion = (): string | null => {
    if (!activePush) return null;
    const fw = firmware.find(f => f.id === activePush.firmware_id);
    return fw ? fw.version : null;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const stepLabels: Record<string, string> = {
    pending: 'Preparing...',
    manifest_sent: 'Sending manifest...',
    transferring: 'Transferring chunks...',
    verifying: 'Verifying...',
    complete: 'Complete',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed': return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'cancelled': return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      default: return <ClockIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-0 w-fit">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse first:rounded-l-lg last:rounded-r-lg" />
          ))}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
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
        {(['gateway', 'lock', 'friend_node'] as FirmwareTargetType[]).map((tt) => (
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
      {(isActiveTransfer || (liveProgress && !['complete', 'failed', 'cancelled'].includes(liveProgress.step))) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                Firmware Update In Progress
              </h3>
              {/* Show version and target type context */}
              <div className="flex items-center gap-2 mt-1">
                {getActivePushVersion() && (
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    v{getActivePushVersion()}
                  </span>
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

          <div className="mb-2">
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {stepLabels[liveProgress?.step || activePush?.status || 'pending']}
            </span>
            {liveProgress?.chunksTotal && (
              <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                ({liveProgress.chunksSent || 0}/{liveProgress.chunksTotal} chunks)
              </span>
            )}
          </div>

          {/* Progress bar with pulse animation */}
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 h-3 rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${Math.max(liveProgress?.percent || 0, 2)}%` }}
            >
              {/* Animated shimmer overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
            </div>
          </div>
          <div className="text-right mt-1">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {liveProgress?.percent || 0}%
            </span>
          </div>

          {liveProgress?.message && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">{liveProgress.message}</p>
          )}
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
              const fw = firmware.find(f => f.id === p.firmware_id);
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

          {/* Load More */}
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
