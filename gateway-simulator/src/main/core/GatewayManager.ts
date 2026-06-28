import { randomUUID } from 'crypto';
import { app } from 'electron';
import type { AppState, CreateGatewayRequest, GatewayInstanceState, GatewayLogEvent, GatewayUpdatedEvent, HydrateResponse, SessionSummary, CatalogSessionSummary, SimulateAccessEventRequest } from '@protocol/ipc-channels';
import { normalizeBehavior } from '@protocol/ipc-channels';
import { backendClient, BackendClient } from '../auth/BackendClient';
import { isCatalogAdminRole } from '../auth/catalog-session.utils';
import { SimulatedGateway } from './SimulatedGateway';
import { FileStateStore, emptyProfile, type GatewayProfile } from '../persistence/FileStateStore';
import type { BrowserWindow } from 'electron';
import { IPC_EVENTS } from '@protocol/ipc-channels';
import { SimulatorHistory } from '../history/SimulatorHistory';
import type { HistoryState } from '@protocol/ipc-channels';
import type { SimulatorSnapshot } from '../history/simulator-history.types';
import { snapshotsEqual } from '../history/simulator-snapshot.utils';
import { updateEditMenuHistory } from '../edit-menu';
import type {
  AddUserDeviceRequest,
  CreateUserRequest,
  ImportCloudUserRequest,
  SetRoutePassTamperRequest,
  TryOpenWithAccessCodeRequest,
  TryOpenWithAccessCodeResult,
  TryOpenWithUserDeviceRequest,
  TryOpenWithUserDeviceResult,
  UpdateUserRequest,
  UserInstanceState,
} from '@protocol/user-simulator-state';
import type { CloudUserSummary } from '../auth/BackendClient';
import { UserManager } from './UserManager';
import { tryOpenLockWithUserDevice } from '../users/user-lock-access.service';
import { tryOpenWithAccessCode } from '../access/try-access-code.service';

export type GatewayManagerOptions = {
  store?: FileStateStore;
  backendClient?: BackendClient;
  catalogClient?: BackendClient;
  mobileApi?: import('../auth/MobileApiClient').MobileApiClient;
  generateId?: () => string;
  createGateway?: (profile: GatewayProfile, ctx: GatewayBuildContext) => SimulatedGateway;
};

export type GatewayBuildContext = {
  store: FileStateStore;
  onUpdate: (state: GatewayInstanceState) => void;
  onLog: (entry: import('@protocol/ipc-channels').GatewayEventEntry) => void;
};

export class GatewayManager {
  private instances = new Map<string, SimulatedGateway>();
  private store: FileStateStore;
  private readonly api: BackendClient;
  private readonly catalogApi: BackendClient;
  private readonly generateId: () => string;
  private readonly createGateway?: GatewayManagerOptions['createGateway'];
  private window: BrowserWindow | null = null;
  private hydrated = false;
  private readonly history = new SimulatorHistory();
  private applyingHistory = false;
  private readonly userManager: UserManager;

  constructor(options: GatewayManagerOptions = {}) {
    this.store = options.store ?? new FileStateStore(app.getPath('userData'));
    this.api = options.backendClient ?? backendClient;
    this.catalogApi = options.catalogClient ?? new BackendClient();
    this.generateId = options.generateId ?? randomUUID;
    this.createGateway = options.createGateway;
    this.userManager = new UserManager({
      store: this.store,
      generateId: this.generateId,
      mobileApi: options.mobileApi,
      sessionProvider: {
        fetchCloudUser: (cloudUserId) => this.catalogApi.getUserDetail(cloudUserId),
        mintUserSession: (cloudUserId) => this.catalogApi.mintSimulatorUserSession(cloudUserId),
        getBackendUrl: () => this.catalogApi.getBackendUrl(),
      },
      onUserUpdated: (state) => this.broadcastUserUpdated(state),
    });
  }

  setWindow(win: BrowserWindow | null): void {
    this.window = win;
  }

