import {
  GatewayRecovery,
  GatewayRecoveryProgress,
  GatewayRecoveryStatus,
  RECOVERY_TERMINAL_STATUSES,
} from '@/types/gateway-recovery.types';

export const RECOVERY_BLOCKING_STATUSES: GatewayRecoveryStatus[] = [
  'detected',
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
      message = 'Swap candidate detected — configure recovery to begin';
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
        message = `Inventory snapshot push — chunk ${sent} of ${total}`;
      } else {
        percent = 50;
        message = 'Preparing inventory snapshot push';
      }
      break;
    }
    case 'complete':
      percent = 100;
      message = 'Recovery complete';
      break;
    case 'bypassed':
      percent = 100;
      message = 'Recovery bypassed — inventory sync unblocked';
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
  return {
    ...baseline,
    ...live,
    percent: Math.max(baseline.percent, live.percent ?? 0),
    message: live.message || baseline.message,
    chunksSent: live.chunksSent ?? baseline.chunksSent,
    chunksTotal: live.chunksTotal ?? baseline.chunksTotal,
  };
}

export function canStartRecovery(
  recovery: GatewayRecovery | null,
  hasCandidate: boolean,
): boolean {
  if (!hasCandidate) return false;
  if (!recovery) return true;
  if (RECOVERY_TERMINAL_STATUSES.includes(recovery.status)) {
    return recovery.status === 'cancelled';
  }
  return recovery.status === 'detected' || recovery.status === 'awaiting_config';
}

export function canShowRecoveryConfig(
  recovery: GatewayRecovery | null,
  hasCandidate: boolean,
): boolean {
  if (!hasCandidate) return false;
  if (!recovery) return true;
  if (recovery.status === 'cancelled') return true;
  return recovery.status === 'detected' || recovery.status === 'awaiting_config';
}
