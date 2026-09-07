import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GatewayManager } from '../src/main/core/GatewayManager';
import { createMockStore } from './helpers/mock-store';
import type { BackendClient } from '../src/main/auth/BackendClient';
import type { FmsConfigRecord } from '../src/main/auth/backend-api.types';

function sampleFmsConfig(overrides: Partial<FmsConfigRecord> = {}): FmsConfigRecord {
  return {
    id: 'cfg-1',
    facility_id: 'fac-1',
    facility_name: 'Warehouse A',
    provider_type: 'storedge',
    is_enabled: true,
    config: {
      customSettings: { facilityId: 'ext-1' },
      syncSettings: {
        webhookAuthMode: 'hmac',
        webhookSecret: 'secret-key',
      },
    },
    ...overrides,
  };
}

function buildCatalogApi(overrides: Partial<BackendClient> = {}): BackendClient {
  return {
    getToken: vi.fn().mockReturnValue('catalog-token'),
    getBackendUrl: vi.fn().mockReturnValue('http://127.0.0.1:3000'),
    listFmsConfigs: vi.fn().mockResolvedValue([sampleFmsConfig()]),
    listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    restoreSession: vi.fn(),
    ...overrides,
  } as unknown as BackendClient;
}

async function seedWebhookSession(
  store: ReturnType<typeof createMockStore>,
  role = 'admin',
): Promise<void> {
  await store.saveCatalogSession({
    backendUrl: 'http://127.0.0.1:3000',
    token: 'catalog-token',
    email: 'user@test.com',
    role,
    updatedAt: new Date().toISOString(),
  });
}

describe('GatewayManager FMS webhooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists webhook targets without exposing secrets', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi();
    await seedWebhookSession(store, 'facility_admin');

    const manager = new GatewayManager({ store, catalogClient: catalogApi });
    const targets = await manager.listFmsWebhookTargets();

    expect(catalogApi.listFmsConfigs).toHaveBeenCalledWith({ webhooksOnly: true });
    expect(targets).toHaveLength(1);
    expect(targets[0]!.facilityId).toBe('fac-1');
    expect(targets[0]!.authReady).toBe(true);
    expect('webhookSecret' in targets[0]!).toBe(false);
  });

  it('rejects list when role cannot simulate webhooks', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi({ getToken: vi.fn().mockReturnValue('catalog-token') });
    await seedWebhookSession(store, 'tenant');

    const manager = new GatewayManager({ store, catalogClient: catalogApi });

    await expect(manager.listFmsWebhookTargets()).rejects.toThrow(/simulate webhooks/i);
  });

  it('rejects import when role is facility_admin', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi();
    await seedWebhookSession(store, 'facility_admin');

    const manager = new GatewayManager({ store, catalogClient: catalogApi });

    await expect(manager.listCloudUsers()).rejects.toThrow(/import users/i);
  });

  it('sends webhook using cached target without re-listing', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi();
    await seedWebhookSession(store);

    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchFn);

    const manager = new GatewayManager({ store, catalogClient: catalogApi });
    await manager.listFmsWebhookTargets();

    const result = await manager.sendFmsWebhook({
      facilityId: 'fac-1',
      body: { id: 'evt-1', type: 'com.storedge.tenant.updated.v1' },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(catalogApi.listFmsConfigs).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('rejects send when integration is disabled', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi({
      listFmsConfigs: vi.fn().mockResolvedValue([
        sampleFmsConfig({ is_enabled: false }),
      ]),
    });
    await seedWebhookSession(store);

    const manager = new GatewayManager({ store, catalogClient: catalogApi });
    await manager.listFmsWebhookTargets();

    await expect(
      manager.sendFmsWebhook({
        facilityId: 'fac-1',
        body: { id: 'evt-1' },
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it('rejects send when auth secret is missing', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi({
      listFmsConfigs: vi.fn().mockResolvedValue([
        sampleFmsConfig({
          config: {
            syncSettings: { webhookAuthMode: 'hmac' },
          },
        }),
      ]),
    });
    await seedWebhookSession(store);

    const manager = new GatewayManager({ store, catalogClient: catalogApi });
    await manager.listFmsWebhookTargets();

    await expect(
      manager.sendFmsWebhook({
        facilityId: 'fac-1',
        body: { id: 'evt-1' },
      }),
    ).rejects.toThrow(/auth is not configured/i);
  });

  it('clears webhook cache on catalog sign out', async () => {
    const store = createMockStore();
    const catalogApi = buildCatalogApi();
    await seedWebhookSession(store);

    const manager = new GatewayManager({ store, catalogClient: catalogApi });
    await manager.listFmsWebhookTargets();
    await manager.clearCatalogSession();

    vi.mocked(catalogApi.listFmsConfigs).mockClear();
    await seedWebhookSession(store);
    await manager.listFmsWebhookTargets();

    expect(catalogApi.listFmsConfigs).toHaveBeenCalledOnce();
  });
});
