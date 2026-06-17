import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  GatewayRecovery,
  GatewayRecoveryEvent,
  GatewayRecoveryProgress,
  GatewayRecoveryStatus,
  RECOVERY_TERMINAL_STATUSES,
  SwapCandidate,
} from '@/types/gateway-recovery.types';
import {
  canShowRecoveryConfig,
  canStartRecovery,
  deriveRecoveryProgress,
  isRecoveryBlocking,
  mergeRecoveryProgress,
  RECOVERY_STEPPER_STEPS,
  resolveStepperStepIndex,
} from '@/utils/gateway-recovery-progress.utils';
import RecoveryBlockingBanner from '@/components/Gateway/RecoveryBlockingBanner';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';

interface RecoveryOption {
  id: string;
  label: string;
  version?: string;
  created_at?: string;
}

interface GatewaySwapRecoveryTabProps {
  facilityId: string;
  boundGatewayId?: string;
  wsConnected: boolean;
  onRecoveryChange?: (snapshot?: { status?: GatewayRecoveryStatus; terminal?: boolean }) => void;
}

function truncateId(id: string, visible = 8): string {
  if (id.length <= visible * 2 + 1) return id;
  return `${id.slice(0, visible)}…${id.slice(-visible)}`;
}

function terminalStatusTone(status: GatewayRecoveryStatus): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'complete') return 'success';
  if (status === 'bypassed') return 'warning';
  if (status === 'failed') return 'error';
  return 'neutral';
}

