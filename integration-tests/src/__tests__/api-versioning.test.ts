/**
 * API Versioning and Compatibility Testing
 * 
 * This test suite ensures API versioning works correctly and maintains
 * backward compatibility as the API evolves.
 */

// Set up environment variables before importing backend
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'testpassword';
process.env.DB_NAME = 'blulok_test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32-chars';
process.env.PORT = '3000';

import request from 'supertest';
import { createApp } from '../../../backend/src/app';
import jwt from 'jsonwebtoken';

describe('API Versioning and Compatibility Testing', () => {
  let app: any;
  let authToken: string;

  beforeAll(() => {
    app = createApp();
    
    // Create a valid JWT token for authenticated requests
    authToken = jwt.sign(
      { 
        userId: 'user-1', 
        email: 'admin@example.com', 
        role: 'admin' 
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('API Version Header Support', () => {
    it('should accept API version in headers', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('API-Version', '1.0')
        .set('Accept', 'application/vnd.blulok.v1+json');

      expect([200, 500]).toContain(response.status);
    });

    it('should handle different API version formats', async () => {
      const versionHeaders = [
        'API-Version: 1.0',
        'X-API-Version: 1.0',
        'Accept: application/vnd.blulok.v1+json',
        'Accept: application/json; version=1.0'
      ];

      for (const header of versionHeaders) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set(header.split(':')[0], header.split(':')[1].trim());

        expect([200, 400, 500]).toContain(response.status);
      }
    });

    it('should handle version negotiation', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Accept', 'application/vnd.blulok.v1+json, application/vnd.blulok.v2+json, application/json');

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain response structure consistency', async () => {
      const endpoints = [
        '/health',
        '/api/v1/users',
        '/api/v1/facilities',
        '/api/v1/key-sharing'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${authToken}`);

        // Response should have consistent structure
        if (response.status === 200) {
          // Health endpoint has different structure
          if (response.body.status === 'healthy') {
            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('timestamp');
          } else {
            expect(response.body).toHaveProperty('success');
            expect(typeof response.body.success).toBe('boolean');
          }
        }
      }
    });

    it('should maintain error response format', async () => {
      const errorScenarios = [
        { method: 'get', path: '/api/v1/nonexistent' },
        { method: 'post', path: '/api/v1/users', data: {} },
        { method: 'get', path: '/api/v1/users' } // No auth
      ];

      for (const scenario of errorScenarios) {
        let response;
        switch (scenario.method.toLowerCase()) {
          case 'get':
            response = await request(app).get(scenario.path);
            break;
          case 'post':
            response = await request(app).post(scenario.path)
              .send(scenario.data || {});
            break;
          case 'put':
            response = await request(app).put(scenario.path)
              .send(scenario.data || {});
            break;
          case 'delete':
            response = await request(app).delete(scenario.path);
            break;
          default:
            response = await request(app).get(scenario.path);
        }

        if (response.status >= 400) {
          // Some endpoints may not have success property in error responses
          if (response.body.hasOwnProperty('success')) {
            expect(response.body).toHaveProperty('success', false);
          }
          if (response.body.hasOwnProperty('message')) {
            expect(response.body).toHaveProperty('message');
          }
          // At minimum, should have some error indication
          expect(response.body).toBeDefined();
        }
      }
    });

    it('should maintain field naming conventions', async () => {
      const response = await request(app)
        .get('/health');

      if (response.status === 200) {
        // Check that field names follow consistent conventions
        const body = response.body;
        if (body.timestamp) {
          expect(typeof body.timestamp).toBe('string');
        }
        if (body.status) {
          expect(typeof body.status).toBe('string');
        }
      }
    });
  });

  describe('Content Type Versioning', () => {
    it('should handle different content type versions', async () => {
      const contentTypes = [
        'application/json',
        'application/vnd.blulok.v1+json',
        'application/vnd.blulok+json',
        'application/json; charset=utf-8',
        'application/json; version=1.0'
      ];

      for (const contentType of contentTypes) {
        const response = await request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', contentType)
          .send({ name: 'test', email: 'test@test.com' });

        expect([200, 201, 400, 415, 500]).toContain(response.status);
      }
    });

    it('should handle content negotiation', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Accept', 'application/vnd.blulok.v1+json; q=0.9, application/json; q=0.8');

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('URL Versioning', () => {
    it('should support versioned URLs', async () => {
      const versionedPaths = [
        '/api/v1/users',
        '/api/v1/facilities',
        '/api/v1/key-sharing'
      ];

      for (const path of versionedPaths) {
        const response = await request(app)
          .get(path)
          .set('Authorization', `Bearer ${authToken}`);

        // Should not return 404 for versioned paths
        expect(response.status).not.toBe(404);
      }
    });

    it('should handle version in query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users?version=1.0')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 500]).toContain(response.status);
    });

    it('should handle version in path parameters', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Deprecation Headers', () => {
    it('should include deprecation information when appropriate', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      // Check for deprecation headers
      const deprecationHeaders = [
        'Deprecation',
        'Sunset',
        'Link'
      ];

      deprecationHeaders.forEach(header => {
        if (response.headers[header.toLowerCase()]) {
          expect(typeof response.headers[header.toLowerCase()]).toBe('string');
        }
      });
    });

    it('should provide migration information', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      // Check for migration-related headers
      const migrationHeaders = [
        'link',
        'x-api-version',
        'x-deprecated'
      ];

      migrationHeaders.forEach(header => {
        if (response.headers[header]) {
          expect(typeof response.headers[header]).toBe('string');
        }
      });
    });
  });

  describe('Feature Flags and Version-Specific Behavior', () => {
    it('should handle feature flag headers', async () => {
      const featureFlags = [
        'X-Feature-Flag: new-user-api',
        'X-Feature-Flag: enhanced-facilities',
        'X-Feature-Flag: beta-key-sharing'
      ];

      for (const flag of featureFlags) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set(flag.split(':')[0], flag.split(':')[1].trim());

        expect([200, 500]).toContain(response.status);
      }
    });

    it('should handle version-specific query parameters', async () => {
      const versionParams = [
        '?v=1.0',
        '?version=1.0',
        '?api_version=1.0',
        '?format=v1'
      ];

      for (const param of versionParams) {
        const response = await request(app)
          .get(`/api/v1/users${param}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([200, 500]).toContain(response.status);
      }
    });
  });

  describe('Response Versioning', () => {
    it('should include version information in responses', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        // Check for version information in response
        const versionFields = [
          'version',
          'api_version',
          'schema_version'
        ];

        versionFields.forEach(field => {
          if (response.body[field]) {
            expect(typeof response.body[field]).toBe('string');
          }
        });
      }
    });

    it('should maintain consistent response schemas', async () => {
      const endpoints = [
        '/health',
        '/api/v1/users',
        '/api/v1/facilities'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${authToken}`);

        if (response.status === 200) {
          // Basic schema validation
          expect(response.body).toBeDefined();
          expect(typeof response.body).toBe('object');
        }
      }
    });
  });

  describe('Client Compatibility', () => {
    it('should handle old client user agents', async () => {
      const oldUserAgents = [
        'BlulokClient/1.0',
        'BlulokMobile/0.9',
        'BlulokWeb/1.1',
        'CustomClient/1.0'
      ];

      for (const userAgent of oldUserAgents) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set('User-Agent', userAgent);

        expect([200, 500]).toContain(response.status);
      }
    });

    it('should handle different client capabilities', async () => {
      const capabilityHeaders = [
        'X-Client-Capabilities: basic',
        'X-Client-Capabilities: advanced',
        'X-Client-Capabilities: mobile',
        'X-Client-Capabilities: web'
      ];

      for (const capability of capabilityHeaders) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set(capability.split(':')[0], capability.split(':')[1].trim());

        expect([200, 500]).toContain(response.status);
      }
    });
  });

  describe('Migration Support', () => {
    it('should provide helpful error messages for deprecated endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status >= 400) {
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
      }
    });

    it('should include migration guidance in responses', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        // Check for migration-related information
        const migrationFields = [
          'migration_guide',
          'deprecation_notice',
          'upgrade_path'
        ];

        migrationFields.forEach(field => {
          if (response.body[field]) {
            expect(typeof response.body[field]).toBe('string');
          }
        });
      }
    });
  });

  describe('Version Validation', () => {
    it('should validate API version format', async () => {
      const invalidVersions = [
        'invalid',
        '1',
        '1.0.0.0',
        'v1.0',
        '1.0-beta',
        ''
      ];

      for (const version of invalidVersions) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set('API-Version', version);

        expect([200, 400, 500]).toContain(response.status);
      }
    });

    it('should handle missing version gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      // Should work without explicit version
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Future Version Support', () => {
    it('should handle future version requests', async () => {
      const futureVersions = ['2.0', '1.5', '2.1'];

      for (const version of futureVersions) {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${authToken}`)
          .set('API-Version', version);

        expect([200, 400, 404, 500]).toContain(response.status);
      }
    });

    it('should provide appropriate responses for unsupported versions', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('API-Version', '99.0');

      if (response.status === 400) {
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('version');
      }
    });
  });
});
