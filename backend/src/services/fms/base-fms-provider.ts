/**
 * Base FMS Provider
 * 
 * Abstract base class for all FMS integrations.
 * Each FMS provider (Yardi, AppFolio, etc.) should extend this class.
 */

import {
  FMSProviderConfig,
  FMSTenant,
  FMSUnit,
  FMSProviderCapabilities,
  FMSWebhookPayload
} from '@/types/fms.types';
import { logger } from '@/utils/logger';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export abstract class BaseFMSProvider {
  protected config: FMSProviderConfig;
  protected facilityId: string;
  protected logger = logger;

  constructor(facilityId: string, config: FMSProviderConfig) {
    this.facilityId = facilityId;
    this.config = config;
  }

  /**
   * Get provider name for logging and display
   */
  abstract getProviderName(): string;

  /**
   * Get provider capabilities
   */
  abstract getCapabilities(): FMSProviderCapabilities;

  /**
   * Test the connection and authentication
   * @returns true if connection is successful, false otherwise
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Fetch all tenants from the FMS
   */
  abstract fetchTenants(): Promise<FMSTenant[]>;

  /**
   * Fetch all units from the FMS
   */
  abstract fetchUnits(): Promise<FMSUnit[]>;

  /**
   * Fetch a specific tenant by external ID
   */
  abstract fetchTenant(externalId: string): Promise<FMSTenant | null>;

  /**
   * Fetch a specific unit by external ID
   */
  abstract fetchUnit(externalId: string): Promise<FMSUnit | null>;

  /**
   * Validate webhook signature (if supported)
   */
  abstract validateWebhook(payload: FMSWebhookPayload, signature: string): Promise<boolean>;

  /**
   * Parse webhook payload into standard format
   */
  abstract parseWebhookPayload(rawPayload: any): Promise<FMSWebhookPayload>;

  /**
   * Push tenant data to FMS (if supported)
   * Some FMS systems support bidirectional sync
   */
  async pushTenant(_tenant: FMSTenant): Promise<boolean> {
    this.logger.warn(`pushTenant not implemented for ${this.getProviderName()}`);
    return false;
  }

  /**
   * Push unit data to FMS (if supported)
   */
  async pushUnit(_unit: FMSUnit): Promise<boolean> {
    this.logger.warn(`pushUnit not implemented for ${this.getProviderName()}`);
    return false;
  }

  /**
   * Helper: Make authenticated HTTP request
   * Can be overridden by providers with specific auth needs
   */
  protected async makeAuthenticatedRequest(
    url: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication based on auth type
    switch (this.config.auth.type) {
      case 'api_key':
        if (this.config.auth.credentials.apiKey) {
          headers['X-API-Key'] = this.config.auth.credentials.apiKey;
        }
        break;
      
      case 'bearer_token':
        if (this.config.auth.credentials.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.auth.credentials.bearerToken}`;
        }
        break;
      
      case 'basic_auth':
        if (this.config.auth.credentials.username && this.config.auth.credentials.password) {
          const credentials = Buffer.from(
            `${this.config.auth.credentials.username}:${this.config.auth.credentials.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;
      
      case 'oauth2':
        // OAuth2 token should be refreshed if needed before calling this
        if (this.config.auth.credentials.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.auth.credentials.bearerToken}`;
        }
        break;

      case 'oauth1':
        if (this.config.auth.credentials.consumerKey && this.config.auth.credentials.consumerSecret) {
          const oauth = new OAuth({
            consumer: {
              key: this.config.auth.credentials.consumerKey,
              secret: this.config.auth.credentials.consumerSecret,
            },
            signature_method: 'HMAC-SHA1',
            hash_function(base_string, key) {
              return crypto
                .createHmac('sha1', key)
                .update(base_string)
                .digest('base64');
            },
          });

          const requestData = {
            url,
            method,
            data: body,
          };

          const oauthHeaders = oauth.toHeader(oauth.authorize(requestData));
          Object.assign(headers, oauthHeaders);
        }
        break;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`FMS API request failed for ${this.getProviderName()}:`, error);
      throw error;
    }
  }

  /**
   * Helper: Refresh OAuth2 token if needed
   */
  protected async refreshOAuth2Token(): Promise<string | null> {
    if (this.config.auth.type !== 'oauth2') {
      return null;
    }

    const { refreshToken, clientId, clientSecret, tokenEndpoint } = this.config.auth.credentials;

    if (!refreshToken || !clientId || !clientSecret || !tokenEndpoint) {
      this.logger.error('Missing OAuth2 refresh credentials');
      return null;
    }

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      // Update the token in config (should be persisted by caller)
      this.config.auth.credentials.bearerToken = data.access_token;
      
      if (data.refresh_token) {
        this.config.auth.credentials.refreshToken = data.refresh_token;
      }

      return data.access_token;
    } catch (error) {
      this.logger.error('OAuth2 token refresh failed:', error);
      return null;
    }
  }

  /**
   * Helper: Check if provider supports a capability
   */
  protected supportsCapability(capability: keyof FMSProviderCapabilities): boolean {
    return this.getCapabilities()[capability] === true;
  }

  /**
   * Helper: Validate required configuration
   */
  protected validateConfig(): void {
    if (!this.config) {
      throw new Error('FMS provider config is required');
    }

    if (!this.config.auth) {
      throw new Error('FMS auth configuration is required');
    }

    if (!this.config.features) {
      throw new Error('FMS features configuration is required');
    }
  }
}

