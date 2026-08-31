import { contextBridge, ipcRenderer } from 'electron';
import { IPC, IPC_EVENTS } from '@protocol/ipc-channels';
import type {
  BehaviorConfig,
  CreateGatewayRequest,
  GatewayInstanceState,
  GatewayLogEvent,
  GatewayUpdatedEvent,
  HistoryState,
  HydrateResponse,
  LoginRequest,
  SimulateAccessEventRequest,
  SessionSummary,
  UpdateGatewaySettingsRequest,
} from '@protocol/ipc-channels';
import type { DeviceInventoryItem, GatewayInventoryKind } from '@protocol/device-kinds';

const api = {
  hydrate: () => ipcRenderer.invoke(IPC.HYDRATE) as Promise<HydrateResponse>,
  setActiveInstance: (id: string | null) => ipcRenderer.invoke(IPC.SET_ACTIVE_INSTANCE, id),
  login: (req: LoginRequest) => ipcRenderer.invoke(IPC.LOGIN, req),
  getSession: () => ipcRenderer.invoke(IPC.GET_SESSION) as Promise<SessionSummary>,
  getCatalogSession: () => ipcRenderer.invoke(IPC.GET_CATALOG_SESSION) as Promise<import('@protocol/ipc-channels').CatalogSessionSummary>,
  loginCatalog: (req: LoginRequest) => ipcRenderer.invoke(IPC.LOGIN_CATALOG, req) as Promise<import('@protocol/ipc-channels').LoginResponse>,
  clearCatalogSession: () => ipcRenderer.invoke(IPC.CLEAR_CATALOG_SESSION) as Promise<{ ok: boolean }>,
  listFacilities: () => ipcRenderer.invoke(IPC.LIST_FACILITIES),
  listGateways: (facilityId: string) => ipcRenderer.invoke(IPC.LIST_GATEWAYS, facilityId),
  createGateway: (req: CreateGatewayRequest) => ipcRenderer.invoke(IPC.CREATE_GATEWAY, req),
  removeGateway: (id: string) => ipcRenderer.invoke(IPC.REMOVE_GATEWAY, id),
  listInstances: () => ipcRenderer.invoke(IPC.LIST_INSTANCES) as Promise<GatewayInstanceState[]>,
  connect: (id: string) => ipcRenderer.invoke(IPC.CONNECT, id) as Promise<GatewayInstanceState>,
  disconnect: (id: string) => ipcRenderer.invoke(IPC.DISCONNECT, id) as Promise<GatewayInstanceState>,
  connectAll: () => ipcRenderer.invoke(IPC.CONNECT_ALL) as Promise<GatewayInstanceState[]>,
  disconnectAll: () => ipcRenderer.invoke(IPC.DISCONNECT_ALL) as Promise<GatewayInstanceState[]>,
  getGatewayState: (id: string) => ipcRenderer.invoke(IPC.GET_GATEWAY_STATE, id) as Promise<GatewayInstanceState | null>,
  fetchGatewayCloud: (id: string) =>
    ipcRenderer.invoke(IPC.FETCH_GATEWAY_CLOUD, id) as Promise<GatewayInstanceState>,
  updateGatewaySettings: (id: string, patch: UpdateGatewaySettingsRequest) =>
    ipcRenderer.invoke(IPC.UPDATE_GATEWAY_SETTINGS, id, patch) as Promise<GatewayInstanceState>,
  enterProvisioning: (id: string, options?: { releaseCloud?: boolean }) =>
    ipcRenderer.invoke(IPC.ENTER_PROVISIONING, id, options) as Promise<GatewayInstanceState>,
  claimZtpGateway: (id: string) =>
    ipcRenderer.invoke(IPC.CLAIM_ZTP_GATEWAY, id) as Promise<GatewayInstanceState>,
  addDevice: (id: string, kind: GatewayInventoryKind) => ipcRenderer.invoke(IPC.ADD_DEVICE, id, kind),
  updateDevice: (id: string, key: string, patch: Partial<DeviceInventoryItem>) =>
    ipcRenderer.invoke(IPC.UPDATE_DEVICE, id, key, patch),
  updateDeviceSim: (
    id: string,
    key: string,
    req: import('@protocol/device-simulator-state').UpdateDeviceSimRequest,
  ) => ipcRenderer.invoke(IPC.UPDATE_DEVICE_SIM, id, key, req),
  resetDevice: (id: string, key: string) => ipcRenderer.invoke(IPC.RESET_DEVICE, id, key),
  removeDevice: (id: string, key: string) => ipcRenderer.invoke(IPC.REMOVE_DEVICE, id, key),
  clearDevices: (id: string) => ipcRenderer.invoke(IPC.CLEAR_DEVICES, id),
  syncInventory: (id: string) => ipcRenderer.invoke(IPC.SYNC_INVENTORY, id),
  syncState: (id: string) => ipcRenderer.invoke(IPC.SYNC_STATE, id),
  simulateAccessEvent: (id: string, req: SimulateAccessEventRequest) =>
    ipcRenderer.invoke(IPC.SIMULATE_ACCESS_EVENT, id, req),
  setBehavior: (id: string, behavior: Partial<BehaviorConfig>) => ipcRenderer.invoke(IPC.SET_BEHAVIOR, id, behavior),
  resetState: (id: string) => ipcRenderer.invoke(IPC.RESET_STATE, id),
  saveProfile: (id: string) => ipcRenderer.invoke(IPC.SAVE_PROFILE, id),
  loadProfiles: () => ipcRenderer.invoke(IPC.LOAD_PROFILES),
  undo: () => ipcRenderer.invoke(IPC.UNDO) as Promise<HydrateResponse>,
  redo: () => ipcRenderer.invoke(IPC.REDO) as Promise<HydrateResponse>,
  getHistoryState: () => ipcRenderer.invoke(IPC.GET_HISTORY_STATE) as Promise<HistoryState>,
  createUser: (req: import('@protocol/user-simulator-state').CreateUserRequest) =>
    ipcRenderer.invoke(IPC.CREATE_USER, req),
  listCloudUsers: (options?: { search?: string; role?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke(IPC.LIST_CLOUD_USERS, options) as Promise<
      import('@protocol/user-simulator-state').CloudUsersListResponse
    >,
  importCloudUser: (req: import('@protocol/user-simulator-state').ImportCloudUserRequest) =>
    ipcRenderer.invoke(IPC.IMPORT_CLOUD_USER, req) as Promise<
      import('@protocol/user-simulator-state').UserInstanceState
    >,
  removeUser: (id: string) => ipcRenderer.invoke(IPC.REMOVE_USER, id),
  listUsers: () => ipcRenderer.invoke(IPC.LIST_USERS) as Promise<import('@protocol/user-simulator-state').UserInstanceState[]>,
  getUserState: (id: string) =>
    ipcRenderer.invoke(IPC.GET_USER_STATE, id) as Promise<import('@protocol/user-simulator-state').UserInstanceState | null>,
  updateUser: (id: string, patch: import('@protocol/user-simulator-state').UpdateUserRequest) =>
    ipcRenderer.invoke(IPC.UPDATE_USER, id, patch),
  setActiveUser: (id: string | null) => ipcRenderer.invoke(IPC.SET_ACTIVE_USER, id),
  setSidebarCatalog: (catalog: import('@protocol/ipc-channels').SidebarCatalog) =>
    ipcRenderer.invoke(IPC.SET_SIDEBAR_CATALOG, catalog),
  listFmsWebhookTargets: () =>
    ipcRenderer.invoke(IPC.LIST_FMS_WEBHOOK_TARGETS) as Promise<
      import('@protocol/ipc-channels').FmsWebhookTargetSummary[]
    >,
  sendFmsWebhook: (req: import('@protocol/ipc-channels').SendFmsWebhookRequest) =>
    ipcRenderer.invoke(IPC.SEND_FMS_WEBHOOK, req) as Promise<
      import('@protocol/ipc-channels').SendFmsWebhookResponse
    >,
  saveWebhookSimulatorState: (prefs: NonNullable<import('@protocol/ipc-channels').AppState['webhookSimulator']>) =>
    ipcRenderer.invoke(IPC.SAVE_WEBHOOK_SIMULATOR_STATE, prefs),
  addUserDevice: (userId: string, req?: import('@protocol/user-simulator-state').AddUserDeviceRequest) =>
    ipcRenderer.invoke(IPC.ADD_USER_DEVICE, userId, req),
  removeUserDevice: (userId: string, deviceId: string) => ipcRenderer.invoke(IPC.REMOVE_USER_DEVICE, userId, deviceId),
  loginUser: (userId: string, appDeviceId?: string) => ipcRenderer.invoke(IPC.LOGIN_USER, userId, appDeviceId),
  listUserAccessibleFacilities: (userId: string) =>
    ipcRenderer.invoke(IPC.LIST_USER_ACCESSIBLE_FACILITIES, userId) as Promise<
      import('@protocol/ipc-channels').FacilitySummary[]
    >,
  connectUserAppRealtime: (userId: string, facilityId: string) =>
    ipcRenderer.invoke(IPC.CONNECT_USER_APP_REALTIME, userId, facilityId),
  disconnectUserAppRealtime: (userId: string) =>
    ipcRenderer.invoke(IPC.DISCONNECT_USER_APP_REALTIME, userId),
  clearUserAppRealtimeEvents: (userId: string) =>
    ipcRenderer.invoke(IPC.CLEAR_USER_APP_REALTIME_EVENTS, userId),
  registerUserDevice: (userId: string, deviceId: string) => ipcRenderer.invoke(IPC.REGISTER_USER_DEVICE, userId, deviceId),
  fetchUserRoutePass: (userId: string, deviceId: string, facilityId: string, facilityName?: string) =>
    ipcRenderer.invoke(IPC.FETCH_USER_ROUTE_PASS, userId, deviceId, facilityId, facilityName),
  getUserRoutePassDetails: (userId: string, deviceId: string, facilityId: string) =>
    ipcRenderer.invoke(IPC.GET_USER_ROUTE_PASS_DETAILS, userId, deviceId, facilityId) as Promise<
      import('@protocol/user-simulator-state').RoutePassDetails
    >,
  setUserRoutePassTamper: (
    userId: string,
    deviceId: string,
    req: import('@protocol/user-simulator-state').SetRoutePassTamperRequest,
  ) => ipcRenderer.invoke(IPC.SET_USER_ROUTE_PASS_TAMPER, userId, deviceId, req),
  clearUserRoutePass: (userId: string, deviceId: string, facilityId: string) =>
    ipcRenderer.invoke(IPC.CLEAR_USER_ROUTE_PASS, userId, deviceId, facilityId),
  regenerateUserDeviceKeys: (userId: string, deviceId: string) =>
    ipcRenderer.invoke(IPC.REGENERATE_USER_DEVICE_KEYS, userId, deviceId),
  tryOpenWithUserDevice: (gatewayId: string, req: import('@protocol/user-simulator-state').TryOpenWithUserDeviceRequest) =>
    ipcRenderer.invoke(IPC.TRY_OPEN_WITH_USER_DEVICE, gatewayId, req),
  tryOpenWithAccessCode: (gatewayId: string, req: import('@protocol/user-simulator-state').TryOpenWithAccessCodeRequest) =>
    ipcRenderer.invoke(IPC.TRY_OPEN_WITH_ACCESS_CODE, gatewayId, req),
  onUserUpdated: (cb: (event: import('@protocol/ipc-channels').UserUpdatedEvent) => void) => {
    const listener = (_: unknown, data: import('@protocol/ipc-channels').UserUpdatedEvent) => cb(data);
    ipcRenderer.on(IPC_EVENTS.USER_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.USER_UPDATED, listener);
  },
  onHistoryChanged: (cb: (state: HistoryState) => void) => {
    const listener = (_: unknown, data: HistoryState) => cb(data);
    ipcRenderer.on(IPC_EVENTS.HISTORY_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.HISTORY_CHANGED, listener);
  },
  onGatewayUpdated: (cb: (event: GatewayUpdatedEvent) => void) => {
    const listener = (_: unknown, data: GatewayUpdatedEvent) => cb(data);
    ipcRenderer.on(IPC_EVENTS.GATEWAY_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.GATEWAY_UPDATED, listener);
  },
  onGatewayLog: (cb: (event: GatewayLogEvent) => void) => {
    const listener = (_: unknown, data: GatewayLogEvent) => cb(data);
    ipcRenderer.on(IPC_EVENTS.GATEWAY_LOG, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.GATEWAY_LOG, listener);
  },
};

contextBridge.exposeInMainWorld('simulator', api);

export type SimulatorApi = typeof api;
