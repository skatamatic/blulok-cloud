import { copyFile, mkdir, readdir, rename, unlink } from 'fs/promises';
import { join } from 'path';
import type { BehaviorConfig } from '@protocol/ipc-channels';
import { DEFAULT_BEHAVIOR } from '@protocol/ipc-channels';
import { DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION } from '../core/gateway-firmware.utils';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import type { SimulatedDeviceRecord } from '@protocol/device-simulator-state';
import type { UserProfile } from '@protocol/user-simulator-state';
import {
  atomicWriteJson,
  readJsonFile,
  safeProfileFileName,
  type JsonReadSource,
} from './atomic-json-file';

export type GatewayProfile = {
  id: string;
  label: string;
  backendUrl: string;
  facilityId: string;
  facilityName?: string;
  gatewayId: string;
  gatewayName?: string;
  gatewaySerial?: string;
  gatewayFirmwareVersion?: string;
  /** Auth token for reconnect — stored main-process only, never sent to renderer. */
  token: string;
  /** @deprecated Legacy inventory-only persistence — migrated to deviceRecords on load. */
  devices?: DeviceInventoryItem[];
  deviceRecords?: SimulatedDeviceRecord[];
  behavior: BehaviorConfig;
  /** When true, app startup reconnects if autoReconnect behavior is enabled. */
  connectOnRestore?: boolean;
  updatedAt: string;
};

export type SimulatorSession = {
  backendUrl: string;
  token: string;
  email: string;
  updatedAt: string;
};

/** Admin session for listing/importing cloud users — independent of gateway setup login. */
export type CatalogSession = SimulatorSession & {
  role: string;
};

export type AppState = {
  activeInstanceId: string | null;
  activeUserId?: string | null;
  sidebarCatalog?: 'gateways' | 'users';
};

export interface IStateStore {
  loadProfiles(): Promise<GatewayProfile[]>;
  saveProfile(profile: GatewayProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  getProfile(id: string): Promise<GatewayProfile | null>;
  loadUserProfiles(): Promise<UserProfile[]>;
  saveUserProfile(profile: UserProfile): Promise<void>;
  deleteUserProfile(id: string): Promise<void>;
  getUserProfile(id: string): Promise<UserProfile | null>;
  loadSession(): Promise<SimulatorSession | null>;
  saveSession(session: SimulatorSession): Promise<void>;
  loadCatalogSession(): Promise<CatalogSession | null>;
  saveCatalogSession(session: CatalogSession): Promise<void>;
  clearCatalogSession(): Promise<void>;
  loadAppState(): Promise<AppState>;
  saveAppState(state: AppState): Promise<void>;
}

export class FileStateStore implements IStateStore {
  private writeChain: Promise<void> = Promise.resolve();
  private gatewayMigrationPromise: Promise<void> | null = null;
  private userMigrationPromise: Promise<void> | null = null;

  constructor(private readonly baseDir: string) {}

  private legacyProfilesPath(): string {
    return join(this.baseDir, 'gateway-profiles.json');
  }

  private legacyUserProfilesPath(): string {
    return join(this.baseDir, 'user-profiles.json');
  }

  private gatewayProfilesDir(): string {
    return join(this.baseDir, 'gateway-profiles');
  }

  private userProfilesDir(): string {
    return join(this.baseDir, 'user-profiles');
  }

  private gatewayProfilePath(id: string): string {
    return join(this.gatewayProfilesDir(), safeProfileFileName(id));
  }

  private userProfilePath(id: string): string {
    return join(this.userProfilesDir(), safeProfileFileName(id));
  }

  private sessionPath(): string {
    return join(this.baseDir, 'session.json');
  }

  private catalogSessionPath(): string {
    return join(this.baseDir, 'catalog-session.json');
  }

  private appStatePath(): string {
    return join(this.baseDir, 'app-state.json');
  }

  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private logRecovery(kind: string, source: JsonReadSource, detail?: string): void {
    if (source === 'primary') return;
    const suffix = detail ? ` (${detail})` : '';
    console.warn(`[gateway-simulator] Recovered ${kind} from ${source}${suffix}`);
  }

  private async archiveLegacyFile(legacyPath: string): Promise<void> {
    const archivedPath = `${legacyPath}.migrated`;
    try {
      await rename(legacyPath, archivedPath);
    } catch {
      try {
        await copyFile(legacyPath, archivedPath);
        await unlink(legacyPath);
      } catch {
        /* best effort — per-profile files are already written */
      }
    }
  }

  private async migrateLegacyBundle<T extends { id?: string }>(
    legacyPath: string,
    targetDir: string,
    profilePath: (id: string) => string,
    label: string,
  ): Promise<void> {
    await mkdir(targetDir, { recursive: true });

    const existing = await readdir(targetDir).catch(() => [] as string[]);
    if (existing.some((entry) => entry.endsWith('.json'))) {
      return;
    }

    const { data, source } = await readJsonFile<T[]>(legacyPath, []);
    const legacyProfiles = Array.isArray(data) ? data : [];
    if (legacyProfiles.length === 0) {
      return;
    }

    this.logRecovery(label, source, legacyPath);

    for (const profile of legacyProfiles) {
      if (!profile?.id) continue;
      await atomicWriteJson(profilePath(profile.id), profile);
    }

    await this.archiveLegacyFile(legacyPath);
  }

  private ensureGatewayMigration(): Promise<void> {
    if (!this.gatewayMigrationPromise) {
      this.gatewayMigrationPromise = this.migrateLegacyBundle<GatewayProfile>(
        this.legacyProfilesPath(),
        this.gatewayProfilesDir(),
        (id) => this.gatewayProfilePath(id),
        'gateway profiles',
      );
    }
    return this.gatewayMigrationPromise;
  }

