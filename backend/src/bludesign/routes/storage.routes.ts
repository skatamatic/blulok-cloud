/**
 * Storage Routes
 * 
 * API routes for storage provider configuration and OAuth flows.
 */

import { Router, Response } from 'express';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { createStorageProvider, validateStorageConfig } from '../services/storage';
import { StorageProviderType } from '../types/bludesign.types';
import { google } from 'googleapis';
import { logger } from '@/utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken as any);

/**
 * GET /api/v1/bludesign/storage/gdrive/auth-url
 * Get OAuth2 authorization URL for Google Drive
 */
router.get('/gdrive/auth-url', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { clientId, clientSecret, redirectUri } = req.query;

  if (!clientId || !clientSecret) {
    res.status(400).json({
      success: false,
      message: 'clientId and clientSecret are required',
    });
    return;
  }

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
    prompt: 'consent', // Force consent to get refresh token
  });

  res.json({
    success: true,
    authUrl,
  });
}));

/**
 * GET /api/v1/bludesign/storage/gdrive/callback
 * Handle OAuth2 callback and exchange code for tokens
 */
router.get('/gdrive/callback', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code, clientId, clientSecret, redirectUri } = req.query;

  if (!code || !clientId || !clientSecret) {
    res.status(400).json({
      success: false,
      message: 'code, clientId, and clientSecret are required',
    });
    return;
  }

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
}));

/**
 * POST /api/v1/bludesign/storage/gdrive/refresh-tokens
 * Manually refresh Google Drive access token
 */
router.post('/gdrive/refresh-tokens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { clientId, clientSecret, refreshToken } = req.body;

  if (!clientId || !clientSecret || !refreshToken) {
    res.status(400).json({
      success: false,
      message: 'clientId, clientSecret, and refreshToken are required',
    });
    return;
  }

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
}));

/**
 * POST /api/v1/bludesign/storage/:provider/test
 * Test storage provider configuration
 */
router.post('/:provider/test', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { provider } = req.params;
  const { storageConfig } = req.body;

  if (!storageConfig) {
    res.status(400).json({
      success: false,
      message: 'storageConfig is required',
    });
    return;
  }

  // Validate provider type
  const validProviders = ['local', 'gcs', 'gdrive'];
  if (!validProviders.includes(provider)) {
    res.status(400).json({
      success: false,
      message: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`,
    });
    return;
  }

  try {
    // Validate configuration
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

    // Create provider and test connection
    const storageProvider = createStorageProvider(config);
    await storageProvider.initialize();
    
    const isHealthy = await storageProvider.healthCheck();

    if (isHealthy) {
      res.json({
        success: true,
        message: 'Storage provider connection successful',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Storage provider health check failed',
      });
    }
  } catch (error: any) {
    logger.error(`Failed to test storage provider ${provider}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to test storage provider',
      error: error.message,
    });
  }
}));

export { router as storageRouter };
