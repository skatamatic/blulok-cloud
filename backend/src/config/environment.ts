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
  
  // Database configuration
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(3306),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  // Operations/Root keys (Ed25519)
  OPS_ED25519_PRIVATE_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  OPS_ED25519_PUBLIC_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  ROOT_ED25519_PUBLIC_KEY_B64: Joi.string().when('NODE_ENV', { is: 'test', then: Joi.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), otherwise: Joi.string().required() }),
  ROUTE_PASS_TTL_HOURS: Joi.number().integer().min(1).default(24),
  FALLBACK_IAT_SKEW_SECONDS: Joi.number().integer().min(0).default(10),
  
  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:3001,http://localhost:3002'),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  TRUST_PROXY_DEPTH: Joi.number().integer().min(0).default(0),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export interface Config {
  nodeEnv: string;
  port: number;
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
  server: {
    trustProxyDepth: number;
  };
  security: {
    opsPrivateKeyB64: string;
    opsPublicKeyB64: string;
    rootPublicKeyB64: string;
    routePassTtlHours: number;
    fallbackIatSkewSeconds: number;
  };
}

export const config: Config = {
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
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
  server: {
    trustProxyDepth: envVars.TRUST_PROXY_DEPTH,
  },
  security: {
    opsPrivateKeyB64: envVars.OPS_ED25519_PRIVATE_KEY_B64,
    opsPublicKeyB64: envVars.OPS_ED25519_PUBLIC_KEY_B64,
    rootPublicKeyB64: envVars.ROOT_ED25519_PUBLIC_KEY_B64,
    routePassTtlHours: envVars.ROUTE_PASS_TTL_HOURS,
    fallbackIatSkewSeconds: envVars.FALLBACK_IAT_SKEW_SECONDS,
  },
};
