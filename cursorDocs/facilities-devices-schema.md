# Facilities & Devices Data Model

## Overview

This document describes the comprehensive data model for BluLok's facility and device management system. The hierarchy follows this structure:

### Device list API (`GET /api/devices`)

For **facility-scoped** users (e.g. `FACILITY_ADMIN`), when the query **does not** include `facility_id`, the backend filters with **`facility_ids`** = all facilities assigned to that user (not only the first). This matches dashboard widgets such as **Remote Gate** when “All facilities” is selected so gates in every assigned facility are visible.

**`device_scope` query param** (default `operational`):

| Value | Returns |
|-------|---------|
| `operational` | BluLok + access control (existing behavior) |
| `network_infra` | Facility gateway (from `gateways` table) + `gateway_inventory_devices` (bridge, friend_node) |
| `all` | Union of both (merged, sorted, then paginated in memory) |

Network infra list items use `device_category: "network_infra"`, `device_kind` (`gateway` \| `bridge` \| `friend_node`), and `deletable: false` for the facility gateway row.

### LOCK / UNLOCK command JWT (`device_id` claim)

When the cloud delivers **LOCK** / **UNLOCK** over the inbound gateway WebSocket (`{ "type": "COMMAND", "jwt": "..." }`), the signed payload’s **`device_id` claim is the hardware serial**, not the internal UUID—same idea as route passes (`lock:<device_serial>`). **`expires_at`** (unix seconds) is `now + facilities.lock_command_timeout_sec` (default 5 minutes); **`0`** means the lock should not enforce command expiry (facility one-shot mode). Resolution: **BluLok** uses `blulok_devices.device_serial`, then optional `serial`; **access control** uses `metadata` / `device_settings` keys `device_serial` or `serial` if present; otherwise the code falls back to the internal id and logs a warning. Non-WebSocket paths (e.g. HTTP mesh `send-lock-command`) still pass the internal device id to the gateway API and include the same `expires_at` field when supported.


```
Facility (Storage Facility)
└── Gateway (Communication Hub - 1 per facility)
    ├── Access Control Devices (Gates, Elevators, Doors - 0 to N)
    └── BluLok Devices (Smart Locks - 1:1 with Units)
        └── Units (Storage Units)
            └── Unit Assignments (Tenant Access)
```

## Core Entities

### 1. Facilities

**Purpose**: Physical storage facilities that house units and devices.