  /** Restore saved gateway tabs and session from disk (call once at startup). */
  async hydrateFromDisk(): Promise<HydrateResponse> {
    if (this.hydrated) {
      const appState = await this.store.loadAppState();
      return this.buildHydrateResponse(appState);
    }
    this.hydrated = true;
    this.history.clear();

    const session = await this.store.loadSession();
    if (session?.token && session.backendUrl) {
      this.api.restoreSession(session.backendUrl, session.token);
    }

    const catalogSession = await this.store.loadCatalogSession();
    if (catalogSession?.token && catalogSession.backendUrl) {
      this.catalogApi.restoreSession(catalogSession.backendUrl, catalogSession.token);
    }

    const userProfiles = await this.store.loadUserProfiles();
    this.userManager.loadFromProfiles(userProfiles);

    const profiles = await this.store.loadProfiles();
    for (const profile of profiles) {
      if (!profile.token) continue;
      if (this.instances.has(profile.id)) continue;
      const gateway = this.buildInstance(profile);
      this.instances.set(profile.id, gateway);
    }

    const restoreConnects: Promise<void>[] = [];
    for (const profile of profiles) {
      if (!profile.connectOnRestore) continue;
      if (!normalizeBehavior(profile.behavior).autoReconnect) continue;
      const gateway = this.instances.get(profile.id);
      if (!gateway) continue;
      restoreConnects.push(
        gateway.connect().catch(() => undefined),
      );
    }
    if (restoreConnects.length) {
      await Promise.allSettled(restoreConnects);
    }

    const appState = await this.store.loadAppState();
    this.notifyHistoryChanged();
    return this.buildHydrateResponse(appState);
  }

  listUsers(): UserInstanceState[] {
    return this.userManager.listStates();
  }

  getUser(id: string): UserInstanceState | null {
    return this.userManager.getState(id);
  }

  async setActiveUser(id: string | null): Promise<void> {
    const appState = await this.store.loadAppState();
    await this.store.saveAppState({ ...appState, activeUserId: id });
  }

  async setSidebarCatalog(catalog: 'gateways' | 'users'): Promise<void> {
    const appState = await this.store.loadAppState();
    await this.store.saveAppState({ ...appState, sidebarCatalog: catalog });
  }

