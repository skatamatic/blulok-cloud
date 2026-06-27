/**
 * System Storage Configuration Routes
 *
 * Admin-only endpoints for managing firmware storage backend configuration.
 * Configuration is persisted in the `system_settings` table.
 */

import { Router, Response } from 'express';
import { authenticateToken, requireDevAdmin } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import {
  saveFirmwareStorageConfig,
  buildFirmwareStorageProvider,
} from '@/services/firmware/firmware-storage.factory';
import { validateBaseStorageConfig, StorageProviderType } from '@/services/storage';
import { DatabaseService } from '@/services/database.service';
import { registerGet, registerPost, registerPut } from '@/openapi/register-route';

const router = Router();
const MOUNT = '/api/v1/admin/storage-config';

router.use(authenticateToken);
router.use(requireDevAdmin);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Admin'],
    summary: 'Get firmware storage configuration',
    security: 'bearer',
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const db = DatabaseService.getInstance().connection;
      const typeRow = await db('system_settings').where({ key: 'storage.firmware.provider_type' }).first();
      const configRow = await db('system_settings').where({ key: 'storage.firmware.provider_config' }).first();

      if (!typeRow) {
        res.json({
          success: true,
          config: {
            providerType: 'gcs',
            providerConfig: {
              projectId: process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev',
              bucketName: process.env.GCS_BUCKET_NAME || 'blulok-develop',
            },
            source: 'env_fallback',
          },
        });
        return;
      }

      const rawConfig = configRow ? JSON.parse(configRow.value) : {};
      const redacted = { ...rawConfig };
      if (redacted.clientSecret) redacted.clientSecret = '***';
      if (redacted.refreshToken) redacted.refreshToken = '***';
      if (redacted.accessToken) redacted.accessToken = '***';
      if (redacted.keyFileContents) redacted.keyFileContents = '***';

      res.json({
        success: true,
        config: {
          providerType: typeRow.value,
          providerConfig: redacted,
          source: 'database',
        },
      });
    } catch (error: any) {
      logger.error('Failed to read firmware storage config:', error);
      res.status(500).json({ success: false, message: 'Failed to read storage config' });
    }
  }),
);

registerPut(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Admin'],
    summary: 'Update firmware storage configuration',
    security: 'bearer',
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { providerType, providerConfig } = req.body;
    if (!providerType || !providerConfig) {
      res.status(400).json({ success: false, message: 'providerType and providerConfig are required' });
      return;
    }

    const validTypes = [StorageProviderType.LOCAL, StorageProviderType.GCS, StorageProviderType.GDRIVE];
    if (!validTypes.includes(providerType)) {
      res.status(400).json({ success: false, message: `Invalid providerType. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const errors = validateBaseStorageConfig({ type: providerType, config: providerConfig });
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }

    try {
      await saveFirmwareStorageConfig(providerType, providerConfig);
      res.json({ success: true, message: 'Firmware storage configuration updated' });
    } catch (error: any) {
      logger.error('Failed to save firmware storage config:', error);
      res.status(500).json({ success: false, message: 'Failed to save storage config' });
    }
  }),
);

registerPost(
  router,
  '/test',
  {
    openApiPath: `${MOUNT}/test`,
    tags: ['Admin'],
    summary: 'Test firmware storage configuration without saving',
    security: 'bearer',
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { providerType, providerConfig } = req.body;
    if (!providerType || !providerConfig) {
      res.status(400).json({ success: false, message: 'providerType and providerConfig are required' });
      return;
    }

    const errors = validateBaseStorageConfig({ type: providerType, config: providerConfig });
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }

    const steps: Array<{ step: string; status: 'passed' | 'failed'; detail?: string; durationMs?: number }> = [];

    try {
      const t0 = Date.now();
      const provider = buildFirmwareStorageProvider(providerType, providerConfig);
      await provider.initialize();
      steps.push({ step: 'initialize', status: 'passed', durationMs: Date.now() - t0 });

      const testPayload = Buffer.from(JSON.stringify({ ts: Date.now(), probe: true }));
      let testPath: string;

      const t1 = Date.now();
      try {
        testPath = await provider.upload(`__test_${Date.now()}`, 'healthcheck.bin', testPayload);
        steps.push({ step: 'write', status: 'passed', durationMs: Date.now() - t1 });
      } catch (err: any) {
        steps.push({ step: 'write', status: 'failed', detail: err.message, durationMs: Date.now() - t1 });
        throw err;
      }

      const t2 = Date.now();
      try {
        const readBack = await provider.download(testPath);
        if (!readBack || readBack.length === 0) {
          const msg = 'Read returned empty data';
          steps.push({ step: 'read', status: 'failed', detail: msg, durationMs: Date.now() - t2 });
          throw new Error(msg);
        }
        if (!readBack.equals(testPayload)) {
          const msg = `Data mismatch: wrote ${testPayload.length} bytes, read ${readBack.length} bytes`;
          steps.push({ step: 'read', status: 'failed', detail: msg, durationMs: Date.now() - t2 });
          throw new Error(msg);
        }
        steps.push({ step: 'read', status: 'passed', durationMs: Date.now() - t2 });
      } catch (err: any) {
        if (!steps.find(s => s.step === 'read')) {
          steps.push({ step: 'read', status: 'failed', detail: err.message, durationMs: Date.now() - t2 });
        }
        throw err;
      }

      const t3 = Date.now();
      try {
        await provider.remove(testPath);
        steps.push({ step: 'delete', status: 'passed', durationMs: Date.now() - t3 });
      } catch (err: any) {
        steps.push({ step: 'delete', status: 'failed', detail: err.message, durationMs: Date.now() - t3 });
        throw err;
      }

      res.json({ success: true, message: 'All storage tests passed', steps });
    } catch (error: any) {
      logger.error(`Failed to test storage provider ${providerType}:`, error);
      const failedStep = steps.find(s => s.status === 'failed');
      res.status(500).json({
        success: false,
        message: failedStep
          ? `Test failed at "${failedStep.step}": ${failedStep.detail}`
          : `Test failed: ${error.message}`,
        steps,
      });
    }
  }),
);

export { router as systemStorageRouter };
