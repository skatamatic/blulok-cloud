import knex, { Knex } from 'knex';
import path from 'path';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

/**
 * Database Service
 *
 * Singleton service managing all database connectivity and operations for the BluLok system.
 * Provides centralized database connection management, health monitoring, and migration support.
 *
 * Key Features:
 * - Singleton pattern ensuring single database connection pool
 * - Automatic database creation for development environments
 * - Connection pooling with configurable limits
 * - Health monitoring and graceful shutdown
 * - Migration and seeding support
 * - SSL/TLS configuration for production security
 *
 * Connection Pool Configuration:
 * - Min/Max connections: 2-10 (configurable for different environments)
 * - Connection timeouts: 30s acquire, 30s create, 5s destroy
 * - Idle timeout: 30s with 1s reap interval
 *
 * Security Considerations:
 * - SSL/TLS enabled in production (rejectUnauthorized: false for self-signed certs)
 * - Connection credentials loaded from secure configuration
 * - Prepared statements and parameterized queries used throughout
 * - Connection pool prevents connection exhaustion attacks
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private _connection: Knex | null = null;

  private constructor() {}

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retry<T>(
    task: () => Promise<T>,
    description: string,
    attempts = 5,
    baseDelayMs = 2000
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        const isLast = attempt === attempts;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(
          `${description} failed (attempt ${attempt}/${attempts})${isLast ? '' : `, retrying in ${delay}ms`} `,
          error as any
        );
        if (isLast) break;
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  /**
   * Get singleton instance of the database service.
   * Ensures only one database connection pool exists across the application.
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the database connection and ensure database exists.
   * This method should be called once during application startup.
   *
   * Initialization Steps:
   * 1. Ensure database exists (creates if needed in development)
   * 2. Establish Knex connection with full configuration
   * 3. Configure connection pooling and SSL settings
   * 4. Set up migration and seeding directories
   *
   * @returns Promise resolving to true if initialization successful, false otherwise
   */
  public async initialize(): Promise<boolean> {
    try {
      // Ensure database exists before attempting connection, with backoff
      const wasCreated = await this.retry<boolean>(
        () => this.ensureDatabaseExists(),
        'Ensure database exists',
        5,
        2000
      );

      // Create Knex instance with full configuration
      const isProd = config.nodeEnv === 'production';
      const migrationAndSeedExtension = isProd ? 'js' : 'ts';
      const migrationsDir = isProd
        ? path.resolve(process.cwd(), 'dist', 'src', 'database', 'migrations')
        : path.resolve(__dirname, '../database/migrations');
      const seedsDir = isProd
        ? path.resolve(process.cwd(), 'dist', 'src', 'database', 'seeds')
        : path.resolve(__dirname, '../database/seeds');

      this._connection = knex({
        client: 'mysql2',
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          database: config.database.name,
          connectTimeout: 30000,
          ssl: isProd ? { rejectUnauthorized: false } : false,
        },
        pool: {
          min: 2,
          max: 10,
          acquireTimeoutMillis: 60000,
          createTimeoutMillis: 60000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100,
        },
        migrations: {
          directory: migrationsDir,
          extension: migrationAndSeedExtension,
        },
        seeds: {
          directory: seedsDir,
          extension: migrationAndSeedExtension,
        },
      });

      // Test the connection with backoff and a longer timeout
      await this.retry<void>(
        async () => {
          await this._withTimeout(
            this._connection!.raw('SELECT 1'),
            30000,
            'Database connectivity check timed out'
          );
        },
        'Database connectivity check',
        5,
        2000
      );
      logger.info('Database connection established successfully');

      // Return whether the database was just created (for auto-seeding)
      return wasCreated;

    } catch (error) {
      logger.error('Failed to establish database connection:', error);
      throw error;
    }
  }

  private async _withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
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
          connectTimeout: 30000,
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
