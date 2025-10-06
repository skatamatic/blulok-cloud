import knex, { Knex } from 'knex';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

export class DatabaseService {
  private static instance: DatabaseService;
  private _connection: Knex | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<boolean> {
    try {
      // First, try to create the database if it doesn't exist
      const wasCreated = await this.ensureDatabaseExists();

      this._connection = knex({
        client: 'mysql2',
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          database: config.database.name,
          ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
        },
        pool: {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 30000,
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100,
        },
        migrations: {
          directory: './src/database/migrations',
          extension: 'ts',
        },
        seeds: {
          directory: './src/database/seeds',
          extension: 'ts',
        },
      });

      // Test the connection
      await this._connection.raw('SELECT 1');
      logger.info('Database connection established successfully');

      // Return whether the database was just created (for auto-seeding)
      return wasCreated;

    } catch (error) {
      logger.error('Failed to establish database connection:', error);
      throw error;
    }
  }

  private async ensureDatabaseExists(): Promise<boolean> {
    let tempConnection: Knex | null = null;
    let wasCreated = false;
    
    try {
      // Connect without specifying a database
      tempConnection = knex({
        client: 'mysql2',
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
        },
      });

      // Check if database exists
      const result = await tempConnection.raw(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
        [config.database.name]
      );

      if (!result[0] || result[0].length === 0) {
        // Database doesn't exist, create it
        logger.info(`Database '${config.database.name}' does not exist. Creating...`);
        await tempConnection.raw(`CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, [config.database.name]);
        logger.info(`Database '${config.database.name}' created successfully`);
        wasCreated = true;
      } else {
        logger.info(`Database '${config.database.name}' already exists`);
      }

      return wasCreated;

    } catch (error) {
      logger.error('Failed to ensure database exists:', error);
      throw error;
    } finally {
      if (tempConnection) {
        await tempConnection.destroy();
      }
    }
  }

  public get connection(): Knex {
    if (!this._connection) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this._connection;
  }

  public async close(): Promise<void> {
    if (this._connection) {
      await this._connection.destroy();
      this._connection = null;
      logger.info('Database connection closed');
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this._connection) {
        return false;
      }
      await this._connection.raw('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}
