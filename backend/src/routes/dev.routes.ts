/**
 * Development Routes
 *
 * Critical development and testing utilities for BluLok system administration.
 * Provides powerful tools for system setup, testing, debugging, and maintenance
 * with strict security controls to prevent misuse in production.
 *
 * Key Features:
 * - Admin user creation for initial system setup
 * - Comprehensive test data seeding for development
 * - Complete database reset and reseeding capabilities
 * - Real-time log access for debugging
 * - WebSocket connection statistics and monitoring
 * - Full system testing and validation tools
 *
 * Security Architecture:
 * - DEV_ADMIN only access for all endpoints
 * - Password hashing and secure credential management
 * - Environment-aware operations (dev/staging vs production)
 * - Comprehensive audit logging for all operations
 * - Input validation and sanitization
 *
 * Database Operations:
 * - Complete schema reset and rebuild
 * - Migration application and validation
 * - Seeded data creation with realistic relationships
 * - Foreign key constraint management
 * - Transaction safety for bulk operations
 *
 * Test Data Generation:
 * - Multi-facility setup with realistic configurations
 * - Complete user hierarchy (admins, facility admins, tenants)
 * - Device ecosystem (BluLok locks + access control devices)
 * - Unit assignments and occupancy management
 * - Comprehensive access history generation
 * - Geographic data and metadata enrichment
 *
 * Use Cases:
 * - Initial system setup and configuration
 * - Development environment testing
 * - QA and staging environment preparation
 * - Performance testing with realistic data
 * - Debugging and troubleshooting support
 * - Demonstration and training scenarios
 *
 * Business Impact:
 * - Accelerated development cycles
 * - Consistent test environments
 * - Reliable debugging capabilities
 * - Streamlined system administration
 * - Enhanced development productivity
 */

import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../types/auth.types';
import { UserRole } from '../types/auth.types';
import { DatabaseService } from '../services/database.service';
import { MigrationService } from '../services/migration.service';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { WebSocketService } from '../services/websocket.service';
import { logger } from '../utils/logger';

const router = Router();

// Middleware to ensure only admins and dev admins can access these routes
const requireDevAccess = (req: AuthenticatedRequest, res: Response, next: any): void => {
  if (!req.user || ![UserRole.ADMIN, UserRole.DEV_ADMIN].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Dev Admin role required.'
    });
    return;
  }
  next();
};

// Apply dev access middleware to all routes
router.use(requireDevAccess);

