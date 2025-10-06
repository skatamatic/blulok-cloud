/**
 * Test Setup with Database Mocking
 * 
 * This file sets up the test environment with mocked database services
 * to allow full API testing without requiring a real database.
 */

import { SimpleMockDatabaseService } from './mocks/simple-database.mock';

// Mock the database service before any backend imports
const mockDatabaseService = SimpleMockDatabaseService.getInstance();

// Mock the DatabaseService module
jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => mockDatabaseService
  }
}));

// Mock Knex
jest.mock('knex', () => {
  return jest.fn(() => mockDatabaseService.connection);
});

// Mock the BaseModel database access
jest.mock('@/models/base.model', () => {
  const originalModule = jest.requireActual('@/models/base.model');
  return {
    ...originalModule,
    BaseModel: class MockBaseModel extends originalModule.BaseModel {
      protected static get db() {
        return mockDatabaseService.connection;
      }
    }
  };
});

// Set up test data
export const setupTestData = () => {
  // Clear all tables
  mockDatabaseService.clearAllTables();

  // Seed users table
  mockDatabaseService.seedTable('users', [
    {
      id: 'user-1',
      email: 'admin@example.com',
      password: '$2b$10$hashedpassword', // bcrypt hash
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User',
      is_active: true
    },
    {
      id: 'user-2',
      email: 'user@example.com',
      password: '$2b$10$hashedpassword',
      role: 'user',
      first_name: 'Regular',
      last_name: 'User',
      is_active: true
    }
  ]);

  // Seed facilities table
  mockDatabaseService.seedTable('facilities', [
    {
      id: 'facility-1',
      name: 'Main Storage Facility',
      address: '123 Storage St',
      city: 'Storage City',
      state: 'SC',
      zip_code: '12345',
      is_active: true
    },
    {
      id: 'facility-2',
      name: 'Secondary Facility',
      address: '456 Storage Ave',
      city: 'Storage City',
      state: 'SC',
      zip_code: '12346',
      is_active: true
    }
  ]);

  // Seed units table
  mockDatabaseService.seedTable('units', [
    {
      id: 'unit-1',
      facility_id: 'facility-1',
      unit_number: 'A-101',
      size: '10x10',
      is_occupied: false,
      is_active: true
    },
    {
      id: 'unit-2',
      facility_id: 'facility-1',
      unit_number: 'A-102',
      size: '10x15',
      is_occupied: true,
      is_active: true
    }
  ]);

  // Seed devices table
  mockDatabaseService.seedTable('devices', [
    {
      id: 'device-1',
      facility_id: 'facility-1',
      unit_id: 'unit-1',
      device_type: 'access_control',
      device_name: 'Unit A-101 Lock',
      status: 'online',
      is_active: true
    },
    {
      id: 'device-2',
      facility_id: 'facility-1',
      unit_id: 'unit-2',
      device_type: 'blulok',
      device_name: 'Unit A-102 Lock',
      status: 'online',
      is_active: true
    }
  ]);

  // Seed gateways table
  mockDatabaseService.seedTable('gateways', [
    {
      id: 'gateway-1',
      facility_id: 'facility-1',
      gateway_name: 'Main Gateway',
      ip_address: '192.168.1.100',
      status: 'online',
      is_active: true
    }
  ]);

  // Seed key_sharing table
  mockDatabaseService.seedTable('key_sharing', [
    {
      id: 'sharing-1',
      user_id: 'user-2',
      unit_id: 'unit-1',
      shared_by: 'user-1',
      access_type: 'temporary',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      is_active: true
    }
  ]);

  // Seed access_history table
  mockDatabaseService.seedTable('access_history', [
    {
      id: 'history-1',
      user_id: 'user-2',
      unit_id: 'unit-1',
      device_id: 'device-1',
      action: 'unlock',
      timestamp: new Date(),
      success: true
    }
  ]);

  // Seed user_facility_associations table
  mockDatabaseService.seedTable('user_facility_associations', [
    {
      id: 'uf-1',
      user_id: 'user-1',
      facility_id: 'facility-1',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'uf-2',
      user_id: 'user-2',
      facility_id: 'facility-1',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'uf-3',
      user_id: 'user-3',
      facility_id: 'facility-2',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'uf-4',
      user_id: 'user-4',
      facility_id: 'facility-1',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'uf-5',
      user_id: 'user-4',
      facility_id: 'facility-2',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Seed more comprehensive user data
  mockDatabaseService.seedTable('users', [
    {
      id: 'user-1',
      email: 'admin@example.com',
      password: '$2b$10$hashedpassword',
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User',
      is_active: true,
      last_login: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'user-2',
      email: 'user@example.com',
      password: '$2b$10$hashedpassword',
      role: 'user',
      first_name: 'Regular',
      last_name: 'User',
      is_active: true,
      last_login: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'user-3',
      email: 'tenant@example.com',
      password: '$2b$10$hashedpassword',
      role: 'tenant',
      first_name: 'Tenant',
      last_name: 'User',
      is_active: true,
      last_login: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'user-4',
      email: 'facility-admin@example.com',
      password: '$2b$10$hashedpassword',
      role: 'facility_admin',
      first_name: 'Facility',
      last_name: 'Admin',
      is_active: true,
      last_login: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Seed user_widget_layouts table
  mockDatabaseService.seedTable('user_widget_layouts', [
    {
      id: 'widget-1',
      user_id: 'user-1',
      widget_id: 'widget-1',
      widget_type: 'facility_overview',
      layout_config: JSON.stringify({
        position: { x: 0, y: 0, w: 4, h: 3 },
        size: 'medium'
      }),
      is_visible: true,
      display_order: 1
    },
    {
      id: 'widget-2',
      user_id: 'user-1',
      widget_id: 'widget-2',
      widget_type: 'unit_status',
      layout_config: JSON.stringify({
        position: { x: 4, y: 0, w: 2, h: 2 },
        size: 'small'
      }),
      is_visible: true,
      display_order: 2
    }
  ]);

  // Seed default_widget_templates table
  mockDatabaseService.seedTable('default_widget_templates', [
    {
      id: 'template-1',
      widget_id: 'facility_overview',
      widget_type: 'facility_overview',
      name: 'Facility Overview',
      description: 'Overview of facility status',
      default_config: JSON.stringify({
        position: { x: 0, y: 0, w: 4, h: 3 },
        size: 'medium'
      }),
      available_sizes: ['small', 'medium', 'large'],
      required_permissions: ['admin', 'user'],
      is_active: true,
      default_order: 1
    },
    {
      id: 'template-2',
      widget_id: 'unit_status',
      widget_type: 'unit_status',
      name: 'Unit Status',
      description: 'Status of storage units',
      default_config: JSON.stringify({
        position: { x: 4, y: 0, w: 2, h: 2 },
        size: 'small'
      }),
      available_sizes: ['small', 'medium'],
      required_permissions: ['admin', 'user', 'tenant'],
      is_active: true,
      default_order: 2
    }
  ]);
};

// Clean up after tests
export const cleanupTestData = () => {
  mockDatabaseService.clearAllTables();
};

// Helper to get mock data
export const getMockData = (tableName: string) => {
  return mockDatabaseService.getTableData(tableName);
};

// Helper to add mock data
export const addMockData = (tableName: string, data: any) => {
  mockDatabaseService.seedTable(tableName, data);
};

// Helper to clear specific table
export const clearTable = (tableName: string) => {
  mockDatabaseService.clearTable(tableName);
};

// Set up test data when the module is loaded
setupTestData();
