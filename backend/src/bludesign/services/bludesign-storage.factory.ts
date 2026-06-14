/**
 * BluDesign Storage Factory
 *
 * Loads and persists platform-wide BluDesign storage configuration from
 * `system_settings`, mirroring the firmware storage pattern.
 */

import { BaseStorageProvider, StorageProviderType, validateBaseStorageConfig } from '@/services/storage';
import { createBaseStorageProvider } from '@/services/storage/base-storage.factory';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import {
  createStorageProvider,
  clearProviderCache,
  DEFAULT_BLUDESIGN_STORAGE_CONFIG,
} from './storage/storage.factory';
import { StorageProvider } from './storage/storage-provider.interface';
import { StorageProviderType as BluDesignStorageProviderType } from '../types/bludesign.types';

const TYPE_KEY = 'storage.bludesign.provider_type';
const CONFIG_KEY = 'storage.bludesign.provider_config';

const SECRET_FIELDS = ['clientSecret', 'refreshToken', 'accessToken', 'keyFileContents'] as const;

export interface BluDesignStorageDbConfig {
  providerType: string;
  providerConfig: Record<string, unknown>;
}

let cachedDomainProvider: StorageProvider | null = null;
let cachedBaseProvider: BaseStorageProvider | null = null;
let cachedConfigJson: string | null = null;

/** Keep runtime uploads out of backend/ so dev file watchers ignore them. */
const OUTSIDE_LOCAL_STORAGE_REL = '../.blulok-local-data/bludesign';

function normalizeLocalStorageConfig(config: BluDesignStorageDbConfig): BluDesignStorageDbConfig {
  const type = config.providerType?.toLowerCase();
  if (type !== StorageProviderType.LOCAL && type !== 'local') {
    return config;
  }

  const raw = (config.providerConfig.basePath as string | undefined) ?? OUTSIDE_LOCAL_STORAGE_REL;
  const resolved = path.resolve(raw);
  const backendRoot = path.resolve(process.cwd());
  const insideBackend =
    resolved === backendRoot || resolved.startsWith(`${backendRoot}${path.sep}`);

  if (!insideBackend) {
    return config;
  }

  const outside = path.resolve(backendRoot, OUTSIDE_LOCAL_STORAGE_REL);
  try {
    if (fs.existsSync(resolved) && !fs.existsSync(outside)) {
      fs.mkdirSync(path.dirname(outside), { recursive: true });
      fs.cpSync(resolved, outside, { recursive: true });
      logger.info(`Migrated BluDesign local storage from ${resolved} to ${outside}`);
    }
  } catch (err) {
    logger.warn('BluDesign local storage migration skipped', err);
  }

  return {
    ...config,
    providerConfig: { ...config.providerConfig, basePath: outside },
  };
}

export async function loadBluDesignStorageConfig(): Promise<BluDesignStorageDbConfig | null> {
  try {
    const db = DatabaseService.getInstance().connection;
    const typeRow = await db('system_settings').where({ key: TYPE_KEY }).first();
    const configRow = await db('system_settings').where({ key: CONFIG_KEY }).first();

    if (!typeRow) return null;

    return {
      providerType: typeRow.value,
      providerConfig: configRow ? JSON.parse(configRow.value) : {},
    };
  } catch {
    return null;
  }
}

export function getBluDesignStorageEnvFallback(): BluDesignStorageDbConfig {
  return {
    providerType: StorageProviderType.GCS,
    providerConfig: { ...DEFAULT_BLUDESIGN_STORAGE_CONFIG },
  };
}

async function resolveBluDesignStorageConfig(): Promise<BluDesignStorageDbConfig> {
  const loaded = (await loadBluDesignStorageConfig()) ?? getBluDesignStorageEnvFallback();
  return normalizeLocalStorageConfig(loaded);
}

export async function getBluDesignStorageProvider(): Promise<StorageProvider> {
  const config = await resolveBluDesignStorageConfig();
  const configJson = JSON.stringify(config);

  if (cachedDomainProvider && cachedConfigJson === configJson) {
    return cachedDomainProvider;
  }

  const provider = createStorageProvider({
    type: config.providerType as BluDesignStorageProviderType,
    config: {
      ...config.providerConfig,
      maxFileSizeMb: 100,
      allowedExtensions: ['.glb', '.gltf', '.fbx', '.png', '.jpg', '.jpeg', '.webp'],
    },
  });

  cachedDomainProvider = provider;
  cachedConfigJson = configJson;
  logger.info(`BluDesign storage configured: ${config.providerType}`);
  return provider;
}

export async function getBluDesignBaseStorageProvider(): Promise<BaseStorageProvider> {
  const config = await resolveBluDesignStorageConfig();
  const configJson = JSON.stringify(config);

  if (cachedBaseProvider && cachedConfigJson === configJson) {
    return cachedBaseProvider;
  }

  const provider = createBaseStorageProvider({
    type: config.providerType as StorageProviderType,
    config: config.providerConfig,
  });

  cachedBaseProvider = provider;
  cachedConfigJson = configJson;
  return provider;
}

function mergeSecretFields(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null,
): Record<string, unknown> {
  const merged = { ...incoming };
  for (const field of SECRET_FIELDS) {
    if (merged[field] === '***' && existing?.[field]) {
      merged[field] = existing[field];
    }
  }
  return merged;
}

export function redactBluDesignStorageConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...config };
  for (const field of SECRET_FIELDS) {
    if (redacted[field]) {
      redacted[field] = '***';
    }
  }
  return redacted;
}

async function upsertSystemSetting(db: ReturnType<typeof DatabaseService.getInstance>['connection'], key: string, value: string): Promise<void> {
  const existing = await db('system_settings').where({ key }).first();
  if (existing) {
    await db('system_settings').where({ key }).update({ value, updated_at: db.fn.now() });
  } else {
    await db('system_settings').insert({
      id: db.raw('(UUID())'),
      key,
      value,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }
}

export async function saveBluDesignStorageConfig(
  providerType: string,
  providerConfig: Record<string, unknown>,
): Promise<void> {
  const existing = await loadBluDesignStorageConfig();
  const mergedConfig = mergeSecretFields(providerConfig, existing?.providerConfig ?? null);

  const errors = validateBaseStorageConfig({
    type: providerType as StorageProviderType,
    config: mergedConfig,
  });
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const db = DatabaseService.getInstance().connection;
  await upsertSystemSetting(db, TYPE_KEY, providerType);
  await upsertSystemSetting(db, CONFIG_KEY, JSON.stringify(mergedConfig));

  invalidateBluDesignStorageCache();
}

export function invalidateBluDesignStorageCache(): void {
  cachedDomainProvider = null;
  cachedBaseProvider = null;
  cachedConfigJson = null;
  clearProviderCache();
}
