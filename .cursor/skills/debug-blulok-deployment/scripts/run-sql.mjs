#!/usr/bin/env node
/**
 * Run SQL against the configured deployment database (Cloud SQL via local proxy).
 *
 * Usage:
 *   node run-sql.mjs "SELECT id, email FROM users WHERE email LIKE '%test%' LIMIT 10"
 *   node run-sql.mjs --file query.sql
 *   node run-sql.mjs --write "UPDATE ..."
 *   node run-sql.mjs --unsafe "SHOW TABLES"
 */

import fs from 'node:fs';
import { parseFlagArgs, printJson, printTable } from './lib/cli-utils.mjs';
import { assertSqlAllowed, connectDatabase, runQuery } from './lib/sql-client.mjs';

const SPEC = {
  defaults: {
    env: undefined,
    file: undefined,
    write: false,
    unsafe: false,
    json: false,
    positional: [],
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--file': { key: 'file', takesValue: true },
    '--write': { key: 'write' },
    '--unsafe': { key: 'unsafe' },
    '--json': { key: 'json' },
  },
};

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node run-sql.mjs "SELECT ..."
  node run-sql.mjs --file path/to.sql
  node run-sql.mjs --write "UPDATE ... WHERE ..."
  node run-sql.mjs --unsafe "SHOW CREATE TABLE users"

Defaults to read-only (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH).
Requires deploy.env DB password and Cloud SQL proxy on the configured port.
`);
    process.exit(0);
  }

  let sql = options.positional.join(' ').trim();
  if (options.file) {
    sql = fs.readFileSync(options.file, 'utf8').trim();
  }
  if (!sql) {
    console.error('Provide SQL as an argument or --file path');
    process.exit(1);
  }

  assertSqlAllowed(sql, { write: options.write, unsafe: options.unsafe });

  const { config, connection } = await connectDatabase({ env: options.env });
  try {
    const started = Date.now();
    const result = await runQuery(connection, sql);
    const elapsedMs = Date.now() - started;

    const payload = {
      deployment: config.envName,
      database: `${config.database.host}:${config.database.port}/${config.database.name}`,
      rowCount: result.rowCount,
      elapsedMs,
      rows: result.rows,
    };

    if (options.json) {
      printJson(payload);
      return;
    }

    console.log(`${config.envName} @ ${payload.database} — ${result.rowCount} row(s) in ${elapsedMs}ms\n`);

    if (Array.isArray(result.rows) && result.rows.length && typeof result.rows[0] === 'object') {
      const keys = Object.keys(result.rows[0]);
      printTable(
        result.rows,
        keys.map((key) => ({ key, label: key, maxWidth: 40 })),
      );
    } else {
      console.log(result.rows);
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
