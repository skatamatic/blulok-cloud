import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
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
  type FacilityGatewaySession,
} from '@/types/gateway-recovery.types';
import {
  deriveRecoveryProgress,
  formatGatewayConnectionStatus,
  isRecoveryBlocking,
  isRecoveryRunning,
  mergeHydratedRecoveryStatus,
  mergeRecoveryProgress,
  RECOVERY_STEPPER_STEPS,
  resolveGatewaySessionConnected,
  resolveStepperStepIndex,
  resolveSwapView,
} from '@/utils/gateway-recovery-progress.utils';
import RecoveryBlockingBanner from '@/components/Gateway/RecoveryBlockingBanner';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import {
  formatRecoveryInventoryPreviewIdentity,
  formatRecoveryInventoryPreviewLine,
  type RecoveryInventoryPreviewDevice,
} from '@/utils/gateway-recovery-inventory-preview.utils';

interface RecoveryFirmwareOptions {
  productionFirmwareVersion?: string | null;
  candidateFirmwareVersion?: string | null;
  candidateMatchesProduction?: boolean;
  productionFirmwareImageAvailable?: boolean;
}

interface GatewaySwapRecoveryTabProps {
  facilityId: string;
  boundGatewayId?: string;
  wsConnected: boolean;
  onRecoveryChange?: (snapshot?: { status?: GatewayRecoveryStatus; terminal?: boolean }) => void;
}

type InlineNotice = {
  tone: 'success' | 'error' | 'warning' | 'info';
  message: string;
} | null;

/** A swap completion observed live during this session (intentionally not persisted). */
interface SessionSwapResult {
  newGatewayId: string;
  previousGatewayId: string | null;
}

function truncateId(id: string, visible = 8): string {
  if (id.length <= visible * 2 + 1) return id;
  return `${id.slice(0, visible)}…${id.slice(-visible)}`;
}

function ConnectionBadge({
  connected,
  label,
}: {
  connected: boolean | null;
  label?: string;
}) {
  const resolvedLabel = label ?? formatGatewayConnectionStatus(connected);
  const tone = connected === true
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : connected === false
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-300';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {resolvedLabel}
    </span>
  );
}

function GatewayIdTile({
  label,
  gatewayId,
  connected,
  emphasis = 'default',
}: {
  label: string;
  gatewayId: string;
  connected?: boolean | null;
  emphasis?: 'default' | 'primary';
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 min-w-0 flex-1 ${
        emphasis === 'primary'
          ? 'border-[#147FD4]/30 bg-[#147FD4]/5 dark:bg-[#147FD4]/10'
          : 'border-secondary-200 dark:border-secondary-700 bg-secondary-50/50 dark:bg-secondary-900/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-secondary-500 dark:text-secondary-400">
          {label}
        </dt>
        {connected != null && <ConnectionBadge connected={connected} />}
      </div>
      <dd className="font-mono text-sm text-secondary-900 dark:text-white truncate" title={gatewayId}>
        {truncateId(gatewayId)}
      </dd>
    </div>
  );
}

/** Production gateway → swap candidate pairing tiles. */
function GatewayPair({
  productionGatewayId,
  productionConnected,
  candidateGatewayId,
  candidateConnected,
  label,
}: {
  productionGatewayId?: string;
  productionConnected: boolean | null;
  candidateGatewayId?: string;
  candidateConnected: boolean | null;
  label: string;
}) {
  if (!productionGatewayId) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-secondary-500 dark:text-secondary-400 mb-2">
        {label}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <GatewayIdTile
          label="Production gateway"
          gatewayId={productionGatewayId}
          connected={productionConnected}
        />
        {candidateGatewayId && (
          <>
            <ArrowRightIcon className="h-5 w-5 text-[#147FD4] shrink-0 self-center hidden sm:block" aria-hidden="true" />
            <span className="text-xs text-[#147FD4] sm:hidden text-center font-medium">swap to</span>
            <GatewayIdTile
              label="Swap candidate"
              gatewayId={candidateGatewayId}
              connected={candidateConnected}
              emphasis="primary"
            />
          </>
        )}
      </div>
    </div>
  );
}

