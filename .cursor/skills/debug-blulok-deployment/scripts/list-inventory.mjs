#!/usr/bin/env node
/**
 * List users, units, devices, gateways, facilities, or FMS configs.
 * Filter by facility name/id, role, device type, search.
 */

import { parseFlagArgs, printJson, printTable } from './lib/cli-utils.mjs';
import { withAuth } from './lib/api-client.mjs';
import {
  displayName,
  fetchDevices,
  fetchFacilities,
  fetchFmsConfigs,
  fetchGateways,
  fetchKeyShares,
  fetchUnits,
  fetchUsers,
  lockSerial,
  lockStatus,
  resolveFacility,
  unitNumber,
} from './lib/inventory.mjs';

const TYPES = {
  users: 'users',
  user: 'users',
  units: 'units',
  unit: 'units',
  devices: 'devices',
  device: 'devices',
  locks: 'locks',
  lock: 'locks',
  'access-control': 'access-control',
  ac: 'access-control',
  gateways: 'gateways',
  gateway: 'gateways',
  facilities: 'facilities',
  facility: 'facilities',
  fms: 'fms',
  shares: 'shares',
  share: 'shares',
  'key-sharing': 'shares',
};

const SPEC = {
  defaults: {
    env: undefined,
    type: undefined,
    facility: undefined,
    unit: undefined,
    search: undefined,
    role: undefined,
    status: undefined,
    lockStatus: undefined,
    deviceType: undefined,
    unassigned: false,
    limit: 50,
    json: false,
  },
  flags: {
    '--env': { key: 'env', takesValue: true },
    '--type': { key: 'type', takesValue: true },
    '--facility': { key: 'facility', takesValue: true },
    '--unit': { key: 'unit', takesValue: true },
    '--search': { key: 'search', takesValue: true },
    '--role': { key: 'role', takesValue: true },
    '--status': { key: 'status', takesValue: true },
    '--lock-status': { key: 'lockStatus', takesValue: true },
    '--device-type': { key: 'deviceType', takesValue: true },
    '--unassigned': { key: 'unassigned' },
    '--limit': { key: 'limit', takesValue: true },
    '--json': { key: 'json' },
  },
};

function normalizeType(raw) {
  if (!raw) return null;
  const type = TYPES[String(raw).toLowerCase()];
  if (!type) {
    throw new Error(
      `Unknown --type "${raw}". Use users|units|devices|locks|access-control|gateways|facilities|fms|shares`,
    );
  }
  return type;
}

function printUsers(users) {
  console.log('Users:');
  printTable(
    users.map((u) => ({
      ...u,
      name: displayName(u),
      facilities: u.facility_names ?? u.facilities ?? '',
    })),
    [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'name', label: 'name', maxWidth: 24 },
      { key: 'email', label: 'email', maxWidth: 32 },
      { key: 'role', label: 'role' },
      { key: 'facilities', label: 'facilities', maxWidth: 28 },
    ],
  );
}

function printUnits(units) {
  console.log('Units:');
  printTable(
    units.map((u) => ({
      id: u.id,
      unit: unitNumber(u),
      facility: u.facility_name ?? u.facilityName ?? '',
      tenant: u.tenant_name ?? u.primary_tenant_name ?? u.tenant_email ?? '',
      lock: lockSerial(u) ?? '—',
      lock_status: lockStatus(u),
    })),
    [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'unit', label: 'unit' },
      { key: 'facility', label: 'facility', maxWidth: 22 },
      { key: 'tenant', label: 'tenant', maxWidth: 24 },
      { key: 'lock', label: 'lock', maxWidth: 22 },
      { key: 'lock_status', label: 'lock_status' },
    ],
  );
}

function printDevices(devices, title = 'Devices') {
  console.log(`${title}:`);
  printTable(
    devices.map((d) => ({
      id: d.id,
      type: d.device_type ?? d.device_category ?? d.kind ?? '—',
      serial: d.device_serial ?? d.serial_number ?? d.access_id ?? '—',
      unit: d.unit_number ?? d.unitNumber ?? '',
      status: d.status ?? d.lock_status ?? d.device_status ?? '—',
      name: d.name ?? d.device_name ?? '',
    })),
    [
      { key: 'id', label: 'id', maxWidth: 36 },
      { key: 'type', label: 'type' },
      { key: 'serial', label: 'serial', maxWidth: 24 },
      { key: 'unit', label: 'unit' },
      { key: 'status', label: 'status' },
      { key: 'name', label: 'name', maxWidth: 20 },
    ],
  );
}

function printGateways(gateways) {
  console.log('Gateways:');
  printTable(gateways, [
    { key: 'id', label: 'id', maxWidth: 36 },
    { key: 'name', label: 'name', maxWidth: 24 },
    { key: 'facility_id', label: 'facility_id', maxWidth: 36 },
    { key: 'status', label: 'status' },
    { key: 'last_seen', label: 'last_seen', maxWidth: 24 },
  ]);
}

