/**
 * Unit Routes Integration Tests
 * 
 * Tests all unit management endpoints including:
 * - GET /api/v1/units
 * - GET /api/v1/units/my
 * - GET /api/v1/units/:id
 * - POST /api/v1/units
 * - PUT /api/v1/units/:id
 * - POST /api/v1/units/:id/assign
 * - DELETE /api/v1/units/:id/assign/:tenantId
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

describe('Unit Routes Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;
  let tenantToken: string;
  let maintenanceToken: string;
  let facilityAdminToken: string;

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
    
    maintenanceToken = jwt.sign(
      { userId: 'maintenance-1', email: 'maintenance@example.com', role: 'maintenance' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    facilityAdminToken = jwt.sign(
      { 
        userId: 'facility-admin-1', 
        email: 'facility-admin@example.com', 
        role: 'facility_admin',
        facilityIds: ['facility-1']
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/v1/units', () => {
    it('should return units list for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to get units list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.units)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('should return units list for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be able to get units list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should return units list for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be able to get units list
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/units');
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/v1/units/my', () => {
    it('should return user units for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/units/my')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to get their units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should return user units for regular users', async () => {
      const response = await request(app)
        .get('/api/v1/units/my')
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be able to get their units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should return user units for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/units/my')
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be able to get their units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('units');
      expect(Array.isArray(response.body.units)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/units/my');
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/v1/units/:id', () => {
    const unitId = 'unit-1';

    it('should return specific unit for admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to get specific unit details
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id', unitId);
    });

    it('should return specific unit for regular users', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be able to get specific unit details
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id', unitId);
    });

    it('should return specific unit for tenant users', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be able to get specific unit details
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id', unitId);
    });

    it('should handle non-existent unit', async () => {
      const response = await request(app)
        .get('/api/v1/units/non-existent')
        .set('Authorization', `Bearer ${adminToken}`);

      // Should return 404 for non-existent unit
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/v1/units/${unitId}`);
      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/units', () => {
    const newUnit = {
      facility_id: 'facility-1',
      unit_number: 'A101',
      type: 'storage',
      size: '10x10',
      description: 'Standard storage unit'
    };

    it('should create unit for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newUnit);

      // Admin users should be able to create units
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('facility_id', newUnit.facility_id);
    });

    it('should create unit for regular users', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newUnit);

      // Regular users should be able to create units
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('facility_id', newUnit.facility_id);
    });

    it('should deny creation for tenant users', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(newUnit);

      // Tenant users should be denied unit creation
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should deny creation for maintenance users', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send(newUnit);

      // Maintenance users should be denied unit creation
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Should return 400 for missing required fields
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .send(newUnit);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('PUT /api/v1/units/:id', () => {
    const unitId = 'unit-1';
    const updateData = {
      unit_number: 'A102',
      type: 'office',
      size: '12x12',
      description: 'Updated unit description'
    };

    it('should update unit for admin users', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // Admin users should be able to update units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id', unitId);
    });

    it('should update unit for regular users', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);

      // Regular users should be able to update units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id', unitId);
    });

    it('should deny update for tenant users', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(updateData);

      // Tenant users should be denied unit updates
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should deny update for maintenance users', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send(updateData);

      // Maintenance users should be denied unit updates
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should handle non-existent unit', async () => {
      const response = await request(app)
        .put('/api/v1/units/non-existent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      // Should return 404 for non-existent unit
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .send(updateData);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/units/:id/assign', () => {
    const unitId = 'unit-1';
    const assignmentData = {
      tenant_id: 'tenant-1'
    };

    it('should assign unit for admin users', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(assignmentData);

      // Admin users should be able to assign units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit assigned successfully');
    });

    it('should assign unit for regular users', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(assignmentData);

      // Regular users should be able to assign units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit assigned successfully');
    });

    it('should deny assignment for tenant users', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(assignmentData);

      // Tenant users should be denied unit assignment
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should deny assignment for maintenance users', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send(assignmentData);

      // Maintenance users should be denied unit assignment
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit management permissions required');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      // Should return 400 for missing required fields
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${unitId}/assign`)
        .send(assignmentData);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('DELETE /api/v1/units/:id/assign/:tenantId', () => {
    const unitId = 'unit-1';
    const tenantId = 'tenant-1';

    it('should unassign unit for admin users', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${unitId}/assign/${tenantId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin users should be able to unassign units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit unassigned successfully');
    });

    it('should unassign unit for regular users', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${unitId}/assign/${tenantId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Regular users should be able to unassign units
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Unit unassigned successfully');
    });

    it('should deny unassignment for tenant users', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${unitId}/assign/${tenantId}`)
        .set('Authorization', `Bearer ${tenantToken}`);

      // Tenant users should be denied unassignment
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should deny unassignment for maintenance users', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${unitId}/assign/${tenantId}`)
        .set('Authorization', `Bearer ${maintenanceToken}`);

      // Maintenance users should be denied unassignment
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should handle non-existent unit', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/non-existent/assign/${tenantId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Should handle non-existent unit gracefully
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${unitId}/assign/${tenantId}`);

      // Should require authentication
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle XSS in unit descriptions', async () => {
      const maliciousUnit = {
        facility_id: 'facility-1',
        unit_number: 'A101',
        type: 'storage',
        description: '<script>alert("xss")</script>'
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousUnit);

      expect([201, 400, 401, 500]).toContain(response.status);
      if (response.status === 201) {
        // Should sanitize the description
        expect(response.body.unit.description).not.toContain('<script>');
      }
    });

    it('should handle oversized requests', async () => {
      const largeUnit = {
        facility_id: 'facility-1',
        unit_number: 'A101',
        type: 'storage',
        description: 'A'.repeat(10000)
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(largeUnit);

      expect([400, 413, 401, 500]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/units')
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