function InlineNoticeBanner({ notice, onDismiss }: { notice: NonNullable<InlineNotice>; onDismiss: () => void }) {
  const styles = {
    success: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200',
    error: 'border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 text-red-800 dark:text-red-200',
    warning: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200',
    info: 'border-[#147FD4]/30 bg-[#147FD4]/5 dark:bg-[#147FD4]/10 text-secondary-800 dark:text-secondary-200',
  }[notice.tone];

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${styles}`} role="status">
      <span className="flex-1">{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity"
      >
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function GatewaySwapRecoveryTab({
  facilityId,
  boundGatewayId,
  onRecoveryChange,
}: GatewaySwapRecoveryTabProps) {
  const ws = useWebSocket();
  const { authState } = useAuth();
  const isPlatformAdmin = authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<InlineNotice>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [sessions, setSessions] = useState<FacilityGatewaySession[]>([]);
  const [recovery, setRecovery] = useState<GatewayRecovery | null>(null);
  const [events, setEvents] = useState<GatewayRecoveryEvent[]>([]);
  const [inventoryPreview, setInventoryPreview] = useState<RecoveryInventoryPreviewDevice[]>([]);
  const [liveProgress, setLiveProgress] = useState<GatewayRecoveryProgress | null>(null);
  // Completion observed live during this session only — never hydrated on mount.
  const [sessionResult, setSessionResult] = useState<SessionSwapResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBypass, setShowBypass] = useState(false);
  const [bypassConfirmOpen, setBypassConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [firmwareOptions, setFirmwareOptions] = useState<RecoveryFirmwareOptions | null>(null);
  const [includeFirmwareMatch, setIncludeFirmwareMatch] = useState(true);
  const [firmwareDeliveryMode, setFirmwareDeliveryMode] = useState<'v1' | 'v2'>('v1');
  const [v2Available, setV2Available] = useState(true);
  const [v2UnavailableReason, setV2UnavailableReason] = useState<string | null>(null);
  const onRecoveryChangeRef = useRef(onRecoveryChange);
  const recoveryRef = useRef<GatewayRecovery | null>(null);
  const runningRecoveryIdRef = useRef<string | null>(null);
  const lastNotifiedStatusRef = useRef<string | null>(null);
  const lastHydrateAtRef = useRef(0);
  const hydrateBackoffUntilRef = useRef(0);
  const hydrateInFlightRef = useRef(false);

  useEffect(() => {
    onRecoveryChangeRef.current = onRecoveryChange;
  }, [onRecoveryChange]);

  useEffect(() => {
    recoveryRef.current = recovery;
  }, [recovery]);

  // Action notices are transient confirmations — auto-dismiss them so they never
  // linger as stale state. Errors stay until the user dismisses them.
  useEffect(() => {
    if (!actionNotice || actionNotice.tone === 'error') return undefined;
    const timer = setTimeout(() => setActionNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [actionNotice]);

  // Detect a swap completing during this session. We remember the recovery while it is
  // running, and surface a result banner once that same recovery reaches `complete`.
  // A recovery that is already `complete` on mount was not observed running here, so it
  // never produces a result banner — completion is intentionally not persisted.
  useEffect(() => {
    if (!recovery) return;
    if (isRecoveryRunning(recovery.status)) {
      runningRecoveryIdRef.current = recovery.id;
      return;
    }
    if (
      recovery.status === 'complete'
      && runningRecoveryIdRef.current === recovery.id
      && recovery.gateway_id
    ) {
      runningRecoveryIdRef.current = null;
      setSessionResult({
        newGatewayId: recovery.gateway_id,
        previousGatewayId: recovery.previous_gateway_id,
      });
    }
  }, [recovery]);

  const HYDRATE_MIN_INTERVAL_MS = 2500;
  const HYDRATE_429_BACKOFF_MS = 30_000;

  const notifyRecoveryChange = useCallback((status: GatewayRecovery | null) => {
    if (status && RECOVERY_TERMINAL_STATUSES.includes(status.status)) {
      if (lastNotifiedStatusRef.current === status.status) return;
      lastNotifiedStatusRef.current = status.status;
      void onRecoveryChangeRef.current?.({ status: status.status, terminal: true });
      return;
    }
    if (lastNotifiedStatusRef.current !== null) {
      lastNotifiedStatusRef.current = null;
    }
  }, []);

  const hydrate = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (hydrateInFlightRef.current) return;

    const now = Date.now();
    if (opts?.silent && !opts?.force) {
      if (now < hydrateBackoffUntilRef.current) return;
      if (now - lastHydrateAtRef.current < HYDRATE_MIN_INTERVAL_MS) return;
    }

    hydrateInFlightRef.current = true;
    lastHydrateAtRef.current = now;

    try {
      if (!opts?.silent) setLoading(true);
      if (!opts?.silent) setLoadError(null);

      const candRes = await apiService.getGatewayRecoveryCandidates(facilityId);
      const nextCandidates = candRes.data?.candidates || [];
      const nextSessions = candRes.data?.sessions || [];
      const nextRecovery = candRes.data?.recovery || null;

      setCandidates(nextCandidates);
      setSessions(nextSessions);

      const view = resolveSwapView(nextRecovery, nextCandidates, nextSessions, boundGatewayId);
      const statusGatewayId = view.statusGatewayId;

      if (!statusGatewayId) {
        setRecovery(nextRecovery);
        setEvents([]);
        setInventoryPreview([]);
        setFirmwareOptions(null);
        setLiveProgress(nextRecovery && !RECOVERY_TERMINAL_STATUSES.includes(nextRecovery.status)
          ? mergeRecoveryProgress(nextRecovery, null)
          : null);
        notifyRecoveryChange(nextRecovery);
        return;
      }

      const [statusRes, previewRes, optionsRes] = await Promise.all([
        apiService.getGatewayRecoveryStatus(statusGatewayId),
        apiService.getGatewayRecoveryInventoryPreview(statusGatewayId).catch(() => ({ data: { devices: [] } })),
        apiService.getGatewayRecoveryOptions(statusGatewayId).catch(() => ({ data: null })),
      ]);

      const status = mergeHydratedRecoveryStatus(nextRecovery, statusRes.data);

      setRecovery(status);
      setInventoryPreview(previewRes.data?.devices || []);

      const options = optionsRes.data;
      if (options) {
        setFirmwareOptions(options);
      }

      if (status?.id) {
        try {
          const eventsRes = await apiService.getGatewayRecoveryEvents(statusGatewayId, status.id, 50);
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

      notifyRecoveryChange(status);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 429 || message.includes('429') || message.toLowerCase().includes('too many requests')) {
        hydrateBackoffUntilRef.current = Date.now() + HYDRATE_429_BACKOFF_MS;
      }
      if (!opts?.silent) {
        setLoadError(message || 'Failed to load recovery status');
      }
    } finally {
      hydrateInFlightRef.current = false;
      if (!opts?.silent) setLoading(false);
    }
  }, [facilityId, boundGatewayId, notifyRecoveryChange]);

  const hydrateRef = useRef(hydrate);
  useEffect(() => {
    hydrateRef.current = hydrate;
  }, [hydrate]);

  useEffect(() => {
    lastNotifiedStatusRef.current = null;
    lastHydrateAtRef.current = 0;
    hydrateBackoffUntilRef.current = 0;
    runningRecoveryIdRef.current = null;
    setSessionResult(null);
    void hydrateRef.current({ force: true });
  }, [facilityId]);

  useEffect(() => {
    let cancelled = false;
    void apiService.getFirmwareDeliveryCapabilities()
      .then((res) => {
        if (cancelled || !res?.data) return;
        const available = res.data.v2_available !== false;
        setV2Available(available);
        setV2UnavailableReason(available ? null : (res.data.v2_unavailable_reason || 'v2 requires GCS storage'));
        if (!available) {
          setFirmwareDeliveryMode((prev) => (prev === 'v2' ? 'v1' : prev));
        }
      })
      .catch(() => {
        /* keep v2 selectable; push will fail with a clear API error if unsupported */
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const statusSubId = ws.subscribe(
      'gateway_recovery_status',
      (data: {
        facilityId?: string;
        candidates?: SwapCandidate[];
        sessions?: FacilityGatewaySession[];
        recovery?: GatewayRecovery | null;
      }) => {
        if (data?.facilityId && data.facilityId !== facilityId) return;
        setCandidates(data?.candidates || []);
        setSessions(data?.sessions || []);
        const nextRecovery = data?.recovery ?? null;
        setRecovery((prev) => {
          if (nextRecovery && !RECOVERY_TERMINAL_STATUSES.includes(nextRecovery.status)) {
            return nextRecovery;
          }
          if (prev && !RECOVERY_TERMINAL_STATUSES.includes(prev.status) && !nextRecovery) {
            return prev;
          }
          return nextRecovery;
        });
        if (nextRecovery && !RECOVERY_TERMINAL_STATUSES.includes(nextRecovery.status)) {
          setLiveProgress((prev) => mergeRecoveryProgress(nextRecovery, prev));
        } else if (nextRecovery) {
          setLiveProgress(deriveRecoveryProgress(nextRecovery));
        }
        notifyRecoveryChange(nextRecovery);
        setLoading(false);
      },
      undefined,
      { facility_id: facilityId },
    );

    const progressSubId = ws.subscribe(
      'gateway_recovery_progress',
      (data: GatewayRecoveryProgress) => {
        if (!data?.facilityId || data.facilityId !== facilityId) return;

        const current = recoveryRef.current;
        if (current?.id && data.recoveryId && data.recoveryId !== current.id) {
          if (RECOVERY_TERMINAL_STATUSES.includes(current.status)) return;
          void hydrateRef.current({ silent: true, force: true });
          return;
        }
        if (
          current
          && RECOVERY_TERMINAL_STATUSES.includes(current.status)
          && data.status
          && !RECOVERY_TERMINAL_STATUSES.includes(data.status)
        ) {
          return;
        }

        setRecovery((prev) => (prev && data.status ? { ...prev, status: data.status } : prev));
        setLiveProgress((prev) => {
          const base = recoveryRef.current;
          if (!base) return prev;
          return mergeRecoveryProgress(base, data);
        });
        if (data.status && RECOVERY_TERMINAL_STATUSES.includes(data.status)) {
          void hydrateRef.current({ silent: true, force: true });
        }
      },
      undefined,
      { facility_id: facilityId },
    );

    return () => {
      if (statusSubId) ws.unsubscribe(statusSubId);
      if (progressSubId) ws.unsubscribe(progressSubId);
    };
  }, [ws.subscribe, ws.unsubscribe, facilityId, notifyRecoveryChange]);

  const view = useMemo(
    () => resolveSwapView(recovery, candidates, sessions, boundGatewayId),
    [recovery, candidates, sessions, boundGatewayId],
  );
  const isInProgress = view.mode === 'in_progress';

  // One-shot detail fetch (preview / options / events) when the status gateway changes — no polling.
  useEffect(() => {
    const gatewayId = view.statusGatewayId;
    if (!gatewayId) {
      setInventoryPreview([]);
      setFirmwareOptions(null);
      setEvents([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [previewRes, optionsRes] = await Promise.all([
          apiService.getGatewayRecoveryInventoryPreview(gatewayId).catch(() => ({ data: { devices: [] } })),
          apiService.getGatewayRecoveryOptions(gatewayId).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        setInventoryPreview(previewRes.data?.devices || []);
        if (optionsRes.data) setFirmwareOptions(optionsRes.data);

        const recoveryId = recoveryRef.current?.id;
        if (recoveryId) {
          try {
            const eventsRes = await apiService.getGatewayRecoveryEvents(gatewayId, recoveryId, 50);
            if (!cancelled) setEvents(eventsRes.data?.events || []);
          } catch {
            if (!cancelled) setEvents([]);
          }
        }
      } catch {
        /* keep last detail snapshot */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view.statusGatewayId, recovery?.id, recovery?.status]);

  // Idle/ready/in-progress: live via WS; mount hydrate seeds REST once.

  const progress = useMemo(() => {
    if (recovery && liveProgress) return mergeRecoveryProgress(recovery, liveProgress);
    if (recovery) return deriveRecoveryProgress(recovery);
    return liveProgress;
  }, [recovery, liveProgress]);

  const isBlocking = isRecoveryBlocking(recovery?.status);
  const isActive = recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status);
  const stepperIndex = resolveStepperStepIndex(progress?.status ?? recovery?.status);
  const productionFirmwareVersion = firmwareOptions?.productionFirmwareVersion ?? null;
  const candidateFirmwareVersion = firmwareOptions?.candidateFirmwareVersion ?? null;
  const candidateMatchesProduction = firmwareOptions?.candidateMatchesProduction ?? false;
  const productionFirmwareImageAvailable = firmwareOptions?.productionFirmwareImageAvailable ?? false;
  const firmwareMatchBlocked = includeFirmwareMatch
    && !!productionFirmwareVersion
    && !productionFirmwareImageAvailable
    && !candidateMatchesProduction;

  const previousGatewayConnected = useMemo(() => {
    if (!sessionResult?.previousGatewayId) return null;
    return resolveGatewaySessionConnected(sessions, sessionResult.previousGatewayId);
  }, [sessionResult, sessions]);

  const setActionError = (message: string) => setActionNotice({ tone: 'error', message });

  const handleInitiate = async () => {
    const gatewayId = view.candidateGatewayId;
    if (!gatewayId) {
      setActionError('No swap candidate available. Connect the replacement gateway and try again.');
      return;
    }
    setSubmitting(true);
    setActionNotice(null);
    try {
      const res = await apiService.initiateGatewayRecovery(gatewayId, {
        includeFirmware: includeFirmwareMatch,
        firmwareDeliveryMode: includeFirmwareMatch ? firmwareDeliveryMode : undefined,
      });
      setSessionResult(null);
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      setActionNotice({
        tone: 'info',
        message: includeFirmwareMatch
          ? 'Swap started. Firmware will be matched if needed, then inventory is pushed.'
          : 'Swap started. Pushing inventory (firmware step skipped).',
      });
      await hydrate({ silent: true, force: true });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to start swap');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    const gatewayId = view.statusGatewayId;
    if (!gatewayId) return;
    setSubmitting(true);
    setActionNotice(null);
    try {
      const res = await apiService.retryGatewayRecovery(gatewayId);
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      setActionNotice({ tone: 'info', message: 'Swap resumed from the last failed phase.' });
      await hydrate({ silent: true, force: true });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBypass = async () => {
    const gatewayId = recovery?.gateway_id;
    if (!gatewayId) return;
    setSubmitting(true);
    setActionNotice(null);
    try {
      const res = await apiService.bypassGatewayRecovery(gatewayId, true);
      setRecovery(res.data);
      setLiveProgress(deriveRecoveryProgress(res.data));
      setBypassConfirmOpen(false);
      setShowBypass(false);
      setActionNotice({ tone: 'warning', message: 'Swap bypassed. Inventory sync is unblocked.' });
      notifyRecoveryChange(res.data);
      await hydrate({ silent: true, force: true });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Bypass failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const gatewayId = recovery?.gateway_id;
    if (!gatewayId || !recovery?.id) return;
    setSubmitting(true);
    setActionNotice(null);
    try {
      await apiService.cancelGatewayRecovery(gatewayId, recovery.id);
      setCancelConfirmOpen(false);
      setActionNotice({ tone: 'info', message: 'Swap cancelled.' });
      await hydrate({ force: true });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-secondary-500 dark:text-secondary-400">
        <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
        Loading swap status…
      </div>
    );
  }

  const canBypass = !!isActive && isPlatformAdmin;

  return (
    <div className="space-y-6">
      {loadError && (
        <div
          className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {isBlocking && <RecoveryBlockingBanner />}

      {/* Session-only swap result (cleared on navigation away / refresh) */}
      {sessionResult && !isInProgress && (
        <div
          className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 px-5 py-4"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="h-6 w-6 text-emerald-600 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-secondary-900 dark:text-white">Gateway swap complete</h3>
              <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                Production gateway is now <span className="font-mono">{truncateId(sessionResult.newGatewayId)}</span>.
                {sessionResult.previousGatewayId && (
                  <>
                    {' '}The previous unit (<span className="font-mono">{truncateId(sessionResult.previousGatewayId)}</span>) is{' '}
                    {previousGatewayConnected === true
                      ? 'connected as a swap candidate'
                      : previousGatewayConnected === false
                        ? 'offline'
                        : 'no longer the production gateway'}.
                  </>
                )}{' '}
                Inventory sync is unblocked.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSessionResult(null)}
              aria-label="Dismiss swap result"
              className="shrink-0 rounded p-0.5 text-secondary-500 opacity-70 hover:opacity-100 transition-opacity"
            >
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* In-progress: progress monitor with cancel / bypass */}
      {isInProgress && (
        <div className="rounded-xl border border-[#147FD4]/40 bg-white dark:bg-secondary-900 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-secondary-100 dark:border-secondary-800">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <ArrowPathIcon className="h-6 w-6 text-[#147FD4] shrink-0 animate-spin" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Gateway swap in progress</h3>
                  <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                    Firmware and inventory snapshot are being applied to the replacement gateway.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCancelConfirmOpen(true)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg border border-secondary-300 dark:border-secondary-600 px-4 py-2 text-sm font-medium text-secondary-700 dark:text-secondary-200 hover:bg-secondary-50 dark:hover:bg-secondary-800 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  <StopIcon className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {actionNotice && (
              <InlineNoticeBanner notice={actionNotice} onDismiss={() => setActionNotice(null)} />
            )}

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Keep this page open until the swap finishes to monitor live progress and act if it stalls.</span>
            </div>

            <GatewayPair
              productionGatewayId={view.productionGatewayId}
              productionConnected={view.productionConnected}
              candidateGatewayId={view.candidateGatewayId}
              candidateConnected={view.candidateConnected}
              label="Swapping to"
            />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-secondary-500 dark:text-secondary-400 mb-3">
                Swap progress
              </p>

              {!ws.isConnected && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <ClockIcon className="h-4 w-4 shrink-0" />
                  Live updates disconnected. Checking swap status every few seconds.
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

              <ol className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {RECOVERY_STEPPER_STEPS.map((step, idx) => {
                  const done = stepperIndex > idx;
                  const current = stepperIndex === idx;
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
            </div>
          </div>
        </div>
      )}

      {/* Failed: error + retry */}
      {view.mode === 'failed' && !isInProgress && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-secondary-900 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-secondary-100 dark:border-secondary-800">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <XCircleIcon className="h-6 w-6 text-red-600 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Gateway swap failed</h3>
                  <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                    {recovery?.error_message || 'Review the event log and retry when the swap candidate is ready.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={submitting}
                  aria-busy={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Retry swap
                </button>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-5">
            {actionNotice && (
              <InlineNoticeBanner notice={actionNotice} onDismiss={() => setActionNotice(null)} />
            )}
            <GatewayPair
              productionGatewayId={view.productionGatewayId}
              productionConnected={view.productionConnected}
              candidateGatewayId={view.candidateGatewayId}
              candidateConnected={view.candidateConnected}
              label="Swap target"
            />
          </div>
        </div>
      )}

      {/* Ready / idle: start a swap when a candidate is available */}
      {(view.mode === 'ready' || view.mode === 'idle') && !isInProgress && (
        <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-secondary-100 dark:border-secondary-800">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {view.mode === 'ready' ? (
                  <ExclamationTriangleIcon className="h-6 w-6 text-[#147FD4] shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircleIcon className="h-6 w-6 text-secondary-400 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                    {view.mode === 'ready' ? 'Replacement gateway detected' : 'No swap candidate connected'}
                  </h3>
                  <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-300">
                    {view.mode === 'ready'
                      ? view.candidateConnected
                        ? 'Start a swap to make this gateway the production unit for the facility.'
                        : 'Swap candidate is offline. Reconnect it to start a swap.'
                      : 'Connect a replacement gateway as a swap candidate to begin a swap.'}
                  </p>
                </div>
              </div>
              {view.mode === 'ready' && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  {isActive && (
                    <button
                      type="button"
                      onClick={() => setCancelConfirmOpen(true)}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-lg border border-secondary-300 dark:border-secondary-600 px-4 py-2 text-sm font-medium text-secondary-700 dark:text-secondary-200 hover:bg-secondary-50 dark:hover:bg-secondary-800 active:scale-[0.98] disabled:opacity-50 transition-all"
                    >
                      <StopIcon className="h-4 w-4" />
                      Dismiss
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleInitiate()}
                    disabled={submitting || !view.canStart || firmwareMatchBlocked}
                    aria-busy={submitting}
                    title={
                      !view.canStart
                        ? 'Connect the swap candidate before starting a swap'
                        : firmwareMatchBlocked
                          ? 'Upload a firmware image for the production gateway version, or disable firmware matching'
                          : undefined
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-[#147FD4] px-4 py-2 text-sm font-medium text-white hover:bg-[#1269b0] active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    <PlayIcon className="h-4 w-4" />
                    Start swap
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {actionNotice && (
              <InlineNoticeBanner notice={actionNotice} onDismiss={() => setActionNotice(null)} />
            )}

            <GatewayPair
              productionGatewayId={view.productionGatewayId}
              productionConnected={view.productionConnected}
              candidateGatewayId={view.candidateGatewayId}
              candidateConnected={view.candidateConnected}
              label="Current gateways"
            />

            {view.mode === 'ready' && (
              <div className="rounded-lg border border-secondary-200 dark:border-secondary-700 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-secondary-900 dark:text-white">Swap configuration</h4>
                  <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-0.5">
                    Optionally align the swap candidate to the production gateway firmware before inventory push.
                  </p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFirmwareMatch}
                    onChange={(e) => setIncludeFirmwareMatch(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-secondary-300 text-[#147FD4] focus:ring-[#147FD4] dark:border-secondary-600"
                  />
                  <span className="text-sm text-secondary-800 dark:text-secondary-100">
                    Include firmware matching
                    <span className="block text-xs font-normal text-secondary-500 dark:text-secondary-400 mt-0.5">
                      Uses the production gateway firmware version. If the swap candidate differs, an OTA push runs before inventory.
                    </span>
                  </span>
                </label>

                {includeFirmwareMatch && (
                  <div className="rounded-md bg-secondary-50/80 dark:bg-secondary-900/40 px-3 py-2 text-sm space-y-1">
                    <p className="text-secondary-700 dark:text-secondary-200">
                      Production firmware:{' '}
                      <span className="font-mono">{productionFirmwareVersion ?? 'unknown'}</span>
                    </p>
                    <p className="text-secondary-600 dark:text-secondary-300">
                      Swap candidate firmware:{' '}
                      <span className="font-mono">{candidateFirmwareVersion ?? 'unknown'}</span>
                    </p>
                    {candidateMatchesProduction && (
                      <p className="text-emerald-700 dark:text-emerald-300 text-xs">
                        Candidate already matches production. OTA will be skipped.
                      </p>
                    )}
                    {firmwareMatchBlocked && (
                      <p className="text-amber-700 dark:text-amber-300 text-xs">
                        No firmware image for the production version. Disable matching or upload the image first.
                      </p>
                    )}
                    <div className="flex flex-col gap-1 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-secondary-500 dark:text-secondary-400">OTA delivery</span>
                        <div className="flex rounded-md border border-secondary-200 dark:border-secondary-600 overflow-hidden" role="group" aria-label="Firmware delivery mode">
                          {(['v1', 'v2'] as const).map((mode) => {
                            const disabled = mode === 'v2' && !v2Available;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => !disabled && setFirmwareDeliveryMode(mode)}
                                disabled={disabled}
                                title={disabled ? (v2UnavailableReason || undefined) : undefined}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${
                                  firmwareDeliveryMode === mode
                                    ? 'bg-[#147FD4] text-white'
                                    : disabled
                                      ? 'bg-secondary-100 dark:bg-secondary-900 text-secondary-400 cursor-not-allowed'
                                      : 'bg-white dark:bg-secondary-800 text-secondary-600 dark:text-secondary-300'
                                }`}
                              >
                                {mode}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-xs text-secondary-400 dark:text-secondary-500">
                          {firmwareDeliveryMode === 'v1' ? 'WebSocket chunks' : 'GCS download'}
                        </span>
                      </div>
                      {!v2Available && v2UnavailableReason && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">{v2UnavailableReason}</p>
                      )}
                    </div>
                  </div>
                )}

                {!includeFirmwareMatch && (
                  <p className="text-xs text-secondary-500 dark:text-secondary-400">
                    Firmware step skipped. Only the inventory snapshot is pushed.
                  </p>
                )}
              </div>
            )}

            {view.mode === 'ready' && inventoryPreview.length > 0 && (
              <div className="rounded-lg border border-secondary-200 dark:border-secondary-700 p-4">
                <h4 className="text-sm font-medium text-secondary-900 dark:text-white mb-1">Inventory snapshot preview</h4>
                <p className="text-sm text-secondary-500 dark:text-secondary-400 mb-3">
                  {includeFirmwareMatch && candidateMatchesProduction
                    ? 'Inventory snapshot will be pushed to the swap candidate (firmware OTA skipped).'
                    : includeFirmwareMatch
                      ? `${inventoryPreview.length} device(s) will be pushed after firmware is aligned to production.`
                      : `${inventoryPreview.length} device(s) will be pushed to the swap candidate.`}
                </p>
                <ul className="max-h-40 overflow-y-auto text-xs font-mono text-secondary-600 dark:text-secondary-300 space-y-1">
                  {inventoryPreview.slice(0, 20).map((device, i) => (
                    <li key={`${device.kind}-${formatRecoveryInventoryPreviewIdentity(device)}-${i}`}>
                      {formatRecoveryInventoryPreviewLine(device)}
                    </li>
                  ))}
                  {inventoryPreview.length > 20 && (
                    <li className="text-secondary-400">…and {inventoryPreview.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event log for active / failed swaps */}
      {(isInProgress || view.mode === 'failed') && events.length > 0 && (
        <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
          <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Swap event log</h4>
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
                    <span className="text-secondary-600 dark:text-secondary-300">: {event.message}</span>
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

      {canBypass && (
        <div className="rounded-xl border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900 p-5">
          {!showBypass ? (
            <button
              type="button"
              onClick={() => setShowBypass(true)}
              className="text-sm text-secondary-500 hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 transition-colors"
            >
              Bypass swap (advanced)
            </button>
          ) : (
            <div className="flex items-start gap-3">
              <ShieldExclamationIcon className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Bypass skips firmware and inventory protection. Platform admins only. Only use if you accept the risk of
                  a partial inventory wiping cloud devices.
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

      <ConfirmDialog
        isOpen={bypassConfirmOpen}
        title="Bypass gateway swap?"
        message="This immediately unblocks inventory sync without completing firmware or inventory snapshot push. Cloud lock data could be deleted if the new gateway sends a partial inventory."
        confirmLabel="Bypass swap"
        confirmTone="danger"
        onConfirm={() => void handleBypass()}
        onCancel={() => setBypassConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={cancelConfirmOpen}
        title="Cancel gateway swap?"
        message="Stops the swap and unblocks inventory sync."
        confirmLabel="Cancel swap"
        confirmTone="danger"
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </div>
  );
}