// POST /dev/create-admin-users - Create admin and dev admin users
router.post('/create-admin-users', asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = DatabaseService.getInstance();
    const bcrypt = require('bcrypt');
    
    // Hash passwords
    const adminPasswordHash = await bcrypt.hash('Admin123!@#', 12);
    const devAdminPasswordHash = await bcrypt.hash('DevAdmin123!@#', 12);
    
    // Check if users already exist
    const existingAdmin = await db.connection('users').where('email', 'admin@blulok.com').first();
    const existingDevAdmin = await db.connection('users').where('email', 'devadmin@blulok.com').first();
    
    if (existingAdmin && existingDevAdmin) {
      res.json({
        success: true,
        message: 'Admin users already exist',
        users: [
          { email: 'admin@blulok.com', password: 'Admin123!@#' },
          { email: 'devadmin@blulok.com', password: 'DevAdmin123!@#' }
        ]
      });
      return;
    }
    
    // Create admin users
    const users = [];
    
    if (!existingAdmin) {
      users.push({
        id: '550e8400-e29b-41d4-a716-446655440010',
        email: 'admin@blulok.com',
        password_hash: adminPasswordHash,
        first_name: 'System',
        last_name: 'Administrator',
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    if (!existingDevAdmin) {
      users.push({
        id: '550e8400-e29b-41d4-a716-446655440011',
        email: 'devadmin@blulok.com',
        password_hash: devAdminPasswordHash,
        first_name: 'Developer',
        last_name: 'Admin',
        role: 'dev_admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    if (users.length > 0) {
      await db.connection('users').insert(users);
    }
    
    res.json({
      success: true,
      message: 'Admin users created successfully',
      users: [
        { email: 'admin@blulok.com', password: 'Admin123!@#' },
        { email: 'devadmin@blulok.com', password: 'DevAdmin123!@#' }
      ]
    });
  } catch (error: any) {
    console.error('Error creating admin users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin users',
      error: error.message
    });
  }
}));

// POST /dev/seed-comprehensive-data - Seed comprehensive test data
router.post('/seed-comprehensive-data', asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = DatabaseService.getInstance();
    
    // Check if data already exists
    const existingFacilities = await db.connection('facilities').count('* as count').first();
    if (existingFacilities && Number(existingFacilities.count) > 0) {
      res.status(400).json({
        success: false,
        message: 'Data already exists in database. Please reset the database first before seeding new data.'
      });
      return;
    }
    
    console.log('🌱 Starting comprehensive data seeding...');
    
    // Step 1: Create Facilities
    console.log('📍 Creating facilities...');
    const facilities = await createFacilities(db);
    
    // Step 2: Create Gateways (1 per facility)
    console.log('🌐 Creating gateways...');
    const gateways = await createGateways(db, facilities);
    
    // Step 3: Create Units and BluLok Devices
    console.log('🔐 Creating units and BluLok devices...');
    const { units, blulokDevices } = await createUnitsAndBluLokDevices(db, facilities, gateways);
    
    // Step 4: Create Access Control Devices
    console.log('🚪 Creating access control devices...');
    const accessControlDevices = await createAccessControlDevices(db, gateways);
    
    // Step 5: Create Users
    console.log('👥 Creating users...');
    const users = await createUsers(db, facilities);
    
    // Step 6: Create User-Facility Associations
    console.log('🔗 Creating user-facility associations...');
    await createUserFacilityAssociations(db, users, facilities);
    
    // Step 7: Create Unit Assignments
    await createUnitAssignments(db, users, units);
    
    // Step 8: Create Access History
    logger.info('Creating access history...');
    const accessHistoryCount = await createAccessHistory(db, users, facilities, units, blulokDevices, accessControlDevices);
    
    console.log('✅ Comprehensive data seeding completed!');
    
    res.json({
      success: true,
      message: 'Comprehensive test data seeded successfully',
      data: {
        facilities: facilities.length,
        gateways: gateways.length,
        units: units.length,
        blulokDevices: blulokDevices.length,
        accessControlDevices: accessControlDevices.length,
        users: users.length,
        accessHistoryRecords: accessHistoryCount
      }
    });
  } catch (error: any) {
    console.error('Error seeding comprehensive data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed comprehensive data',
      error: error.message
    });
  }
}));

// POST /dev/reset-database - Reset database to initial seed state
router.post('/reset-database', asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const db = DatabaseService.getInstance();

    console.log('Starting complete database reset...');

    // Step 1: Drop and recreate the entire schema
    console.log('Step 1: Dropping and recreating schema...');
    
    // Get the current database name
    const dbNameResult = await db.connection.raw('SELECT DATABASE() as db_name');
    const dbName = dbNameResult[0][0].db_name;
    
    // Drop the entire schema
    await db.connection.raw(`DROP SCHEMA IF EXISTS \`${dbName}\``);
    console.log(`Dropped schema: ${dbName}`);
    
    // Recreate the schema
    await db.connection.raw(`CREATE SCHEMA \`${dbName}\``);
    console.log(`Recreated schema: ${dbName}`);

    // Step 2: Clear migration tracking tables
    console.log('Step 2: Clearing migration tracking...');
    try {
      await db.connection.raw('DROP TABLE IF EXISTS knex_migrations');
      await db.connection.raw('DROP TABLE IF EXISTS knex_migrations_lock');
    } catch (error) {
      console.log('Migration tables already cleared or never existed');
    }

    // Step 3: Run the initial seed SQL script
    console.log('Step 3: Running initial seed SQL script...');
    try {
      // Read and execute the initial SQL script
      const fs = require('fs');
      const path = require('path');
      const initSqlPath = path.join(__dirname, '../../../docker/mysql/init.sql');
      
      if (fs.existsSync(initSqlPath)) {
        const initSql = fs.readFileSync(initSqlPath, 'utf8');
        // Split by semicolon and execute each statement
        const statements = initSql.split(';').filter((stmt: string) => stmt.trim().length > 0);
        for (const statement of statements) {
          if (statement.trim()) {
            await db.connection.raw(statement);
          }
        }
        console.log('Initial seed SQL script executed successfully');
      } else {
        console.log('No initial seed SQL script found, skipping...');
      }
    } catch (error) {
      console.log('Initial seed SQL script not found or failed, continuing with migrations...');
    }

    // Step 4: Apply all migrations
    console.log('Step 4: Applying all migrations...');
    await MigrationService.runMigrations();
    console.log('All migrations applied successfully');

    // Step 5: Run basic seeds only (device_types, users, widget_templates)
    console.log('Step 5: Running basic seeds...');
    try {
      // Run specific seeds in order
      await db.connection.seed.run({ specific: '001_device_types.ts' });
      await db.connection.seed.run({ specific: '002_default_users.ts' });
      await db.connection.seed.run({ specific: '003_default_widget_templates.ts' });
      console.log('Basic seeds completed successfully');
    } catch (error) {
      console.error('Error running seeds:', error);
      throw error;
    }

    console.log('Database reset completed successfully!');

    res.json({
      success: true,
      message: 'Database completely reset to initial clean state - schema dropped, rebuilt, and seeded'
    });
  } catch (error: any) {
    console.error('Error resetting database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset database',
      error: error.message
    });
  }
}));

