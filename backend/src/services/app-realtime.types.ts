import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';

/** Wire event names multiplexed on `/ws/app`. */
export type AppRealtimeEventName =
  | 'app_snapshot'
  | 'notification_created'
  | 'notification_read'
  | 'notification_deleted'
  | 'notifications_batch_read'
  | 'notifications_batch_hidden'
  | 'notifications_count_update'
  | 'device_status_update'
  | 'units_update'
  | 'activity_update'
  | 'activity_new'
  | 'access_session_upsert'
  | 'access_codes_update'
  | 'key_sharing_update'
  | 'gateway_status_update';

export interface AppRealtimeClient {
  userId: string;
  userRole: UserRole;
  /** Live facility IDs for facility-scoped roles; undefined for global admins. */
  facilityIds?: string[];
  /** Active app subscription (at most one). */
  subscriptionId?: string;
  facilityId?: string;
  /** Cached unit IDs for tenant/maintenance device filtering within the subscribed facility. */
  accessibleUnitIds?: Set<string>;
  lastClientHeartbeat: Date;
  heartbeatCount: number;
}

export interface AppRealtimeSubscriber {
  ws: WebSocket;
  client: AppRealtimeClient;
}

export interface AppEventEnvelope {
  type: 'app_event';
  subscriptionId: string;
  facilityId: string;
  event: AppRealtimeEventName;
  data: unknown;
  timestamp: string;
}

/** Optional scope for units_update fanout on `/ws/app`. */
export interface AppUnitsUpdateScope {
  facilityId?: string;
  /** Specific unit that changed. `null` = facility-level device with no unit. */
  unitId?: string | null;
  /** When set, hub resolves facility/unit from the device if not already provided. */
  deviceId?: string;
}

export interface AppWsControlMessage {
  type: 'subscription' | 'unsubscription' | 'heartbeat' | 'error' | 'scope_update';
  subscriptionId?: string;
  subscriptionType?: string;
  data?: unknown;
  error?: string;
  timestamp?: string;
}
