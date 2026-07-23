import { randomUUID } from 'crypto';
import type { FileStateStore, UserProfile } from '../persistence/FileStateStore';
import type {
  AddUserDeviceRequest,
  AppRealtimeEventEntry,
  AppRealtimeState,
  CreateUserRequest,
  ImportCloudUserRequest,
  SetRoutePassTamperRequest,
  UpdateUserRequest,
  RoutePassDetails,
  UserInstanceState,
} from '@protocol/user-simulator-state';
import { EMPTY_APP_REALTIME_STATE } from '@protocol/user-simulator-state';
import {
  createLinkedUserDevice,
  createUserDevice,
  emptyUserProfile,
  findCachedPass,
  findUserDevice,
  newUserDeviceId,
  toUserInstanceState,
  upsertCachedPass,
} from '../users/user-device.utils';
import { mobileApiClient, type MobileApiClient } from '../auth/MobileApiClient';
import type { CloudUserDetail, MintUserSessionResult } from '../auth/BackendClient';
import type { MobileFacilitySummary } from '../auth/MobileApiClient';
import { isJwtFresh, parseJwtExpiry } from '../auth/session-jwt.utils';
import { parseRoutePassExpiry, buildRoutePassDetails } from '../users/route-pass-jwt.utils';
import { AppRealtimeConnection } from '../net/AppRealtimeConnection';

type AppRealtimeRuntime = {
  status: AppRealtimeState['status'];
  facilityId?: string;
  subscriptionId?: string;
  lastError?: string;
  connectedAt?: string;
  events: AppRealtimeEventEntry[];
  connection: AppRealtimeConnection | null;
};

export type UserSessionProvider = {
  fetchCloudUser: (cloudUserId: string) => Promise<CloudUserDetail>;
  mintUserSession: (cloudUserId: string) => Promise<MintUserSessionResult>;
  getBackendUrl: () => string;
};

export type UserManagerDeps = {
  store: FileStateStore;
  generateId: () => string;
  mobileApi?: MobileApiClient;
  sessionProvider?: UserSessionProvider;
  onUserUpdated?: (state: UserInstanceState) => void;
};

export class UserManager {
  private profiles = new Map<string, UserProfile>();
  /** Ephemeral /ws/app sessions — never persisted (opt-in “open the app”). */
  private readonly appRealtime = new Map<string, AppRealtimeRuntime>();
  private readonly store: FileStateStore;
  private readonly generateId: () => string;
  private readonly mobileApi: MobileApiClient;
  private readonly sessionProvider?: UserSessionProvider;
  private readonly onUserUpdated?: (state: UserInstanceState) => void;

  constructor(deps: UserManagerDeps) {
    this.store = deps.store;
    this.generateId = deps.generateId;
    this.mobileApi = deps.mobileApi ?? mobileApiClient;
    this.sessionProvider = deps.sessionProvider;
    this.onUserUpdated = deps.onUserUpdated;
  }

  loadFromProfiles(profiles: UserProfile[]): void {
    for (const id of this.appRealtime.keys()) {
      this.teardownAppRealtime(id, { emit: false });
    }
    this.profiles.clear();
    for (const profile of profiles) {
      this.profiles.set(profile.id, structuredClone(profile));
    }
  }

  exportProfiles(): UserProfile[] {
    return [...this.profiles.values()].map((p) => structuredClone(p));
  }

  listStates(): UserInstanceState[] {
    return [...this.profiles.values()].map((p) => this.buildState(p));
  }

  getState(id: string): UserInstanceState | null {
    const profile = this.profiles.get(id);
    return profile ? this.buildState(profile) : null;
  }

  getProfile(id: string): UserProfile | null {
    const profile = this.profiles.get(id);
    return profile ? structuredClone(profile) : null;
  }

  findByCloudUserId(cloudUserId: string): UserProfile | null {
    for (const profile of this.profiles.values()) {
      if (profile.cloudUserId === cloudUserId) return profile;
    }
    return null;
  }