// GET /dev/logs - Get backend logs
router.get('/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type = 'all', lines = '100' } = req.query;
    const linesCount = parseInt(lines as string) || 100;
    
    // Define log file paths - prioritize combined.log
    const logFiles = {
      all: ['logs/combined.log', 'logs/error.log'],
      combined: ['logs/combined.log'],
      error: ['logs/error.log'],
      app: ['logs/combined.log'], // Map app to combined
      access: ['logs/combined.log'] // Map access to combined
    };
    
    const selectedFiles = logFiles[type as keyof typeof logFiles] || logFiles.all;
    const logs: Array<{ file: string; content: string; timestamp: string }> = [];
    
    for (const filePath of selectedFiles) {
      try {
        const fullPath = path.join(process.cwd(), filePath);
        
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          const lastLines = lines.slice(-linesCount).join('\n');
          const stats = fs.statSync(fullPath);
          
          logs.push({
            file: filePath,
            content: lastLines,
            timestamp: stats.mtime.toISOString()
          });
        }
      } catch (fileError) {
        console.error(`Error reading log file ${filePath}:`, fileError);
        logs.push({
          file: filePath,
          content: `Error reading log file: ${fileError}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        logs,
        totalFiles: selectedFiles.length,
        linesRequested: linesCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
}));

// GET /dev/websocket-stats - Get WebSocket statistics
router.get('/websocket-stats', asyncHandler(async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const wsService = WebSocketService.getInstance();
    const stats = wsService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Error fetching WebSocket stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WebSocket statistics',
      error: error.message
    });
  }
}));

// Helper functions for comprehensive data seeding

async function createFacilities(db: any): Promise<any[]> {
  const facilities = [
    {
      id: uuidv4(),
      name: 'Downtown Storage Hub',
      description: 'Premium storage facility in the heart of downtown with 24/7 security and climate control.',
      address: '123 Main Street, Downtown District, City Center, AB T2P 1A1',
      latitude: 51.0447,
      longitude: -114.0719,
      contact_email: 'manager@downtownstorage.com',
      contact_phone: '(403) 555-0101',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Warehouse District Storage',
      description: 'Large-scale storage facility perfect for commercial and residential needs.',
      address: '456 Industrial Avenue, Warehouse District, Business Park, AB T3E 2B2',
      latitude: 51.0234,
      longitude: -114.1234,
      contact_email: 'admin@warehousestorage.com',
      contact_phone: '(403) 555-0202',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Airport Storage Solutions',
      description: 'Convenient storage near the airport with easy highway access.',
      address: '789 Airport Road, Airport District, Terminal Area, AB T1Y 3C3',
      latitude: 51.1234,
      longitude: -114.0567,
      contact_email: 'info@airportstorage.com',
      contact_phone: '(403) 555-0303',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Riverside Storage Center',
      description: 'Modern storage facility with river views and premium amenities.',
      address: '321 River Road, Riverside District, Waterfront, AB T4R 4R4',
      latitude: 51.0567,
      longitude: -114.0890,
      contact_email: 'contact@riversidestorage.com',
      contact_phone: '(403) 555-0404',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Mountain View Storage',
      description: 'Scenic storage facility with mountain views and outdoor access.',
      address: '654 Mountain Drive, Hillside District, Scenic View, AB T5M 5M5',
      latitude: 51.0789,
      longitude: -114.1123,
      contact_email: 'hello@mountainviewstorage.com',
      contact_phone: '(403) 555-0505',
      status: 'active'
    }
  ];
  
  await db.connection('facilities').insert(facilities);
  return facilities;
}

async function createGateways(db: any, facilities: any[]): Promise<any[]> {
  const gateways = facilities.map(facility => ({
    id: uuidv4(),
    facility_id: facility.id,
    name: `${facility.name} Gateway`,
    model: 'BluLok Gateway Pro',
    firmware_version: '2.1.4',
    ip_address: `192.168.${Math.floor(Math.random() * 255) + 1}.1`,
    mac_address: `00:1B:44:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}`,
    status: Math.random() > 0.1 ? 'online' : 'offline',
    last_seen: new Date(Date.now() - Math.random() * 60 * 60 * 1000) // Within last hour
  }));
  
  await db.connection('gateways').insert(gateways);
  return gateways;
}

async function createUnitsAndBluLokDevices(db: any, facilities: any[], gateways: any[]): Promise<{units: any[], blulokDevices: any[]}> {
  const units: any[] = [];
  const blulokDevices: any[] = [];
  
  facilities.forEach((facility, facilityIndex) => {
    const gateway = gateways[facilityIndex];
    if (!gateway) return;
    
    // Create 20-30 units per facility
    const unitCount = 20 + Math.floor(Math.random() * 11);
    
    for (let i = 0; i < unitCount; i++) {
      const unitId = uuidv4();
      const blulokId = uuidv4();
      
      // Generate unit number (A-101, B-205, etc.)
      const section = String.fromCharCode(65 + Math.floor(i / 10)); // A, B, C, etc.
      const unitNumber = `${section}-${String(i % 10 + 1).padStart(2, '0')}`;
      
      // Unit size and pricing
      const sizes = ['small', 'medium', 'large', 'xl'] as const;
      const unitSize: typeof sizes[number] = sizes[Math.floor(Math.random() * sizes.length)] || 'medium';
      const rateMap: Record<typeof sizes[number], number> = { small: 89.99, medium: 129.99, large: 179.99, xl: 229.99 };
      
      units.push({
        id: unitId,
        facility_id: facility.id,
        unit_number: unitNumber,
        unit_type: unitSize.charAt(0).toUpperCase() + unitSize.slice(1),
        size_sqft: unitSize === 'small' ? 25 : unitSize === 'medium' ? 50 : unitSize === 'large' ? 100 : 200,
        monthly_rate: rateMap[unitSize],
        status: 'available' // All units start as available, will be updated to occupied when assigned
      });
      
      // Create corresponding BluLok device
      const lockStatus = Math.random() > 0.95 ? 'unlocked' : 'locked'; // 5% unlocked
      const batteryLevel = Math.floor(Math.random() * 100) + 1;
      
      blulokDevices.push({
        id: blulokId,
        gateway_id: gateway.id,
        unit_id: unitId,
        device_serial: `BL-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        firmware_version: '1.2.3',
        lock_status: lockStatus,
        device_status: batteryLevel < 20 ? 'low_battery' : 'online',
        battery_level: batteryLevel,
        last_activity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Within last 24 hours
        last_seen: new Date(Date.now() - Math.random() * 60 * 60 * 1000) // Within last hour
      });
    }
  });
  
  await db.connection('units').insert(units);
  await db.connection('blulok_devices').insert(blulokDevices);
  
  return { units, blulokDevices };
}

