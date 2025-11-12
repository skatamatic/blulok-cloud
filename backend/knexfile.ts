import { config } from './src/config/environment';
import type { Knex } from 'knex';
import path from 'path';

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.name,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: path.resolve(__dirname, 'src', 'database', 'migrations'),
      extension: 'ts',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: path.resolve(__dirname, 'src', 'database', 'seeds'),
      extension: 'ts',
    },
  },

  test: {
    client: 'mysql2',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: `${config.database.name}_test`,
    },
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: path.resolve(__dirname, 'src', 'database', 'migrations'),
      extension: 'ts',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: path.resolve(__dirname, 'src', 'database', 'seeds'),
      extension: 'ts',
    },
  },

  production: {
    client: 'mysql2',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.name,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 20,
    },
    migrations: {
      directory: path.resolve(__dirname, 'src', 'database', 'migrations'),
      extension: 'js',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: path.resolve(__dirname, 'src', 'database', 'seeds'),
      extension: 'js',
    },
  },
};

export default knexConfig;
