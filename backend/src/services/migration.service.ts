import { DatabaseService } from './database.service';
import { logger } from '@/utils/logger';

export class MigrationService {
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

      logger.info('Running essential database seeds...');
      
      // Only run essential seeds (device types, default users, widget templates)
      // Skip test data seeds (004, 005) which should only be run manually via dev tools
      await knex.seed.run({
        specific: '001_device_types.ts',
      });
      
      await knex.seed.run({
        specific: '002_default_users.ts',
      });
      
      await knex.seed.run({
        specific: '003_default_widget_templates.ts',
      });
      
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
