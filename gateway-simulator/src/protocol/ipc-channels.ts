import type { DeviceInventoryItem } from './device-kinds';
import type { SimulateAccessEventRequest } from './access-events';
import type { DeviceSimulatorState, SimulatedDeviceRecord, UpdateDeviceSimRequest } from './device-simulator-state';
export type { SimulateAccessEventRequest };
import type { GatewaySessionRole } from './messages';

export type AckMode = 'accept' | 'reject' | 'ignore' | 'hold';

export type FirmwareBehaviorMode = 'succeed' | 'fail' | 'stall';

/** How the simulator responds to inbound LOCK / UNLOCK command JWTs from the cloud. */
export type LockUnlockMode =
  /** Apply locally and push state to cloud (default). */
  | 'accept'
  /** Apply locally only — no state sync (cloud stays pending until timeout). */
  | 'apply-only'
  /** Drop command without changing local state. */
  | 'ignore';

export type BehaviorConfig = {
  /** Always true — unexpected drops and app-launch restore reconnect. Kept for profile compatibility. */
  autoReconnect: boolean;
  /** Always true — PING always gets PONG. Kept for profile compatibility. */
  respondToPing: boolean;
  accessCodeAckMode: AckMode;
  deviceDeletionAckMode: AckMode;
  commandLatencyMs: number;
  firmwareMode: FirmwareBehaviorMode;
  firmwareVerifyDelayMs: number;
  lockUnlockMode: LockUnlockMode;
  periodicTelemetryMs: number;
  forceOffline: boolean;
  /** Always true — push state/inventory when connected. Kept for profile compatibility. */
  liveStateSync: boolean;
  /** @deprecated migrated to lockUnlockMode on load */
  autoLockResponse?: boolean;
};

export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  autoReconnect: true,
  respondToPing: true,
  accessCodeAckMode: 'accept',
  deviceDeletionAckMode: 'accept',
  commandLatencyMs: 0,
  firmwareMode: 'succeed',
  firmwareVerifyDelayMs: 500,
  lockUnlockMode: 'accept',
  periodicTelemetryMs: 0,
  forceOffline: false,
  liveStateSync: true,
};

/** Merge persisted/partial behavior with defaults (avoids undefined controlled inputs in UI). */
export function normalizeBehavior(behavior?: Partial<BehaviorConfig>): BehaviorConfig {
  const merged: BehaviorConfig = { ...DEFAULT_BEHAVIOR, ...behavior };
  if (behavior?.lockUnlockMode === undefined && behavior?.autoLockResponse !== undefined) {
    merged.lockUnlockMode = behavior.autoLockResponse ? 'accept' : 'apply-only';
  }
  delete merged.autoLockResponse;
  // These used to be Behavior-tab toggles; they are always on now.
  merged.autoReconnect = true;
  merged.respondToPing = true;
  merged.liveStateSync = true;
  return merged;
}

