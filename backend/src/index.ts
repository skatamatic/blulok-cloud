import { config } from '@/config/environment';
import { createApp } from '@/app';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';
import { MigrationService } from '@/services/migration.service';
import { WebSocketService } from '@/services/websocket.service';
import { LoggerInterceptorService } from '@/services/logger-interceptor.service';
import { DeviceEventService } from '@/services/device-event.service';
import { FMSService } from '@/services/fms/fms.service';
import { SimulatedProvider } from '@/services/fms/providers/simulated-provider';
import { GenericRestProvider } from '@/services/fms/providers/generic-rest-provider';
import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSProviderType } from '@/types/fms.types';
import { validateEd25519Env } from '@/utils/security-env';

async function bootstrap(): Promise<void> {
  try {
    // Validate security environment early
    validateEd25519Env();

    // Initialize database connection
    const dbService = DatabaseService.getInstance();
    let databaseWasCreated = false;
    
    try {
      databaseWasCreated = await dbService.initialize();
      logger.info('Database connection established');
      
      // Always run migrations
      await MigrationService.runMigrations();

      // Check if database needs seeding (either newly created or empty)
      const needsSeeding = databaseWasCreated || await MigrationService.needsSeeding();
      if (needsSeeding) {
        logger.info('Database needs initial data. Running seeds...');
        await MigrationService.runSeeds();
        logger.info('Initial data seeded successfully');
      }
      
    } catch (dbError) {
      if (config.nodeEnv === 'test') {
        logger.warn('Database setup failed (test mode), continuing without database:', dbError);
      } else {
        logger.error('Database setup failed. Aborting startup to avoid partial initialization.', dbError);
        throw dbError;
      }
    }

    // Register FMS providers
    const fmsService = FMSService.getInstance();
    fmsService.registerProvider(FMSProviderType.SIMULATED, SimulatedProvider as any);
    fmsService.registerProvider(FMSProviderType.GENERIC_REST, GenericRestProvider as any);
    fmsService.registerProvider(FMSProviderType.STOREDGE, StoredgeProvider as any);
    logger.info('FMS providers registered');

    // Create and start the application
    const app = createApp();
    
    const server = app.listen(config.port, () => {
      logger.info(`BluLok API server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });

    // Initialize WebSocket and logger interceptor
    const wsService = WebSocketService.getInstance();
    wsService.initialize(server);

    // Initialize Gateway WS for site gateways
    const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
    GatewayEventsService.getInstance().initialize(server);

    const loggerInterceptor = LoggerInterceptorService.getInstance();

    // Initialize DeviceEventService now that database is ready
    const deviceEventService = DeviceEventService.getInstance();
    deviceEventService.initialize();

    // Outbound legacy gateway polling is deprecated and disabled.
    logger.info('Outbound legacy gateway polling is disabled (using inbound WS gateways)');

    // Initialize access revocation listener (denylist on unassign)
    const { AccessRevocationListenerService } = await import('@/services/access-revocation-listener.service');
    AccessRevocationListenerService.getInstance();

    // Initialize denylist pruning service (daily cleanup of expired entries)
    const { DenylistPruningService } = await import('@/services/denylist-pruning.service');
    DenylistPruningService.getInstance().start();

    // Initialize data pruning service (daily cleanup of expired invites, OTPs, password reset tokens)
    const { DataPruningService } = await import('@/services/data-pruning.service');
    DataPruningService.getInstance().start();

    // Initialize route pass pruning service (daily cleanup of expired route pass issuance logs)
    const { RoutePassPruningService } = await import('@/services/route-pass-pruning.service');
    RoutePassPruningService.getInstance().start();

    // Legacy command worker removed (key distribution queues deprecated)

    // Graceful shutdown
    const gracefulShutdown = () => {
      logger.info('Shutting down gracefully');
      
      // Stop pruning services
      const { DenylistPruningService } = require('@/services/denylist-pruning.service');
      DenylistPruningService.getInstance().stop();
      const { DataPruningService } = require('@/services/data-pruning.service');
      DataPruningService.getInstance().stop();
      const { RoutePassPruningService } = require('@/services/route-pass-pruning.service');
      RoutePassPruningService.getInstance().stop();
      
      // Destroy logger interceptor
      loggerInterceptor.destroy();
      
      // Close WebSocket server
      wsService.destroy();
      
      // Close HTTP server
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap().catch((error) => {
  logger.error('Bootstrap failed:', error);
  process.exit(1);
});
