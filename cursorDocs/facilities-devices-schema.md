# Facilities & Devices Data Model

## Overview

This document describes the comprehensive data model for BluLok's facility and device management system. The hierarchy follows this structure:

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
  status ENUM('online', 'offline', 'error', 'maintenance') DEFAULT 'offline',
  is_locked BOOLEAN DEFAULT TRUE,
  last_activity TIMESTAMP,
  device_settings JSON,
  metadata JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(gateway_id, relay_channel) -- Unique relay per gateway
);
```

**Key Features**:
- **Device Types**: Gates, elevators, doors with specific UI treatment
- **Relay Mapping**: Each device maps to a specific relay channel
- **Lock State**: Current locked/unlocked status
- **Activity Tracking**: Last activity timestamps for auditing

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
- Syncs the full device inventory for a gateway
- Devices in the array that don't exist are created
- Devices not in the array are removed
- Used for initial sync and device discovery

```json
{
  "facility_id": "uuid",
  "devices": [
    { "lock_id": "serial-or-uuid", "lock_number": 101, "firmware_version": "1.0.0" }
  ]
}
```

**2. State Update** (`POST /api/v1/internal/gateway/devices/state`)
- Partial updates for device telemetry and state
- Only updates fields that are provided (partial updates supported)
- Used for real-time status updates from devices

```json
{
  "facility_id": "uuid",
  "updates": [
    {
      "lock_id": "serial-or-uuid",
      "lock_state": "LOCKED", // LOCKED, UNLOCKED, LOCKING, UNLOCKING, ERROR, UNKNOWN
      "battery_level": 85,
      "online": true,
      "signal_strength": -65,
      "temperature": 22.5,
      "error_code": null,
      "source": "GATEWAY"
    }
  ]
}
```

**Legacy** (`POST /api/v1/internal/gateway/device-sync`) - DEPRECATED
- Combined inventory and state sync
- Returns `X-Deprecated` header
- Use `/devices/inventory` + `/devices/state` instead

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

## Business Rules

### Access Control
- **Primary Tenant**: Each unit has exactly one primary tenant
- **Shared Access**: Primary tenant can share access with other tenants
- **Admin Assignment**: Admins/facility admins can assign any tenant to any unit
- **Facility Scoping**: Facility admins can only manage their assigned facilities

### Device Management
- **Gateway Requirement**: All devices must be connected through a facility's gateway
- **Unique Constraints**: One gateway per facility, one BluLok per unit
- **Relay Channels**: Access control devices use unique relay channels per gateway
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
- `POST /api/v1/devices/blulok` - Create BluLok device
- `PUT /api/v1/devices/:type/:id/status` - Update device status
- `PUT /api/v1/devices/blulok/:id/lock` - Control lock status

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

