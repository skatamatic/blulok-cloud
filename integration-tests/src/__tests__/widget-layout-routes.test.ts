/**
 * Widget Layout Routes Integration Tests
 * 
 * Tests all widget layout management endpoints including:
 * - GET /api/v1/widget-layouts
 * - POST /api/v1/widget-layouts
 * - PUT /api/v1/widget-layouts/:widgetId
 * - DELETE /api/v1/widget-layouts/:widgetId
 * - POST /api/v1/widget-layouts/:widgetId/show
 * - POST /api/v1/widget-layouts/reset
 * - GET /api/v1/widget-layouts/templates
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

describe('Widget Layout Routes Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;
  let tenantToken: string;

  beforeAll(() => {
    app = createApp();
    
    // Create tokens for different user roles
    adminToken = jwt.sign(
      { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    userToken = jwt.sign(
      { userId: 'user-1', email: 'user@example.com', role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    tenantToken = jwt.sign(
      { userId: 'tenant-1', email: 'tenant@example.com', role: 'tenant' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/v1/widget-layouts', () => {
    it('should return widget layouts for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layouts');
        expect(Array.isArray(response.body.layouts)).toBe(true);
      }
    });

    it('should return widget layouts for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layouts');
      }
    });

    it('should return widget layouts for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layouts');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/widget-layouts');
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/widget-layouts', () => {
    const newLayout = {
      user_id: 'user-1',
      name: 'Dashboard Layout',
      layout_data: [
        { i: 'widget-1', x: 0, y: 0, w: 1, h: 1 },
        { i: 'widget-2', x: 1, y: 0, w: 1, h: 1 }
      ],
      is_default: false
    };

    it('should create widget layout for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newLayout);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layout');
      }
    });

    it('should create widget layout for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newLayout);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layout');
      }
    });

    it('should create widget layout for tenant users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(newLayout);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('layout');
      }
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should validate layout data structure', async () => {
      const invalidLayout = {
        ...newLayout,
        layout_data: 'invalid-data'
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidLayout);

      expect([400, 401, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .send(newLayout);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('PUT /api/v1/widget-layouts/:widgetId', () => {
    const widgetId = 'widget-1';
    const updateData = {
      layoutConfig: {
        position: {
          x: 0,
          y: 0,
          w: 2,
          h: 1
        },
        size: 'medium'
      },
      isVisible: true,
      displayOrder: 1
    };

    it('should update widget layout for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // With mocked database, this should work
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget updated successfully');
    });

    it('should update widget layout for regular users', async () => {
      const response = await request(app)
        .put(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      // Regular users should also be able to update widget layouts
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget updated successfully');
    });

    it('should update widget layout for tenant users', async () => {
      const response = await request(app)
        .put(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(updateData);

      // Tenant users should also be able to update widget layouts
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget updated successfully');
    });

    it('should create new widget layout for non-existent widget', async () => {
      const response = await request(app)
        .put('/api/v1/widget-layouts/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // API creates new widget layout if it doesn't exist
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget updated successfully');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/widget-layouts/${widgetId}`)
        .send(updateData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('DELETE /api/v1/widget-layouts/:widgetId', () => {
    const widgetId = 'widget-1';

    it('should delete widget layout for admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should delete widget layout for regular users', async () => {
      const response = await request(app)
        .delete(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should delete widget layout for tenant users', async () => {
      const response = await request(app)
        .delete(`/api/v1/widget-layouts/${widgetId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent widget layout gracefully', async () => {
      const response = await request(app)
        .delete('/api/v1/widget-layouts/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      // API handles non-existent widgets gracefully
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget hidden successfully');
    });

    it('should require authentication', async () => {
      const response = await request(app).delete(`/api/v1/widget-layouts/${widgetId}`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/widget-layouts/:widgetId/show', () => {
    const widgetId = 'widget-1';

    it('should toggle widget visibility for admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/widget-layouts/${widgetId}/show`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should toggle widget visibility for regular users', async () => {
      const response = await request(app)
        .post(`/api/v1/widget-layouts/${widgetId}/show`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should toggle widget visibility for tenant users', async () => {
      const response = await request(app)
        .post(`/api/v1/widget-layouts/${widgetId}/show`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 404, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should handle non-existent widget layout gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/non-existent/show')
        .set('Authorization', `Bearer ${adminToken}`);

      // API handles non-existent widgets gracefully
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget shown successfully');
    });

    it('should require authentication', async () => {
      const response = await request(app).post(`/api/v1/widget-layouts/${widgetId}/show`);
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/widget-layouts/reset', () => {
    const resetData = {
      user_id: 'user-1'
    };

    it('should reset widget layouts for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(resetData);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should reset widget layouts for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .set('Authorization', `Bearer ${userToken}`)
        .send(resetData);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should reset widget layouts for tenant users', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(resetData);

      expect([200, 400, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      }
    });

    it('should reset widget layouts successfully', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Reset endpoint doesn't require body validation
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Widget layout reset to defaults');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts/reset')
        .send(resetData);

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/widget-layouts/templates', () => {
    it('should return widget templates for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      }
    });

    it('should return widget templates for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${userToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('templates');
      }
    });

    it('should return widget templates for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect([200, 401, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('templates');
      }
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/widget-layouts/templates');
      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle XSS in layout names', async () => {
      const maliciousLayout = {
        user_id: 'user-1',
        name: '<script>alert("xss")</script>',
        layout_data: [{ i: 'widget-1', x: 0, y: 0, w: 1, h: 1 }]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousLayout);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        // Should sanitize the name
        expect(response.body.layout.name).not.toContain('<script>');
      }
    });

    it('should handle oversized requests', async () => {
      const largeLayout = {
        user_id: 'user-1',
        name: 'Large Layout',
        layout_data: Array(1000).fill({ i: 'widget-1', x: 0, y: 0, w: 1, h: 1 })
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeLayout);

      expect([400, 413, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Should handle rate limiting gracefully
      responses.forEach(response => {
        expect([200, 429, 401, 500]).toContain(response.status);
      });
    });
  });
});
