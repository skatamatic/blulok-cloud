import { DatabaseService } from './database.service';
import { logger } from '@/utils/logger';

/**
 * Migration Service
 *
 * Handles database schema migrations and seeding operations for the BluLok system.
 * Provides controlled database evolution and initial data setup.
 *
 * Key Features:
 * - Automated schema migrations with version tracking
 * - Selective seed execution (essential vs test data)
 * - Migration rollback capabilities
 * - Comprehensive logging and error handling
 * - Production-safe migration patterns
 *
 * Migration Strategy:
 * - Uses Knex.js migration system with batch tracking
 * - Migrations are versioned and executed in order
 * - Rollbacks supported for development and emergency fixes
 * - Schema changes are additive and backward-compatible where possible
 *
 * Seeding Strategy:
 * - Essential seeds: Device types, default users, widget templates
 * - Test data seeds: Sample facilities, units, and test data
 * - Selective execution prevents accidental test data in production
 * - Idempotent operations to prevent duplicate data
 *
 * Production Deployment:
 * - Migrations run automatically on application startup
 * - Only essential seeds execute in production
 * - Test data seeding requires manual intervention
 * - Migration failures prevent application startup
 *
 * Development Workflow:
 * - Developers can run migrations and seeds locally
 * - Rollback capability for testing migration changes
 * - Full seed execution for complete test environments
 */
export class MigrationService {
  public static async needsSeeding(): Promise<boolean> {
    try {
      const dbService = DatabaseService.getInstance();
      const knex = dbService.connection;

      // Check if there are any users in the database
      const userCount = await knex('users').count('id as count').first();
      const hasUsers = userCount && (userCount.count as number) > 0;

      if (!hasUsers) {
        logger.info('No users found in database - seeding required');
        return true;
      }

      logger.info('Users found in database - seeding not required');
      return false;

    } catch (error) {
      // If we can't check (e.g., table doesn't exist yet), assume seeding is needed
      logger.warn('Could not check if seeding is needed, assuming it is:', error);
      return true;
    }
  }

  public static async runMigrations(): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      const knex = dbService.connection;

      logger.info('Running database migrations...');
      
      // Run migrations
      const [batchNo, migrationsList] = await knex.migrate.latest();
      
      if (migrationsList.length === 0) {
        logger.info('Database is already up to date');
      } else {
        logger.info(`Batch ${batchNo} run: ${migrationsList.length} migrations`);
        migrationsList.forEach((migration: string) => {
          logger.info(`- ${migration}`);
        });
      }

    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  public static async runSeeds(): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      const knex = dbService.connection;
      // Enable loading TypeScript seed files when running in Node without a TS runtime
      const isProd = process.env.NODE_ENV === 'production';
      if (!isProd) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('ts-node/register/transpile-only');
        } catch (_e) {
          // ignore
        }
      }
      const ext = isProd ? 'js' : 'ts';

      logger.info('Running essential database seeds...');
      
      // Only run essential seeds (device types, default users, widget templates)
      // Skip test data seeds (004, 005) which should only be run manually via dev tools
      await knex.seed.run({ specific: `001_device_types.${ext}` });
      
      await knex.seed.run({ specific: `002_default_users.${ext}` });
      
      await knex.seed.run({ specific: `003_default_widget_templates.${ext}` });
      
      logger.info('Essential database seeds completed successfully');
      logger.info('To add test data, use the Dev Tools or run: npm run seed');

    } catch (error) {
      logger.error('Seeding failed:', error);
      throw error;
    }
  }

  public static async runAllSeeds(): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      const knex = dbService.connection;

      logger.info('Running all database seeds (including test data)...');
      
      // Run all seed files
      await knex.seed.run();
      
      logger.info('All database seeds completed successfully');

    } catch (error) {
      logger.error('Seeding failed:', error);
      throw error;
    }
  }

  public static async rollbackMigration(): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      const knex = dbService.connection;

      logger.info('Rolling back last migration...');
      const [batchNo, migrationsList] = await knex.migrate.rollback();
      
      if (migrationsList.length === 0) {
        logger.info('No migrations to rollback');
      } else {
        logger.info(`Batch ${batchNo} rolled back: ${migrationsList.length} migrations`);
        migrationsList.forEach((migration: string) => {
          logger.info(`- ${migration}`);
        });
      }

    } catch (error) {
      logger.error('Migration rollback failed:', error);
      throw error;
    }
  }
}
