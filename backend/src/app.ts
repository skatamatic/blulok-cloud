import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { config } from '@/config/environment';
import { errorHandler } from '@/middleware/error.middleware';
import { requestLogger } from '@/middleware/logger.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
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

export function createApp(): Application {
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
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
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
    app.use('/api/v1/fms', fmsRouter);
    app.use('/api/v1/access-history', accessHistoryRouter);
    app.use('/api/v1/key-sharing', keySharingRouter);
    app.use('/api/v1/dev', authenticateToken, devRouter);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
