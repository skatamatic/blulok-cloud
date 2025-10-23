/**
 * Base FMS Provider OAuth1 Authentication Tests
 * 
 * Tests OAuth 1.0a authentication implementation in the base provider
 */

import { BaseFMSProvider } from '@/services/fms/base-fms-provider';
import {
  FMSProviderConfig,
  FMSProviderType,
  FMSAuthType,
  FMSTenant,
  FMSUnit,
  FMSProviderCapabilities,
  FMSWebhookPayload,
} from '@/types/fms.types';

// Mock fetch globally
global.fetch = jest.fn();

// Create a concrete test implementation of BaseFMSProvider
class TestOAuth1Provider extends BaseFMSProvider {
  getProviderName(): string {
    return 'Test OAuth1 Provider';
  }

  getCapabilities(): FMSProviderCapabilities {
    return {
      supportsTenantSync: true,
      supportsUnitSync: true,
      supportsWebhooks: false,
      supportsRealtime: false,
      supportsLeaseManagement: false,
      supportsPaymentIntegration: false,
      supportsBulkOperations: false,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeAuthenticatedRequest('https://api.test.com/health');
      return true;
    } catch {
      return false;
    }
  }

  async fetchTenants(): Promise<FMSTenant[]> {
    const response = await this.makeAuthenticatedRequest('https://api.test.com/tenants');
    return response.tenants || [];
  }

  async fetchUnits(): Promise<FMSUnit[]> {
    const response = await this.makeAuthenticatedRequest('https://api.test.com/units');
    return response.units || [];
  }

  async fetchTenant(_externalId: string): Promise<FMSTenant | null> {
    return null;
  }

  async fetchUnit(_externalId: string): Promise<FMSUnit | null> {
    return null;
  }

  async validateWebhook(_payload: FMSWebhookPayload, _signature: string): Promise<boolean> {
    return false;
  }

  async parseWebhookPayload(rawPayload: any): Promise<FMSWebhookPayload> {
    return rawPayload;
  }
}