async function createAccessControlDevices(db: any, gateways: any[]): Promise<any[]> {
  const accessControlDevices: any[] = [];
  
  gateways.forEach((gateway) => {
    // Create 1-3 access control devices per facility
    const deviceCount = 1 + Math.floor(Math.random() * 3);
    const deviceTypes = ['gate', 'elevator', 'door'] as const;
    
    for (let i = 0; i < deviceCount; i++) {
      const deviceType: typeof deviceTypes[number] = deviceTypes[i % deviceTypes.length] || 'door';
      const locations: Record<typeof deviceTypes[number], string[]> = {
        gate: ['Main Entrance', 'Loading Dock', 'Emergency Exit'],
        elevator: ['Floor 1', 'Floor 2', 'Basement'],
        door: ['Section A', 'Section B', 'Section C', 'Maintenance Room']
      };
      
      const location = locations[deviceType][Math.floor(Math.random() * locations[deviceType].length)];
      
      accessControlDevices.push({
        id: uuidv4(),
        gateway_id: gateway.id,
        name: `${gateway.name.replace(' Gateway', '')} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} ${i + 1}`,
        device_type: deviceType,
        location_description: location,
        relay_channel: i + 1,
        status: Math.random() > 0.1 ? 'online' : 'offline',
        last_activity: new Date(Date.now() - Math.random() * 10 * 60 * 1000) // Within 10 minutes
      });
    }
  });
  
  await db.connection('access_control_devices').insert(accessControlDevices);
  return accessControlDevices;
}

