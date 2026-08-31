import {
  GatewayRecovery,
  GatewayRecoveryProgress,
  GatewayRecoveryStatus,
  RECOVERY_TERMINAL_STATUSES,
  SwapCandidate,
  type FacilityGatewaySession,
} from '@/types/gateway-recovery.types';

/** Statuses during which inventory sync / lock commands are blocked for the facility. */
export const RECOVERY_BLOCKING_STATUSES: GatewayRecoveryStatus[] = [
  'detected',
  'awaiting_config',
  'firmware',
  'inventory_push',
];

/** Statuses that mean a swap is actively running on the cloud (progress UI shown). */
export const RECOVERY_RUNNING_STATUSES: GatewayRecoveryStatus[] = [
  'awaiting_config',
  'firmware',
  'inventory_push',
];

export const RECOVERY_STEPPER_STEPS: Array<{ key: string; label: string }> = [
  { key: 'configure', label: 'Configure' },
  { key: 'firmware', label: 'Firmware' },
  { key: 'inventory_push', label: 'Inventory Push' },
  { key: 'complete', label: 'Complete' },
];

export function isRecoveryBlocking(status?: GatewayRecoveryStatus | null): boolean {
  return !!status && RECOVERY_BLOCKING_STATUSES.includes(status);
}

/** Whether a swap is actively running (firmware/inventory push) — drives the progress UI. */
export function isRecoveryRunning(status?: GatewayRecoveryStatus | null): boolean {
  return !!status && RECOVERY_RUNNING_STATUSES.includes(status);
}

export function resolveStepperStepIndex(status?: GatewayRecoveryStatus | null): number {
  if (!status) return -1;
  if (status === 'detected' || status === 'awaiting_config') return 0;
  if (status === 'firmware') return 1;
  if (status === 'inventory_push') return 2;
  if (status === 'complete' || status === 'bypassed') return 3;
  return -1;
}

export function deriveRecoveryProgress(recovery: GatewayRecovery): GatewayRecoveryProgress {
  const { status } = recovery;
  let percent = 0;
  let message: string | undefined;

  switch (status) {
    case 'detected':
      percent = 0;
      message = 'Swap candidate detected. Configure recovery to continue.';
      break;
    case 'awaiting_config':
      percent = 5;
      message = 'Recovery configured';
      break;
    case 'firmware':
      percent = 25;
      message = 'Firmware update in progress';
      break;
    case 'inventory_push': {
      const sent = recovery.inventory_chunks_sent ?? 0;
      const total = recovery.inventory_chunks_total ?? 0;
      if (total > 0) {
        percent = 50 + Math.round((sent / total) * 45);
        message = `Inventory snapshot: chunk ${sent} of ${total}`;
      } else {
        percent = 50;
        message = 'Preparing inventory snapshot push';
      }
      break;
    }
    case 'complete':
      percent = 100;
      message = 'Recovery complete. New gateway is bound; inventory sync is unblocked.';
      break;
    case 'bypassed':
      percent = 100;
      message = 'Recovery bypassed. Inventory sync is unblocked.';
      break;
    case 'failed':
      percent = 0;
      message = recovery.error_message || 'Recovery failed';
      break;
    case 'cancelled':
      percent = 0;
      message = 'Recovery cancelled';
      break;
    default:
      break;
  }

  return {
    recoveryId: recovery.id,
    gatewayId: recovery.gateway_id,
    facilityId: recovery.facility_id,
    status,
    phase: status,
    percent,
    message,
    firmwareId: recovery.firmware_id,
    inventorySnapshotId: recovery.inventory_snapshot_id,
    chunksTotal: recovery.inventory_chunks_total ?? undefined,
    chunksSent: recovery.inventory_chunks_sent,
    error: recovery.error_message ?? undefined,
  };
}

export function mergeRecoveryProgress(
  recovery: GatewayRecovery,
  live?: GatewayRecoveryProgress | null,
): GatewayRecoveryProgress {
  const baseline = deriveRecoveryProgress(recovery);
  if (!live) return baseline;

  if (live.recoveryId && live.recoveryId !== recovery.id) {
    return baseline;
  }

  if (RECOVERY_TERMINAL_STATUSES.includes(recovery.status)) {
    return baseline;
  }

  const liveStatus = live.status ?? live.phase;
  const message = liveStatus === recovery.status
    ? (live.message || baseline.message)
    : baseline.message;

  return {
    ...baseline,
    ...live,
    status: recovery.status,
    phase: recovery.status,
    percent: Math.max(baseline.percent, live.percent ?? 0),
    message,
    chunksSent: liveStatus === recovery.status
      ? (live.chunksSent ?? baseline.chunksSent)
      : baseline.chunksSent,
    chunksTotal: liveStatus === recovery.status
      ? (live.chunksTotal ?? baseline.chunksTotal)
      : baseline.chunksTotal,
  };
}

export function formatGatewayConnectionStatus(connected: boolean | null | undefined): string {
  if (connected === true) return 'Connected';
  if (connected === false) return 'Offline';
  return 'Unknown';
}

export function normalizeGatewayId(id: string | undefined | null): string {
  return (id ?? '').trim().toLowerCase();
}

export function gatewayIdsEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  return normalizeGatewayId(a) === normalizeGatewayId(b);
}

