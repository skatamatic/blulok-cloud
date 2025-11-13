/**
 * Integration Test Server
 * 
 * This creates a backend server specifically for integration tests
 * that uses mocked database instead of real database connections.
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { errorHandler } from '@/middleware/error.middleware';
import { requestLogger } from '@/middleware/logger.middleware';
import { healthRouter } from '@/routes/health.routes';
import { authRouter } from '@/routes/auth.routes';
import { usersRouter } from '@/routes/users.routes';
import { userFacilitiesRouter } from '@/routes/user-facilities.routes';
import { widgetLayoutsRouter } from '@/routes/widget-layouts.routes';
import { facilitiesRouter } from '@/routes/facilities.routes';
import { gatewayRouter } from '@/routes/gateway.routes';
import { devicesRouter } from '@/routes/devices.routes';
import { unitsRouter } from '@/routes/units.routes';
import accessHistoryRouter from '@/routes/access-history.routes';
import keySharingRouter from '@/routes/key-sharing.routes';

// Mock the database service before importing routes
jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: createMockKnex(),
      healthCheck: jest.fn().mockResolvedValue(true),
    })),
  },
}));

// Mock all the models
jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn().mockImplementation((id) => {
      if (id === 'non-existent-user') return Promise.resolve(null);
      return Promise.resolve({
        id,
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        role: 'TENANT'
      });
    }),
    deactivateUser: jest.fn().mockResolvedValue((id: string) => ({ id, is_active: false })),
    activateUser: jest.fn().mockResolvedValue((id: string) => ({ id, is_active: true })),
    findAll: jest.fn().mockResolvedValue({
      users: [
        { id: 'user-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', role: 'ADMIN' },
        { id: 'user-2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', role: 'TENANT' }
      ],
      total: 2
    }),
    create: jest.fn().mockResolvedValue({ id: 'new-user-id' }),
    updateById: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
    deleteById: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('@/models/facility.model', () => ({
  FacilityModel: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue({
      facilities: [
        { id: 'facility-1', name: 'Test Facility 1', address: '123 Test St' },
        { id: 'facility-2', name: 'Test Facility 2', address: '456 Test Ave' }
      ],
      total: 2
    }),
    findById: jest.fn().mockImplementation((id) => Promise.resolve({
      id,
      name: 'Test Facility',
      address: '123 Test St'
    })),
    create: jest.fn().mockResolvedValue({ id: 'new-facility-id' }),
    update: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true)
  }))
}));

jest.mock('@/models/key-sharing.model', () => ({
  KeySharingModel: jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue({
      sharings: [
        { id: 'sharing-1', primary_tenant_id: 'owner-1', shared_with_user_id: 'user-1', unit_id: 'unit-1', is_active: true, expires_at: null }
      ],
      total: 1
    }),
    findById: jest.fn().mockImplementation((id) => Promise.resolve({
      id,
      primary_tenant_id: 'owner-1',
      shared_with_user_id: 'invitee-1',
      unit_id: 'unit-1',
      is_active: false,
      expires_at: null
    })),
    create: jest.fn().mockResolvedValue({ id: 'new-sharing-id' }),
    updateById: jest.fn().mockResolvedValue(true),
    deleteById: jest.fn().mockResolvedValue(true),
    getExpiredSharings: jest.fn().mockResolvedValue([]),
    getUserOwnedKeys: jest.fn().mockResolvedValue({
      sharings: [
        { id: 'sharing-1', primary_tenant_id: 'owner-1', shared_with_user_id: 'user-1', unit_id: 'unit-1', is_active: true, expires_at: null }
      ],
      total: 1
    }),
    getUserSharedKeys: jest.fn().mockResolvedValue({
      sharings: [
        { id: 'sharing-2', primary_tenant_id: 'owner-2', shared_with_user_id: 'user-2', unit_id: 'unit-1', is_active: true, expires_at: null }
      ],
      total: 1
    }),
    getUnitSharedKeys: jest.fn().mockResolvedValue({
      sharings: [],
      total: 0
    }),
    update: jest.fn().mockImplementation((_id, data) => Promise.resolve({
      id: _id,
      primary_tenant_id: 'owner-1',
      shared_with_user_id: 'invitee-1',
      unit_id: 'unit-1',
      is_active: data?.is_active ?? true,
      expires_at: data?.expires_at ?? null,
    })),
    revokeSharing: jest.fn().mockResolvedValue(true)
  }))
}));

jest.mock('@/services/auth.service', () => ({
  AuthService: {
    login: jest.fn().mockResolvedValue({
      success: true,
      token: 'mock-jwt-token',
      user: {
        id: 'test-user-id',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      }
    }),
    generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
    verifyToken: jest.fn().mockImplementation((token) => {
      if (token === 'mock-jwt-token') {
        return { userId: 'test-user-id', role: 'admin' };
      }
      return null;
    }),
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    comparePassword: jest.fn().mockResolvedValue(true),
    createUser: jest.fn().mockResolvedValue({ success: true, id: 'new-user-id' }),
    changePassword: jest.fn().mockResolvedValue({ success: true, message: 'Password changed successfully' }),
    canManageUsers: jest.fn().mockReturnValue(true),
    hasPermission: jest.fn().mockImplementation((role, _requiredRoles) => {
      // ADMIN and DEV_ADMIN have all permissions
      if (role === 'admin' || role === 'dev_admin') {
        return true;
      }
      // For now, allow all permissions for testing
      return true;
    }),
    canAccessAllFacilities: jest.fn().mockImplementation((role) => {
      return role === 'admin' || role === 'dev_admin';
    })
  }
}));

// Mock Knex for database operations
const createMockKnex = () => {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    whereNotBetween: jest.fn().mockReturnThis(),
    whereExists: jest.fn().mockReturnThis(),
    whereNotExists: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereNotIn: jest.fn().mockReturnThis(),
    orWhereNull: jest.fn().mockReturnThis(),
    orWhereNotNull: jest.fn().mockReturnThis(),
    orWhereBetween: jest.fn().mockReturnThis(),
    orWhereNotBetween: jest.fn().mockReturnThis(),
    orWhereExists: jest.fn().mockReturnThis(),
    orWhereNotExists: jest.fn().mockReturnThis(),
    orWhereRaw: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    rightJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    outerJoin: jest.fn().mockReturnThis(),
    crossJoin: jest.fn().mockReturnThis(),
    joinRaw: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    groupByRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    orderByRaw: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    havingIn: jest.fn().mockReturnThis(),
    havingNotIn: jest.fn().mockReturnThis(),
    havingNull: jest.fn().mockReturnThis(),
    havingNotNull: jest.fn().mockReturnThis(),
    havingBetween: jest.fn().mockReturnThis(),
    havingNotBetween: jest.fn().mockReturnThis(),
    havingExists: jest.fn().mockReturnThis(),
    havingNotExists: jest.fn().mockReturnThis(),
    havingRaw: jest.fn().mockReturnThis(),
    orHaving: jest.fn().mockReturnThis(),
    orHavingIn: jest.fn().mockReturnThis(),
    orHavingNotIn: jest.fn().mockReturnThis(),
    orHavingNull: jest.fn().mockReturnThis(),
    orHavingNotNull: jest.fn().mockReturnThis(),
    orHavingBetween: jest.fn().mockReturnThis(),
    orHavingNotBetween: jest.fn().mockReturnThis(),
    orHavingExists: jest.fn().mockReturnThis(),
    orHavingNotExists: jest.fn().mockReturnThis(),
    orHavingRaw: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    union: jest.fn().mockReturnThis(),
    unionAll: jest.fn().mockReturnThis(),
    intersect: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({}),
    then: jest.fn().mockResolvedValue([]),
    catch: jest.fn().mockResolvedValue([]),
    finally: jest.fn().mockResolvedValue([]),
    raw: jest.fn().mockResolvedValue([]),
    fn: {
      now: jest.fn().mockReturnValue('NOW()'),
    },
  };

  const mockKnex = jest.fn((_tableName: string) => mockQueryBuilder) as any;
  
  // Add properties to the mock function
  Object.assign(mockKnex, {
    // Transaction support
    transaction: jest.fn().mockImplementation((callback) => {
      const mockTrx = createMockKnex();
      return callback(mockTrx);
    }),
    
    // Migration support
    migrate: {
      latest: jest.fn().mockResolvedValue([]),
      rollback: jest.fn().mockResolvedValue([]),
      status: jest.fn().mockResolvedValue([]),
    },
    
    // Seed support
    seed: {
      run: jest.fn().mockResolvedValue([]),
    },
    
    // Connection management
    destroy: jest.fn().mockResolvedValue(undefined),
  });
  
  return mockKnex;
};

export function createIntegrationTestApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Higher limit for tests
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Compression and parsing middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Health check routes
  app.use('/health', healthRouter);

  // API routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/user-facilities', userFacilitiesRouter);
  app.use('/api/v1/widget-layouts', widgetLayoutsRouter);
  app.use('/api/v1/facilities', facilitiesRouter);
  app.use('/api/v1/gateways', gatewayRouter);
  app.use('/api/v1/devices', devicesRouter);
  app.use('/api/v1/units', unitsRouter);
  app.use('/api/v1/access-history', accessHistoryRouter);
  app.use('/api/v1/key-sharing', keySharingRouter);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
