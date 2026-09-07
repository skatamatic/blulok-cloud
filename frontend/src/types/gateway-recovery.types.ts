export type GatewayRecoveryStatus =
  | 'detected'
  | 'awaiting_config'
  | 'firmware'
  | 'inventory_push'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'bypassed';

export interface GatewayRecovery {
  id: string;
  facility_id: string;
  gateway_id: string;
  previous_gateway_id: string | null;
  status: GatewayRecoveryStatus;
  firmware_id: string | null;
  firmware_delivery_mode?: 'v1' | 'v2';
  inventory_snapshot_id: string | null;
  firmware_push_id: string | null;
  inventory_chunks_total: number | null;
  inventory_chunks_sent: number;
  bypassed: boolean;
  error_message: string | null;
  initiated_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GatewayRecoveryProgress {
  recoveryId: string;
  gatewayId: string;
  facilityId: string;
  status: GatewayRecoveryStatus;
  phase: GatewayRecoveryStatus;
  percent: number;
  message?: string;
  firmwareId?: string | null;
  inventorySnapshotId?: string | null;
  chunksTotal?: number;
  chunksSent?: number;
  error?: string;
  timestamp?: string;
}

export interface SwapCandidate {
  gatewayId: string;
  connected: boolean;
  lastActivityAt?: number;
}

export type FacilityGatewaySessionRole = 'active' | 'swap_candidate';

export interface FacilityGatewaySession {
  gatewayId: string;
  sessionRole: FacilityGatewaySessionRole;
  connected: boolean;
  lastActivityAt?: number;
}

/** Demoted previous production gateway after a completed swap (may still be connected as swap candidate). */
export interface DemotedPreviousGateway {
  gatewayId: string;
  connected: boolean;
}

export interface PostSwapActions {
  /** Previous production gateway can be restored via a new recovery. */
  canSwapBack: boolean;
  swapBackGatewayId?: string;
  /** Whether the swap-back target is connected as a swap candidate right now. */
  swapBackOnline?: boolean;
  canSwapAgain: boolean;
  swapAgainGatewayId?: string;
  /** Whether the next swap candidate is connected right now. */
  swapAgainOnline?: boolean;
}

export interface GatewayRecoveryEvent {
  id: string;
  phase: string;
  message: string | null;
  progress_percent: number | null;
  created_at: string;
}

export const RECOVERY_PHASE_ORDER: GatewayRecoveryStatus[] = [
  'firmware',
  'inventory_push',
  'complete',
];

export const RECOVERY_PHASE_LABELS: Record<string, string> = {
  detected: 'Detected',
  awaiting_config: 'Configure',
  firmware: 'Firmware',
  inventory_push: 'Inventory Push',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
  bypassed: 'Bypassed',
};

export const RECOVERY_TERMINAL_STATUSES: GatewayRecoveryStatus[] = [
  'complete',
  'failed',
  'cancelled',
  'bypassed',
];
