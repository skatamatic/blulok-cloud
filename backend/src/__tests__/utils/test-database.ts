import knex from 'knex';

// Test database configuration
const testDbConfig = {
  client: 'mysql2',
  connection: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '3306'),
    user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || '',
    database: process.env.TEST_DB_NAME || 'blulok_test',
    charset: 'utf8mb4',
  },
  pool: {
    min: 1,
    max: 5,
  },
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/database/seeds',
  },
};

export const testDb = knex(testDbConfig);

// Helper functions for test database management
export const setupTestDb = async () => {
  try {
    // Create test database if it doesn't exist
    const tempDb = knex({
      client: 'mysql2',
      connection: {
        host: testDbConfig.connection.host,
        port: testDbConfig.connection.port,
        user: testDbConfig.connection.user,
        password: testDbConfig.connection.password,
      },
    });

    await tempDb.raw(`CREATE DATABASE IF NOT EXISTS ${testDbConfig.connection.database}`);
    await tempDb.destroy();

    // Run migrations
    await testDb.migrate.latest();
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error;
  }
};

export const teardownTestDb = async () => {
  try {
    // Drop all tables
    await testDb.migrate.rollback();
    await testDb.destroy();
  } catch (error) {
    console.error('Error tearing down test database:', error);
    throw error;
  }
};

export const cleanTestDb = async () => {
  try {
    // Clean all tables but keep structure
    const tables = await testDb.raw(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME NOT IN ('knex_migrations', 'knex_migrations_lock')
    `, [testDbConfig.connection.database]);

    for (const table of tables[0]) {
      await testDb.raw(`TRUNCATE TABLE ${table.TABLE_NAME}`);
    }
  } catch (error) {
    console.error('Error cleaning test database:', error);
    throw error;
  }
};