  /** @deprecated Legacy manual user — prefer importCloudUser. */
  createUser(req: CreateUserRequest): UserInstanceState {
    const id = this.generateId();
    const profile = emptyUserProfile({
      id,
      label: req.label.trim() || req.email,
      backendUrl: req.backendUrl.replace(/\/+$/, ''),
      email: req.email.trim(),
      password: req.password,
    });
    this.profiles.set(id, profile);
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  async importCloudUser(req: ImportCloudUserRequest): Promise<UserInstanceState> {
    if (!this.sessionProvider) {
      throw new Error('Admin sign-in required — use Import user to sign in');
    }
    const backendUrl = this.sessionProvider.getBackendUrl();
    if (!backendUrl) throw new Error('Backend URL not configured');

    if (this.findByCloudUserId(req.cloudUserId)) {
      throw new Error('User is already in the simulator');
    }

    const [detail, session] = await Promise.all([
      this.sessionProvider.fetchCloudUser(req.cloudUserId),
      this.sessionProvider.mintUserSession(req.cloudUserId),
    ]);

    const email =
      detail.email?.trim() ||
      detail.phoneNumber?.trim() ||
      session.user.email?.trim() ||
      req.cloudUserId;
    const displayName = `${detail.firstName ?? ''} ${detail.lastName ?? ''}`.trim();
    const label = req.label?.trim() || displayName || email;

    const id = this.generateId();
    const profile = emptyUserProfile({
      id,
      label,
      backendUrl,
      email,
      cloudUserId: req.cloudUserId,
      importedFromCloud: true,
      role: session.user.role,
      sessionToken: session.token,
      sessionTokenExpiresAt: session.expiresAt ?? parseJwtExpiry(session.token),
      opsPublicKeyB64: session.opsPublicKeyB64,
    });

    profile.devices = (detail.devices ?? [])
      .filter((d) => d.status !== 'revoked')
      .map((d) => createLinkedUserDevice(newUserDeviceId(), d));

    profile.updatedAt = new Date().toISOString();
    this.profiles.set(id, profile);
    await this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  removeUser(id: string): void {
    this.teardownAppRealtime(id, { emit: false });
    this.profiles.delete(id);
    void this.store.deleteUserProfile(id);
  }

  updateUser(id: string, patch: UpdateUserRequest): UserInstanceState {
    const profile = this.require(id);
    if (patch.label !== undefined) profile.label = patch.label.trim() || profile.email;
    if (patch.backendUrl !== undefined) profile.backendUrl = patch.backendUrl.replace(/\/+$/, '');
    if (patch.email !== undefined) profile.email = patch.email.trim();
    if (patch.password !== undefined) profile.password = patch.password;
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  addDevice(userId: string, req: AddUserDeviceRequest = {}): UserInstanceState {
    const profile = this.require(userId);
    const device = createUserDevice(newUserDeviceId(), req);
    profile.devices.push(device);
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  removeDevice(userId: string, deviceId: string): UserInstanceState {
    const profile = this.require(userId);
    profile.devices = profile.devices.filter((d) => d.id !== deviceId);
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  async loginUser(userId: string, appDeviceId?: string): Promise<UserInstanceState> {
    const profile = this.require(userId);
    await this.ensureSession(profile, appDeviceId);
    profile.updatedAt = new Date().toISOString();
    await this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  async registerDevice(userId: string, deviceId: string): Promise<UserInstanceState> {
    const profile = this.require(userId);
    await this.ensureSession(profile);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    if (device.linkedFromBackend && device.hasLocalKeys === false) {
      throw new Error('Cloud-linked device has no local keys — regenerate keys or add a new simulator device');
    }

    const result = await this.mobileApi.registerKey(profile.backendUrl, profile.sessionToken!, {
      appDeviceId: device.appDeviceId,
      platform: device.platform,
      deviceName: device.deviceName,
      publicKeyB64: device.publicKeyB64,
    });
    device.backendDeviceId = result.deviceId;
    device.registeredAt = new Date().toISOString();
    device.linkedFromBackend = false;
    device.hasLocalKeys = true;
    profile.isDeviceRegistered = true;
    profile.keyGenerationRequired = false;
    profile.updatedAt = new Date().toISOString();
    await this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  async fetchRoutePass(
    userId: string,
    deviceId: string,
    facilityId: string,
    facilityName?: string,
  ): Promise<UserInstanceState> {
    const profile = this.require(userId);
    await this.ensureSession(profile);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    if (!device.backendDeviceId) throw new Error('Register device key with backend first');

    const result = await this.mobileApi.requestRoutePass(
      profile.backendUrl,
      profile.sessionToken!,
      device.appDeviceId,
      facilityId,
    );
    upsertCachedPass(device, {
      facilityId,
      facilityName,
      jwt: result.routePass,
      fetchedAt: new Date().toISOString(),
      expiresAt: result.expiresAt ?? parseRoutePassExpiry(result.routePass),
      tamper: 'none',
    });
    profile.updatedAt = new Date().toISOString();
    await this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  setRoutePassTamper(
    userId: string,
    deviceId: string,
    req: SetRoutePassTamperRequest,
  ): UserInstanceState {
    const profile = this.require(userId);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    const pass = findCachedPass(device, req.facilityId);
    if (!pass) throw new Error('No cached route pass for this facility');
    pass.tamper = req.tamper;
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  clearRoutePass(userId: string, deviceId: string, facilityId: string): UserInstanceState {
    const profile = this.require(userId);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    device.cachedRoutePasses = device.cachedRoutePasses.filter((p) => p.facilityId !== facilityId);
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  getRoutePassDetails(userId: string, deviceId: string, facilityId: string): RoutePassDetails {
    const profile = this.require(userId);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    const pass = findCachedPass(device, facilityId);
    if (!pass?.jwt) throw new Error('No cached route pass for this facility');
    return buildRoutePassDetails(pass);
  }

  regenerateDeviceKeys(userId: string, deviceId: string): UserInstanceState {
    const profile = this.require(userId);
    const device = profile.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('Device not found');
    const fresh = createUserDevice(deviceId, {
      appDeviceId: device.appDeviceId,
      platform: device.platform,
      deviceName: device.deviceName,
    });
    Object.assign(device, fresh, {
      backendDeviceId: undefined,
      registeredAt: undefined,
      cachedRoutePasses: [],
      linkedFromBackend: false,
      hasLocalKeys: true,
    });
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  importProfile(profile: UserProfile): void {
    this.profiles.set(profile.id, structuredClone(profile));
  }

  /**
   * Facilities this user's JWT can access (GET /facilities) — use for App realtime picker.
   */
  async listAccessibleFacilities(userId: string): Promise<MobileFacilitySummary[]> {
    const profile = this.require(userId);
    await this.ensureSession(profile);
    if (!profile.sessionToken) throw new Error('No session token — refresh session first');
    return this.mobileApi.listFacilities(profile.backendUrl, profile.sessionToken, { limit: 200 });
  }

  /**
   * Opt-in: simulate the user opening the phone app — connect `/ws/app` and subscribe.
   * Does not auto-reconnect; call again after Close / unexpected drop.
   */
  async connectAppRealtime(userId: string, facilityId: string): Promise<UserInstanceState> {
    const profile = this.require(userId);
    const trimmedFacility = facilityId.trim();
    if (!trimmedFacility) throw new Error('facility_id is required');

    const existing = this.appRealtime.get(userId);
    if (existing?.status === 'connecting' || existing?.status === 'connected') {
      throw new Error('App realtime already open — close it first');
    }

    await this.ensureSession(profile);
    if (!profile.sessionToken) throw new Error('No session token — refresh session first');

    const runtime = this.ensureAppRealtimeRuntime(userId);
    runtime.status = 'connecting';
    runtime.facilityId = trimmedFacility;
    runtime.lastError = undefined;
    runtime.subscriptionId = undefined;
    runtime.connectedAt = undefined;
    this.emitUser(profile);

    const connection = new AppRealtimeConnection({
      backendUrl: profile.backendUrl,
      token: profile.sessionToken,
      facilityId: trimmedFacility,
      onLog: (direction, summary, payload, eventName) => {
        this.appendAppRealtimeLog(userId, { direction, summary, payload, eventName });
      },
      onClose: (code, reason) => {
        const rt = this.appRealtime.get(userId);
        if (!rt || rt.connection !== connection) return;
        rt.connection = null;
        rt.subscriptionId = undefined;
        if (connection.wasClosedIntentionally()) {
          rt.status = 'disconnected';
          rt.lastError = undefined;
        } else {
          rt.status = 'error';
          rt.lastError = `Closed (${code})${reason ? `: ${reason}` : ''}`;
        }
        this.emitUser(this.require(userId));
      },
    });

    runtime.connection = connection;

    try {
      await connection.connect();
      runtime.status = 'connected';
      runtime.subscriptionId = connection.getSubscriptionId() ?? undefined;
      runtime.connectedAt = new Date().toISOString();
      runtime.lastError = undefined;
      profile.updatedAt = new Date().toISOString();
      await this.persist(profile);
      return this.emitUser(profile);
    } catch (err) {
      try {
        connection.disconnect();
      } catch {
        /* ignore */
      }
      runtime.connection = null;
      runtime.status = 'error';
      runtime.lastError = err instanceof Error ? err.message : String(err);
      this.appendAppRealtimeLog(userId, {
        direction: 'system',
        summary: `Connect failed: ${runtime.lastError}`,
      });
      this.emitUser(profile);
      throw err;
    }
  }

  disconnectAppRealtime(userId: string): UserInstanceState {
    this.require(userId);
    this.teardownAppRealtime(userId, { emit: false });
    return this.emitUser(this.require(userId));
  }

  clearAppRealtimeEvents(userId: string): UserInstanceState {
    this.require(userId);
    const runtime = this.ensureAppRealtimeRuntime(userId);
    runtime.events = [];
    return this.emitUser(this.require(userId));
  }

  private async ensureSession(profile: UserProfile, appDeviceId?: string): Promise<void> {
    if (isJwtFresh(profile.sessionToken)) return;

    if (profile.importedFromCloud && profile.cloudUserId && this.sessionProvider) {
      await this.applyMintedSession(profile, await this.sessionProvider.mintUserSession(profile.cloudUserId));
      return;
    }

    if (profile.password) {
      const device = appDeviceId ? findUserDevice(profile, appDeviceId) : profile.devices[0];
      const result = await this.mobileApi.login(
        profile.backendUrl,
        profile.email,
        profile.password,
        device?.appDeviceId,
        device?.platform,
      );
      profile.sessionToken = result.token;
      profile.sessionTokenExpiresAt = parseJwtExpiry(result.token);
      profile.cloudUserId = result.userId;
      profile.role = result.role;
      profile.keyGenerationRequired = result.keyGenerationRequired;
      profile.isDeviceRegistered = result.isDeviceRegistered;
      if (result.opsPublicKeyB64) profile.opsPublicKeyB64 = result.opsPublicKeyB64;
      return;
    }

    throw new Error('Session expired — refresh session or re-import user');
  }

  private applyMintedSession(profile: UserProfile, session: MintUserSessionResult): void {
    profile.sessionToken = session.token;
    profile.sessionTokenExpiresAt = session.expiresAt ?? parseJwtExpiry(session.token);
    profile.cloudUserId = session.user.id;
    profile.role = session.user.role;
    profile.keyGenerationRequired = false;
    if (session.opsPublicKeyB64) profile.opsPublicKeyB64 = session.opsPublicKeyB64;
  }

  private require(id: string): UserProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`User not found: ${id}`);
    return profile;
  }

  private buildState(profile: UserProfile): UserInstanceState {
    return {
      ...toUserInstanceState(profile),
      appRealtime: this.snapshotAppRealtime(profile.id),
    };
  }

  private emitUser(profile: UserProfile): UserInstanceState {
    const state = this.buildState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  private snapshotAppRealtime(userId: string): AppRealtimeState {
    const runtime = this.appRealtime.get(userId);
    if (!runtime) return { ...EMPTY_APP_REALTIME_STATE, events: [] };
    return {
      status: runtime.status,
      facilityId: runtime.facilityId,
      subscriptionId: runtime.subscriptionId,
      lastError: runtime.lastError,
      connectedAt: runtime.connectedAt,
      events: [...runtime.events].slice(-200),
    };
  }

  private ensureAppRealtimeRuntime(userId: string): AppRealtimeRuntime {
    let runtime = this.appRealtime.get(userId);
    if (!runtime) {
      runtime = {
        status: 'disconnected',
        events: [],
        connection: null,
      };
      this.appRealtime.set(userId, runtime);
    }
    return runtime;
  }

  private appendAppRealtimeLog(
    userId: string,
    entry: Omit<AppRealtimeEventEntry, 'id' | 'timestamp'> & { eventName?: string },
  ): void {
    const runtime = this.ensureAppRealtimeRuntime(userId);
    runtime.events.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      direction: entry.direction,
      summary: entry.summary,
      eventName: entry.eventName,
      payload: entry.payload,
    });
    if (runtime.events.length > 500) runtime.events.shift();
    const profile = this.profiles.get(userId);
    if (profile) this.emitUser(profile);
  }

  private teardownAppRealtime(userId: string, opts: { emit: boolean }): void {
    const runtime = this.appRealtime.get(userId);
    if (!runtime) return;
    try {
      runtime.connection?.disconnect();
    } catch {
      /* ignore */
    }
    runtime.connection = null;
    runtime.status = 'disconnected';
    runtime.subscriptionId = undefined;
    runtime.connectedAt = undefined;
    runtime.lastError = undefined;
    if (opts.emit) {
      const profile = this.profiles.get(userId);
      if (profile) this.emitUser(profile);
    }
  }

  private async persist(profile: UserProfile): Promise<void> {
    await this.store.saveUserProfile(profile);
  }
}