/** IPC invoke channels (renderer → main). */
export const IPC = {
  // Session / backend
  LOGIN: 'sim:login',
  LIST_FACILITIES: 'sim:list-facilities',
  LIST_GATEWAYS: 'sim:list-gateways',
  GET_SESSION: 'sim:get-session',
  GET_CATALOG_SESSION: 'sim:get-catalog-session',
  LOGIN_CATALOG: 'sim:login-catalog',
  CLEAR_CATALOG_SESSION: 'sim:clear-catalog-session',

  // Gateway lifecycle
  CREATE_GATEWAY: 'sim:create-gateway',
  REMOVE_GATEWAY: 'sim:remove-gateway',
  LIST_INSTANCES: 'sim:list-instances',
  CONNECT: 'sim:connect',
  DISCONNECT: 'sim:disconnect',
  CONNECT_ALL: 'sim:connect-all',
  DISCONNECT_ALL: 'sim:disconnect-all',
  GET_GATEWAY_STATE: 'sim:get-gateway-state',
  FETCH_GATEWAY_CLOUD: 'sim:fetch-gateway-cloud',
  UPDATE_GATEWAY_SETTINGS: 'sim:update-gateway-settings',
  /** ZTP: enter factory/provisioning lifecycle (optional cloud release). */
  ENTER_PROVISIONING: 'sim:enter-provisioning',
  /** ZTP: claim current facility while sitting in provision WAITING. */
  CLAIM_ZTP_GATEWAY: 'sim:claim-ztp-gateway',

  // Devices
  ADD_DEVICE: 'sim:add-device',
  UPDATE_DEVICE: 'sim:update-device',
  UPDATE_DEVICE_SIM: 'sim:update-device-sim',
  RESET_DEVICE: 'sim:reset-device',
  REMOVE_DEVICE: 'sim:remove-device',
  CLEAR_DEVICES: 'sim:clear-devices',
  SYNC_INVENTORY: 'sim:sync-inventory',
  SYNC_STATE: 'sim:sync-state',
  SIMULATE_ACCESS_EVENT: 'sim:simulate-access-event',

  // Behavior / persistence
  SET_BEHAVIOR: 'sim:set-behavior',
  RESET_STATE: 'sim:reset-state',
  SAVE_PROFILE: 'sim:save-profile',
  LOAD_PROFILES: 'sim:load-profiles',
  HYDRATE: 'sim:hydrate',
  SET_ACTIVE_INSTANCE: 'sim:set-active-instance',
  GET_APP_STATE: 'sim:get-app-state',
  UNDO: 'sim:undo',
  REDO: 'sim:redo',
  GET_HISTORY_STATE: 'sim:get-history-state',

  // Simulated users (mobile tenant flow)
  CREATE_USER: 'sim:create-user',
  LIST_CLOUD_USERS: 'sim:list-cloud-users',
  IMPORT_CLOUD_USER: 'sim:import-cloud-user',
  REMOVE_USER: 'sim:remove-user',
  LIST_USERS: 'sim:list-users',
  GET_USER_STATE: 'sim:get-user-state',
  UPDATE_USER: 'sim:update-user',
  SET_ACTIVE_USER: 'sim:set-active-user',
  SET_SIDEBAR_CATALOG: 'sim:set-sidebar-catalog',

  // FMS webhook simulation
  LIST_FMS_WEBHOOK_TARGETS: 'sim:list-fms-webhook-targets',
  SEND_FMS_WEBHOOK: 'sim:send-fms-webhook',
  SAVE_WEBHOOK_SIMULATOR_STATE: 'sim:save-webhook-simulator-state',
  ADD_USER_DEVICE: 'sim:add-user-device',
  REMOVE_USER_DEVICE: 'sim:remove-user-device',
  LOGIN_USER: 'sim:login-user',
  /** Facilities the simulated user's JWT can access (for App realtime picker). */
  LIST_USER_ACCESSIBLE_FACILITIES: 'sim:list-user-accessible-facilities',
  REGISTER_USER_DEVICE: 'sim:register-user-device',
  FETCH_USER_ROUTE_PASS: 'sim:fetch-user-route-pass',
  GET_USER_ROUTE_PASS_DETAILS: 'sim:get-user-route-pass-details',
  SET_USER_ROUTE_PASS_TAMPER: 'sim:set-user-route-pass-tamper',
  CLEAR_USER_ROUTE_PASS: 'sim:clear-user-route-pass',
  REGENERATE_USER_DEVICE_KEYS: 'sim:regenerate-user-device-keys',
  TRY_OPEN_WITH_USER_DEVICE: 'sim:try-open-with-user-device',
  TRY_OPEN_WITH_ACCESS_CODE: 'sim:try-open-with-access-code',
  /** Opt-in: open tenant /ws/app and subscribe to a facility. */
  CONNECT_USER_APP_REALTIME: 'sim:connect-user-app-realtime',
  DISCONNECT_USER_APP_REALTIME: 'sim:disconnect-user-app-realtime',
  CLEAR_USER_APP_REALTIME_EVENTS: 'sim:clear-user-app-realtime-events',
} as const;

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
};

/** IPC event channels (main → renderer). */
export const IPC_EVENTS = {
  GATEWAY_UPDATED: 'sim:gateway-updated',
  GATEWAY_EVENT: 'sim:gateway-event',
  GATEWAY_LOG: 'sim:gateway-log',
  HISTORY_CHANGED: 'sim:history-changed',
  USER_UPDATED: 'sim:user-updated',
} as const;

export type LoginRequest = {
  backendUrl: string;
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: { id: string; email: string; role: string };
};

export type FacilitySummary = {
  id: string;
  name: string;
  status?: string;
};

export type GatewayRecordSummary = {
  id: string;
  facility_id: string;
  name?: string;
  mac_address?: string | null;
  status?: string;
  gateway_type?: string;
};

export type SessionSummary = {
  available: boolean;
  backendUrl?: string;
  email?: string;
};

export type CatalogSessionSummary = {
  available: boolean;
  backendUrl?: string;
  email?: string;
  role?: string;
  /** True when signed in as admin or dev_admin — required for user import. */
  canImportUsers?: boolean;
  /** True when signed in as admin, dev_admin, or facility_admin — required for FMS webhooks. */
  canSimulateFmsWebhooks?: boolean;
};

export type GatewayRecordDetail = {
  id: string;
  facility_id: string | null;
  name: string;
  mac_address?: string | null;
  status?: string;
  gateway_type?: string;
};