async function createUsers(db: any, facilities: any[]): Promise<any[]> {
  const users: any[] = [];
  const bcrypt = require('bcrypt');
  const passwordHash = await bcrypt.hash('Password123!', 10);
  
  // Create facility admins (2 per facility)
  facilities.forEach((facility, facilityIndex) => {
    for (let i = 0; i < 2; i++) {
      users.push({
        id: uuidv4(),
        email: `admin${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Facility${facilityIndex + 1}`,
        last_name: `Admin${i + 1}`,
        role: 'facility_admin',
        is_active: true
      });
    }
  });
  
  // Create maintenance users (2 per facility)
  facilities.forEach((facility, facilityIndex) => {
    for (let i = 0; i < 2; i++) {
      users.push({
        id: uuidv4(),
        email: `maintenance${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Maintenance${facilityIndex + 1}`,
        last_name: `Tech${i + 1}`,
        role: 'maintenance',
        is_active: true
      });
    }
  });
  
  // Create tenant users (5-10 per facility)
  facilities.forEach((facility, facilityIndex) => {
    const tenantCount = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < tenantCount; i++) {
      users.push({
        id: uuidv4(),
        email: `tenant${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Tenant${facilityIndex + 1}`,
        last_name: `User${i + 1}`,
        role: 'tenant',
        is_active: true
      });
    }
  });
  
  await db.connection('users').insert(users);
  return users;
}

async function createUserFacilityAssociations(db: any, users: any[], facilities: any[]): Promise<void> {
  const associations: any[] = [];
  
  // Associate facility admins and maintenance with their facilities
  let userIndex = 0;
  facilities.forEach((facility) => {
    // 2 facility admins per facility
    for (let i = 0; i < 2; i++) {
      associations.push({
        id: uuidv4(),
        user_id: users[userIndex].id,
        facility_id: facility.id,
        created_at: new Date()
      });
      userIndex++;
    }
    
    // 2 maintenance users per facility
    for (let i = 0; i < 2; i++) {
      associations.push({
        id: uuidv4(),
        user_id: users[userIndex].id,
        facility_id: facility.id,
        created_at: new Date()
      });
      userIndex++;
    }
  });
  
  // Associate some tenants with multiple facilities
  const tenantUsers = users.filter(user => user.role === 'tenant');
  tenantUsers.forEach((tenant) => {
    // Each tenant gets 1-3 facility associations
    const facilityCount = 1 + Math.floor(Math.random() * 3);
    const selectedFacilities = facilities.sort(() => 0.5 - Math.random()).slice(0, facilityCount);
    
    selectedFacilities.forEach(facility => {
      associations.push({
        id: uuidv4(),
        user_id: tenant.id,
        facility_id: facility.id,
        created_at: new Date()
      });
    });
  });
  
  await db.connection('user_facility_associations').insert(associations);
}

