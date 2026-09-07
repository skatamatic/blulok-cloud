/**
 * Stops singleton background loops/timers so Jest workers can exit cleanly.
 * Safe to call repeatedly — errors are swallowed.
 */
export async function teardownBackgroundTimers(): Promise<void> {
  const safe = async (label: string, fn: () => void | Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch {
      // Best-effort cleanup for tests.
    }
  };

  await safe('AccessCodeSchedulerService', async () => {
    const { AccessCodeSchedulerService } = await import('../services/access-code-scheduler.service');
    AccessCodeSchedulerService.resetForTests();
  });

  await safe('DataPruningService', async () => {
    const { DataPruningService } = await import('../services/data-pruning.service');
    DataPruningService.resetForTests();
  });

  await safe('AccessSessionSweeperService', async () => {
    const { AccessSessionSweeperService } = await import('../services/access/access-session-sweeper.service');
    AccessSessionSweeperService.resetForTests();
  });

  await safe('RoutePassPruningService', async () => {
    const { RoutePassPruningService } = await import('../services/route-pass-pruning.service');
    RoutePassPruningService.resetForTests();
  });

  await safe('DenylistPruningService', async () => {
    const { DenylistPruningService } = await import('../services/denylist-pruning.service');
    DenylistPruningService.resetForTests();
  });

  await safe('LockCommandService', async () => {
    const { LockCommandService } = await import('../services/lock-command.service');
    LockCommandService.resetForTests();
  });

  await safe('DeviceDeletionOutboxService', async () => {
    const { DeviceDeletionOutboxService } = await import('../services/device-deletion-outbox.service');
    DeviceDeletionOutboxService.resetForTests();
  });

  await safe('FirmwareService timers', async () => {
    const { _testClearPendingTimers } = await import('../services/firmware/firmware.service');
    _testClearPendingTimers();
  });

  await safe('GatewayRecoveryService timers', async () => {
    const { _testClearPendingTimers } = await import('../services/gateway/gateway-recovery.service');
    _testClearPendingTimers();
  });
}

export async function teardownBackgroundConnections(): Promise<void> {
  const safe = async (label: string, fn: () => void | Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch {
      // Best-effort cleanup for tests.
    }
  };

  await safe('GatewayEventsService', async () => {
    const { GatewayEventsService } = await import('../services/gateway/gateway-events.service');
    const existing = (GatewayEventsService as any).instance;
    if (existing) {
      existing.shutdown();
      (GatewayEventsService as any).instance = undefined;
    }
  });

  await safe('WebSocketService', async () => {
    const { WebSocketService } = await import('../services/websocket.service');
    const existing = (WebSocketService as any).instance;
    if (existing) {
      existing.destroy();
    }
  });

  await safe('GatewayService', async () => {
    const { GatewayService } = await import('../services/gateway/gateway.service');
    const existing = (GatewayService as any).instance;
    if (existing) {
      await existing.shutdown();
      (GatewayService as any).instance = undefined;
    }
  });
}

export async function teardownBackgroundServices(): Promise<void> {
  await teardownBackgroundTimers();
  await teardownBackgroundConnections();
}