describe('BaseFMSProvider - OAuth1 Authentication', () => {
  let provider: TestOAuth1Provider;
  const facilityId = 'test-facility-123';
  const consumerKey = 'test-consumer-key';
  const consumerSecret = 'test-consumer-secret';

  beforeEach(() => {
    jest.clearAllMocks();

    const config: FMSProviderConfig = {
      providerType: FMSProviderType.STOREDGE,
      baseUrl: 'https://api.test.com',
      auth: {
        type: FMSAuthType.OAUTH1,
        credentials: {
          consumerKey,
          consumerSecret,
        },
      },
      features: {
        supportsTenantSync: true,
        supportsUnitSync: true,
        supportsWebhooks: false,
        supportsRealtime: false,
      },
      syncSettings: {
        autoAcceptChanges: false,
      },
    };

    provider = new TestOAuth1Provider(facilityId, config);
  });

  describe('OAuth1 Header Generation', () => {
    it('should generate OAuth Authorization header for GET requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tenants: [] }),
      });

      await provider.fetchTenants();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('OAuth');
    });

    it('should include all required OAuth parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      // Check for required OAuth 1.0a parameters
      expect(authHeader).toContain('oauth_consumer_key');
      expect(authHeader).toContain('oauth_signature_method');
      expect(authHeader).toContain('oauth_timestamp');
      expect(authHeader).toContain('oauth_nonce');
      expect(authHeader).toContain('oauth_version');
      expect(authHeader).toContain('oauth_signature');
    });

    it('should use HMAC-SHA1 signature method', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      expect(authHeader).toContain('oauth_signature_method="HMAC-SHA1"');
    });

    it('should use OAuth version 1.0', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      expect(authHeader).toContain('oauth_version="1.0"');
    });

    it('should include consumer key in header', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      expect(authHeader).toContain(`oauth_consumer_key="${consumerKey}"`);
    });
  });

  describe('OAuth Signature Generation', () => {
    it('should generate unique signatures for different requests', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tenants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ units: [] }),
        });

      await provider.fetchTenants();
      await provider.fetchUnits();

      const firstAuthHeader = (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization;
      const secondAuthHeader = (global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization;

      const firstSignature = firstAuthHeader.match(/oauth_signature="([^"]+)"/)?.[1];
      const secondSignature = secondAuthHeader.match(/oauth_signature="([^"]+)"/)?.[1];

      expect(firstSignature).toBeDefined();
      expect(secondSignature).toBeDefined();
      // Signatures should differ because of different URLs/timestamps
      expect(firstSignature).not.toBe(secondSignature);
    });

    it('should generate unique nonce for each request', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      await provider.testConnection();
      await provider.testConnection();

      const firstAuthHeader = (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization;
      const secondAuthHeader = (global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization;

      const firstNonce = firstAuthHeader.match(/oauth_nonce="([^"]+)"/)?.[1];
      const secondNonce = secondAuthHeader.match(/oauth_nonce="([^"]+)"/)?.[1];

      expect(firstNonce).toBeDefined();
      expect(secondNonce).toBeDefined();
      expect(firstNonce).not.toBe(secondNonce);
    });

    it('should include timestamp in OAuth parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const beforeTimestamp = Math.floor(Date.now() / 1000);
      await provider.testConnection();
      const afterTimestamp = Math.floor(Date.now() / 1000);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;
      
      const oauthTimestamp = authHeader.match(/oauth_timestamp="(\d+)"/)?.[1];
      expect(oauthTimestamp).toBeDefined();
      
      const timestamp = parseInt(oauthTimestamp!, 10);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(timestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('Request Methods', () => {
    it('should handle GET requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await provider.testConnection();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/health',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should not include body property in GET requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestOptions = fetchCall[1];

      expect(requestOptions).not.toHaveProperty('body');
    });

    it('should include Content-Type header', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(provider.testConnection()).resolves.toBe(false);
    });

    it('should propagate network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.testConnection()).resolves.toBe(false);
    });
  });

  describe('Missing Credentials', () => {
    it('should still make request without OAuth headers if credentials missing', async () => {
      const configWithoutCreds: FMSProviderConfig = {
        providerType: FMSProviderType.STOREDGE,
        baseUrl: 'https://api.test.com',
        auth: {
          type: FMSAuthType.OAUTH1,
          credentials: {
            // Missing consumerKey and consumerSecret
          },
        },
        features: {
          supportsTenantSync: true,
          supportsUnitSync: true,
          supportsWebhooks: false,
          supportsRealtime: false,
        },
        syncSettings: {
          autoAcceptChanges: false,
        },
      };

      const providerWithoutCreds = new TestOAuth1Provider(facilityId, configWithoutCreds);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await providerWithoutCreds.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      // Should still have Content-Type but no OAuth Authorization header
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('Integration with Other Auth Types', () => {
    it('should not add OAuth headers when using API_KEY auth type', async () => {
      const apiKeyConfig: FMSProviderConfig = {
        providerType: FMSProviderType.GENERIC_REST,
        baseUrl: 'https://api.test.com',
        auth: {
          type: FMSAuthType.API_KEY,
          credentials: {
            apiKey: 'test-api-key',
          },
        },
        features: {
          supportsTenantSync: true,
          supportsUnitSync: true,
          supportsWebhooks: false,
          supportsRealtime: false,
        },
        syncSettings: {
          autoAcceptChanges: false,
        },
      };

      const apiKeyProvider = new TestOAuth1Provider(facilityId, apiKeyConfig);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiKeyProvider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['X-API-Key']).toBe('test-api-key');
      expect(headers.Authorization).toBeUndefined();
    });

    it('should not add OAuth headers when using BEARER_TOKEN auth type', async () => {
      const bearerConfig: FMSProviderConfig = {
        providerType: FMSProviderType.GENERIC_REST,
        baseUrl: 'https://api.test.com',
        auth: {
          type: FMSAuthType.BEARER_TOKEN,
          credentials: {
            bearerToken: 'test-bearer-token',
          },
        },
        features: {
          supportsTenantSync: true,
          supportsUnitSync: true,
          supportsWebhooks: false,
          supportsRealtime: false,
        },
        syncSettings: {
          autoAcceptChanges: false,
        },
      };

      const bearerProvider = new TestOAuth1Provider(facilityId, bearerConfig);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await bearerProvider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.Authorization).toBe('Bearer test-bearer-token');
      expect(headers.Authorization).not.toContain('OAuth');
    });
  });

  describe('URL and Method in Signature', () => {
    it('should include request URL in signature calculation', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tenants: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ units: [] }),
        });

      await provider.fetchTenants(); // Different URL
      await provider.fetchUnits(); // Different URL

      const firstAuthHeader = (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization;
      const secondAuthHeader = (global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization;

      // Signatures should be different because URLs are different
      const firstSignature = firstAuthHeader.match(/oauth_signature="([^"]+)"/)?.[1];
      const secondSignature = secondAuthHeader.match(/oauth_signature="([^"]+)"/)?.[1];

      expect(firstSignature).not.toBe(secondSignature);
    });
  });
});