export function resolveGatewaySessionConnected(
  sessions: FacilityGatewaySession[] | undefined,
  gatewayId: string | undefined,
): boolean | null {
  if (!gatewayId || !sessions?.length) return null;
  const match = sessions.find((session) => gatewayIdsEqual(session.gatewayId, gatewayId));
  return match ? match.connected : null;
}

/**
 * Resolve the current production gateway for the facility. The active session is
 * authoritative (it reflects the gateway the cloud is bound to right now), with the
 * caller's bound gateway id and the latest completed recovery as fallbacks.
 */
export function resolveProductionGatewayId(
  sessions: FacilityGatewaySession[],
  boundGatewayId: string | undefined,
  recovery: GatewayRecovery | null | undefined,
): string | undefined {
  const activeConnected = sessions.find((s) => s.sessionRole === 'active' && s.connected);
  if (activeConnected) return activeConnected.gatewayId;
  const active = sessions.find((s) => s.sessionRole === 'active');
  if (active) return active.gatewayId;
  if (recovery?.status === 'complete' && recovery.gateway_id) return recovery.gateway_id;
  return boundGatewayId;
}

export interface AvailableCandidate {
  gatewayId?: string;
  connected: boolean | null;
}

/**
 * Find the gateway available to swap to. While a recovery targets a specific gateway,
 * that gateway is the candidate; otherwise we pick a **connected** swap-candidate
 * WebSocket session (or candidate list entry), excluding the production gateway.
 * Offline / disconnected units never appear as swap candidates.
 */
export function resolveAvailableCandidate(
  recovery: GatewayRecovery | null | undefined,
  candidates: SwapCandidate[],
  sessions: FacilityGatewaySession[],
  productionGatewayId: string | undefined,
): AvailableCandidate {
  if (recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status) && recovery.gateway_id) {
    const connected = resolveGatewaySessionConnected(sessions, recovery.gateway_id)
      ?? candidates.find((c) => gatewayIdsEqual(c.gatewayId, recovery.gateway_id))?.connected
      ?? null;
    return { gatewayId: recovery.gateway_id, connected };
  }

  const pool: Array<{ gatewayId: string; connected: boolean }> = [];
  for (const session of sessions) {
    if (session.sessionRole === 'swap_candidate' && session.connected) {
      pool.push({ gatewayId: session.gatewayId, connected: true });
    }
  }
  for (const candidate of candidates) {
    if (
      candidate.connected
      && !pool.some((p) => gatewayIdsEqual(p.gatewayId, candidate.gatewayId))
    ) {
      pool.push({ gatewayId: candidate.gatewayId, connected: true });
    }
  }

  const eligible = pool.filter((p) => !gatewayIdsEqual(p.gatewayId, productionGatewayId));
  const chosen = eligible[0];
  return { gatewayId: chosen?.gatewayId, connected: chosen ? true : null };
}

export type SwapMode = 'idle' | 'ready' | 'in_progress' | 'failed';

export interface SwapView {
  /** High-level UI mode. */
  mode: SwapMode;
  productionGatewayId?: string;
  productionConnected: boolean | null;
  candidateGatewayId?: string;
  candidateConnected: boolean | null;
  /** Whether a connected candidate is ready to start a swap. */
  canStart: boolean;
  /** Gateway id to use for status / options / preview / actions fetches. */
  statusGatewayId?: string;
}

/**
 * Collapse recovery + session + candidate data into a single, simple view model:
 * either a swap is running, the last one failed, a candidate is ready to swap to, or
 * the facility is idle. There is intentionally no persisted "completed" mode — a
 * finished swap simply returns to idle/ready and the UI surfaces the result for the
 * current session only.
 */
export function resolveSwapView(
  recovery: GatewayRecovery | null | undefined,
  candidates: SwapCandidate[],
  sessions: FacilityGatewaySession[],
  boundGatewayId: string | undefined,
): SwapView {
  const productionGatewayId = resolveProductionGatewayId(sessions, boundGatewayId, recovery);
  const productionConnected = resolveGatewaySessionConnected(sessions, productionGatewayId);
  const candidate = resolveAvailableCandidate(recovery, candidates, sessions, productionGatewayId);

  let mode: SwapMode;
  if (recovery && isRecoveryRunning(recovery.status)) {
    mode = 'in_progress';
  } else if (recovery?.status === 'failed') {
    mode = 'failed';
  } else if (candidate.gatewayId) {
    mode = 'ready';
  } else {
    mode = 'idle';
  }

  const statusGatewayId = (recovery && !RECOVERY_TERMINAL_STATUSES.includes(recovery.status))
    ? recovery.gateway_id
    : (recovery?.status === 'failed' ? recovery.gateway_id : candidate.gatewayId);

  return {
    mode,
    productionGatewayId,
    productionConnected,
    candidateGatewayId: candidate.gatewayId,
    candidateConnected: candidate.connected,
    canStart: mode === 'ready' && candidate.connected === true,
    statusGatewayId,
  };
}

export function mergeHydratedRecoveryStatus(
  facilityRecovery: GatewayRecovery | null | undefined,
  fetchedRecovery: GatewayRecovery | null | undefined,
): GatewayRecovery | null {
  if (facilityRecovery && !RECOVERY_TERMINAL_STATUSES.includes(facilityRecovery.status)) {
    return facilityRecovery;
  }
  if (fetchedRecovery && !RECOVERY_TERMINAL_STATUSES.includes(fetchedRecovery.status)) {
    return fetchedRecovery;
  }
  return fetchedRecovery ?? facilityRecovery ?? null;
}