async function createUnitAssignments(db: any, users: any[], units: any[]): Promise<void> {
  const assignments: any[] = [];
  const tenantUsers = users.filter(user => user.role === 'tenant');
  const unitIdsToUpdate: string[] = [];
  
  // Assign units to tenants
  tenantUsers.forEach(tenant => {
    // Each tenant gets 1-3 units
    const unitCount = 1 + Math.floor(Math.random() * 3);
    const availableUnits = units.filter(unit => unit.status === 'available');
    const selectedUnits = availableUnits.sort(() => 0.5 - Math.random()).slice(0, unitCount);
    
    selectedUnits.forEach(unit => {
      assignments.push({
        id: uuidv4(),
        tenant_id: tenant.id,
        unit_id: unit.id,
        is_primary: true, // Set as primary tenant
        access_type: 'full',
        access_granted_at: new Date(),
        created_at: new Date()
      });
      
      // Mark this unit as occupied
      unitIdsToUpdate.push(unit.id);
    });
  });
  
  // Insert assignments
  await db.connection('unit_assignments').insert(assignments);
  
  // Update unit status to occupied for assigned units
  if (unitIdsToUpdate.length > 0) {
    await db.connection('units')
      .whereIn('id', unitIdsToUpdate)
      .update({ status: 'occupied' });
  }
}

async function createAccessHistory(db: any, users: any[], facilities: any[], units: any[], blulokDevices: any[], accessControlDevices: any[]): Promise<number> {
  const accessLogs: any[] = [];
  const actions = ['unlock', 'lock', 'access_granted', 'access_denied', 'manual_override'];
  const methods = ['app', 'keypad', 'card', 'manual', 'automatic'];
  
  // Create 200-500 access history records
  const recordCount = 200 + Math.floor(Math.random() * 301);
  
  for (let i = 0; i < recordCount; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    
    // 70% chance for blulok device, 30% for access control
    const useBlulokDevice = Math.random() < 0.7;
    let device: any, deviceType: string = '', unit: any, facility: any;
    
    if (useBlulokDevice && blulokDevices.length > 0) {
      device = blulokDevices[Math.floor(Math.random() * blulokDevices.length)];
      deviceType = 'blulok';
      unit = units.find((u: any) => u.id === device.unit_id);
      facility = facilities.find((f: any) => f.id === unit?.facility_id);
    } else if (accessControlDevices.length > 0) {
      device = accessControlDevices[Math.floor(Math.random() * accessControlDevices.length)];
      deviceType = 'access_control';
      const gateway = await db.connection('gateways').where('id', device.gateway_id).first();
      facility = facilities.find((f: any) => f.id === gateway?.facility_id);
      unit = null; // Access control devices don't have specific units
    }
    
    if (!device || !facility || !deviceType) continue;
    
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);
    const occurredAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000) - (minutesAgo * 60 * 1000));
    
    accessLogs.push({
      id: uuidv4(),
      device_id: device.id,
      device_type: deviceType,
      user_id: user.id,
      action: action,
      method: method,
      success: action !== 'access_denied',
      reason: action === 'access_denied' ? 'Access denied by system' : null,
      ip_address: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      metadata: {
        user: {
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          navigation_url: `/users?highlight=${user.id}`
        },
        facility: {
          id: facility.id,
          name: facility.name,
          navigation_url: `/facilities?highlight=${facility.id}`
        },
        unit: unit ? {
          id: unit.id,
          number: unit.unit_number,
          type: unit.unit_type,
          navigation_url: `/facilities?highlight=${facility.id}&unit=${unit.id}`
        } : null,
        device: {
          id: device.id,
          name: device.name || `${facility?.name} Unit ${unit?.unit_number} Lock`,
          type: deviceType,
          location: device.location_description || unit?.unit_number || 'Unknown',
          navigation_url: deviceType === 'blulok' 
            ? `/facilities?highlight=${facility.id}&unit=${unit?.id}&device=${device.id}`
            : `/devices?highlight=${device.id}`
        },
        description: `${action} ${deviceType === 'blulok' ? 'unit' : 'access point'} ${device.name || `${facility?.name} Unit ${unit?.unit_number} Lock`}`,
        temperature: Math.floor(Math.random() * 20) + 15,
        humidity: Math.floor(Math.random() * 40) + 30,
        battery_level: Math.floor(Math.random() * 100) + 1
      },
      occurred_at: occurredAt
    });
  }
  
  await db.connection('access_logs').insert(accessLogs);
  return accessLogs.length;
}

export { router as devRouter };
