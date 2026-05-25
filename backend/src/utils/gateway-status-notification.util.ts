import { logger } from '@/utils/logger';

export type GatewayDbStatus = 'online' | 'offline' | 'error';

/**
 * Fan-out in-app alerts when a gateway's persisted status changes.
 * Used by inbound WS sync, HTTP gateway sync, and gateway connection handlers.
 */
export async function notifyGatewayStatusTransition(params: {
  facilityId: string;
  gatewayId: string;
  gatewayName: string;
  previousStatus: string;
  nextStatus: GatewayDbStatus;
  reason?: string;
}): Promise<void> {
  const { facilityId, gatewayId, gatewayName, previousStatus, nextStatus, reason } = params;
  if (previousStatus === nextStatus) return;

  try {
    const { InAppNotificationDispatcher } = await import(
      '@/services/notifications/in-app-notification-dispatcher.service'
    );
    const dispatcher = InAppNotificationDispatcher.getInstance();

    if (nextStatus === 'offline') {
      await dispatcher.notifyGatewayOffline(facilityId, gatewayId, gatewayName);
      return;
    }
    if (nextStatus === 'online' && previousStatus === 'offline') {
      await dispatcher.notifyGatewayRestored(facilityId, gatewayId, gatewayName);
      return;
    }
    if (nextStatus === 'error') {
      await dispatcher.notifyGatewayAlert(
        facilityId,
        gatewayId,
        gatewayName,
        reason || 'Gateway entered error state',
      );
    }
  } catch (err) {
    logger.error('Failed to send gateway status notification:', err);
  }
}

/** Load gateway name when missing and dispatch status transition alerts. */
export async function notifyGatewayStatusAfterDbUpdate(params: {
  facilityId: string;
  gatewayId: string;
  previousStatus: string;
  nextStatus: GatewayDbStatus;
  reason?: string;
  gatewayName?: string;
}): Promise<void> {
  let gatewayName = params.gatewayName;
  if (!gatewayName) {
    try {
      const { GatewayModel } = await import('@/models/gateway.model');
      const gw = await new GatewayModel().findById(params.gatewayId);
      gatewayName = gw?.name || 'Gateway';
    } catch {
      gatewayName = 'Gateway';
    }
  }
  await notifyGatewayStatusTransition({
    facilityId: params.facilityId,
    gatewayId: params.gatewayId,
    gatewayName,
    previousStatus: params.previousStatus,
    nextStatus: params.nextStatus,
    reason: params.reason,
  });
}
