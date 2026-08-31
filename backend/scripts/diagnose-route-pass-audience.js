#!/usr/bin/env node
/**
 * Diagnose why a user received a given route-pass aud[] at issuance time.
 * Mirrors AudienceResolver queries against the connected database.
 *
 * Usage:
 *   node scripts/diagnose-route-pass-audience.js <userId> [--facility <uuid>] [--jti <uuid>]
 *
 * Requires backend/.env (DB_*). For Cloud SQL, start the proxy first.
 *
 * HTTP/API workflow: see .cursor/skills/debug-blulok-deployment/SKILL.md
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId;
  let facilityId;
  let jti;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--jti') {
      jti = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--user') {
      userId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--facility') {
      facilityId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (!userId) {
      userId = arg;
      continue;
    }
    if (!facilityId) {
      facilityId = arg;
    }
  }

  return { userId, facilityId, jti };
}

async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'developer',
    password: process.env.DB_PASSWORD || 'mobile',
    database: process.env.DB_NAME || 'blulok_dev',
  });
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help || !parsed.userId) {
    console.error('Usage: node scripts/diagnose-route-pass-audience.js <userId> [--facility <uuid>] [--jti <uuid>]');
    process.exit(parsed.help ? 0 : 1);
  }
  const { userId, facilityId, jti } = parsed;
  const conn = await connect();

  console.log('Route pass audience diagnostic');
  console.log(`DB: ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`User: ${userId}`);
  if (facilityId) console.log(`Facility filter: ${facilityId}`);
  if (jti) console.log(`JTI: ${jti}`);

  try {
    section('User record');
    const [users] = await conn.query(
      'SELECT id, email, login_identifier, role, is_active, is_placeholder, created_at FROM users WHERE id = ?',
      [userId],
    );
    if (!users.length) {
      console.log('NO USER ROW — pass sub does not exist in this database.');
    } else {
      console.table(users);
    }

    section('Route pass issuance log (most recent + matching jti)');
      const [recent] = await conn.query(
        `SELECT id, user_id, device_id, audiences, jti, issued_at, expires_at
         FROM route_pass_issuance_log
         WHERE user_id = ?
         ORDER BY issued_at DESC
         LIMIT 5`,
        [userId],
      );
      if (!recent.length) {
        console.log('No issuance log rows for this user in this database.');
      } else {
        for (const row of recent) {
          console.log({
            jti: row.jti,
            issued_at: row.issued_at,
            expires_at: row.expires_at,
            audiences: typeof row.audiences === 'string' ? row.audiences : JSON.stringify(row.audiences),
          });
        }
      }
      if (jti) {
        const [byJti] = await conn.query(
          'SELECT * FROM route_pass_issuance_log WHERE jti = ? LIMIT 1',
          [jti],
        );
        console.log('By JTI:', byJti.length ? byJti[0] : 'not found');
      }

    section('Unit assignments (active)');
    const assignmentSql = `
      SELECT ua.id, ua.unit_id, u.unit_number, u.facility_id, f.name AS facility_name,
             ua.is_primary, ua.access_expires_at,
             bd.id AS blulok_device_id, bd.device_serial, bd.unit_id AS device_unit_id
      FROM unit_assignments ua
      JOIN units u ON u.id = ua.unit_id
      LEFT JOIN facilities f ON f.id = u.facility_id
      LEFT JOIN blulok_devices bd ON bd.unit_id = ua.unit_id
      WHERE ua.tenant_id = ?
        AND (ua.access_expires_at IS NULL OR ua.access_expires_at > UTC_TIMESTAMP())
      ORDER BY f.name, u.unit_number`;
    const [assignments] = await conn.query(assignmentSql, [userId]);
    if (!assignments.length) {
      console.log('No active unit assignments.');
    } else {
      console.table(assignments);
      const missingDevice = assignments.filter((r) => !r.blulok_device_id);
      if (missingDevice.length) {
        console.log(
          `WARNING: ${missingDevice.length} assigned unit(s) have NO blulok_devices row — AudienceResolver inner join yields zero lock: aud entries.`,
        );
      }
      const missingSerial = assignments.filter((r) => r.blulok_device_id && !r.device_serial);
      if (missingSerial.length) {
        console.log('WARNING: assigned lock(s) missing device_serial.');
      }
    }

    section('Key shares (active)');
    const shareSql = `
      SELECT ks.id, ks.unit_id, u.unit_number, u.facility_id, ks.primary_tenant_id,
             ks.shared_with_user_id, ks.is_active, ks.expires_at,
             bd.id AS blulok_device_id, bd.device_serial
      FROM key_sharing ks
      JOIN units u ON u.id = ks.unit_id
      LEFT JOIN blulok_devices bd ON bd.unit_id = ks.unit_id
      WHERE ks.shared_with_user_id = ?
        AND ks.is_active = 1
        AND (ks.expires_at IS NULL OR ks.expires_at > UTC_TIMESTAMP())
      ORDER BY u.facility_id, u.unit_number`;
    const [shares] = await conn.query(shareSql, [userId]);
    console.log(shares.length ? shares : 'No active key shares.');

    section('AudienceResolver — assigned locks query');
    let assignedSql = `
      SELECT bd.device_serial
      FROM blulok_devices bd
      INNER JOIN unit_assignments ua ON ua.unit_id = bd.unit_id
      WHERE ua.tenant_id = ?
        AND (ua.access_expires_at IS NULL OR ua.access_expires_at > UTC_TIMESTAMP())`;
    const assignedParams = [userId];
    if (facilityId) {
      assignedSql += `
        AND EXISTS (
          SELECT 1 FROM units u
          WHERE u.id = ua.unit_id AND u.facility_id = ?
        )`;
      assignedParams.push(facilityId);
    }
    const [assignedRows] = await conn.query(assignedSql, assignedParams);
    console.log('Rows:', assignedRows);
    console.log(
      'Would emit:',
      assignedRows.map((r) => `lock:${r.device_serial}`),
    );

    section('AudienceResolver — shared locks query');
    let sharedSql = `
      SELECT bd.device_serial, ks.primary_tenant_id AS owner_user_id
      FROM blulok_devices bd
      INNER JOIN key_sharing ks ON ks.unit_id = bd.unit_id
      WHERE ks.shared_with_user_id = ?
        AND ks.is_active = 1
        AND (ks.expires_at IS NULL OR ks.expires_at > UTC_TIMESTAMP())`;
    const sharedParams = [userId];
    if (facilityId) {
      sharedSql += `
        AND EXISTS (
          SELECT 1 FROM units u
          WHERE u.id = ks.unit_id AND u.facility_id = ?
        )`;
      sharedParams.push(facilityId);
    }
    const [sharedRows] = await conn.query(sharedSql, sharedParams);
    console.log('Rows:', sharedRows);
    console.log(
      'Would emit:',
      sharedRows
        .filter((r) => r.owner_user_id && r.device_serial)
        .map((r) => `shared_key:${r.owner_user_id}:${r.device_serial}`),
    );

    section('Registered app devices');
    const [devices] = await conn.query(
      `SELECT id, app_device_id, status, created_at, updated_at
       FROM user_devices WHERE user_id = ? ORDER BY updated_at DESC`,
      [userId],
    );
    console.log(devices.length ? devices : 'No user_devices rows.');

    section('Summary');
    const audCount =
      assignedRows.length +
      sharedRows.filter((r) => r.owner_user_id && r.device_serial).length;
    if (audCount === 0) {
      console.log(
        'EMPTY aud[] is expected for this user' +
          (facilityId ? ` with facility_id=${facilityId}` : '') +
          ' given current DB state.',
      );
      console.log(
        'Common deployment causes: unit assignment without provisioned lock, lock unassigned from unit (blulok_devices.unit_id NULL), expired assignment, or facility_id filter mismatch.',
      );
    } else {
      console.log(`Resolver would produce at least ${audCount} lock/shared_key audience entries (+ access_control from AppEntryAccessService).`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
