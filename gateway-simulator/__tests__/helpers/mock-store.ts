import { vi } from 'vitest';
import type { FileStateStore } from '../../src/main/persistence/FileStateStore';
import { emptyProfile, type GatewayProfile } from '../../src/main/persistence/FileStateStore';
import { emptyUserProfile, type UserProfile } from '../../src/main/persistence/user-profile.utils';

export function createMockStore(initialProfiles: GatewayProfile[] = [], initialUsers: UserProfile[] = []): FileStateStore {
  const profiles = new Map(initialProfiles.map((p) => [p.id, p]));
  const userProfiles = new Map(initialUsers.map((p) => [p.id, p]));
  let session: Awaited<ReturnType<FileStateStore['loadSession']>> = null;
  let catalogSession: Awaited<ReturnType<FileStateStore['loadCatalogSession']>> = null;
  let appState: Awaited<ReturnType<FileStateStore['loadAppState']>> = {
    activeInstanceId: null,
    activeUserId: null,
    sidebarCatalog: 'gateways',
  };

  return {
    loadProfiles: vi.fn(async () => [...profiles.values()]),
    saveProfile: vi.fn(async (profile: GatewayProfile) => {
      profiles.set(profile.id, profile);
    }),
    deleteProfile: vi.fn(async (id: string) => {
      profiles.delete(id);
    }),
    getProfile: vi.fn(async (id: string) => profiles.get(id) ?? null),
    loadUserProfiles: vi.fn(async () => [...userProfiles.values()]),
    saveUserProfile: vi.fn(async (profile: UserProfile) => {
      userProfiles.set(profile.id, profile);
    }),
    deleteUserProfile: vi.fn(async (id: string) => {
      userProfiles.delete(id);
    }),
    getUserProfile: vi.fn(async (id: string) => userProfiles.get(id) ?? null),
    loadSession: vi.fn(async () => session),
    saveSession: vi.fn(async (s) => {
      session = s;
    }),
    loadCatalogSession: vi.fn(async () => catalogSession),
    saveCatalogSession: vi.fn(async (s) => {
      catalogSession = s;
    }),
    clearCatalogSession: vi.fn(async () => {
      catalogSession = null;
    }),
    loadAppState: vi.fn(async () => appState),
    saveAppState: vi.fn(async (s) => {
      appState = s;
    }),
  };
}

export function sampleProfile(overrides: Partial<GatewayProfile> & Pick<GatewayProfile, 'id'>): GatewayProfile {
  return emptyProfile({
    label: 'Test GW',
    backendUrl: 'http://127.0.0.1:3000',
    facilityId: 'fac-1',
    gatewayId: 'gw-cloud-1',
    token: 'test-token',
    ...overrides,
  });
}

export function sampleUserProfile(overrides: Partial<UserProfile> & Pick<UserProfile, 'id'>): UserProfile {
  return emptyUserProfile({
    label: 'Test User',
    backendUrl: 'http://127.0.0.1:3000',
    email: 'tenant@example.com',
    password: 'password123',
    ...overrides,
  });
}
