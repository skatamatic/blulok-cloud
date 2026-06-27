/**
 * Storage Routes
 *
 * API routes for storage provider configuration and OAuth flows.
 */

import { Router, Response } from 'express';
import { authenticateToken, requireAdmin } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { createStorageProvider, validateStorageConfig } from '../services/storage';
import {
  getBluDesignStorageEnvFallback,
  loadBluDesignStorageConfig,
  redactBluDesignStorageConfig,
  saveBluDesignStorageConfig,
} from '../services/bludesign-storage.factory';
import { StorageProviderType } from '../types/bludesign.types';
import { validateBaseStorageConfig } from '@/services/storage';
import { google } from 'googleapis';
import { logger } from '@/utils/logger';
import {
  registerGet,
  registerPost,
  registerPut,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  storageConfigUpdateSchema,
  gdriveAuthUrlQuerySchema,
  gdriveCallbackQuerySchema,
  gdriveRefreshTokensSchema,
  storageProviderTestParamSchema,
  storageProviderTestBodySchema,
} from '@/schemas/bludesign/storage.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/storage';

router.use(authenticateToken);
router.use(requireAdmin);

registerGet(
  router,
  '/config',
  {
    openApiPath: `${MOUNT}/config`,
    tags: ['BluDesign'],
    summary: 'Get BluDesign storage configuration (secrets redacted)',
    security: 'bearer',
    responses: {
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const dbConfig = await loadBluDesignStorageConfig();

      if (!dbConfig) {
        const fallback = getBluDesignStorageEnvFallback();
        res.json({
          success: true,
          config: {
            providerType: fallback.providerType,
            providerConfig: fallback.providerConfig,
            source: 'env_fallback',
          },
        });
        return;
      }

      res.json({
        success: true,
        config: {
          providerType: dbConfig.providerType,
          providerConfig: redactBluDesignStorageConfig(dbConfig.providerConfig),
          source: 'database',
        },
      });
    } catch (error: any) {
      logger.error('Failed to read BluDesign storage config:', error);
      res.status(500).json({ success: false, message: 'Failed to read storage config' });
    }
  }),
);

registerPut(
  router,
  '/config',
  {
    openApiPath: `${MOUNT}/config`,
    tags: ['BluDesign'],
    summary: 'Update BluDesign storage configuration',
    security: 'bearer',
    body: storageConfigUpdateSchema,
    responses: {
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { providerType, providerConfig } = req.body;

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
      await saveBluDesignStorageConfig(providerType, providerConfig);
      res.json({ success: true, message: 'BluDesign storage configuration updated' });
    } catch (error: any) {
      logger.error('Failed to save BluDesign storage config:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to save storage config' });
    }
  }),
);

registerGet(
  router,
  '/gdrive/auth-url',
  {
    openApiPath: `${MOUNT}/gdrive/auth-url`,
    tags: ['BluDesign'],
    summary: 'Get OAuth2 authorization URL for Google Drive',
    security: 'bearer',
    query: gdriveAuthUrlQuerySchema,
    responses: {
      400: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { clientId, clientSecret, redirectUri } = req.query;

    const oauth2Client = new google.auth.OAuth2(
      clientId as string,
      clientSecret as string,
      (redirectUri as string) || 'urn:ietf:wg:oauth:2.0:oob'
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });

    res.json({
      success: true,
      authUrl,
    });
  }),
);

registerGet(
  router,
  '/gdrive/callback',
  {
    openApiPath: `${MOUNT}/gdrive/callback`,
    tags: ['BluDesign'],
    summary: 'Exchange OAuth2 code for Google Drive tokens',
    security: 'bearer',
    query: gdriveCallbackQuerySchema,
    responses: {
      400: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { code, clientId, clientSecret, redirectUri } = req.query;

    try {
      const oauth2Client = new google.auth.OAuth2(
        clientId as string,
        clientSecret as string,
        (redirectUri as string) || 'urn:ietf:wg:oauth:2.0:oob'
      );

      const { tokens } = await oauth2Client.getToken(code as string);

      res.json({
        success: true,
        tokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date,
        },
      });
    } catch (error: any) {
      logger.error('Failed to exchange OAuth code for tokens:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to exchange authorization code',
        error: error.message,
      });
    }
  }),
);

registerPost(
  router,
  '/gdrive/refresh-tokens',
  {
    openApiPath: `${MOUNT}/gdrive/refresh-tokens`,
    tags: ['BluDesign'],
    summary: 'Refresh Google Drive access token',
    security: 'bearer',
    body: gdriveRefreshTokensSchema,
    responses: {
      400: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { clientId, clientSecret, refreshToken } = req.body;

    try {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      res.json({
        success: true,
        tokens: {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || refreshToken,
          expiryDate: credentials.expiry_date,
        },
      });
    } catch (error: any) {
      logger.error('Failed to refresh Google Drive tokens:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to refresh access token',
        error: error.message,
      });
    }
  }),
);

registerPost(
  router,
  '/:provider/test',
  {
    openApiPath: `${MOUNT}/{provider}/test`,
    tags: ['BluDesign'],
    summary: 'Test storage provider configuration',
    security: 'bearer',
    params: storageProviderTestParamSchema,
    body: storageProviderTestBodySchema,
    responses: {
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { provider } = req.params;
    const { storageConfig } = req.body;

    const config = {
      type: provider as StorageProviderType,
      config: storageConfig,
    };

    const validationErrors = validateStorageConfig(config);
    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Configuration validation failed',
        errors: validationErrors,
      });
      return;
    }

    const steps: Array<{ step: string; status: 'passed' | 'failed'; detail?: string; durationMs?: number }> = [];

    try {
      const t0 = Date.now();
      const storageProvider = createStorageProvider(config);
      await storageProvider.initialize();
      steps.push({ step: 'initialize', status: 'passed', durationMs: Date.now() - t0 });

      const testProjectId = `__test_${Date.now()}`;
      const testAssetId = '__probe';
      const testFilename = 'healthcheck.json';
      const testPayload = Buffer.from(JSON.stringify({ ts: Date.now(), probe: true }));

      const t1 = Date.now();
      try {
        await storageProvider.uploadAssetFile(testProjectId, testAssetId, testFilename, testPayload, 'application/json');
        steps.push({ step: 'write', status: 'passed', durationMs: Date.now() - t1 });
      } catch (err: any) {
        steps.push({ step: 'write', status: 'failed', detail: err.message, durationMs: Date.now() - t1 });
        throw err;
      }

      const t2 = Date.now();
      try {
        const readBack = await storageProvider.downloadAssetFile(testProjectId, testAssetId, testFilename);
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
        await storageProvider.deleteAssetFiles(testProjectId, testAssetId);
        await storageProvider.deleteProject(testProjectId);
        steps.push({ step: 'delete', status: 'passed', durationMs: Date.now() - t3 });
      } catch (err: any) {
        steps.push({ step: 'delete', status: 'failed', detail: err.message, durationMs: Date.now() - t3 });
        throw err;
      }

      res.json({
        success: true,
        message: 'All storage tests passed',
        steps,
      });
    } catch (error: any) {
      logger.error(`Storage provider test failed for ${provider}:`, error);
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

export { router as storageRouter };
