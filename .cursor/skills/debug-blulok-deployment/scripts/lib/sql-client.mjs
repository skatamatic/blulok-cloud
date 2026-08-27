import { backendNodeRequire } from './paths.mjs';
import { cloudSqlProxyHint, loadDeployConfig } from './load-deploy-config.mjs';

const READ_ONLY_PATTERN =
  /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i;

const WRITE_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

const UNSAFE_PATTERN =
  /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|CALL|LOAD)\b/i;

export function classifySql(sql) {
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim();
  if (!stripped) return 'empty';
  if (UNSAFE_PATTERN.test(stripped)) return 'unsafe';
  if (WRITE_PATTERN.test(stripped)) return 'write';
  if (READ_ONLY_PATTERN.test(stripped)) return 'read';
  return 'unknown';
}

export function assertSqlAllowed(sql, { write = false, unsafe = false } = {}) {
  const kind = classifySql(sql);
  if (kind === 'empty') throw new Error('Empty SQL query');
  if (kind === 'unsafe' && !unsafe) {
    throw new Error('DDL/admin SQL blocked. Pass --unsafe to allow CREATE/ALTER/DROP/etc.');
  }
  if (kind === 'write' && !write && !unsafe) {
    throw new Error('Write SQL blocked. Pass --write for INSERT/UPDATE/DELETE or --unsafe for DDL.');
  }
  if (kind === 'unknown' && !write && !unsafe) {
    throw new Error('Unrecognized SQL. Pass --write or --unsafe if you intend this statement.');
  }
}

export async function connectDatabase(options = {}) {
  const config = loadDeployConfig(options);
  const db = config.database;

  if (!db.password) {
    const hint = cloudSqlProxyHint(config);
    throw new Error(
      `Missing ${db.passwordEnvKey} in deploy.env. ` +
        (hint ? `Start Cloud SQL proxy first: ${hint}` : 'Configure [develop.database] in deploy.toml.'),
    );
  }

  const mysql = backendNodeRequire('mysql2/promise');
  let connection;
  try {
    connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.name,
      multipleStatements: options.multipleStatements ?? false,
    });
  } catch (err) {
    const hint = cloudSqlProxyHint(config);
    const suffix = hint ? `\nHint: ${hint}` : '';
    throw new Error(`Database connection failed (${db.host}:${db.port}/${db.name}): ${err.message}${suffix}`);
  }

  return { config, connection, db };
}

export async function runQuery(connection, sql, params = []) {
  const [rows, fields] = await connection.execute(sql, params);
  return { rows, fields, rowCount: Array.isArray(rows) ? rows.length : 0 };
}