  async createUser(req: CreateUserRequest): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Add user', () => {
      state = this.userManager.createUser(req);
    });
    return state;
  }

  async listCloudUsers(options?: {
    search?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: CloudUserSummary[]; total: number }> {
    this.requireCatalogAdminSession();
    return this.catalogApi.listUsers({ limit: 200, ...options });
  }

  async importCloudUser(req: ImportCloudUserRequest): Promise<UserInstanceState> {
    this.requireCatalogAdminSession();
    let state!: UserInstanceState;
    await this.recordUndoable('Import user', async () => {
      state = await this.userManager.importCloudUser(req);
    });
    return state;
  }

  async getCatalogSessionSummary(): Promise<CatalogSessionSummary> {
    const stored = await this.store.loadCatalogSession();
    if (stored?.token && stored.backendUrl) {
      return {
        available: true,
        backendUrl: stored.backendUrl,
        email: stored.email,
        role: stored.role,
        canImportUsers: isCatalogAdminRole(stored.role),
      };
    }
    if (this.catalogApi.getToken()) {
      return { available: true, canImportUsers: false };
    }
    return { available: false };
  }

  async loginCatalogSession(req: import('@protocol/ipc-channels').LoginRequest): Promise<import('@protocol/ipc-channels').LoginResponse> {
    const result = await this.catalogApi.login(req);
    if (!isCatalogAdminRole(result.user.role)) {
      this.catalogApi.restoreSession('', '');
      throw new Error('Admin or Dev Admin account required to import users');
    }
    await this.store.saveCatalogSession({
      backendUrl: req.backendUrl.replace(/\/+$/, ''),
      token: result.token,
      email: result.user.email,
      role: result.user.role,
      updatedAt: new Date().toISOString(),
    });
    return result;
  }

  async clearCatalogSession(): Promise<void> {
    await this.store.clearCatalogSession();
    this.catalogApi.restoreSession('', '');
  }

  private requireCatalogAdminSession(): void {
    if (!this.catalogApi.getToken()) {
      throw new Error('Sign in as Admin or Dev Admin to import users');
    }
  }

  async removeUser(id: string): Promise<void> {
    await this.recordUndoable('Remove user', () => {
      this.userManager.removeUser(id);
    });
  }

  async updateUser(id: string, patch: UpdateUserRequest): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Update user', () => {
      state = this.userManager.updateUser(id, patch);
    });
    return state;
  }

  async addUserDevice(userId: string, req?: AddUserDeviceRequest): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Add user device', () => {
      state = this.userManager.addDevice(userId, req);
    });
    return state;
  }

  async removeUserDevice(userId: string, deviceId: string): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Remove user device', () => {
      state = this.userManager.removeDevice(userId, deviceId);
    });
    return state;
  }

  async loginUser(userId: string, appDeviceId?: string): Promise<UserInstanceState> {
    return this.userManager.loginUser(userId, appDeviceId);
  }

  async registerUserDevice(userId: string, deviceId: string): Promise<UserInstanceState> {
    return this.userManager.registerDevice(userId, deviceId);
  }

  async fetchUserRoutePass(
    userId: string,
    deviceId: string,
    facilityId: string,
    facilityName?: string,
  ): Promise<UserInstanceState> {
    return this.userManager.fetchRoutePass(userId, deviceId, facilityId, facilityName);
  }

  getUserRoutePassDetails(
    userId: string,
    deviceId: string,
    facilityId: string,
  ): import('@protocol/user-simulator-state').RoutePassDetails {
    return this.userManager.getRoutePassDetails(userId, deviceId, facilityId);
  }

  async setUserRoutePassTamper(
    userId: string,
    deviceId: string,
    req: SetRoutePassTamperRequest,
  ): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Route pass tamper', () => {
      state = this.userManager.setRoutePassTamper(userId, deviceId, req);
    });
    return state;
  }

  async clearUserRoutePass(
    userId: string,
    deviceId: string,
    facilityId: string,
  ): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Clear route pass', () => {
      state = this.userManager.clearRoutePass(userId, deviceId, facilityId);
    });
    return state;
  }

  async regenerateUserDeviceKeys(userId: string, deviceId: string): Promise<UserInstanceState> {
    let state!: UserInstanceState;
    await this.recordUndoable('Regenerate device keys', () => {
      state = this.userManager.regenerateDeviceKeys(userId, deviceId);
    });
    return state;
  }

  async tryOpenWithUserDevice(
    gatewayId: string,
    req: TryOpenWithUserDeviceRequest,
  ): Promise<TryOpenWithUserDeviceResult> {
    const gw = this.require(gatewayId);
    const state = gw.getState();
    const userProfile = this.userManager.getProfile(req.userId);
    if (!userProfile) throw new Error('User not found');

    const record = gw.getDeviceRecord(req.deviceKey);
    if (!record) throw new Error('Device not found');

    const opsKey = state.opsPublicKey ?? userProfile.opsPublicKeyB64 ?? '';

    return tryOpenLockWithUserDevice({
      facilityId: state.facilityId,
      gatewayId,
      deviceKey: req.deviceKey,
      inventoryItem: record.item,
      deviceSim: record.sim,
      opsPublicKeyB64: opsKey,
      userProfile,
      appDeviceId: req.appDeviceId,
      resolveCloudDeviceId: async () => gw.resolveCloudDeviceId(record.item),
      applyUnlock: async () => {
        await gw.unlockDevice(req.deviceKey);
        this.broadcastUpdate(gw.getState());
      },
      emitAccessEvent: async ({ success, denial_reason, userId, role }) => {
        await gw.simulateAccessEvent({
          deviceKey: req.deviceKey,
          action: success ? 'access_granted' : 'access_denied',
          method: 'route_pass',
          success,
          denial_reason,
          actor: {
            user_id: userId,
            role: (role as import('@protocol/access-events').AccessEventActorRole) ?? 'tenant',
            name: userProfile.label,
          },
        });
      },
    });
  }

  async tryOpenWithAccessCode(
    gatewayId: string,
    req: TryOpenWithAccessCodeRequest,
  ): Promise<TryOpenWithAccessCodeResult> {
    const gw = this.require(gatewayId);
    const record = gw.getDeviceRecord(req.deviceKey);
    if (!record) throw new Error('Device not found');

    return tryOpenWithAccessCode({
      deviceKey: req.deviceKey,
      inventoryItem: record.item,
      deviceSim: record.sim,
      enteredCode: req.code,
      applyUnlock: async () => {
        await gw.unlockDevice(req.deviceKey);
        this.broadcastUpdate(gw.getState());
      },
      emitAccessEvent: async ({ success, action, denial_reason, keypad }) => {
        await gw.simulateAccessEvent({
          deviceKey: req.deviceKey,
          action,
          method: 'keypad',
          success,
          denial_reason,
          actor: { role: 'unknown', name: 'Keypad User' },
          keypad,
        });
      },
    });
  }

  async getAppStateAsync(): Promise<AppState> {
    return this.store.loadAppState();
  }

  getHistoryState(): HistoryState {
    return this.history.getState();
  }

  async setActiveInstance(id: string | null): Promise<void> {
    await this.store.saveAppState({ activeInstanceId: id });
  }

  listInstances(): GatewayInstanceState[] {
    return [...this.instances.values()].map((g) => g.getState());
  }

  getInstance(id: string): GatewayInstanceState | null {
    return this.instances.get(id)?.getState() ?? null;
  }

  async createInstance(req: CreateGatewayRequest): Promise<GatewayInstanceState> {
    let state!: GatewayInstanceState;
    await this.recordUndoable('Add gateway', async () => {
      const id = this.generateId();
      const gatewayId = req.gatewayId ?? this.generateId();
      const token = await this.resolveAuthToken(req.token);
      const backendUrl = req.backendUrl || (await this.store.loadSession())?.backendUrl;
      if (!backendUrl) throw new Error('Backend URL is required');

      const profile = emptyProfile({
        id,
        label: req.label,
        backendUrl,
        facilityId: req.facilityId,
        facilityName: req.facilityName,
        gatewayId,
        gatewayName: req.gatewayName?.trim() || undefined,
        gatewaySerial: req.gatewaySerial?.trim() || undefined,
        token,
      });

      const gateway = this.buildInstance(profile);
      this.instances.set(id, gateway);
      await gateway.persist();
      await this.setActiveInstance(id);

      state = gateway.getState();
      this.broadcastUpdate(state);
    });
    return state;
  }

  async getSessionSummary(): Promise<SessionSummary> {
    const session = await this.store.loadSession();
    if (!session?.token || !session.backendUrl) {
      return { available: false };
    }
    return {
      available: true,
      backendUrl: session.backendUrl,
      email: session.email,
    };
  }

  private async resolveAuthToken(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    const fromApi = this.api.getToken();
    if (fromApi) return fromApi;
    const session = await this.store.loadSession();
    if (session?.token) return session.token;
    throw new Error('Not authenticated — sign in or reuse your saved session');
  }

  async removeInstance(id: string): Promise<void> {
    await this.recordUndoable('Remove gateway', async () => {
      const gw = this.instances.get(id);
      gw?.disconnect();
      this.instances.delete(id);
      await this.store.deleteProfile(id);

      const appState = await this.store.loadAppState();
      if (appState.activeInstanceId === id) {
        const remaining = [...this.instances.keys()];
        await this.setActiveInstance(remaining[0] ?? null);
      }
    });
  }

  async persistSession(backendUrl: string, token: string, email: string): Promise<void> {
    await this.store.saveSession({ backendUrl, token, email, updatedAt: new Date().toISOString() });
    this.api.restoreSession(backendUrl, token);
  }

  async connect(id: string): Promise<GatewayInstanceState> {
    const gw = this.require(id);
    await gw.connect();
    return gw.getState();
  }

  disconnect(id: string): GatewayInstanceState {
    const gw = this.require(id);
    gw.disconnect();
    return gw.getState();
  }

  async connectAll(): Promise<GatewayInstanceState[]> {
    const tasks = [...this.instances.entries()].map(async ([, gw]) => {
      const status = gw.getState().connectionStatus;
      if (status === 'connected' || status === 'connecting') return;
      try {
        await gw.connect();
      } catch {
        // Individual connection errors stay on the instance state.
      }
    });
    await Promise.all(tasks);
    return this.listInstances();
  }

  disconnectAll(): GatewayInstanceState[] {
    for (const gw of this.instances.values()) {
      gw.disconnect();
    }
    return this.listInstances();
  }

  async addDevice(id: string, kind: import('@protocol/device-kinds').GatewayInventoryKind) {
    let item!: import('@protocol/device-kinds').DeviceInventoryItem;
    await this.recordUndoable('Add device', async () => {
      item = await this.require(id).addDevice(kind);
    });
    return item;
  }

  async updateDevice(id: string, key: string, patch: Partial<import('@protocol/device-kinds').DeviceInventoryItem>) {
    let result: import('@protocol/device-kinds').DeviceInventoryItem | null = null;
    await this.recordUndoable(
      'Update device',
      async () => {
        result = await this.require(id).updateDevice(key, patch);
      },
      `device:${id}:${key}`,
    );
    return result;
  }

  async updateDeviceSim(
    id: string,
    key: string,
    req: import('@protocol/device-simulator-state').UpdateDeviceSimRequest,
  ) {
    await this.recordUndoable(
      'Update device',
      async () => {
        await this.require(id).updateDeviceSim(key, req);
      },
      `device:${id}:${key}`,
    );
    return this.require(id).getState();
  }

  async resetDevice(id: string, key: string) {
    await this.recordUndoable('Reset device', async () => {
      this.require(id).resetDeviceToDefaults(key);
    });
    return this.require(id).getState();
  }

  async removeDevice(id: string, key: string) {
    let ok = false;
    await this.recordUndoable('Remove device', async () => {
      ok = await this.require(id).removeDevice(key);
    });
    return ok;
  }

  async clearDevices(id: string) {
    await this.recordUndoable('Clear devices', () => {
      this.require(id).clearDevices();
    });
  }

  async syncInventory(id: string) {
    await this.require(id).syncInventory();
    return this.require(id).getState();
  }

  async syncState(id: string) {
    await this.require(id).syncState();
    return this.require(id).getState();
  }

  async simulateAccessEvent(id: string, req: SimulateAccessEventRequest) {
    await this.require(id).simulateAccessEvent(req);
    return this.require(id).getState();
  }

  async setBehavior(id: string, behavior: Partial<import('@protocol/ipc-channels').BehaviorConfig>) {
    await this.recordUndoable('Behavior settings', () => {
      this.require(id).setBehavior(behavior);
    });
    return this.require(id).getState();
  }

  async resetState(id: string) {
    await this.recordUndoable('Reset gateway', () => {
      this.require(id).resetState();
    });
    return this.require(id).getState();
  }

  async undo(): Promise<HydrateResponse> {
    const entry = this.history.popUndo();
    if (!entry) {
      return this.hydrateResponse();
    }
    this.history.pushRedo(entry);
    this.applyingHistory = true;
    try {
      await this.applySnapshot(entry.before);
    } finally {
      this.applyingHistory = false;
    }
    this.notifyHistoryChanged();
    return this.hydrateResponse();
  }

  async redo(): Promise<HydrateResponse> {
    const entry = this.history.popRedo();
    if (!entry) {
      return this.hydrateResponse();
    }
    this.history.pushUndo(entry);
    this.applyingHistory = true;
    try {
      await this.applySnapshot(entry.after);
    } finally {
      this.applyingHistory = false;
    }
    this.notifyHistoryChanged();
    return this.hydrateResponse();
  }

  async fetchGatewayCloud(id: string): Promise<GatewayInstanceState> {
    const gw = this.require(id);
    const profile = await this.store.getProfile(id);
    if (!profile?.token) throw new Error('Gateway profile missing auth token');

    const state = gw.getState();
    this.api.restoreSession(state.backendUrl, profile.token);
    const record = await this.api.getGateway(state.gatewayId);

    gw.applySettings({
      gatewayName: record.name,
      gatewaySerial: record.mac_address?.trim() ?? '',
    });
    await gw.persist();
    const next = gw.getState();
    this.broadcastUpdate(next);
    return next;
  }

  async updateGatewaySettings(
    id: string,
    patch: import('@protocol/ipc-channels').UpdateGatewaySettingsRequest,
  ): Promise<GatewayInstanceState> {
    let next!: GatewayInstanceState;
    await this.recordUndoable('Gateway settings', async () => {
      const gw = this.require(id);
      const profile = await this.store.getProfile(id);
      if (!profile?.token) throw new Error('Gateway profile missing auth token');

      const state = gw.getState();
      this.api.restoreSession(state.backendUrl, profile.token);

      const cloudPatch: { name?: string; mac_address?: string | null } = {};
      if (patch.gatewayName !== undefined) {
        const name = patch.gatewayName.trim();
        if (!name) throw new Error('Gateway name cannot be empty');
        cloudPatch.name = name;
      }
      if (patch.gatewaySerial !== undefined) {
        cloudPatch.mac_address = patch.gatewaySerial.trim() || null;
      }

      let cloudRecord: import('@protocol/ipc-channels').GatewayRecordDetail | null = null;
      if (Object.keys(cloudPatch).length > 0) {
        cloudRecord = await this.api.updateGateway(state.gatewayId, cloudPatch);
      }

      gw.applySettings({
        label: patch.label,
        gatewayName: cloudRecord?.name ?? patch.gatewayName,
        gatewaySerial:
          cloudRecord?.mac_address?.trim() ??
          (patch.gatewaySerial !== undefined ? patch.gatewaySerial.trim() : undefined),
      });
      await gw.persist();
      next = gw.getState();
      this.broadcastUpdate(next);
    });
    return next;
  }

  async saveProfile(id: string) {
    await this.require(id).persist();
  }

  async loadProfiles() {
    return this.store.loadProfiles();
  }

  getBackendClient() {
    return this.api;
  }

  private buildInstance(profile: GatewayProfile): SimulatedGateway {
    const ctx: GatewayBuildContext = {
      store: this.store,
      onUpdate: (state) => this.broadcastUpdate(state),
      onLog: (entry) => this.broadcastLog(profile.id, entry),
    };
    if (this.createGateway) {
      return this.createGateway(profile, ctx);
    }
    return new SimulatedGateway({
      id: profile.id,
      label: profile.label,
      backendUrl: profile.backendUrl,
      facilityId: profile.facilityId,
      facilityName: profile.facilityName,
      gatewayId: profile.gatewayId,
      gatewayName: profile.gatewayName,
      gatewaySerial: profile.gatewaySerial,
      token: profile.token,
      devices: profile.devices,
      deviceRecords: profile.deviceRecords,
      behavior: profile.behavior,
      connectOnRestore: profile.connectOnRestore,
      store: ctx.store,
      onUpdate: ctx.onUpdate,
      onLog: ctx.onLog,
    });
  }

  private require(id: string): SimulatedGateway {
    const gw = this.instances.get(id);
    if (!gw) throw new Error(`Gateway instance not found: ${id}`);
    return gw;
  }

  private async captureSnapshot(): Promise<SimulatorSnapshot> {
    const profiles = [...this.instances.values()].map((gw) => structuredClone(gw.toProfile()));
    const appState = await this.store.loadAppState();
    return {
      profiles,
      userProfiles: this.userManager.exportProfiles(),
      activeInstanceId: appState.activeInstanceId,
      activeUserId: appState.activeUserId ?? null,
    };
  }

  private async applySnapshot(snapshot: SimulatorSnapshot): Promise<void> {
    const snapshotIds = new Set(snapshot.profiles.map((p) => p.id));
    const userProfiles = snapshot.userProfiles ?? [];

    for (const id of [...this.instances.keys()]) {
      if (!snapshotIds.has(id)) {
        this.instances.get(id)?.disconnect();
        this.instances.delete(id);
        await this.store.deleteProfile(id);
      }
    }

    for (const profile of snapshot.profiles) {
      const existing = this.instances.get(profile.id);
      if (existing) {
        const previousDevices = [...existing.getState().devices];
        existing.importProfile(profile);
        await existing.persist();
        if (this.applyingHistory) {
          await existing.syncLiveAfterProfileRestore(previousDevices);
        }
        this.broadcastUpdate(existing.getState());
      } else {
        const gateway = this.buildInstance(profile);
        this.instances.set(profile.id, gateway);
        await gateway.persist();
        this.broadcastUpdate(gateway.getState());
      }
    }

    const userIds = new Set(userProfiles.map((p) => p.id));
    for (const stored of await this.store.loadUserProfiles()) {
      if (!userIds.has(stored.id)) {
        await this.store.deleteUserProfile(stored.id);
      }
    }
    this.userManager.loadFromProfiles(userProfiles);
    for (const profile of userProfiles) {
      await this.store.saveUserProfile(profile);
      const userState = this.userManager.getState(profile.id);
      if (userState) this.broadcastUserUpdated(userState);
    }

    const appState = await this.store.loadAppState();
    await this.store.saveAppState({
      ...appState,
      activeInstanceId: snapshot.activeInstanceId,
      activeUserId: snapshot.activeUserId ?? null,
    });
  }

  private async recordUndoable(
    label: string,
    mutate: () => void | Promise<void>,
    coalesceKey?: string,
  ): Promise<void> {
    if (this.applyingHistory) {
      await mutate();
      return;
    }

    const before = await this.captureSnapshot();
    await mutate();
    const after = await this.captureSnapshot();
    if (snapshotsEqual(before, after)) {
      return;
    }

    if (coalesceKey) {
      const last = this.history.peekUndo();
      if (last?.coalesceKey === coalesceKey) {
        this.history.coalesceLatestAfter(after);
        this.notifyHistoryChanged();
        return;
      }
    }

    this.history.push({ label, before, after, coalesceKey });
    this.notifyHistoryChanged();
  }

  private async hydrateResponse(): Promise<HydrateResponse> {
    const appState = await this.store.loadAppState();
    return this.buildHydrateResponse(appState);
  }

  private buildHydrateResponse(appState: AppState): HydrateResponse {
    return {
      instances: this.listInstances(),
      users: this.listUsers(),
      activeInstanceId: appState.activeInstanceId,
      activeUserId: appState.activeUserId ?? null,
      sidebarCatalog: appState.sidebarCatalog ?? 'gateways',
    };
  }

  private broadcastUserUpdated(state: UserInstanceState): void {
    if (!this.window) return;
    this.window.webContents.send(IPC_EVENTS.USER_UPDATED, { userId: state.id, state });
  }

  private notifyHistoryChanged(): void {
    const state = this.history.getState();
    updateEditMenuHistory(state);
    if (!this.window) return;
    this.window.webContents.send(IPC_EVENTS.HISTORY_CHANGED, state);
  }

  private broadcastUpdate(state: GatewayInstanceState): void {
    if (!this.window) return;
    const event: GatewayUpdatedEvent = { instanceId: state.id, state };
    this.window.webContents.send(IPC_EVENTS.GATEWAY_UPDATED, event);
  }

  private broadcastLog(instanceId: string, entry: import('@protocol/ipc-channels').GatewayEventEntry): void {
    if (!this.window) return;
    const event: GatewayLogEvent = { instanceId, entry };
    this.window.webContents.send(IPC_EVENTS.GATEWAY_LOG, event);
  }
}

let sharedManager: GatewayManager | undefined;

export function getGatewayManager(): GatewayManager {
  if (!sharedManager) {
    sharedManager = new GatewayManager();
  }
  return sharedManager;
}

/** Lazy singleton — avoids touching Electron `app` at module load (test-friendly). */
export const gatewayManager = new Proxy({} as GatewayManager, {
  get(_target, prop) {
    const mgr = getGatewayManager();
    const value = Reflect.get(mgr, prop, mgr) as unknown;
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(mgr) : value;
  },
});
