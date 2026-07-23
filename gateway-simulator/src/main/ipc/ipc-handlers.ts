import { ipcMain } from 'electron';
import { IPC } from '@protocol/ipc-channels';
import type { BehaviorConfig, CreateGatewayRequest, LoginRequest, SimulateAccessEventRequest } from '@protocol/ipc-channels';
import type { DeviceInventoryItem, GatewayInventoryKind } from '@protocol/device-kinds';
import { gatewayManager } from '../core/GatewayManager';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.HYDRATE, async () => {
    return gatewayManager.hydrateFromDisk();
  });

  ipcMain.handle(IPC.SET_ACTIVE_INSTANCE, async (_e, id: string | null) => {
    await gatewayManager.setActiveInstance(id);
    return { ok: true };
  });

  ipcMain.handle(IPC.GET_APP_STATE, async () => {
    return gatewayManager.getAppStateAsync();
  });

  ipcMain.handle(IPC.GET_SESSION, async () => {
    return gatewayManager.getSessionSummary();
  });

  ipcMain.handle(IPC.GET_CATALOG_SESSION, async () => gatewayManager.getCatalogSessionSummary());

  ipcMain.handle(IPC.LOGIN_CATALOG, async (_e, req: LoginRequest) => gatewayManager.loginCatalogSession(req));

  ipcMain.handle(IPC.CLEAR_CATALOG_SESSION, async () => {
    await gatewayManager.clearCatalogSession();
    return { ok: true };
  });

  ipcMain.handle(IPC.LOGIN, async (_e, req: LoginRequest) => {
    const result = await gatewayManager.getBackendClient().login(req);
    await gatewayManager.persistSession(req.backendUrl, result.token, result.user.email);
    return result;
  });

  ipcMain.handle(IPC.LIST_FACILITIES, async () => {
    return gatewayManager.getBackendClient().listFacilities();
  });

  ipcMain.handle(IPC.LIST_GATEWAYS, async (_e, facilityId: string) => {
    return gatewayManager.getBackendClient().listGateways(facilityId);
  });

  ipcMain.handle(IPC.CREATE_GATEWAY, async (_e, req: CreateGatewayRequest) => {
    return gatewayManager.createInstance(req);
  });

  ipcMain.handle(IPC.REMOVE_GATEWAY, async (_e, id: string) => {
    await gatewayManager.removeInstance(id);
    return { ok: true };
  });

  ipcMain.handle(IPC.LIST_INSTANCES, async () => {
    return gatewayManager.listInstances();
  });

  ipcMain.handle(IPC.CONNECT, async (_e, id: string) => {
    return gatewayManager.connect(id);
  });

  ipcMain.handle(IPC.DISCONNECT, async (_e, id: string) => {
    return gatewayManager.disconnect(id);
  });

  ipcMain.handle(IPC.CONNECT_ALL, async () => {
    return gatewayManager.connectAll();
  });

  ipcMain.handle(IPC.DISCONNECT_ALL, async () => {
    return gatewayManager.disconnectAll();
  });

  ipcMain.handle(IPC.GET_GATEWAY_STATE, async (_e, id: string) => {
    return gatewayManager.getInstance(id);
  });

  ipcMain.handle(IPC.FETCH_GATEWAY_CLOUD, async (_e, id: string) => {
    return gatewayManager.fetchGatewayCloud(id);
  });

  ipcMain.handle(
    IPC.UPDATE_GATEWAY_SETTINGS,
    async (_e, id: string, patch: import('@protocol/ipc-channels').UpdateGatewaySettingsRequest) => {
      return gatewayManager.updateGatewaySettings(id, patch);
    },
  );

  ipcMain.handle(
    IPC.ENTER_PROVISIONING,
    async (_e, id: string, options?: { releaseCloud?: boolean }) => {
      return gatewayManager.enterProvisioning(id, options);
    },
  );

  ipcMain.handle(IPC.CLAIM_ZTP_GATEWAY, async (_e, id: string) => {
    return gatewayManager.claimZtpGateway(id);
  });

  ipcMain.handle(IPC.ADD_DEVICE, async (_e, id: string, kind: GatewayInventoryKind) => {
    gatewayManager.addDevice(id, kind);
    return gatewayManager.getInstance(id);
  });

  ipcMain.handle(
    IPC.UPDATE_DEVICE,
    async (_e, id: string, key: string, patch: Partial<DeviceInventoryItem>) => {
      await gatewayManager.updateDevice(id, key, patch);
      return gatewayManager.getInstance(id);
    },
  );

  ipcMain.handle(
    IPC.UPDATE_DEVICE_SIM,
    async (_e, id: string, key: string, req: import('@protocol/device-simulator-state').UpdateDeviceSimRequest) => {
      return gatewayManager.updateDeviceSim(id, key, req);
    },
  );

  ipcMain.handle(IPC.RESET_DEVICE, async (_e, id: string, key: string) => {
    return gatewayManager.resetDevice(id, key);
  });

  ipcMain.handle(IPC.REMOVE_DEVICE, async (_e, id: string, key: string) => {
    gatewayManager.removeDevice(id, key);
    return gatewayManager.getInstance(id);
  });

  ipcMain.handle(IPC.CLEAR_DEVICES, async (_e, id: string) => {
    gatewayManager.clearDevices(id);
    return gatewayManager.getInstance(id);
  });

  ipcMain.handle(IPC.SYNC_INVENTORY, async (_e, id: string) => {
    return gatewayManager.syncInventory(id);
  });

  ipcMain.handle(IPC.SYNC_STATE, async (_e, id: string) => {
    return gatewayManager.syncState(id);
  });

  ipcMain.handle(IPC.SIMULATE_ACCESS_EVENT, async (_e, id: string, req: SimulateAccessEventRequest) => {
    return gatewayManager.simulateAccessEvent(id, req);
  });

  ipcMain.handle(IPC.SET_BEHAVIOR, async (_e, id: string, behavior: Partial<BehaviorConfig>) => {
    return gatewayManager.setBehavior(id, behavior);
  });

  ipcMain.handle(IPC.RESET_STATE, async (_e, id: string) => {
    return gatewayManager.resetState(id);
  });

  ipcMain.handle(IPC.SAVE_PROFILE, async (_e, id: string) => {
    await gatewayManager.saveProfile(id);
    return { ok: true };
  });

  ipcMain.handle(IPC.LOAD_PROFILES, async () => {
    return gatewayManager.loadProfiles();
  });

  ipcMain.handle(IPC.UNDO, async () => gatewayManager.undo());
  ipcMain.handle(IPC.REDO, async () => gatewayManager.redo());
  ipcMain.handle(IPC.GET_HISTORY_STATE, async () => gatewayManager.getHistoryState());

  ipcMain.handle(IPC.CREATE_USER, async (_e, req: import('@protocol/user-simulator-state').CreateUserRequest) => {
    return gatewayManager.createUser(req);
  });
  ipcMain.handle(
    IPC.LIST_CLOUD_USERS,
    async (_e, options?: { search?: string; role?: string; limit?: number; offset?: number }) => {
      return gatewayManager.listCloudUsers(options);
    },
  );
  ipcMain.handle(
    IPC.IMPORT_CLOUD_USER,
    async (_e, req: import('@protocol/user-simulator-state').ImportCloudUserRequest) => {
      return gatewayManager.importCloudUser(req);
    },
  );
  ipcMain.handle(IPC.REMOVE_USER, async (_e, id: string) => {
    await gatewayManager.removeUser(id);
    return { ok: true };
  });
  ipcMain.handle(IPC.LIST_USERS, async () => gatewayManager.listUsers());
  ipcMain.handle(IPC.GET_USER_STATE, async (_e, id: string) => gatewayManager.getUser(id));
  ipcMain.handle(
    IPC.UPDATE_USER,
    async (_e, id: string, patch: import('@protocol/user-simulator-state').UpdateUserRequest) => {
      return gatewayManager.updateUser(id, patch);
    },
  );
  ipcMain.handle(IPC.SET_ACTIVE_USER, async (_e, id: string | null) => {
    await gatewayManager.setActiveUser(id);
    return { ok: true };
  });
  ipcMain.handle(IPC.SET_SIDEBAR_CATALOG, async (_e, catalog: import('@protocol/ipc-channels').SidebarCatalog) => {
    await gatewayManager.setSidebarCatalog(catalog);
    return { ok: true };
  });
  ipcMain.handle(IPC.LIST_FMS_WEBHOOK_TARGETS, async () => gatewayManager.listFmsWebhookTargets());
  ipcMain.handle(
    IPC.SEND_FMS_WEBHOOK,
    async (_e, req: import('@protocol/ipc-channels').SendFmsWebhookRequest) => gatewayManager.sendFmsWebhook(req),
  );
  ipcMain.handle(
    IPC.SAVE_WEBHOOK_SIMULATOR_STATE,
    async (_e, prefs: NonNullable<import('@protocol/ipc-channels').AppState['webhookSimulator']>) => {
      await gatewayManager.saveWebhookSimulatorState(prefs);
      return { ok: true };
    },
  );
  ipcMain.handle(
    IPC.ADD_USER_DEVICE,
    async (_e, userId: string, req?: import('@protocol/user-simulator-state').AddUserDeviceRequest) => {
      return gatewayManager.addUserDevice(userId, req);
    },
  );
  ipcMain.handle(IPC.REMOVE_USER_DEVICE, async (_e, userId: string, deviceId: string) => {
    return gatewayManager.removeUserDevice(userId, deviceId);
  });
  ipcMain.handle(IPC.LOGIN_USER, async (_e, userId: string, appDeviceId?: string) => {
    return gatewayManager.loginUser(userId, appDeviceId);
  });
  ipcMain.handle(IPC.LIST_USER_ACCESSIBLE_FACILITIES, async (_e, userId: string) => {
    return gatewayManager.listUserAccessibleFacilities(userId);
  });
  ipcMain.handle(IPC.CONNECT_USER_APP_REALTIME, async (_e, userId: string, facilityId: string) => {
    return gatewayManager.connectUserAppRealtime(userId, facilityId);
  });
  ipcMain.handle(IPC.DISCONNECT_USER_APP_REALTIME, async (_e, userId: string) => {
    return gatewayManager.disconnectUserAppRealtime(userId);
  });
  ipcMain.handle(IPC.CLEAR_USER_APP_REALTIME_EVENTS, async (_e, userId: string) => {
    return gatewayManager.clearUserAppRealtimeEvents(userId);
  });
  ipcMain.handle(IPC.REGISTER_USER_DEVICE, async (_e, userId: string, deviceId: string) => {
    return gatewayManager.registerUserDevice(userId, deviceId);
  });
  ipcMain.handle(
    IPC.FETCH_USER_ROUTE_PASS,
    async (_e, userId: string, deviceId: string, facilityId: string, facilityName?: string) => {
      return gatewayManager.fetchUserRoutePass(userId, deviceId, facilityId, facilityName);
    },
  );
  ipcMain.handle(
    IPC.GET_USER_ROUTE_PASS_DETAILS,
    (_e, userId: string, deviceId: string, facilityId: string) => {
      return gatewayManager.getUserRoutePassDetails(userId, deviceId, facilityId);
    },
  );
  ipcMain.handle(
    IPC.SET_USER_ROUTE_PASS_TAMPER,
    async (
      _e,
      userId: string,
      deviceId: string,
      req: import('@protocol/user-simulator-state').SetRoutePassTamperRequest,
    ) => {
      return gatewayManager.setUserRoutePassTamper(userId, deviceId, req);
    },
  );
  ipcMain.handle(IPC.CLEAR_USER_ROUTE_PASS, async (_e, userId: string, deviceId: string, facilityId: string) => {
    return gatewayManager.clearUserRoutePass(userId, deviceId, facilityId);
  });
  ipcMain.handle(IPC.REGENERATE_USER_DEVICE_KEYS, async (_e, userId: string, deviceId: string) => {
    return gatewayManager.regenerateUserDeviceKeys(userId, deviceId);
  });
  ipcMain.handle(
    IPC.TRY_OPEN_WITH_USER_DEVICE,
    async (_e, gatewayId: string, req: import('@protocol/user-simulator-state').TryOpenWithUserDeviceRequest) => {
      return gatewayManager.tryOpenWithUserDevice(gatewayId, req);
    },
  );
  ipcMain.handle(
    IPC.TRY_OPEN_WITH_ACCESS_CODE,
    async (_e, gatewayId: string, req: import('@protocol/user-simulator-state').TryOpenWithAccessCodeRequest) => {
      return gatewayManager.tryOpenWithAccessCode(gatewayId, req);
    },
  );
}