  private ensureUserMigration(): Promise<void> {
    if (!this.userMigrationPromise) {
      this.userMigrationPromise = this.migrateLegacyBundle<UserProfile>(
        this.legacyUserProfilesPath(),
        this.userProfilesDir(),
        (id) => this.userProfilePath(id),
        'user profiles',
      );
    }
    return this.userMigrationPromise;
  }

  private async loadEntityDir<T extends { id: string }>(
    dir: string,
    label: string,
  ): Promise<T[]> {
    const entries = await readdir(dir).catch(() => [] as string[]);
    const profiles: T[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = join(dir, entry);
      const { data, source } = await readJsonFile<T | null>(filePath, null);
      if (!data?.id) continue;
      if (source !== 'primary') {
        this.logRecovery(`${label} ${data.id}`, source);
      }
      profiles.push(data);
    }

    return profiles;
  }

  async loadProfiles(): Promise<GatewayProfile[]> {
    await this.ensureGatewayMigration();
    return this.loadEntityDir<GatewayProfile>(this.gatewayProfilesDir(), 'gateway profile');
  }

  async saveProfile(profile: GatewayProfile): Promise<void> {
    await this.ensureGatewayMigration();
    await this.withWriteLock(async () => {
      const next: GatewayProfile = { ...profile, updatedAt: new Date().toISOString() };
      await atomicWriteJson(this.gatewayProfilePath(profile.id), next);
    });
  }

  async deleteProfile(id: string): Promise<void> {
    await this.ensureGatewayMigration();
    await this.withWriteLock(async () => {
      await unlink(this.gatewayProfilePath(id)).catch(() => undefined);
      await unlink(`${this.gatewayProfilePath(id)}.bak`).catch(() => undefined);
    });
  }

  async getProfile(id: string): Promise<GatewayProfile | null> {
    await this.ensureGatewayMigration();
    const { data, source } = await readJsonFile<GatewayProfile | null>(
      this.gatewayProfilePath(id),
      null,
    );
    if (!data?.id) return null;
    if (source !== 'primary') {
      this.logRecovery(`gateway profile ${id}`, source);
    }
    return data;
  }

  async loadUserProfiles(): Promise<UserProfile[]> {
    await this.ensureUserMigration();
    return this.loadEntityDir<UserProfile>(this.userProfilesDir(), 'user profile');
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    await this.ensureUserMigration();
    await this.withWriteLock(async () => {
      const next: UserProfile = { ...profile, updatedAt: new Date().toISOString() };
      await atomicWriteJson(this.userProfilePath(profile.id), next);
    });
  }

  async deleteUserProfile(id: string): Promise<void> {
    await this.ensureUserMigration();
    await this.withWriteLock(async () => {
      await unlink(this.userProfilePath(id)).catch(() => undefined);
      await unlink(`${this.userProfilePath(id)}.bak`).catch(() => undefined);
    });
  }

  async getUserProfile(id: string): Promise<UserProfile | null> {
    await this.ensureUserMigration();
    const { data, source } = await readJsonFile<UserProfile | null>(this.userProfilePath(id), null);
    if (!data?.id) return null;
    if (source !== 'primary') {
      this.logRecovery(`user profile ${id}`, source);
    }
    return data;
  }

  async loadSession(): Promise<SimulatorSession | null> {
    const { data, source } = await readJsonFile<SimulatorSession | null>(this.sessionPath(), null);
    if (!data) return null;
    if (source !== 'primary') {
      this.logRecovery('session', source);
    }
    return data;
  }

  async saveSession(session: SimulatorSession): Promise<void> {
    await this.withWriteLock(async () => {
      await atomicWriteJson(this.sessionPath(), {
        ...session,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async loadCatalogSession(): Promise<CatalogSession | null> {
    const { data, source } = await readJsonFile<CatalogSession | null>(this.catalogSessionPath(), null);
    if (!data) return null;
    if (source !== 'primary') {
      this.logRecovery('catalog session', source);
    }
    return data;
  }

  async saveCatalogSession(session: CatalogSession): Promise<void> {
    await this.withWriteLock(async () => {
      await atomicWriteJson(this.catalogSessionPath(), {
        ...session,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async clearCatalogSession(): Promise<void> {
    await this.withWriteLock(async () => {
      await unlink(this.catalogSessionPath()).catch(() => undefined);
      await unlink(`${this.catalogSessionPath()}.bak`).catch(() => undefined);
    });
  }

  async loadAppState(): Promise<AppState> {
    const { data, source } = await readJsonFile<AppState>(this.appStatePath(), {
      activeInstanceId: null,
      activeUserId: null,
      sidebarCatalog: 'gateways',
    });
    if (source !== 'primary') {
      this.logRecovery('app state', source);
    }
    return {
      activeInstanceId: data.activeInstanceId ?? null,
      activeUserId: data.activeUserId ?? null,
      sidebarCatalog: data.sidebarCatalog ?? 'gateways',
    };
  }

  async saveAppState(state: AppState): Promise<void> {
    await this.withWriteLock(async () => {
      await atomicWriteJson(this.appStatePath(), state);
    });
  }
}

export function emptyProfile(
  overrides: Partial<GatewayProfile> &
    Pick<GatewayProfile, 'id' | 'label' | 'backendUrl' | 'facilityId' | 'gatewayId' | 'token'>,
): GatewayProfile {
  return {
    deviceRecords: [],
    behavior: { ...DEFAULT_BEHAVIOR },
    gatewayFirmwareVersion: DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
