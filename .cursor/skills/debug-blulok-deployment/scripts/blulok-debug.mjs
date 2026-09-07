#!/usr/bin/env node
/**
 * Unified entry point for BluLok deployment debugging scripts.
 *
 * Usage:
 *   node blulok-debug.mjs lookup --user "realize"
 *   node blulok-debug.mjs list --facility "621 Sandbox"
 *   node blulok-debug.mjs facility --facility "621 Sandbox" --report
 *   node blulok-debug.mjs access --session <uuid>
 *   node blulok-debug.mjs gateway --facility <uuid> --ws-status
 *   node blulok-debug.mjs route-pass --jwt "<token>" --report
 *   node blulok-debug.mjs fetch-pass --user "tenant@example.com" --report
 *   node blulok-debug.mjs sql "SELECT id FROM users LIMIT 5"
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

const COMMANDS = {
  lookup: 'lookup-entity.mjs',
  list: 'list-inventory.mjs',
  facility: 'inspect-facility.mjs',
  access: 'investigate-access.mjs',
  gateway: 'investigate-gateway.mjs',
  incident: 'investigate-incident.mjs',
  'route-pass': 'investigate-route-pass.mjs',
  'fetch-pass': 'fetch-route-pass.mjs',
  'decode-jwt': 'decode-route-pass-jwt.mjs',
  sql: 'run-sql.mjs',
};

function printHelp() {
  console.log(`BluLok deployment debug suite

Usage:
  node blulok-debug.mjs <command> [command flags...]

Commands:
  lookup       Find users/facilities/units/gateways by name, email, phone, id
  list         List users/units/devices/gateways/FMS/shares, filter by facility
  facility     Facility snapshot: people, units, locks, FMS, gateway WS
  access       Access sessions and raw access events
  gateway      Gateway WS status, telemetry, session trace, ping
  incident     Deep dive: session + gateway trace + telemetry + findings
  route-pass   Route pass JWT investigation
  fetch-pass   Latest live issuance (metadata); --issue to mint, --jwt to decode
  decode-jwt   Offline JWT decode (no API)
  sql          Run SQL via Cloud SQL proxy (read-only by default)

Setup:
  cp deploy.example.toml deploy.toml
  cp deploy.env.example deploy.env

Examples:
  node blulok-debug.mjs lookup --user "realize.test@mailinator.com"
  node blulok-debug.mjs list --facility "621 Sandbox" --type users
  node blulok-debug.mjs facility --facility "621 Sandbox" --report
  node blulok-debug.mjs incident --session <uuid> --report
  node blulok-debug.mjs lookup --user "email@example.com" --details --report
  node blulok-debug.mjs gateway --facility <uuid> --trace --telemetry
  node blulok-debug.mjs route-pass --jwt "<token>" --report
  node blulok-debug.mjs fetch-pass --user "tenant@example.com" --report
  node blulok-debug.mjs sql "SELECT COUNT(*) AS n FROM users"
`);
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(command ? 0 : 1);
}

const script = COMMANDS[command];
if (!script) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const child = spawn(process.execPath, [path.join(SCRIPTS_DIR, script), ...rest], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