**Schema**:
```sql
CREATE TABLE facilities (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  branding_image_url VARCHAR(500),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Key Features**:
- **Geographic Data**: Latitude/longitude for Google Maps integration
- **Branding**: Custom facility images and contact information
- **Status Management**: Active/inactive/maintenance states
- **Flexible Metadata**: JSON field for facility-specific data

### 2. Gateways

**Purpose**: Communication hubs that connect facility devices to the cloud platform.

**Schema**:
```sql
CREATE TABLE gateways (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  name VARCHAR(255) NOT NULL,
  model VARCHAR(100),
  firmware_version VARCHAR(50),
  ip_address VARCHAR(45), -- IPv6 support
  mac_address VARCHAR(17),
  status ENUM('online', 'offline', 'error', 'maintenance') DEFAULT 'offline',
  last_seen TIMESTAMP,
  configuration JSON,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(facility_id) -- One gateway per facility
);
```

**Key Features**:
- **1:1 Facility Relationship**: Each facility has exactly one gateway
- **Cloud-owned display name**: when a gateway is bound, `gateways.name` defaults to the facility name unless `metadata.displayNameSetByOperator` is set (operator rename). Swap candidates use `Swap candidate <short-guid>` until promoted. AUTH/inventory never supply the name. Add Facility does not pre-create a gateway — hardware auto-registers over WebSocket.
- **Network Information**: IP and MAC address tracking
- **Health Monitoring**: Online status and last seen timestamps
- **Configuration Storage**: JSON field for gateway-specific settings

### 3. Access Control Devices

**Purpose**: Physical access control devices (gates, elevators, doors) connected to gateways.

**Schema**:
```sql
CREATE TABLE access_control_devices (
  id UUID PRIMARY KEY,
  gateway_id UUID NOT NULL REFERENCES gateways(id),
  name VARCHAR(255) NOT NULL,
  device_type ENUM('gate', 'elevator', 'door') NOT NULL,
  location_description VARCHAR(255),
  relay_channel INTEGER NOT NULL,
  device_serial VARCHAR(100) NOT NULL,
  access_methods JSON NOT NULL, -- ['app' | 'keypad' | 'fob'], default ['app']
  status ENUM('online', 'offline', 'error', 'maintenance') DEFAULT 'offline',
  is_locked BOOLEAN DEFAULT TRUE,
  has_lock_feedback BOOLEAN NOT NULL DEFAULT TRUE,
  no_feedback_open_timeout_sec INTEGER NOT NULL DEFAULT 0,
  no_feedback_unlock_until TIMESTAMP NULL,
  last_activity TIMESTAMP,
  device_settings JSON,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(gateway_id, device_serial, relay_channel) -- Sync identity: access_id + relay per device
);
```

### 3.0 Network infrastructure devices (`gateway_inventory_devices`)

**Purpose:** Record-keeping for mesh hardware reported by the gateway (bridges, friend nodes). No operational commands except cloud-initiated delete notification.

```sql
CREATE TABLE gateway_inventory_devices (
  id UUID PRIMARY KEY,
  gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  device_kind VARCHAR(64) NOT NULL,        -- bridge | friend_node
  device_serial VARCHAR(128) NOT NULL,
  state VARCHAR(32),
  firmware_version VARCHAR(64),
  info JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (gateway_id, device_kind, device_serial)
);
```

The facility **gateway** itself remains in the `gateways` table and appears in the network-infra devices view but is not stored in this table.

**Key Features**:
- **Device Types**: Gates, elevators, doors with specific UI treatment
- **Relay Mapping**: Each access control device has its own relay channel (1–8). Multiple keypads on the same gateway may share the same relay number; identity is **`device_serial` + `relay_channel`**, not relay alone.
- **Configurable Access Methods**: Per-device support for app, keypad, and fob access (any combination)
- **Lock State**: Current locked/unlocked status
- **Relay-only/no-feedback mode**: when `has_lock_feedback=false`, gateway `locked` telemetry is ignored. An accepted OPEN stays logically locked when `no_feedback_open_timeout_sec=0`; otherwise cloud sets `is_locked=false` until the durable `no_feedback_unlock_until` deadline and then returns it to locked. This keeps Open usable for hardware without position sensors.
- **Activity Tracking**: Last activity timestamps for auditing

### 3.1 Access Groups (Unified Device Groups)

**Purpose**: Unified access groups control **both app-entry (route pass / BLE) and keypad access**. Each facility has one protected **default group** (`is_default=true`, name `Default Facility Group`). Because it is the default group, every tenant in the facility is entitled to its access-control devices — this guarantees a route to their unit through the shared gate/door.

**Membership model**:
- **Every access-control device and BluLok unit lock auto-joins the default group** on create/sync. **Lock-less units** are stored as unit-anchored `blulok` members (`device_id = source_unit_id = unit id`) via the unit-create hook; migration `091` backfills existing rows. Migrations `084` (access-control) and `085` (BluLok locks) repair historical device gaps.
- A device may be moved into one or more **specific (non-default) groups** to restrict a wing/section. **A device never belongs to a specific group and the default group at the same time**: adding it to its first specific group removes it from the default group; removing its last specific membership returns it to the default group automatically.
- **Access-control devices can belong to multiple specific groups at once** (e.g. a shared wing door reachable from several sub-hallway groups). The same applies to BluLok locks.

**Entitlement model**: A tenant is entitled to open **all access-control devices in any group their unit lock belongs to**. Concretely: (a) the default group's access-control devices are granted to all tenants in the facility via `is_default`; (b) for each specific group containing the tenant's accessible unit lock, the tenant is granted that group's access-control devices. This drives both route-pass (app entry) and keypad access-code distribution identically. BluLok lock entitlement itself flows from unit ownership / key-sharing — group membership only links a lock to the access-control devices it should reach.

**Legacy note**: `group_type` (`zone` | `access_code`) remains in the database for backward compatibility but entitlement and UI no longer branch on it.

**Schema**:
```sql
CREATE TABLE device_groups (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  group_type ENUM('zone', 'access_code') NOT NULL DEFAULT 'zone', -- deprecated discriminator
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  access_code_current_code VARCHAR(8) NULL,
  access_code_current_valid_from TIMESTAMP NULL,
  access_code_current_valid_until TIMESTAMP NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  settings JSON NULL,
  metadata JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  INDEX idx_device_groups_facility_default (facility_id, is_default)
);