export type UpdateGatewaySettingsRequest = {
  label?: string;
  /** Cloud gateway display name (PUT /gateways/:id `name`). */
  gatewayName?: string;
  /** Hardware serial stored as `mac_address` on the gateway record. */
  gatewaySerial?: string;
  /** Running firmware reported on WS AUTH (`firmware_version`). */
  gatewayFirmwareVersion?: string;
  /** Switch cloud auth mode (disconnects if connected). */
  authMode?: 'legacy_jwt' | 'ztp_keypair';
};

export type CreateGatewayRequest = {
  label: string;
  backendUrl: string;
  facilityId: string;
  facilityName?: string;
  /** Existing gateway UUID, or omit for a fresh auto-registering gateway. */
  gatewayId?: string;
  /** Cloud gateway display name (optional at create; editable later in settings). */
  gatewayName?: string;
  /** Hardware serial stored as `mac_address` on the gateway record. */
  gatewaySerial?: string;
  /** Omit when the main process already has a saved session. */
  token?: string;
  /** Default legacy_jwt — ZTP generates a keypair and uses challenge-response AUTH. */
  authMode?: 'legacy_jwt' | 'ztp_keypair';
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'provisioning' | 'connected' | 'error';

/** ZTP device lifecycle (persisted). Legacy JWT gateways stay `operational`. */
export type ZtpLifecyclePhase = 'provisioning' | 'operational';

export type GatewayEventEntry = {
  id: string;
  timestamp: string;
  direction: 'in' | 'out' | 'system';
  summary: string;
  payload?: unknown;
};

export type GatewayInstanceState = {
  id: string;
  label: string;
  backendUrl: string;
  facilityId: string;
  facilityName?: string;
  gatewayId: string;
  /** Cached cloud gateway display name. */
  gatewayName?: string;
  /** Cached hardware serial (`mac_address` on gateway record). */
  gatewaySerial?: string;
  /** Firmware version applied to this simulator gateway (OTA target_type gateway). */
  gatewayFirmwareVersion?: string;
  connectionStatus: ConnectionStatus;
  sessionRole?: GatewaySessionRole;
  autoRegistered?: boolean;
  opsPublicKey?: string;
  /** Cloud auth strategy for this instance. */
  authMode: 'legacy_jwt' | 'ztp_keypair';
  /** ZTP lifecycle: factory/waiting-room vs claimed ops. */
  ztpLifecyclePhase: ZtpLifecyclePhase;
  /** Compressed P-256 public key (sticker QR payload) — safe to display. */
  ztpPublicKeyB64?: string;
  devices: DeviceInventoryItem[];
  deviceSimByKey: Record<string, DeviceSimulatorState>;
  behavior: BehaviorConfig;
  events: GatewayEventEntry[];
  lastError?: string;
  connectedAt?: string;
  /** Non-fatal warning (e.g. inventory sync blocked during recovery) while WS stays connected. */
  connectionWarning?: string;
  /** Epoch ms when the next automatic reconnect attempt is scheduled (unexpected drop only). */
  reconnectAt?: number;
};

export type SidebarCatalog = 'gateways' | 'users' | 'webhooks';

export type FmsWebhookTargetSummary = {
  configId: string;
  facilityId: string;
  facilityName: string | null;
  providerType: string;
  isEnabled: boolean;
  webhookUrl: string;
  externalFacilityId: string;
  /** True when config.customSettings.facilityId is set (required for Storable). */
  hasExternalFacilityId: boolean;
  authMode: 'hmac' | 'header_secret' | 'none';
  /** False when HMAC/header_secret mode is configured without a secret. */
  authReady: boolean;
  webhookAuthHeader?: string;
  webhookSignatureHeader?: string;
};

export type SendFmsWebhookRequest = {
  facilityId: string;
  body: unknown;
  extraHeaders?: Record<string, string>;
  authOverride?: {
    mode: 'hmac' | 'header_secret' | 'none';
    secret?: string;
    authHeader?: string;
    signatureHeader?: string;
    bearer?: boolean;
  };
};

export type SendFmsWebhookResponse = {
  status: number;
  ok: boolean;
  body: unknown;
  rawBody: string;
};

export type AppState = {
  activeInstanceId: string | null;
  activeUserId?: string | null;
  sidebarCatalog?: SidebarCatalog;
  webhookSimulator?: {
    selectedFacilityId?: string;
    selectedTemplateId?: string;
  };
};

export type HydrateResponse = {
  instances: GatewayInstanceState[];
  users: import('./user-simulator-state').UserInstanceState[];
  activeInstanceId: string | null;
  activeUserId: string | null;
  sidebarCatalog: SidebarCatalog;
  webhookSimulator?: AppState['webhookSimulator'];
};

export type GatewayUpdatedEvent = {
  instanceId: string;
  state: GatewayInstanceState;
};

export type GatewayLogEvent = {
  instanceId: string;
  entry: GatewayEventEntry;
};

export type UserUpdatedEvent = {
  userId: string;
  state: import('./user-simulator-state').UserInstanceState;
};
