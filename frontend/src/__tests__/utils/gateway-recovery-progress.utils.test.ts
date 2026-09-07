import {
  deriveRecoveryProgress,
  formatGatewayConnectionStatus,
  gatewayIdsEqual,
  isRecoveryBlocking,
  isRecoveryRunning,
  mergeHydratedRecoveryStatus,
  mergeRecoveryProgress,
  resolveAvailableCandidate,
  resolveGatewaySessionConnected,
  resolveProductionGatewayId,
  resolveStepperStepIndex,
  resolveSwapView,
} from '@/utils/gateway-recovery-progress.utils';
import {
  GatewayRecovery,
  type FacilityGatewaySession,
} from '@/types/gateway-recovery.types';

const baseRecovery: GatewayRecovery = {
  id: 'rec-1',
  facility_id: 'fac-1',
  gateway_id: 'gw-new',
  previous_gateway_id: 'gw-old',
  status: 'detected',
  firmware_id: null,
  inventory_snapshot_id: null,
  firmware_push_id: null,
  inventory_chunks_total: null,
  inventory_chunks_sent: 0,
  bypassed: false,
  error_message: null,
  initiated_by: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const activeSession = (gatewayId: string, connected = true): FacilityGatewaySession => ({
  gatewayId,
  sessionRole: 'active',
  connected,
});

const candidateSession = (gatewayId: string, connected = true): FacilityGatewaySession => ({
  gatewayId,
  sessionRole: 'swap_candidate',
  connected,
});

describe('gateway-recovery-progress.utils', () => {
  it('marks blocking and running statuses correctly', () => {
    expect(isRecoveryBlocking('inventory_push')).toBe(true);
    expect(isRecoveryBlocking('detected')).toBe(true);
    expect(isRecoveryBlocking('failed')).toBe(false);

    expect(isRecoveryRunning('firmware')).toBe(true);
    expect(isRecoveryRunning('inventory_push')).toBe(true);
    expect(isRecoveryRunning('detected')).toBe(false);
    expect(isRecoveryRunning('complete')).toBe(false);
  });

  it('derives inventory push percent from chunk progress', () => {
    const progress = deriveRecoveryProgress({
      ...baseRecovery,
      status: 'inventory_push',
      inventory_chunks_sent: 5,
      inventory_chunks_total: 10,
    });
    expect(progress.percent).toBe(73);
    expect(progress.message).toContain('5 of 10');
  });

  it('merges live progress without regressing percent', () => {
    const recovery = { ...baseRecovery, status: 'inventory_push' as const, inventory_chunks_sent: 8, inventory_chunks_total: 10 };
    const merged = mergeRecoveryProgress(recovery, { ...deriveRecoveryProgress(recovery), percent: 95, message: 'Live update' });
    expect(merged.percent).toBeGreaterThanOrEqual(86);
    expect(merged.message).toBe('Live update');
  });

  it('ignores stale live progress from a different recovery session', () => {
    const recovery = { ...baseRecovery, id: 'rec-new', status: 'detected' as const };
    const merged = mergeRecoveryProgress(recovery, {
      recoveryId: 'rec-old',
      gatewayId: 'gw-old',
      facilityId: 'fac-1',
      status: 'complete',
      phase: 'complete',
      percent: 100,
      message: 'Recovery complete. Inventory sync is unblocked.',
      chunksSent: 0,
      chunksTotal: 1,
    });
    expect(merged.percent).toBe(0);
    expect(merged.message).toContain('Configure recovery');
    expect(merged.chunksTotal).toBeUndefined();
  });

  it('does not apply stale live progress after terminal recovery', () => {
    const recovery = { ...baseRecovery, status: 'complete' as const };
    const merged = mergeRecoveryProgress(recovery, {
      recoveryId: recovery.id,
      gatewayId: recovery.gateway_id,
      facilityId: recovery.facility_id,
      status: 'detected',
      phase: 'detected',
      percent: 0,
      message: 'New gateway detected',
    });
    expect(merged.percent).toBe(100);
    expect(merged.message).toContain('Recovery complete');
  });

  it('maps stepper index for configure and inventory phases', () => {
    expect(resolveStepperStepIndex('detected')).toBe(0);
    expect(resolveStepperStepIndex('firmware')).toBe(1);
    expect(resolveStepperStepIndex('inventory_push')).toBe(2);
    expect(resolveStepperStepIndex('complete')).toBe(3);
  });

  it('matches gateway ids case-insensitively', () => {
    expect(gatewayIdsEqual('GW-NEW', 'gw-new')).toBe(true);
    expect(gatewayIdsEqual('gw-a', 'gw-b')).toBe(false);
  });

  it('formats connection status', () => {
    expect(formatGatewayConnectionStatus(true)).toBe('Connected');
    expect(formatGatewayConnectionStatus(false)).toBe('Offline');
    expect(formatGatewayConnectionStatus(null)).toBe('Unknown');
  });

  it('resolves session connection state', () => {
    const sessions = [activeSession('gw-new'), candidateSession('gw-old', false)];
    expect(resolveGatewaySessionConnected(sessions, 'gw-new')).toBe(true);
    expect(resolveGatewaySessionConnected(sessions, 'gw-old')).toBe(false);
    expect(resolveGatewaySessionConnected(sessions, 'gw-missing')).toBeNull();
  });

  describe('resolveProductionGatewayId', () => {
    it('prefers the connected active session', () => {
      expect(resolveProductionGatewayId(
        [activeSession('gw-new'), candidateSession('gw-old')],
        'gw-bound',
        null,
      )).toBe('gw-new');
    });

    it('falls back to bound gateway when no active session', () => {
      expect(resolveProductionGatewayId([], 'gw-bound', null)).toBe('gw-bound');
    });

    it('uses completed recovery gateway when no session and no bound id', () => {
      expect(resolveProductionGatewayId(
        [],
        undefined,
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new' },
      )).toBe('gw-new');
    });
  });

  describe('resolveAvailableCandidate', () => {
    it('uses the recovery target gateway while a recovery is active', () => {
      const result = resolveAvailableCandidate(
        { ...baseRecovery, status: 'detected', gateway_id: 'gw-new' },
        [{ gatewayId: 'gw-new', connected: true }],
        [],
        'gw-old',
      );
      expect(result.gatewayId).toBe('gw-new');
      expect(result.connected).toBe(true);
    });

    it('treats a reconnected previous gateway as a normal swap candidate after complete', () => {
      const result = resolveAvailableCandidate(
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new', previous_gateway_id: 'gw-old' },
        [],
        [activeSession('gw-new'), candidateSession('gw-old', true)],
        'gw-new',
      );
      expect(result.gatewayId).toBe('gw-old');
      expect(result.connected).toBe(true);
    });

    it('excludes the production gateway and ignores offline candidates', () => {
      const result = resolveAvailableCandidate(
        null,
        [{ gatewayId: 'gw-new', connected: true }, { gatewayId: 'gw-off', connected: false }],
        [activeSession('gw-new')],
        'gw-new',
      );
      expect(result.gatewayId).toBeUndefined();
      expect(result.connected).toBeNull();
    });

    it('returns no candidate when only offline swap sessions exist after complete', () => {
      const result = resolveAvailableCandidate(
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new', previous_gateway_id: 'gw-old' },
        [],
        [activeSession('gw-new'), candidateSession('gw-old', false)],
        'gw-new',
      );
      expect(result.gatewayId).toBeUndefined();
      expect(result.connected).toBeNull();
    });

    it('returns no candidate when none are available', () => {
      const result = resolveAvailableCandidate(null, [], [activeSession('gw-new')], 'gw-new');
      expect(result.gatewayId).toBeUndefined();
      expect(result.connected).toBeNull();
    });
  });

  describe('resolveSwapView', () => {
    it('reports in_progress while a swap is running', () => {
      const view = resolveSwapView(
        { ...baseRecovery, status: 'inventory_push', gateway_id: 'gw-new' },
        [{ gatewayId: 'gw-new', connected: true }],
        [activeSession('gw-old'), candidateSession('gw-new')],
        'gw-old',
      );
      expect(view.mode).toBe('in_progress');
      expect(view.statusGatewayId).toBe('gw-new');
      expect(view.candidateGatewayId).toBe('gw-new');
      expect(view.productionGatewayId).toBe('gw-old');
    });

    it('reports failed with the recovery gateway as status target', () => {
      const view = resolveSwapView(
        { ...baseRecovery, status: 'failed', gateway_id: 'gw-new' },
        [],
        [activeSession('gw-old')],
        'gw-old',
      );
      expect(view.mode).toBe('failed');
      expect(view.statusGatewayId).toBe('gw-new');
    });

    it('reports ready and can start when a connected candidate exists', () => {
      const view = resolveSwapView(
        null,
        [{ gatewayId: 'gw-new', connected: true }],
        [activeSession('gw-old')],
        'gw-old',
      );
      expect(view.mode).toBe('ready');
      expect(view.canStart).toBe(true);
      expect(view.candidateGatewayId).toBe('gw-new');
      expect(view.statusGatewayId).toBe('gw-new');
    });

    it('stays idle when the only candidate is offline', () => {
      const view = resolveSwapView(
        null,
        [{ gatewayId: 'gw-new', connected: false }],
        [activeSession('gw-old')],
        'gw-old',
      );
      expect(view.mode).toBe('idle');
      expect(view.canStart).toBe(false);
      expect(view.candidateGatewayId).toBeUndefined();
    });

    it('treats a completed recovery with offline previous gateway as idle', () => {
      const view = resolveSwapView(
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new', previous_gateway_id: 'gw-old' },
        [],
        [activeSession('gw-new'), candidateSession('gw-old', false)],
        'gw-new',
      );
      expect(view.mode).toBe('idle');
      expect(view.productionGatewayId).toBe('gw-new');
      expect(view.candidateGatewayId).toBeUndefined();
    });

    it('treats a completed recovery with no candidate as idle (no persisted completion)', () => {
      const view = resolveSwapView(
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new', previous_gateway_id: 'gw-old' },
        [],
        [activeSession('gw-new')],
        'gw-new',
      );
      expect(view.mode).toBe('idle');
      expect(view.productionGatewayId).toBe('gw-new');
      expect(view.candidateGatewayId).toBeUndefined();
    });

    it('returns to ready after complete when the previous gateway is connected as a candidate', () => {
      const view = resolveSwapView(
        { ...baseRecovery, status: 'complete', gateway_id: 'gw-new', previous_gateway_id: 'gw-old' },
        [],
        [activeSession('gw-new'), candidateSession('gw-old', true)],
        'gw-new',
      );
      expect(view.mode).toBe('ready');
      expect(view.productionGatewayId).toBe('gw-new');
      expect(view.candidateGatewayId).toBe('gw-old');
      expect(view.canStart).toBe(true);
    });
  });

  it('prefers active facility recovery over terminal status from hydrate fetch', () => {
    const detected = { ...baseRecovery, id: 'rec-new', status: 'detected' as const, gateway_id: 'gw-third' };
    const complete = { ...baseRecovery, status: 'complete' as const, gateway_id: 'gw-new', previous_gateway_id: 'gw-old' };
    expect(mergeHydratedRecoveryStatus(detected, complete)).toEqual(detected);
    expect(mergeHydratedRecoveryStatus(complete, detected)).toEqual(detected);
  });
});
