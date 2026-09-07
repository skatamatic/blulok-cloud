import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileStateStore, emptyProfile } from '../src/main/persistence/FileStateStore';
import { emptyUserProfile } from '../src/main/persistence/user-profile.utils';

describe('FileStateStore persistence', () => {
  let dir: string;
  let store: FileStateStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gw-sim-'));
    store = new FileStateStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves and loads gateway profiles with token', async () => {
    const profile = emptyProfile({
      id: 'gw-1',
      label: 'Test Gateway',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-uuid-1',
      token: 'jwt-token-secret',
      devices: [{ kind: 'lock', lock_id: 'LOCK-1', online: true, locked: true }],
    });

    await store.saveProfile(profile);
    const loaded = await store.loadProfiles();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe('Test Gateway');
    expect(loaded[0].token).toBe('jwt-token-secret');
    expect(loaded[0].devices).toHaveLength(1);
  });

  it('persists each gateway profile in its own file', async () => {
    await store.saveProfile(
      emptyProfile({
        id: 'gw-1',
        label: 'Gateway A',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g1',
        token: 't1',
      }),
    );
    await store.saveProfile(
      emptyProfile({
        id: 'gw-2',
        label: 'Gateway B',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g2',
        token: 't2',
      }),
    );

    const files = await readdir(join(dir, 'gateway-profiles'));
    expect(files.filter((file) => file.endsWith('.json'))).toHaveLength(2);
    expect(await store.loadProfiles()).toHaveLength(2);
  });

  it('does not lose profiles when concurrent saves overlap', async () => {
    const profiles = ['gw-1', 'gw-2', 'gw-3'].map((id, index) => emptyProfile({
      id,
      label: `Gateway ${index + 1}`,
      backendUrl: 'http://localhost',
      facilityId: 'f',
      gatewayId: `cloud-${id}`,
      token: `token-${id}`,
    }));

    await Promise.all(profiles.map((profile) => store.saveProfile(profile)));

    const loaded = await store.loadProfiles();
    expect(loaded.map((profile) => profile.id).sort()).toEqual(['gw-1', 'gw-2', 'gw-3']);
  });

  it('deletes profiles', async () => {
    await store.saveProfile(
      emptyProfile({
        id: 'gw-1',
        label: 'A',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g',
        token: 't',
      }),
    );
    await store.deleteProfile('gw-1');
    expect(await store.loadProfiles()).toHaveLength(0);
  });

  it('migrates legacy gateway-profiles.json into per-profile files', async () => {
    const legacy = [
      emptyProfile({
        id: 'legacy-1',
        label: 'Legacy One',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g1',
        token: 't1',
      }),
      emptyProfile({
        id: 'legacy-2',
        label: 'Legacy Two',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g2',
        token: 't2',
      }),
    ];
    await writeFile(join(dir, 'gateway-profiles.json'), JSON.stringify(legacy, null, 2), 'utf8');

    const loaded = await store.loadProfiles();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((profile) => profile.id).sort()).toEqual(['legacy-1', 'legacy-2']);

    const migratedArchive = await readFile(join(dir, 'gateway-profiles.json.migrated'), 'utf8');
    expect(JSON.parse(migratedArchive)).toHaveLength(2);
  });

  it('recovers a gateway profile from backup after corruption', async () => {
    await store.saveProfile(
      emptyProfile({
        id: 'gw-1',
        label: 'Before',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g',
        token: 't',
      }),
    );
    await store.saveProfile(
      emptyProfile({
        id: 'gw-1',
        label: 'After',
        backendUrl: 'http://localhost',
        facilityId: 'f',
        gatewayId: 'g',
        token: 't',
      }),
    );

    await writeFile(join(dir, 'gateway-profiles', 'gw-1.json'), '{ truncated', 'utf8');

    const loaded = await store.loadProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.label).toBe('Before');
  });

  it('persists session and app state', async () => {
    await store.saveSession({
      backendUrl: 'http://127.0.0.1:3000',
      token: 'tok',
      email: 'dev@test.com',
      updatedAt: new Date().toISOString(),
    });
    await store.saveAppState({ activeInstanceId: 'gw-1' });

    const session = await store.loadSession();
    const appState = await store.loadAppState();

    expect(session?.email).toBe('dev@test.com');
    expect(appState.activeInstanceId).toBe('gw-1');
  });

  it('saves and loads user profiles', async () => {
    const user = emptyUserProfile({
      id: 'user-1',
      label: 'Tenant',
      backendUrl: 'http://127.0.0.1:3000',
      email: 'tenant@test.com',
      password: 'secret',
    });
    await store.saveUserProfile(user);
    const loaded = await store.loadUserProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.email).toBe('tenant@test.com');
    expect(loaded[0]?.password).toBe('secret');
  });
});
