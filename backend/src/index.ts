import { config } from '@/config/environment';
import { createApp } from '@/app';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';
import { MigrationService } from '@/services/migration.service';
import { WebSocketService } from '@/services/websocket.service';
import { LoggerInterceptorService } from '@/services/logger-interceptor.service';
import { FMSService } from '@/services/fms/fms.service';
import { SimulatedProvider } from '@/services/fms/providers/simulated-provider';
import { GenericRestProvider } from '@/services/fms/providers/generic-rest-provider';
import { FMSProviderType } from '@/types/fms.types';

async function bootstrap(): Promise<void> {
  try {
    // Initialize database connection
    const dbService = DatabaseService.getInstance();
    let databaseWasCreated = false;
    
    try {
      databaseWasCreated = await dbService.initialize();
      logger.info('Database connection established');
      
      // Always run migrations
      await MigrationService.runMigrations();
      
      // If database was just created, run seeds to set up initial data
      if (databaseWasCreated) {
        logger.info('New database detected. Running seeds to create initial data...');
        await MigrationService.runSeeds();
        logger.info('Initial data seeded successfully');
      }
      
    } catch (dbError) {
      logger.warn('Database setup failed, continuing without database:', dbError);
    }

    // Register FMS providers
    const fmsService = FMSService.getInstance();
    fmsService.registerProvider(FMSProviderType.SIMULATED, SimulatedProvider as any);
    fmsService.registerProvider(FMSProviderType.GENERIC_REST, GenericRestProvider as any);
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
    
    const loggerInterceptor = LoggerInterceptorService.getInstance();

    // Graceful shutdown
    const gracefulShutdown = () => {
      logger.info('Shutting down gracefully');
      
      
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
