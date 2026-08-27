import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from './paths.mjs';

function parseSimpleToml(text) {
  const result = { default_env: 'develop', envs: {} };
  let section = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      const top = section.includes('.') ? section.split('.')[0] : section;
      if (!result.envs[top]) result.envs[top] = {};
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"$/);
    if (!kv) continue;

    const [, key, value] = kv;
    if (section) {
      if (section.includes('.')) {
        const [envName, subsection] = section.split('.', 2);
        if (!result.envs[envName][subsection]) result.envs[envName][subsection] = {};
        result.envs[envName][subsection][key] = value;
      } else {
        result.envs[section][key] = value;
      }
    } else if (key === 'default_env') {
      result.default_env = value;
    }
  }

  return result;
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function resolveDatabase(envBlock) {
  const dbBlock = envBlock.database ?? {};
  const passwordEnvKey = dbBlock.password_env || 'BLULOK_DEBUG_DB_PASSWORD';
  const password = process.env[passwordEnvKey] || null;

  return {
    host: dbBlock.host || '127.0.0.1',
    port: Number(dbBlock.port || 3307),
    user: dbBlock.user || 'blulok_user',
    password,
    passwordEnvKey,
    name: dbBlock.name || 'blulok_prod',
    configured: Boolean(dbBlock.host || dbBlock.name),
  };
}

export function loadDeployConfig(options = {}) {
  const configPath = options.configPath ?? path.join(SKILL_DIR, 'deploy.toml');
  const examplePath = path.join(SKILL_DIR, 'deploy.example.toml');
  const envPath = options.envPath ?? path.join(SKILL_DIR, 'deploy.env');

  loadEnvFile(envPath);

  const tomlPath = fs.existsSync(configPath) ? configPath : examplePath;
  const parsed = parseSimpleToml(fs.readFileSync(tomlPath, 'utf8'));

  const envName =
    options.env ??
    process.env.BLULOK_DEBUG_ENV ??
    parsed.default_env ??
    'develop';

  const envBlock = parsed.envs[envName];
  if (!envBlock) {
    throw new Error(
      `Unknown deploy env "${envName}". Available: ${Object.keys(parsed.envs).join(', ')}`,
    );
  }

  const passwordEnvKey = envBlock.admin_password_env || 'BLULOK_DEBUG_ADMIN_PASSWORD';
  const adminPassword = process.env[passwordEnvKey] || null;
  if (!adminPassword) {
    throw new Error(
      `Missing ${passwordEnvKey}. Copy deploy.env.example to deploy.env and set the dev_admin password.`,
    );
  }

  const database = resolveDatabase(envBlock);

  return {
    skillDir: SKILL_DIR,
    configPath: tomlPath,
    envName,
    label: envBlock.label || envName,
    apiBase: envBlock.api_base.replace(/\/$/, ''),
    adminIdentifier: envBlock.admin_identifier,
    adminPassword,
    database,
    gcp: {
      project: envBlock.gcp_project || null,
      region: envBlock.gcp_region || null,
      cloudRunBackend: envBlock.cloud_run_backend || null,
      cloudSqlInstance: envBlock.cloud_sql_instance || null,
    },
  };
}

export function sanitizeConfig(config) {
  if (!config) return config;
  return {
    ...config,
    adminPassword: config.adminPassword ? '[redacted]' : undefined,
    database: config.database
      ? { ...config.database, password: config.database.password ? '[redacted]' : null }
      : undefined,
  };
}

export function cloudSqlProxyHint(config) {
  const instance = config.gcp?.cloudSqlInstance;
  const port = config.database?.port ?? 3307;
  if (!instance) return null;
  return `cloud-sql-proxy ${instance} --port ${port}`;
}