CREATE TABLE device_group_members (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  -- device_id is a free UUID (no FK to device tables). Memberships are cleaned by:
  -- DevicesService.delete*FromInventory, DeviceModel.deleteAccessControlDevice,
  -- GatewayModel.delete / facility cascade, and startup orphan sweeper.
  device_id UUID NOT NULL,
  device_type ENUM('access_control', 'blulok') NOT NULL DEFAULT 'access_control',
  source_unit_id UUID NULL, -- BluLok unit-anchored membership
  created_at TIMESTAMP,
  UNIQUE(group_id, device_id, device_type)
);
```

### 3.2 Access Code Configs and Codes

**Purpose**: Facility-level policy for keypad code lifecycle and scoped active codes. Group-scoped code is authoritative for devices in access-code groups.

**Schema**:
```sql
CREATE TABLE access_code_configs (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  digit_count INTEGER NOT NULL DEFAULT 6, -- 3..8
  rotation_interval_hours INTEGER NOT NULL DEFAULT 24,
  rotation_hour INTEGER NOT NULL DEFAULT 0,
  rotation_minute INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(facility_id)
);

CREATE TABLE access_codes (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  scope_type ENUM('device_group', 'device') NOT NULL,
  scope_id UUID NULL,
  schedule_id UUID NULL REFERENCES schedules(id),
  code VARCHAR(8) NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  generated_by ENUM('system', 'admin') NOT NULL DEFAULT 'system',
  set_by_user_id UUID NULL REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Push outbox** (migration `075`): one active row per facility while delivery is pending.

```sql
CREATE TABLE access_code_push_outbox (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  status ENUM('pending', 'in_progress', 'failed', 'dead_letter') NOT NULL DEFAULT 'pending',
  last_nonce VARCHAR(64) NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  next_attempt_at TIMESTAMP NULL,
  coalesce_pending BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

- **`enqueue`**: upserts a pending row when codes change; coalesces multiple edits while a push is **`in_progress`** via **`coalesce_pending`**.
- **`flushPendingPushForFacility`**: sends signed JWT when gateway is online; sets in-memory push state **`pending`** when offline.
- Scheduler scans due rows every 5s; gateway **`AUTH_OK`** triggers immediate flush.

**Behavioral rules**:
- Devices in active `access_code` groups must remain synchronized to that group's current code.
- Device-scoped overrides are rejected when the target device is already in an active access-code group.
- App-facing access code results return only devices the caller can access (global shared group or tenant-scoped group membership).

### 4. Units

**Purpose**: Individual storage units within facilities that can be rented by tenants.

**Schema**:
```sql
CREATE TABLE units (
  id UUID PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  unit_number VARCHAR(50) NOT NULL,
  unit_type VARCHAR(100), -- "Small", "Medium", "Large", "Climate Controlled"
  size_sqft DECIMAL(8,2),
  monthly_rate DECIMAL(10,2),
  status ENUM('available', 'occupied', 'maintenance', 'reserved') DEFAULT 'available',
  description TEXT,
  features JSON, -- ["climate_controlled", "drive_up", "ground_floor"]
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(facility_id, unit_number) -- Unique unit number per facility
);
```

**Key Features**:
- **Flexible Numbering**: Support for various unit numbering schemes (A101, B-205, etc.)
- **Rental Information**: Size, type, and monthly rate
- **Feature Flags**: JSON array for unit features and amenities
- **Status Tracking**: Available, occupied, maintenance, reserved
- **Occupancy vs assignments**: The API treats a unit as **occupied** whenever it has **any** `unit_assignments` row (primary or shared). `UnitsService` updates `units.status` after assign/unassign so the column stays aligned; list/detail/stats queries also **derive** effective status from assignment counts so stale `available` rows cannot appear when tenants are still assigned.
- **Manual status updates**: `PUT /units/:id` rejects `available` or `reserved` while any assignment exists; the response returns **effective** status (assignment-aware). DEV_ADMIN user hard-delete syncs affected units after removing that tenant’s assignments. Facility-level unit stats use the same assignment-based occupancy counts as global unit stats.

### 5. BluLok Devices

**Purpose**: Smart lock devices that secure individual storage units.

**Schema**:
```sql
CREATE TABLE blulok_devices (
  id UUID PRIMARY KEY,
  gateway_id UUID NOT NULL REFERENCES gateways(id),
  unit_id UUID REFERENCES units(id), -- Nullable for devices not yet assigned
  device_serial VARCHAR(100) UNIQUE NOT NULL,
  firmware_version VARCHAR(50),
  lock_status ENUM('locked', 'unlocked', 'locking', 'unlocking', 'error', 'maintenance', 'unknown') DEFAULT 'locked',
  device_status ENUM('online', 'offline', 'low_battery', 'error') DEFAULT 'offline',
  battery_level INTEGER, -- 0-100
  signal_strength INTEGER, -- dBm (e.g., -65)
  temperature DECIMAL(5,2), -- Device temperature reading
  error_code VARCHAR(50), -- Error code for error states
  error_message VARCHAR(255), -- Human-readable error description
  last_activity TIMESTAMP,
  last_seen TIMESTAMP,
  device_settings JSON,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(unit_id) -- One BluLok device per unit
);
```

**Key Features**:
- **1:1 Unit Relationship**: Each unit has exactly one BluLok device (nullable for unassigned devices)
- **Dual Status**: Lock status (locked/unlocked/locking/unlocking) and device status (online/offline)
- **Battery Monitoring**: Battery level tracking for maintenance
- **Telemetry**: Signal strength, temperature, and error tracking
- **Serial Tracking**: Unique device serial numbers for inventory

### Gateway Device Sync API

The gateway uses two endpoints for device management:

**1. Inventory Sync** (`POST /api/v1/internal/gateway/devices/inventory`)
- Syncs the full device inventory for a gateway (locks and access control in one `devices[]` array)
- **Locks** (`kind: "lock"`, `lock_id` required): rows in `blulok_devices`
- **Access control** (`kind: "access_control"`, `access_id` + optional `relay_channel`, default **1**): rows in `access_control_devices`. Identity is **hardware serial + relay** (parallel to `lock_id` for BluLok). `relay_channel` is the relay output on **that keypad device** (defaults to 1 for single-relay hardware); it is **not** globally unique per gateway.
- Devices in the array that don't exist are created (access auto-provision uses `access_methods: ["keypad"]`, `metadata.createdFromGatewaySync: true`)
- **Removal policy:** only auto-provisioned devices (`metadata.createdFromGatewaySync`) are removed when omitted; admin-created devices are preserved
- Include both lock and access items in the same payload when reconciling a full gateway inventory

```json
{
  "facility_id": "uuid",
  "devices": [
    { "kind": "lock", "lock_id": "serial-or-uuid", "lock_number": 101, "firmware_version": "1.0.0" },
    { "kind": "access_control", "access_id": "KP-7F2A-001", "relay_channel": 2, "device_type": "door", "name": "Main keypad" }
  ]
}
```

Response includes lock counts at the top level and, when access items were sent, an `access_control` object with the same shape.

**2. State Update** (`POST /api/v1/internal/gateway/devices/state`)
- Partial updates for device telemetry and state
- Lock updates use `lock_id`; access control uses `kind: "access_control"` + `access_id` + `relay_channel` (`online` → `status`, `locked` → `is_locked`). For access-control rows with `has_lock_feedback=false`, cloud deliberately ignores `locked` while still applying connectivity and `last_seen`.

```json
{
  "facility_id": "uuid",
  "updates": [
    {
      "kind": "lock",
      "lock_id": "serial-or-uuid",
      "state": "CLOSED",
      "battery_level": 3423,
      "online": true
    },
    {
      "kind": "access_control",
      "access_id": "KP-7F2A-001",
      "relay_channel": 2,
      "online": true,
      "locked": true
    }
  ]
}
```

### Admin REST API (frontend / manual provisioning)

These endpoints are used by the web UI when an admin adds or edits access control hardware. They use **`device_serial`** (same value as gateway `access_id`), not the internal UUID.

| Operation | Method | Path | Required fields |
|-----------|--------|------|-----------------|
| Create | `POST` | `/api/v1/devices/access-control` | `gateway_id`, `device_serial`, `name`, `device_type` (`gate` \| `elevator` \| `door`), `location_description`, `relay_channel` (1–8); optional `has_lock_feedback`, `no_feedback_open_timeout_sec` (0–3600) |
| Read | `GET` | `/api/v1/devices/access-control/:id` | — |
| Update | `PUT` | `/api/v1/devices/access-control/:id` | Any of: `name`, `location_description`, `device_serial`, `relay_channel`, `access_methods`, `supports_remote_lock`, `supports_widget_timed_open`, `has_lock_feedback`, `no_feedback_open_timeout_sec`, `device_settings`, `metadata` |
| Lock/unlock | `PUT` | `/api/v1/devices/access-control/:id/lock` | `lock_status`: `locked` \| `unlocked` |

**Create example (manual admin):**

```json
{
  "gateway_id": "uuid",
  "device_serial": "KP-7F2A-001",
  "name": "Main gate keypad",
  "device_type": "gate",
  "location_description": "North entrance",
  "relay_channel": 2,
  "access_methods": ["app", "keypad"]
}
```

**Gateway vs admin identity mapping:**

| Context | Serial field name | Relay field | Composite key |
|---------|-------------------|-------------|---------------|
| Gateway inventory/state | `access_id` | `relay_channel` | `{access_id}::{relay_channel}` in sync `not_found` responses |
| Admin API / DB / frontend | `device_serial` | `relay_channel` | Unique `(gateway_id, device_serial, relay_channel)` |

Manual devices have no `metadata.createdFromGatewaySync` (or `createdFromGatewaySync: false`) and are **never** removed by gateway inventory omission. Gateway auto-provision sets `metadata.createdFromGatewaySync: true` and default `access_methods: ["keypad"]`.

**Access group memberships:** `device_group_members.device_id` is not FK-cascaded from device tables. Memberships are removed when devices are deleted via inventory/admin services, gateway/facility cascade helpers, create-rollback `deleteAccessControlDevice`, and the startup orphan sweeper (`DeviceGroupService.cleanupUnknownDefaultGroupMembersOnStartup`).

**Frontend types:** `CreateAccessControlDevicePayload` and `UpdateAccessControlDevicePayload` in `frontend/src/types/facility.types.ts`; list/card subtitle helper `formatAccessDeviceListSubtitle()` in `frontend/src/utils/accessDeviceDisplay.utils.ts`.

**Inventory sync audit log:** Each `POST /internal/gateway/devices/inventory` run persists a row in `gateway_device_sync_logs` with per-device entries (`added`, `removed`, `unchanged`, `skipped_manual`, `error`). Admins and dev admins can read history via `GET /api/v1/gateways/:gatewayId/device-sync-logs` (Facility → Gateway → **Inventory sync** tab).

**Gateway telemetry logs:** High-volume operational lines from the gateway via `POST /internal/gateway/add_log` are stored in `gateway_telemetry_logs` (`logged_at`, JSON `payload`, up to 10k rows/gateway). Admins, dev admins, and facility admins read via `GET /api/v1/gateways/:gatewayId/telemetry-logs` (Facility → Gateway → **Gateway logs** tab); live updates use WebSocket subscription `gateway_telemetry_logs`.

### 6. Unit Assignments

**Purpose**: Manages tenant access to units with primary/shared relationships.

**Schema**:
```sql
CREATE TABLE unit_assignments (
  id UUID PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES units(id),
  tenant_id UUID NOT NULL REFERENCES users(id),
  is_primary BOOLEAN DEFAULT FALSE,
  access_type ENUM('full', 'shared', 'temporary') DEFAULT 'full',
  access_granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_expires_at TIMESTAMP,
  granted_by UUID REFERENCES users(id),
  notes TEXT,
  access_permissions JSON, -- Future: time restrictions, etc.
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(unit_id, tenant_id) -- Unique assignment per unit-tenant pair
);
```

**Key Features**:
- **Primary/Shared Model**: One primary tenant, multiple shared tenants
- **Access Types**: Full, shared, or temporary access
- **Expiration Support**: Temporary access with expiration dates
- **Audit Trail**: Who granted access and when
- **Future Extensibility**: JSON permissions for complex access rules

### 7. Access Logs

**Purpose**: Comprehensive audit trail for all device access events.

**Schema**:
```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL,
  device_type VARCHAR(50) NOT NULL, -- 'blulok' or 'access_control'
  user_id UUID REFERENCES users(id),
  action ENUM('unlock', 'lock', 'access_granted', 'access_denied', 'manual_override') NOT NULL,
  method ENUM('app', 'keypad', 'card', 'manual', 'automatic') NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT, -- Failure reason if not successful
  ip_address VARCHAR(45),
  metadata JSON,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features**:
- **Universal Logging**: Logs access for both BluLok and access control devices
- **Action Tracking**: Detailed action types and methods
- **Success/Failure**: Clear success indicators with failure reasons
- **Rich Context**: IP addresses, metadata, and user attribution

## Data Relationships

### Facility → Gateway → Devices
```
Facility (1) ←→ (1) Gateway (1) ←→ (N) Access Control Devices
                           (1) ←→ (N) BluLok Devices
```

### Units → Assignments → Tenants
```
Unit (1) ←→ (N) Unit Assignments (N) ←→ (1) Tenant (User)
     (1) ←→ (1) BluLok Device
```

### Access Control Flow
```
User → Unit Assignment → BluLok Device → Gateway → Cloud Platform
```

### Keypad Access Code Resolution
```
AccessControlDevice (keypad-enabled)
  -> resolve active code by precedence:
     device_group scope > device scope
  -> schedule contexts:
     one active code per schedule_id (plus optional unscheduled default)
```

### Access Code Scope Semantics

- **Device Group Code**: Authoritative code scoped to a reusable device group (highest precedence when device is grouped).
- **Device Code**: Device-level scope used only when device is not in an active access-code group.
- **Schedule Scope**: Optional `schedule_id` on each active code, enabling multiple concurrent codes per device/group for different schedule windows.

Scope rules:
- `scope_type = device_group` -> `scope_id` must reference a `device_groups.id` in the same facility.
- `scope_type = device` -> `scope_id` must reference an `access_control_devices.id` in the same facility.
- `schedule_id` (when present) must reference a schedule in the same facility.

## Business Rules

### Access Control
- **Primary Tenant**: Each unit has exactly one primary tenant
- **Shared Access**: Primary tenant can share access with other tenants
- **Admin Assignment**: Admins/facility admins can assign any tenant to any unit
- **Facility Scoping**: Facility admins can only manage their assigned facilities

### Device Management
- **Gateway Requirement**: All devices must be connected through a facility's gateway
- **Unique Constraints**: One gateway per facility, one BluLok per unit
- **Relay Channels**: Uniqueness is `(gateway_id, device_serial, relay_channel)` — two keypads may both use relay `1`
- **Status Synchronization**: Device status updates propagate to related entities

### Data Integrity
- **Cascading Deletes**: Deleting a facility removes all related gateways, devices, and units
- **Orphan Prevention**: Cannot delete entities with dependent relationships
- **Audit Trail**: All access events are logged for security and compliance

## API Endpoints

### Facilities
- `GET /api/v1/facilities` - List facilities (filtered by user access)
- `GET /api/v1/facilities/:id` - Get facility details with stats
- `POST /api/v1/facilities` - Create facility (Admin only)
- `PUT /api/v1/facilities/:id` - Update facility
- `DELETE /api/v1/facilities/:id` - Delete facility (Admin only)

### Devices
- `GET /api/v1/devices` - List all devices with hierarchy
- `GET /api/v1/devices/facility/:id/hierarchy` - Get facility device tree
- `POST /api/v1/devices/access-control` - Create access control device
- `PUT /api/v1/devices/access-control/:id` - Update access control device (including `access_methods`)
- `POST /api/v1/devices/blulok` - Create BluLok device
- `PUT /api/v1/devices/:type/:id/status` - Update device status
- `PUT /api/v1/devices/blulok/:id/lock` - Control lock status

### Device Groups
- `POST /api/v1/device-groups` - Create group
- `GET /api/v1/device-groups?facility_id=...` - List groups for facility
- `GET /api/v1/device-groups/:id` - Get group + members
- `PUT /api/v1/device-groups/:id` - Update group
- `DELETE /api/v1/device-groups/:id` - Delete group
- `POST /api/v1/device-groups/:id/members` - Add device to group
- `DELETE /api/v1/device-groups/:id/members/:deviceId` - Remove device from group

### Access Codes
- `GET /api/v1/access-codes/my` - User-resolved device/code pairings
- `GET /api/v1/access-codes/app/my` - App-facing filtered pairings with schedule metadata
- `GET /api/v1/access-codes/config/:facilityId` - Read facility policy
- `PUT /api/v1/access-codes/config/:facilityId` - Update facility policy
- `GET /api/v1/access-codes?facility_id=...&schedule_id=...` - List active scoped codes, optionally filtered by schedule context
- `GET /api/v1/access-codes/effective?facility_id=...&schedule_id=...` - Resolved effective codes, optionally schedule-filtered
- `POST /api/v1/access-codes/rotate` - Force random rotation
- `PUT /api/v1/access-codes/manual/set` - Set manual scoped code (supports `schedule_id` for `device_group` scope)
- `POST /api/v1/access-codes/push/:facilityId` - Push ACCESS_CODE_UPDATE to gateway
- `GET /api/v1/internal/gateway/access-codes` - Gateway polling endpoint for resolved device/relay mappings

### ACCESS_CODE_UPDATE payload contract

Device targeting uses **both** cloud and gateway identifiers:

- `device_id` — cloud UUID (`access_control_devices.id`)
- `access_id` — gateway hardware serial (`access_control_devices.device_serial`, same as inventory/state sync)
- `relay_channel` — gateway relay output (1–8)

Per device in `ACCESS_CODE_UPDATE`: `device_id`, `access_id`, `relay_channel`, `valid_codes[]`

App-facing code APIs (`GET /access-codes/my`, `GET /access-codes/app/my`) return the same pairing keys.

Gateway command entries include schedule context in nested `valid_codes`:
- `schedule_id`, `schedule_name`
- `time_windows[]` (`day_of_week`, `start_time`, `end_time`)

Receivers should treat missing schedule metadata as always-valid legacy behavior.

### Devices (BluLok lock ↔ unit)
- `GET /api/v1/devices` - List devices (BluLok + access control); filter by `device_type`, `facility_id`, `search`
- `GET /api/v1/devices/blulok/:id` - Get BluLok lock details (includes `unit_id` when assigned)
- `GET /api/v1/devices/unassigned` - List BluLok locks with no unit link (`facility_admin`+; scope with `facility_id`)
- `POST /api/v1/devices/blulok/:deviceId/assign` - Link lock to unit (`{ "unit_id": "uuid" }`; `facility_admin`+)
- `DELETE /api/v1/devices/blulok/:deviceId/unassign` - Remove lock from unit; lock stays in facility inventory (`facility_admin`+)
- `DELETE /api/v1/devices/blulok/:deviceId` - Remove lock from cloud inventory (`facility_admin`+ scoped; sends **`DEVICE_DELETED`** tombstone to gateway)
- `DELETE /api/v1/devices/access-control/:deviceId` - Remove access control row from cloud inventory (`facility_admin`+ scoped; **`DEVICE_DELETED`** tombstone)

**App integration guide:** [Assign / unassign locks in manager mode](./app-lock-unit-assignment-apis.md)

### Units
- `GET /api/v1/units` - List units with assignments
- `GET /api/v1/units/:id` - Get unit details
- `GET /api/v1/units/my` - Get current user's units (tenant only)
- `POST /api/v1/units` - Create unit
- `PUT /api/v1/units/:id` - Update unit
- `POST /api/v1/units/:id/assign` - Assign tenant to unit
- `DELETE /api/v1/units/:id/assign/:tenantId` - Remove tenant from unit

## Security Considerations

### Role-Based Access
- **DEV_ADMIN/ADMIN**: Full access to all facilities and operations
- **FACILITY_ADMIN**: Access limited to assigned facilities
- **TENANT**: Read-only access to assigned units and facilities
- **MAINTENANCE/BLULOK_TECHNICIAN**: Device-specific access (future implementation)

### Data Protection
- **Facility Scoping**: All queries filtered by user's facility access
- **Audit Logging**: All device access events logged with user attribution
- **Secure Communication**: All device communication through authenticated gateways
- **Permission Validation**: Every API call validates user permissions

## Performance Optimizations

### Database Indexes
- **Facility Lookups**: Indexed by name, status
- **Device Queries**: Indexed by gateway_id, status, device_type
- **Unit Searches**: Indexed by facility_id, unit_number, status
- **Access Logs**: Indexed by device_id, user_id, occurred_at

### Query Optimization
- **Batch Operations**: Single queries for related data (units with assignments)
- **Selective Joins**: Only join necessary tables based on user permissions
- **Pagination Support**: Limit/offset for large datasets
- **Efficient Filtering**: Database-level filtering before data transfer

This data model provides a **robust foundation** for BluLok's facility management system with **proper security**, **scalability**, and **audit capabilities**.

