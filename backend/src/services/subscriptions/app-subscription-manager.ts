import { WebSocket } from 'ws';
import { AppRealtimeHub } from '@/services/app-realtime.hub';
import type { AppRealtimeClient } from '@/services/app-realtime.types';

/**
 * App facility-stream subscription facade used by `/ws/app`.
 * Validation, snapshot, and fanout live on {@link AppRealtimeHub}.
 */
export class AppSubscriptionManager {
  private hub = AppRealtimeHub.getInstance();

  public async subscribe(
    ws: WebSocket,
    client: AppRealtimeClient,
    facilityId: string,
    subscriptionId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.hub.subscribe(ws, client, facilityId, subscriptionId);
  }

  public unsubscribe(ws: WebSocket, client: AppRealtimeClient): void {
    this.hub.unsubscribe(ws, client);
  }
}
