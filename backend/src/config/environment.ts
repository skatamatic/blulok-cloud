import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  TRUST_PROXY_DEPTH: Joi.number().integer().min(0).default(0),
  
  // Database configuration
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(3306),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('30d'),
  // Operations/Root keys (Ed25519)
  OPS_ED25519_PRIVATE_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  OPS_ED25519_PUBLIC_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  ROOT_ED25519_PUBLIC_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  ROUTE_PASS_TTL_HOURS: Joi.number().integer().min(1).default(24),
  FALLBACK_IAT_SKEW_SECONDS: Joi.number().integer().min(0).default(10),
  
  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:3001,http://localhost:5173,http://localhost:3002'),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),

  /** When true, serves Swagger UI at /api/docs (defaults on; set false to disable). */
  ENABLE_OPENAPI_DOCS: Joi.string().valid('true', 'false', '1', '0').default('true'),

  /**
   * When true, greenfield gateway bind via human JWT first-install auto-bind is disabled.
   * Sticker claim + ECDSA AUTH is required for new binds. Default false (lab/legacy).
   */
  GATEWAY_ZTP_REQUIRED: Joi.string().valid('true', 'false', '1', '0').default('false'),

  /**
   * When true, push DENYLIST_SYNC replace snapshot on active-gateway AUTH_OK.
   * Default false until production gateway firmware has parity.
   */
  GATEWAY_DENYLIST_SYNC_ENABLED: Joi.string().valid('true', 'false', '1', '0').default('false'),

  /**
   * Optional 32+ char (or 64-hex) key for encrypting sensitive system_settings
   * values (Twilio auth token, SMTP password). When unset, secrets are stored plaintext.
   */
  SETTINGS_ENCRYPTION_KEY: Joi.string().min(16).optional().allow('', null),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export interface Config {
  nodeEnv: string;
  port: number;
  server: {
    trustProxyDepth: number;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  corsOrigins: string[];
  logLevel: string;
  enableOpenApiDocs: boolean;
  /** When true, disable JWT first-install auto-bind; require ZTP claim for greenfield. */
  gatewayZtpRequired: boolean;
  security: {
    opsPrivateKeyB64: string;
    opsPublicKeyB64: string;
    rootPublicKeyB64: string;
    routePassTtlHours: number;
    fallbackIatSkewSeconds: number;
  };
  /** Optional key for encrypting sensitive system_settings at rest. */
  settingsEncryptionKey?: string;
}

export const config: Config = {
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  server: {
    trustProxyDepth: envVars.TRUST_PROXY_DEPTH,
  },
  database: {
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    name: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
  },
  corsOrigins: envVars.CORS_ORIGINS.split(',').map((origin: string) => origin.trim()),
  logLevel: envVars.LOG_LEVEL,
  enableOpenApiDocs: envVars.ENABLE_OPENAPI_DOCS === 'true' || envVars.ENABLE_OPENAPI_DOCS === '1',
  gatewayZtpRequired: envVars.GATEWAY_ZTP_REQUIRED === 'true' || envVars.GATEWAY_ZTP_REQUIRED === '1',
  security: {
    opsPrivateKeyB64: envVars.OPS_ED25519_PRIVATE_KEY_B64,
    opsPublicKeyB64: envVars.OPS_ED25519_PUBLIC_KEY_B64,
    rootPublicKeyB64: envVars.ROOT_ED25519_PUBLIC_KEY_B64,
    routePassTtlHours: envVars.ROUTE_PASS_TTL_HOURS,
    fallbackIatSkewSeconds: envVars.FALLBACK_IAT_SKEW_SECONDS,
  },
  settingsEncryptionKey: envVars.SETTINGS_ENCRYPTION_KEY || undefined,
};