export default function GatewaySwapRecoveryTab({
  facilityId,
  boundGatewayId,
  onRecoveryChange,
}: GatewaySwapRecoveryTabProps) {
  const { addToast } = useToast();
  const ws = useWebSocket();
  const { authState } = useAuth();
  const isPlatformAdmin = authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN;

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [recovery, setRecovery] = useState<GatewayRecovery | null>(null);
  const [events, setEvents] = useState<GatewayRecoveryEvent[]>([]);
  const [inventoryPreview, setInventoryPreview] = useState<Array<{ kind: string; serial: string }>>([]);
  const [liveProgress, setLiveProgress] = useState<GatewayRecoveryProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBypass, setShowBypass] = useState(false);
  const [bypassConfirmOpen, setBypassConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [firmwareOptions, setFirmwareOptions] = useState<RecoveryOption[]>([]);
  const [provisioningOptions, setProvisioningOptions] = useState<RecoveryOption[]>([]);
  const [selectedFirmwareId, setSelectedFirmwareId] = useState('');
  const [selectedProvisioningBackupId, setSelectedProvisioningBackupId] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const targetGatewayId = useMemo(() => {
    if (recovery?.gateway_id) return recovery.gateway_id;
    if (candidates[0]?.gatewayId) return candidates[0].gatewayId;
    return undefined;
  }, [recovery, candidates]);

  const hydrate = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const candRes = await apiService.getGatewayRecoveryCandidates(facilityId);
      const nextCandidates = candRes.data?.candidates || [];
      const nextRecovery = candRes.data?.recovery || null;
      setCandidates(nextCandidates);

      const gatewayId = nextRecovery?.gateway_id || nextCandidates[0]?.gatewayId;
      if (!gatewayId) {
        setRecovery(null);
        setEvents([]);
        setInventoryPreview([]);
        setFirmwareOptions([]);
        setProvisioningOptions([]);
        setLiveProgress(null);
        onRecoveryChange?.();
        return;
      }

      const [statusRes, previewRes, optionsRes] = await Promise.all([
        apiService.getGatewayRecoveryStatus(gatewayId),
        apiService.getGatewayRecoveryInventoryPreview(gatewayId).catch(() => ({ data: { devices: [] } })),
        apiService.getGatewayRecoveryOptions(gatewayId).catch(() => ({ data: null })),
      ]);

      const status = statusRes.data || nextRecovery;
      setRecovery(status);
      setInventoryPreview(previewRes.data?.devices || []);

      const options = optionsRes.data;
      if (options) {
        setFirmwareOptions(options.firmwareOptions || []);
        setProvisioningOptions(options.provisioningBackupOptions || []);
        if (canShowRecoveryConfig(status, nextCandidates.length > 0)) {
          setSelectedFirmwareId(
            status?.firmware_id
            || options.defaultFirmwareId
            || options.firmwareOptions?.[0]?.id
            || '',
          );
          setSelectedProvisioningBackupId(
            status?.provisioning_backup_id
            || options.defaultProvisioningBackupId
            || options.provisioningBackupOptions?.[0]?.id
            || '',
          );
        }
      }

      if (status?.id) {
        try {
          const eventsRes = await apiService.getGatewayRecoveryEvents(gatewayId, status.id, 50);
          setEvents(eventsRes.data?.events || []);
        } catch {
          setEvents([]);
        }
      } else {
        setEvents([]);
      }

      if (status && !RECOVERY_TERMINAL_STATUSES.includes(status.status)) {
        setLiveProgress((prev) => mergeRecoveryProgress(status, prev));
      } else if (status) {
        setLiveProgress(deriveRecoveryProgress(status));
      } else {
        setLiveProgress(null);
      }

      if (status && RECOVERY_TERMINAL_STATUSES.includes(status.status)) {
        onRecoveryChange?.({ status: status.status, terminal: true });
      } else {
        onRecoveryChange?.();
      }
    } catch (err: unknown) {
      if (!opts?.silent) {
        addToast({
          type: 'error',
          title: 'Failed to load recovery status',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [facilityId, addToast, onRecoveryChange]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!targetGatewayId) return;
    const subId = ws.subscribe('gateway_recovery_progress', (data: GatewayRecoveryProgress) => {
      if (data.gatewayId !== targetGatewayId) return;
      setRecovery((prev) => (prev && data.status ? { ...prev, status: data.status } : prev));
      setLiveProgress((prev) => mergeRecoveryProgress(
        { ...(prev ?? {}), status: data.status, gateway_id: data.gatewayId } as GatewayRecovery,
        { ...data, percent: Math.max(prev?.percent ?? 0, data.percent ?? 0) },
      ));
      if (RECOVERY_TERMINAL_STATUSES.includes(data.status)) {
        void hydrate({ silent: true });
      }
    });
    return () => {
      if (subId) ws.unsubscribe(subId);
    };
  }, [ws, targetGatewayId, hydrate]);

  const isInProgress = !!recovery
    && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status)
    && !['detected', 'awaiting_config'].includes(recovery.status);

  useEffect(() => {
    if (!isInProgress) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const pollMs = ws.isConnected ? 8000 : 4000;
    pollRef.current = setInterval(() => {
      void hydrate({ silent: true });
    }, pollMs);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isInProgress, ws.isConnected, hydrate]);

  const progress = useMemo(() => {
    if (recovery && liveProgress) {
      return mergeRecoveryProgress(recovery, liveProgress);
    }
    if (recovery) return deriveRecoveryProgress(recovery);
    return liveProgress;
  }, [recovery, liveProgress]);

  const hasCandidate = candidates.length > 0;
  const isActive = recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status);
  const isBlocking = isRecoveryBlocking(recovery?.status);
  const showConfig = canShowRecoveryConfig(recovery, hasCandidate);
  const canStart = canStartRecovery(recovery, hasCandidate);
  const canBypass = !!isActive && isPlatformAdmin;
  const candidateOffline = candidates.length > 0 && !candidates.some((c) => c.connected);
  const isFailed = recovery?.status === 'failed';
  const stepperIndex = resolveStepperStepIndex(recovery?.status);
  const terminalTone = recovery ? terminalStatusTone(recovery.status) : null;

  const handleInitiate = async () => {
    if (!targetGatewayId) return;
    setSubmitting(true);
    try {
      const res = await apiService.initiateGatewayRecovery(targetGatewayId, {
        firmwareId: selectedFirmwareId || undefined,
        provisioningBackupId: selectedProvisioningBackupId || undefined,
      });
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      addToast({ type: 'success', title: 'Recovery started', message: 'Phased swap recovery is running on the cloud.' });
      await hydrate({ silent: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to start recovery',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!targetGatewayId) return;
    setSubmitting(true);
    try {
      const res = await apiService.retryGatewayRecovery(targetGatewayId);
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      addToast({ type: 'success', title: 'Recovery retried', message: 'Resuming from the last failed phase.' });
      await hydrate({ silent: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Retry failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBypass = async () => {
    if (!targetGatewayId) return;
    setSubmitting(true);
    try {
      const res = await apiService.bypassGatewayRecovery(targetGatewayId, true);
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      setBypassConfirmOpen(false);
      setShowBypass(false);
      addToast({ type: 'warning', title: 'Recovery bypassed', message: 'Inventory sync is now unblocked.' });
      await hydrate({ silent: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Bypass failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!targetGatewayId || !recovery?.id) return;
    setSubmitting(true);
    try {
      await apiService.cancelGatewayRecovery(targetGatewayId, recovery.id);
      setCancelConfirmOpen(false);
      addToast({ type: 'info', title: 'Recovery cancelled', message: 'You can start a new recovery when ready.' });
      await hydrate();
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Cancel failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-secondary-500 dark:text-secondary-400">
        <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
        Loading swap / recovery…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasCandidate && (
        <div
          className="rounded-lg border border-[#147FD4]/30 bg-[#147FD4]/5 dark:bg-[#147FD4]/10 px-4 py-3"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-[#147FD4] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-secondary-900 dark:text-white">New gateway detected</p>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                A replacement gateway connected while the bound unit is still online. Complete swap recovery before
                trusting inventory from the new hardware.
              </p>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {boundGatewayId && (
                  <div className="rounded-md bg-white/60 dark:bg-black/20 px-2 py-1.5">
                    <dt className="text-secondary-500 dark:text-secondary-400">Bound gateway (production)</dt>
                    <dd className="font-mono text-secondary-800 dark:text-secondary-100" title={boundGatewayId}>
                      {truncateId(boundGatewayId)}
                    </dd>
                  </div>
                )}
                {candidates.map((c) => (
                  <div key={c.gatewayId} className="rounded-md bg-white/60 dark:bg-black/20 px-2 py-1.5">
                    <dt className="text-secondary-500 dark:text-secondary-400">Swap candidate</dt>
                    <dd className="font-mono text-secondary-800 dark:text-secondary-100" title={c.gatewayId}>
                      {truncateId(c.gatewayId)}{' '}
                      <span className={c.connected ? 'text-emerald-600' : 'text-amber-600'}>
                        {c.connected ? '· connected' : '· offline'}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {isBlocking && (
        <RecoveryBlockingBanner />
      )}

      {recovery && RECOVERY_TERMINAL_STATUSES.includes(recovery.status) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            terminalTone === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/20'
              : terminalTone === 'warning'
                ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20'
                : terminalTone === 'error'
                  ? 'border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20'
                  : 'border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-900/40'
          }`}
          role="status"
        >
          <div className="flex items-start gap-3">
            {terminalTone === 'success' && <CheckCircleIcon className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />}
            {terminalTone === 'warning' && <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
            {terminalTone === 'error' && <XCircleIcon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
            {terminalTone === 'neutral' && <StopIcon className="h-5 w-5 text-secondary-500 shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">
                {recovery.status === 'complete' && 'Recovery complete'}
                {recovery.status === 'bypassed' && 'Recovery bypassed'}
                {recovery.status === 'failed' && 'Recovery failed'}
                {recovery.status === 'cancelled' && 'Recovery cancelled'}
              </p>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                {recovery.status === 'complete' && 'The new gateway is bound and inventory sync is unblocked.'}
                {recovery.status === 'bypassed' && 'Inventory sync is unblocked without completing all recovery phases.'}
                {recovery.status === 'failed' && (recovery.error_message || 'Review the event log and retry or bypass.')}
                {recovery.status === 'cancelled' && 'Inventory sync is unblocked. Start a new recovery when the swap candidate is ready.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!targetGatewayId && (
        <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-8 text-center">
          <CheckCircleIcon className="h-10 w-10 text-secondary-300 dark:text-secondary-600 mx-auto mb-3" />
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            No swap candidate or recovery session for this facility.
          </p>
        </div>
      )}

      {targetGatewayId && (
        <>
          {showConfig && (
            <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5 space-y-4">
              <div>
                <h4 className="font-medium text-secondary-900 dark:text-white">Recovery configuration</h4>
                <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                  Select firmware and provisioning backup for the replacement gateway.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {candidateOffline && showConfig && (
                  <p className="md:col-span-2 text-sm text-amber-700 dark:text-amber-300">
                    Swap candidate is offline — connect the replacement gateway before starting recovery. Bypass remains available to platform admins if you accept the risk.
                  </p>
                )}
                <label className="block text-sm">
                  <span className="text-secondary-600 dark:text-secondary-300">Firmware image</span>
                  <select
                    value={selectedFirmwareId}
                    onChange={(e) => setSelectedFirmwareId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800 px-3 py-2 text-secondary-900 dark:text-white transition-colors focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
                  >
                    {firmwareOptions.length === 0 && <option value="">No firmware available</option>}
                    {firmwareOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-secondary-600 dark:text-secondary-300">Provisioning backup</span>
                  <select
                    value={selectedProvisioningBackupId}
                    onChange={(e) => setSelectedProvisioningBackupId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800 px-3 py-2 text-secondary-900 dark:text-white transition-colors focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4]"
                  >
                    {provisioningOptions.length === 0 && <option value="">No backup available</option>}
                    {provisioningOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Phased recovery</h3>
                <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                  Configure → firmware → provisioning restore → inventory snapshot push
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <button
                    type="button"
                    onClick={() => void handleInitiate()}
                    disabled={submitting || !selectedFirmwareId || !selectedProvisioningBackupId || candidateOffline}
                    aria-busy={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <PlayIcon className="h-4 w-4" />
                    {recovery?.status === 'cancelled' ? 'Start new recovery' : 'Start swap recovery'}
                  </button>
                )}
                {isFailed && (
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={submitting}
                    aria-busy={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Retry recovery
                  </button>
                )}
                {isInProgress && (
                  <button
                    type="button"
                    onClick={() => setCancelConfirmOpen(true)}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg border border-secondary-300 dark:border-secondary-600 px-4 py-2 text-sm font-medium text-secondary-700 dark:text-secondary-200 hover:bg-secondary-50 dark:hover:bg-secondary-800 active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <StopIcon className="h-4 w-4" />
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {!ws.isConnected && isInProgress && (
              <p className="mb-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4 shrink-0" />
                Dashboard WebSocket disconnected — polling recovery status every few seconds.
              </p>
            )}

            <div className="mb-4">
              <div className="flex justify-between text-xs text-secondary-500 mb-1">
                <span>{progress?.message || 'Waiting to start'}</span>
                <span>{progress?.percent ?? 0}%</span>
              </div>
              <div
                className="h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden"
                role="progressbar"
                aria-valuenow={progress?.percent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#147FD4] transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
                />
              </div>
              {progress?.chunksTotal != null && progress.chunksTotal > 0 && (
                <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  Chunks delivered: {progress.chunksSent ?? 0} / {progress.chunksTotal}
                </p>
              )}
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {RECOVERY_STEPPER_STEPS.map((step, idx) => {
                const done = stepperIndex > idx || recovery?.status === 'complete' || recovery?.status === 'bypassed';
                const current = stepperIndex === idx && isActive;
                return (
                  <li
                    key={step.key}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors duration-300 ${
                      done
                        ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : current
                          ? 'border-[#147FD4]/40 bg-[#147FD4]/5 dark:bg-[#147FD4]/10 ring-1 ring-[#147FD4]/20'
                          : 'border-secondary-200 dark:border-secondary-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {done ? (
                        <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <span
                          className={`h-4 w-4 rounded-full border shrink-0 ${
                            current ? 'border-[#147FD4] bg-[#147FD4]/20' : 'border-secondary-300 dark:border-secondary-600'
                          }`}
                        />
                      )}
                      <span className="font-medium text-secondary-800 dark:text-secondary-100">{step.label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>

            {recovery?.error_message && recovery.status === 'failed' && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{recovery.error_message}</p>
            )}
          </div>

          {events.length > 0 && (
            <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
              <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Recovery event log</h4>
              <ul className="max-h-48 overflow-y-auto space-y-2 text-sm">
                {[...events].reverse().map((event) => (
                  <li
                    key={event.id}
                    className="flex gap-3 border-b border-secondary-100 dark:border-secondary-800 pb-2 last:border-0 last:pb-0"
                  >
                    <time className="shrink-0 text-xs text-secondary-400 w-36" dateTime={event.created_at}>
                      {formatDateTime(event.created_at)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-secondary-800 dark:text-secondary-100 capitalize">
                        {event.phase.replace(/_/g, ' ')}
                      </span>
                      {event.message && (
                        <span className="text-secondary-600 dark:text-secondary-300"> — {event.message}</span>
                      )}
                      {event.progress_percent != null && (
                        <span className="text-secondary-400"> ({event.progress_percent}%)</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
            <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Inventory snapshot preview</h4>
            <p className="text-sm text-secondary-500 dark:text-secondary-400 mb-3">
              {inventoryPreview.length} device(s) will be pushed to the new gateway after provisioning.
            </p>
            <ul className="max-h-40 overflow-y-auto text-xs font-mono text-secondary-600 dark:text-secondary-300 space-y-1">
              {inventoryPreview.slice(0, 20).map((d, i) => (
                <li key={`${d.serial}-${i}`}>{d.kind}: {d.serial}</li>
              ))}
              {inventoryPreview.length > 20 && (
                <li className="text-secondary-400">…and {inventoryPreview.length - 20} more</li>
              )}
            </ul>
          </div>

          {canBypass && (
            <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
              {!showBypass ? (
                <button
                  type="button"
                  onClick={() => setShowBypass(true)}
                  className="text-sm text-secondary-500 hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 transition-colors"
                >
                  Bypass recovery (advanced)
                </button>
              ) : (
                <div className="flex items-start gap-3">
                  <ShieldExclamationIcon className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Bypass skips firmware, provisioning, and inventory protection. Platform admins only. Only use if you accept the risk of
                      partial inventory wiping cloud devices.
                    </p>
                    <button
                      type="button"
                      onClick={() => setBypassConfirmOpen(true)}
                      disabled={submitting}
                      className="mt-3 rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
                    >
                      Confirm bypass
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={bypassConfirmOpen}
        title="Bypass gateway recovery?"
        message="This immediately unblocks inventory sync without completing firmware, provisioning, or inventory snapshot push. Cloud lock data could be deleted if the new gateway sends a partial inventory."
        confirmLabel="Bypass recovery"
        confirmTone="danger"
        onConfirm={() => void handleBypass()}
        onCancel={() => setBypassConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        title="Cancel gateway recovery?"
        message="This stops the in-progress recovery and unblocks inventory sync. You can start a new recovery afterward without reconnecting the swap gateway."
        confirmLabel="Cancel recovery"
        confirmTone="danger"
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </div>
  );
}