function printFacilities(facilities) {
  console.log('Facilities:');
  printTable(facilities, [
    { key: 'id', label: 'id', maxWidth: 36 },
    { key: 'name', label: 'name', maxWidth: 28 },
    { key: 'status', label: 'status' },
    { key: 'city', label: 'city' },
  ]);
}

function printShares(shares) {
  console.log('Key shares:');
  printTable(shares, [
    { key: 'id', label: 'id', maxWidth: 36 },
    { key: 'unit_id', label: 'unit_id', maxWidth: 36 },
    { key: 'primary_tenant_id', label: 'owner', maxWidth: 36 },
    { key: 'shared_with_user_id', label: 'shared_with', maxWidth: 36 },
    { key: 'is_active', label: 'active' },
    { key: 'access_level', label: 'level' },
  ]);
}

function printFms(configs) {
  console.log('FMS:');
  printTable(configs, [
    { key: 'facility_id', label: 'facility_id', maxWidth: 36 },
    { key: 'facility_name', label: 'facility', maxWidth: 22 },
    { key: 'provider_type', label: 'provider' },
    { key: 'is_enabled', label: 'enabled' },
    { key: 'webhook_auth_mode', label: 'webhook_auth' },
    { key: 'last_sync_status', label: 'last_sync' },
  ]);
}

async function runList(options) {
  return withAuth({ env: options.env }, async ({ config, api }) => {
    const type = normalizeType(options.type);
    const facility = options.facility ? await resolveFacility(api, options.facility) : null;
    const facilityId = facility?.id;
    const limit = Number(options.limit) || 50;
    const common = { facilityId, search: options.search, limit };

    const out = {
      deployment: config.envName,
      apiBase: config.apiBase,
      facility: facility ? { id: facility.id, name: facility.name } : null,
      type: type ?? (facilityId ? 'all' : null),
    };

    if (!type && !facilityId) {
      throw new Error('Provide --type <users|units|devices|locks|gateways|facilities|fms|shares> and/or --facility');
    }

    const want = (name) => !type || type === name || (type === 'devices' && (name === 'locks' || name === 'access-control'));

    if (want('users') && (type === 'users' || facilityId)) {
      out.users = await fetchUsers(api, { ...common, role: options.role });
    }
    if (want('units') && (type === 'units' || facilityId)) {
      out.units = await fetchUnits(api, { ...common, status: options.status, lockStatus: options.lockStatus });
    }
    if (type === 'locks' || type === 'devices' || (!type && facilityId)) {
      out.locks = await fetchDevices(api, {
        ...common,
        status: options.status,
        deviceType: 'blulok',
        unassigned: options.unassigned,
      });
    }
    if (type === 'access-control' || type === 'devices' || (!type && facilityId)) {
      out.accessControl = await fetchDevices(api, {
        ...common,
        status: options.status,
        deviceType: 'access_control',
      });
    }
    if (want('gateways') && (type === 'gateways' || facilityId)) {
      out.gateways = await fetchGateways(api, { facilityId });
    }
    if (want('facilities') && type === 'facilities') {
      out.facilities = await fetchFacilities(api, { search: options.search, status: options.status, limit });
    }
    if (want('fms') && (type === 'fms' || facilityId)) {
      out.fms = await fetchFmsConfigs(api, { facilityId });
    }
    if (type === 'shares') {
      out.shares = await fetchKeyShares(api, {
        unitId: options.unit,
        limit,
      });
    }

    return out;
  });
}

function printAll(result) {
  console.log(
    `Deployment: ${result.deployment} (${result.apiBase})` +
      (result.facility ? `\nFacility: ${result.facility.name} (${result.facility.id})` : '') +
      '\n',
  );

  if (result.facilities) printFacilities(result.facilities.facilities);
  if (result.users) {
    printUsers(result.users.users);
    console.log(`  (${result.users.total} total)\n`);
  }
  if (result.units) {
    printUnits(result.units.units);
    console.log(`  (${result.units.total} total)\n`);
  }
  if (result.locks) {
    printDevices(result.locks.devices, 'BluLoks');
    console.log(`  (${result.locks.total} total)\n`);
  }
  if (result.accessControl) {
    printDevices(result.accessControl.devices, 'Access control');
    console.log(`  (${result.accessControl.total} total)\n`);
  }
  if (result.gateways) {
    printGateways(result.gateways.gateways);
    console.log('');
  }
  if (result.fms) {
    printFms(result.fms.configs);
    console.log('');
  }
  if (result.shares) {
    printShares(result.shares.shares);
    console.log(`  (${result.shares.total} total)\n`);
  }
}

async function main() {
  const options = parseFlagArgs(process.argv, SPEC);
  if (options.help) {
    console.log(`Usage:
  node list-inventory.mjs --type users|units|devices|locks|access-control|gateways|facilities|fms|shares
  node list-inventory.mjs --facility "621 Sandbox"
  node list-inventory.mjs --type users --facility <uuid> --role tenant
  node list-inventory.mjs --type locks --facility <uuid> --unassigned
  node list-inventory.mjs --type shares --unit <uuid>
`);
    process.exit(0);
  }

  const result = await runList(options);
  if (options.json) printJson(result);
  else printAll(result);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
