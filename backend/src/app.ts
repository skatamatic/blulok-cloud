import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { config } from '@/config/environment';
import { errorHandler } from '@/middleware/error.middleware';
import { requestLogger } from '@/middleware/logger.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { defaultLimiter } from '@/middleware/security-limits';
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
import { fmsRouter } from '@/routes/fms.routes';
import { devRouter } from '@/routes/dev.routes';
import { systemSettingsRouter } from '@/routes/system-settings.routes';
import { userDevicesRouter } from '@/routes/user-devices.routes';
import commandsRouter from '@/routes/commands.routes';
import { passesRouter } from '@/routes/passes.routes';
import { internalGatewayRouter } from '@/routes/internal-gateway.routes';
import { adminRouter } from '@/routes/admin.routes';
import { denylistRouter } from '@/routes/denylist.routes';
import { routePassesRouter } from '@/routes/route-passes.routes';
import { schedulesRouter } from '@/routes/schedules.routes';
import { bluDesignRouter } from '@/bludesign';

export function createApp(): Application {
  const app = express();

  // Respect proxies only when explicitly configured (prevents rate-limit bypass)
  if (config.server.trustProxyDepth > 0) {
    app.set('trust proxy', config.server.trustProxyDepth);
  } else {
    app.set('trust proxy', false);
  }

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
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Device-Id', 'X-App-Platform', 'X-Requested-With'],
  }));

  // Explicit preflight handler to prevent 405 on OPTIONS
  app.options('*', cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Device-Id', 'X-App-Platform', 'X-Requested-With'],
  }));

  // Global rate limiting (wrapped with RateLimitBypassService and disabled in test)
  app.use(defaultLimiter);

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
  app.use('/api/v1/user-devices', userDevicesRouter);
  app.use('/api/v1/user-facilities', userFacilitiesRouter);
  app.use('/api/v1/widget-layouts', widgetLayoutsRouter);
  app.use('/api/v1/facilities', facilitiesRouter);
  app.use('/api/v1', schedulesRouter);
  app.use('/api/v1/gateways', gatewayRouter);
  app.use('/api/v1/internal/gateway', internalGatewayRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/devices', devicesRouter);
    app.use('/api/v1/units', unitsRouter);
    app.use('/api/v1/fms', fmsRouter);
    app.use('/api/v1/access-history', accessHistoryRouter);
    app.use('/api/v1/key-sharing', keySharingRouter);
  app.use('/api/v1/passes', passesRouter);
    app.use('/api/v1/route-passes', routePassesRouter);
    app.use('/api/v1/denylist', denylistRouter);
    app.use('/api/v1/commands', commandsRouter);
    app.use('/api/v1/dev', authenticateToken, devRouter);
  app.use('/api/v1/system-settings', systemSettingsRouter);
  
  // BluDesign routes (isolated 3D facility design system)
  app.use('/api/v1/bludesign', bluDesignRouter);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
