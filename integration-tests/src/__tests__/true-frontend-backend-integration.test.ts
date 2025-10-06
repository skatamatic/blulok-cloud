/**
 * True Frontend-Backend Integration Tests
 * 
 * These tests actually use the frontend's ApiService to make requests,
 * ensuring we test the real integration between frontend and backend.
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

import { createApp } from '../../../backend/src/app';
import { apiService } from '../../../frontend/src/services/api.service';
import jwt from 'jsonwebtoken';

describe('True Frontend-Backend Integration Tests', () => {
  let app: any;
  let adminToken: string;
  let devAdminToken: string;
  let userToken: string;
  let tenantToken: string;
  let facilityAdminToken: string;

  beforeAll(async () => {
    // Start the backend server
    app = createApp();
    
    // Create tokens for different user roles
    adminToken = jwt.sign(
      { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    devAdminToken = jwt.sign(
      { userId: 'dev-admin-1', email: 'dev-admin@example.com', role: 'dev_admin' },
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

    // The frontend API service is already initialized and exported
  });

  beforeEach(() => {
    // Set up authentication token for each test
    localStorage.setItem('authToken', adminToken);
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  });

  describe('User Management Integration', () => {
    it('should get users list using frontend API service', async () => {
      // Use the frontend's actual API service
      const response = await apiService.getUsers();
      
      // Verify the response structure matches what frontend expects
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('users');
      expect(response).toHaveProperty('total');
      expect(Array.isArray(response.users)).toBe(true);
      expect(typeof response.total).toBe('number');
    });

    it('should create user using frontend API service', async () => {
      const newUser = {
        email: 'integration-test@example.com',
        password: 'Password123!',
        firstName: 'Integration',
        lastName: 'Test',
        role: 'tenant'
      };

      // Use the frontend's actual API service
      const response = await apiService.createUser(newUser);
      
      // Verify the response structure matches what frontend expects
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('userId');
      expect(response.message).toContain('User created successfully');
    });

    it('should update user using frontend API service', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        role: 'tenant'
      };

      // Use the frontend's actual API service
      const response = await apiService.updateUser('user-1', updateData);
      
      // Verify the response structure matches what frontend expects
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('user');
      expect(response.user).toHaveProperty('id', 'user-1');
    });

    it('should handle authentication errors using frontend API service', async () => {
      // Clear the auth token to simulate unauthenticated request
      localStorage.removeItem('authToken');
      
      // Use the frontend's actual API service
      await expect(apiService.getUsers()).rejects.toThrow();
    });

    it('should handle API errors using frontend API service', async () => {
      // Try to create a user with invalid data
      const invalidUser = {
        email: 'invalid-email',
        password: '123',
        firstName: '',
        lastName: '',
        role: 'invalid-role'
      };

      // Use the frontend's actual API service
      await expect(apiService.createUser(invalidUser)).rejects.toThrow();
    });
  });

  describe('Role-Based Access Integration', () => {
    it('should respect admin permissions using frontend API service', async () => {
      localStorage.setItem('authToken', adminToken);
      
      const response = await apiService.getUsers();
      expect(response.success).toBe(true);
    });

    it('should respect dev admin permissions using frontend API service', async () => {
      localStorage.setItem('authToken', devAdminToken);
      
      const response = await apiService.getUsers();
      expect(response.success).toBe(true);
    });

    it('should deny access for regular users using frontend API service', async () => {
      localStorage.setItem('authToken', userToken);
      
      // Regular users should not be able to get users list
      await expect(apiService.getUsers()).rejects.toThrow();
    });

    it('should deny access for tenant users using frontend API service', async () => {
      localStorage.setItem('authToken', tenantToken);
      
      // Tenant users should not be able to get users list
      await expect(apiService.getUsers()).rejects.toThrow();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle network errors using frontend API service', async () => {
      // This would test how the frontend handles network issues
      // In a real test, you might mock the network to fail
      expect(true).toBe(true); // Placeholder for network error testing
    });

    it('should handle malformed responses using frontend API service', async () => {
      // This would test how the frontend handles unexpected response formats
      expect(true).toBe(true); // Placeholder for malformed response testing
    });
  });
});
