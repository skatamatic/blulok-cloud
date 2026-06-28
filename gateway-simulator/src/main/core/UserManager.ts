import type { FileStateStore, UserProfile } from '../persistence/FileStateStore';
import type {
  AddUserDeviceRequest,
  CreateUserRequest,
  ImportCloudUserRequest,
  SetRoutePassTamperRequest,
  UpdateUserRequest,
  RoutePassDetails,
  UserInstanceState,
} from '@protocol/user-simulator-state';
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
import { isJwtFresh, parseJwtExpiry } from '../auth/session-jwt.utils';
import { parseRoutePassExpiry, buildRoutePassDetails } from '../users/route-pass-jwt.utils';

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
    this.profiles.clear();
    for (const profile of profiles) {
      this.profiles.set(profile.id, structuredClone(profile));
    }
  }

  exportProfiles(): UserProfile[] {
    return [...this.profiles.values()].map((p) => structuredClone(p));
  }

  listStates(): UserInstanceState[] {
    return [...this.profiles.values()].map((p) => toUserInstanceState(p));
  }

  getState(id: string): UserInstanceState | null {
    const profile = this.profiles.get(id);
    return profile ? toUserInstanceState(profile) : null;
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
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  removeUser(id: string): void {
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
    const state = toUserInstanceState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  addDevice(userId: string, req: AddUserDeviceRequest = {}): UserInstanceState {
    const profile = this.require(userId);
    const device = createUserDevice(newUserDeviceId(), req);
    profile.devices.push(device);
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = toUserInstanceState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  removeDevice(userId: string, deviceId: string): UserInstanceState {
    const profile = this.require(userId);
    profile.devices = profile.devices.filter((d) => d.id !== deviceId);
    profile.updatedAt = new Date().toISOString();
    void this.persist(profile);
    const state = toUserInstanceState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  async loginUser(userId: string, appDeviceId?: string): Promise<UserInstanceState> {
    const profile = this.require(userId);
    await this.ensureSession(profile, appDeviceId);
    profile.updatedAt = new Date().toISOString();
    await this.persist(profile);
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
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
    const state = toUserInstanceState(profile);
    this.onUserUpdated?.(state);
    return state;
  }

  importProfile(profile: UserProfile): void {
    this.profiles.set(profile.id, structuredClone(profile));
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

  private async persist(profile: UserProfile): Promise<void> {
    await this.store.saveUserProfile(profile);
  }
}
