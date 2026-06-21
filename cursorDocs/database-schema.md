# BluLok Cloud Database Schema & Migration Guide

## Overview

BluLok Cloud uses MySQL as the primary database with Knex.js as the query builder and migration system. This document outlines the database schema, migration best practices, and troubleshooting guidelines.

## Database Architecture

### Connection Strategy

- **Development**: Direct MySQL connection with connection pooling
- **Production**: Cloud SQL with SSL encryption
- **Testing**: Separate test database with automated cleanup
- **Migration Ready**: Database abstraction allows switching to BigTable later

### Schema Design Principles

1. **UUID Primary Keys**: All tables use UUID for distributed system compatibility
2. **Soft Deletes**: Use `is_active` flags instead of hard deletes for audit trails
3. **Timestamps**: All tables include `created_at` and `updated_at` for auditing
4. **Foreign Key Constraints**: Enforce referential integrity with proper cascading
5. **Indexing Strategy**: Strategic indexes for query performance
6. **Enum Constraints**: Use ENUMs for controlled vocabularies (roles, statuses)

## Core Tables

### Users Table

```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role ENUM('tenant', 'admin', 'facility_admin', 'maintenance', 'blulok_technician', 'dev_admin') NOT NULL DEFAULT 'tenant',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_is_active (is_active)
);
```

**Purpose**: Store user authentication and profile information  
**Key Features**: 
- Email-based authentication
- Role-based access control
- Soft delete capability
- Login tracking

### Facilities Table

```sql
CREATE TABLE facilities (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip_code VARCHAR(20) NOT NULL,
  country VARCHAR(50) NOT NULL DEFAULT 'US',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_is_active (is_active)
);
```

**Purpose**: Store storage facility information  
**Key Features**:
- Geographic location data
- Hierarchical organization
- Soft delete capability

### User Facility Associations Table

```sql
CREATE TABLE user_facility_associations (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  facility_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_facility (user_id, facility_id),
  INDEX idx_user_id (user_id),
  INDEX idx_facility_id (facility_id)
);
```

**Purpose**: Many-to-many relationship between users and facilities  
**Key Features**:
- Enforces unique user-facility pairs
- Cascading deletes for data integrity
- Optimized for access control queries

### Device Types Table

```sql
CREATE TABLE device_types (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  capabilities JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Purpose**: Define types of BluLok devices and their capabilities  
**Key Features**:
- JSON capabilities for flexible device features
- Unique device type names

### Devices Table

```sql
CREATE TABLE devices (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  facility_id VARCHAR(36) NOT NULL,
  device_type_id VARCHAR(36) NOT NULL,
  serial_number VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  status ENUM('online', 'offline', 'maintenance', 'error') NOT NULL DEFAULT 'offline',
  firmware_version VARCHAR(50),
  configuration JSON,
  last_heartbeat TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (device_type_id) REFERENCES device_types(id) ON DELETE RESTRICT,
  INDEX idx_facility_id (facility_id),
  INDEX idx_device_type_id (device_type_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_status (status),
  INDEX idx_is_active (is_active)
);
```

**Purpose**: Store individual BluLok device information  
**Key Features**:
- Unique serial numbers
- Real-time status tracking
- Flexible JSON configuration
- Facility association for access control

### Access Logs Table

```sql
CREATE TABLE access_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  device_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  action ENUM('lock', 'unlock', 'access_granted', 'access_denied', 'heartbeat', 'status_change') NOT NULL,
  result ENUM('success', 'failure', 'timeout') NOT NULL,
  details TEXT,
  ip_address VARCHAR(45),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_device_id (device_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp)
);
```

**Purpose**: Comprehensive audit trail for all device interactions  
**Key Features**:
- Complete action logging
- IP address tracking
- Supports system and user actions
- Optimized for time-based queries

### User Dashboard Pages Table

```sql
CREATE TABLE user_dashboard_pages (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT 'Main',
  page_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_user_page_order (user_id, page_order)
);
```

**Purpose**: Multi-page dashboard tabs per user (staff: up to 5 pages; tenants: single page via API).

### User Widget Layouts Table

```sql
CREATE TABLE user_widget_layouts (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  page_id VARCHAR(36) NOT NULL,
  widget_id VARCHAR(100) NOT NULL,
  widget_type VARCHAR(50) NOT NULL,
  layout_config JSON NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES user_dashboard_pages(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_page_widget (user_id, page_id, widget_id),
  INDEX idx_user_id (user_id),
  INDEX idx_user_page_display_order (user_id, page_id, display_order),
  INDEX idx_widget_type (widget_type),
  INDEX idx_is_visible (is_visible)
);
```

**Purpose**: Store personalized widget layouts per dashboard page  
**Key Features**:
- Per-page widget instances (same widget type allowed on different pages with distinct `widget_id`)
- Widget position and size persistence (`layout_config` includes `size` enum and grid `position`)
- Visibility control for individual widgets
- Display order within a page

### Default Widget Templates Table

```sql
CREATE TABLE default_widget_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  widget_id VARCHAR(100) NOT NULL UNIQUE,
  widget_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_config JSON NOT NULL,
  available_sizes JSON NOT NULL,
  required_permissions JSON,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Purpose**: Define available widget types and their default configurations  
**Key Features**:
- System-wide widget definitions
- Role-based widget availability
- Default layout configurations
- Size constraint definitions

### Saved Dashboards Table

```sql
CREATE TABLE saved_dashboards (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  snapshot JSON NOT NULL,
  page_count INT NOT NULL DEFAULT 0,
  widget_count INT NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  updated_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_name (name),
  INDEX idx_created_by (created_by),
  INDEX idx_updated_at (updated_at)
);
```

**Purpose**: Org-wide named dashboard templates (admin/dev_admin library).  
**Snapshot shape**: `{ version: 1, pages: DashboardPagePayload[] }` — same structure as `POST /widget-layouts`.

### Dashboard Assignments Table

```sql
CREATE TABLE dashboard_assignments (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  saved_dashboard_id VARCHAR(36) NOT NULL,
  scope ENUM('global', 'facility', 'user') NOT NULL,
  facility_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NULL,
  target_role ENUM('tenant','admin','facility_admin','maintenance','blulok_technician','dev_admin') NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (saved_dashboard_id) REFERENCES saved_dashboards(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Scope consistency (MySQL 8+ CHECK, migration 065)
-- global: facility_id and user_id NULL
-- facility: user_id NULL; facility_id may be NULL (= all-facilities aggregate view)
-- user: user_id required; facility_id NULL
-- Dedup via generated scope_entity_id + UNIQUE(saved_dashboard_id, target_role, scope, scope_entity_id)
-- scope_entity_id for facility scope uses COALESCE(facility_id, '00000000-0000-0000-0000-000000000000')
```

**Purpose**: Role/scope dashboard template assignments (user > facility > global hierarchy). Managed in System Settings → Dashboards → Assignments.

### Notifications Table

```sql
CREATE TABLE notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  notification_type ENUM('access_granted', 'access_denied', 'device_registered', 
    'password_reset', 'unit_assigned', 'unit_unassigned', 'system_alert', 
    'maintenance_alert', 'security_alert', 'general') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  is_read BOOLEAN DEFAULT FALSE,
  read_at DATETIME,
  reference_type VARCHAR(50),
  reference_id VARCHAR(36),
  facility_id VARCHAR(36),
  metadata JSON,
  expires_at DATETIME,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL,
  
  INDEX idx_notifications_user_unread (user_id, is_read, is_deleted),
  INDEX idx_notifications_user_type (user_id, notification_type),
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_facility (facility_id),
  INDEX idx_notifications_expires (expires_at),
  INDEX idx_notifications_reference (reference_type, reference_id)
);
```

**Purpose**: Store user notifications with read receipt support  
**Key Features**:
- Flexible notification types for various system events
- Read receipt tracking with timestamp
- Priority levels for UI treatment
- Reference linking to related entities (units, devices, etc.)
- Facility-scoped notifications
- Soft delete support
- Automatic expiration support

**Query Efficiency**:
- Model enforces `DEFAULT_LIMIT=50`, `MAX_LIMIT=100` on all `find()` queries as a safety net
- `markAsRead()` accepts pre-fetched notification to avoid redundant SELECT after UPDATE (2 queries instead of 3)
- `markMultipleAsRead()` uses single `WHERE IN` UPDATE -- no per-row queries
- `markAllAsRead()` uses single filtered UPDATE -- no per-row queries
- `findByIds()` uses single `WHERE IN` SELECT for batch lookups (avoids N+1 in mark-multiple flow)
- `count()` strips pagination/sort params before executing
- `getUserNotifications()` runs `find`, `count`, `getUnreadCount` in parallel via `Promise.all`
- All queries default to `ORDER BY created_at DESC` (newest first)

### Activity Logs Table

```sql
CREATE TABLE activity_logs (
  id VARCHAR(36) PRIMARY KEY,
  entity_type ENUM('unit', 'device', 'facility', 'user', 'gateway') NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  activity_type ENUM('lock', 'unlock', 'locking', 'unlocking', 'access_attempt',
    'status_change', 'error', 'maintenance_start', 'maintenance_end',
    'assignment_change', 'configuration_change', 'connection_change', 'general') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  actor_type ENUM('user', 'system', 'device', 'gateway') NOT NULL,
  actor_id VARCHAR(36),
  actor_name VARCHAR(255),
  result ENUM('success', 'failure', 'pending', 'unknown') DEFAULT 'success',
  result_message VARCHAR(500),
  facility_id VARCHAR(36),
  unit_id VARCHAR(36),
  device_id VARCHAR(36),
  metadata JSON,
  ip_address VARCHAR(45),
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  
  INDEX idx_activity_logs_entity (entity_type, entity_id),
  INDEX idx_activity_logs_facility_time (facility_id, occurred_at),
  INDEX idx_activity_logs_unit_time (unit_id, occurred_at),
  INDEX idx_activity_logs_device_time (device_id, occurred_at),
  INDEX idx_activity_logs_type (activity_type),
  INDEX idx_activity_logs_actor (actor_type, actor_id),
  INDEX idx_activity_logs_occurred (occurred_at),
  INDEX idx_activity_logs_result (result)
);
```

**Purpose**: Historical record of unit and device state changes  
**Key Features**:
- Comprehensive activity tracking for devices and units
- Lock/unlock event logging
- Access attempt tracking (granted/denied)
- Actor tracking (who/what performed the action)
- Result tracking for success/failure auditing
- Facility, unit, and device scoping

**Query Efficiency**:
- Model enforces `DEFAULT_LIMIT=50`, `MAX_LIMIT=100` on all `find()` and `findWithContext()` queries
- `findWithContext()` uses LEFT JOINs to enrich data in a single query (avoids N+1 for unit/device/facility names)
- `count()` strips pagination/sort params before executing
- Service layer runs `findWithContext` + `count` in parallel via `Promise.all`
- Device activity lookup checks both BluLok and access control device types in parallel
- All queries default to `ORDER BY occurred_at DESC` (newest first)
- Rich context with metadata support
- IP address logging for security audits

### Access Code & Device Group Tables

```sql
CREATE TABLE device_groups (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  facility_id VARCHAR(36) NOT NULL,
  group_type ENUM('zone', 'access_code') NOT NULL DEFAULT 'zone', -- deprecated; unified access groups
  is_global_shared BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  access_code_current_code VARCHAR(8) NULL,
  access_code_current_valid_from DATETIME NULL,
  access_code_current_valid_until DATETIME NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  settings JSON,
  metadata JSON,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  INDEX idx_device_groups_facility_id (facility_id),
  INDEX idx_device_groups_facility_default (facility_id, is_default),
  INDEX idx_device_groups_facility_type_global_active (facility_id, group_type, is_global_shared, is_active),
  INDEX idx_device_groups_access_code_current_state (facility_id, group_type, is_active, access_code_current_valid_until)
);

CREATE TABLE device_group_members (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  group_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES device_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES access_control_devices(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_device_group_member (group_id, device_id),
  INDEX idx_device_group_members_device (device_id)
);

CREATE TABLE access_code_configs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  facility_id VARCHAR(36) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  digit_count INT NOT NULL DEFAULT 6,
  rotation_interval_hours INT NOT NULL DEFAULT 24,
  rotation_hour INT NOT NULL DEFAULT 0,
  rotation_minute INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_access_code_config_facility (facility_id)
);

CREATE TABLE access_codes (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  facility_id VARCHAR(36) NOT NULL,
  scope_type ENUM('device_group', 'device') NOT NULL,
  scope_id VARCHAR(36) NULL,
  schedule_id VARCHAR(36) NULL,
  code VARCHAR(8) NOT NULL,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  generated_by ENUM('system', 'admin') NOT NULL DEFAULT 'system',
  set_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
  FOREIGN KEY (set_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_access_codes_active_lookup (facility_id, scope_type, is_active, valid_until),
  INDEX idx_access_codes_scope (scope_type, scope_id),
  INDEX idx_access_codes_scope_schedule_active_valid (facility_id, scope_type, scope_id, schedule_id, is_active, valid_until)
);
```

**Access-code invariants**:
- Group code is first-class group state (`device_groups.access_code_current_*`) and is updated whenever a group-scoped code is created/rotated/manual-set.
- Each facility has exactly one protected default access group (`is_default=true`, `is_global_shared=true`). New access-control devices are auto-assigned there until placed in a specific group.
- Access-control devices in an active `access_code` group cannot receive device-scoped manual overrides.
- Effective resolution always prefers active group-scoped code(s) for grouped devices to keep members code-synchronized.
- Schedule-scoped and unscheduled codes can coexist for the same group/device scope; active uniqueness is enforced per `(facility_id, scope_type, scope_id, schedule_id)`.
- User-facing access-code retrieval filters by the caller's assigned `user_facility_schedules.schedule_id` (with unscheduled fallback for backward compatibility).

**Access-control extension**:

```sql
ALTER TABLE access_control_devices
  ADD COLUMN access_methods JSON NOT NULL;
```

`access_methods` stores allowed methods per access control device (`app`, `keypad`, `fob`), enabling feature-based hardware behavior and RBAC-scoped UI management.

## Migration Best Practices

### Writing Idempotent Migrations

**✅ Always Check Table Existence:**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Good: Check before creating
  if (!(await knex.schema.hasTable('table_name'))) {
    await knex.schema.createTable('table_name', (table) => {
      // table definition
    });
  }
}
```

**❌ Never Assume Tables Don't Exist:**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Bad: Will fail if table exists
  await knex.schema.createTable('table_name', (table) => {
    // table definition
  });
}
```

### Column Modifications

**✅ Check Column Existence:**
```typescript
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    const hasColumn = await knex.schema.hasColumn('users', 'new_column');
    if (!hasColumn) {
      await knex.schema.alterTable('users', (table) => {
        table.string('new_column').nullable();
      });
    }
  }
}
```

**✅ Enum Modifications (MySQL Specific):**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Check current enum values
  const [roleCheck] = await knex.raw(`
    SELECT COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'role'
  `);

  const currentEnum = roleCheck[0]?.COLUMN_TYPE || '';
  
  // Only update if new value not present
  if (!currentEnum.includes('new_role')) {
    await knex.raw(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('tenant', 'admin', 'new_role', 'other_roles') 
      NOT NULL DEFAULT 'tenant'
    `);
  }
}
```

### Index Management

**✅ Safe Index Creation:**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Check if index exists before creating
  const indexExists = await knex.raw(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'table_name'
    AND INDEX_NAME = 'idx_column_name'
  `);

  if (indexExists[0][0].count === 0) {
    await knex.schema.alterTable('table_name', (table) => {
      table.index(['column_name'], 'idx_column_name');
    });
  }
}
```

### Foreign Key Constraints

**✅ Safe Constraint Addition:**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Check if foreign key exists
  const fkExists = await knex.raw(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'child_table'
    AND CONSTRAINT_NAME = 'fk_constraint_name'
  `);

  if (fkExists[0][0].count === 0) {
    await knex.schema.alterTable('child_table', (table) => {
      table.foreign('parent_id').references('id').inTable('parent_table');
    });
  }
}
```

## Migration Troubleshooting

### Common Issues & Solutions

**Issue**: "Table already exists" error
**Solution**: Always use `hasTable()` checks before creation

**Issue**: "Column already exists" error  
**Solution**: Use `hasColumn()` checks before adding columns

**Issue**: "Duplicate key name" error
**Solution**: Check for existing indexes before creation

**Issue**: Enum modification failures
**Solution**: Use raw SQL with existence checks for MySQL enums

### Recovery Procedures

**Reset Migration State:**
```bash
# View migration status
npx knex migrate:status

# Rollback specific migration
npx knex migrate:down

# Force migration state (careful!)
# DELETE FROM knex_migrations WHERE name = 'migration_name';
```

**Clean Database for Development:**
```bash
# Reset entire database (DESTRUCTIVE)
npm run db:reset  # If implemented
# Or manually:
# DROP DATABASE blulok_dev; CREATE DATABASE blulok_dev;
```

## Development Workflow

### Adding New Tables

1. **Create Migration File:**
   ```bash
   npx knex migrate:make add_new_table --knexfile knexfile.ts
   ```

2. **Write Idempotent Migration:**
   ```typescript
   export async function up(knex: Knex): Promise<void> {
     if (!(await knex.schema.hasTable('new_table'))) {
       await knex.schema.createTable('new_table', (table) => {
         // Define table structure
       });
     }
   }
   ```

3. **Test Migration:**
   ```bash
   npm run migrate
   npm run migrate:rollback  # Test rollback
   npm run migrate           # Re-apply
   ```

### Modifying Existing Tables

1. **Create Migration for Changes:**
   ```bash
   npx knex migrate:make modify_existing_table --knexfile knexfile.ts
   ```

2. **Check Before Modifying:**
   ```typescript
   export async function up(knex: Knex): Promise<void> {
     if (await knex.schema.hasTable('existing_table')) {
       // Check what needs to be changed
       const hasColumn = await knex.schema.hasColumn('existing_table', 'new_column');
       if (!hasColumn) {
         await knex.schema.alterTable('existing_table', (table) => {
           table.string('new_column').nullable();
         });
       }
     }
   }
   ```

### Seeding Data

**Development Seeds Only:**
```typescript
export async function seed(knex: Knex): Promise<void> {
  // Only run in development
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  // Clear existing data
  await knex('table_name').del();

  // Insert seed data
  await knex('table_name').insert([
    // seed records
  ]);
}
```

## Performance Considerations

### Indexing Strategy

**Primary Indexes (Always Include):**
- Primary key (automatic)
- Foreign keys
- Unique constraints
- Frequently queried columns

**Query-Specific Indexes:**
- Search fields (email, name)
- Status/state fields
- Date ranges (created_at, updated_at)
- Role-based queries

**Composite Indexes:**
```sql
-- For queries filtering by multiple columns
INDEX idx_user_facility (user_id, facility_id)
INDEX idx_device_status_facility (facility_id, status, is_active)
```

### Query Optimization

**Efficient Joins:**
```typescript
// Good: Use proper joins with indexes
const usersWithFacilities = await knex('users')
  .select('users.*', 'facilities.name as facility_name')
  .leftJoin('user_facility_associations', 'users.id', 'user_facility_associations.user_id')
  .leftJoin('facilities', 'user_facility_associations.facility_id', 'facilities.id')
  .where('users.is_active', true);

// Bad: N+1 queries
const users = await knex('users').where('is_active', true);
for (const user of users) {
  user.facilities = await knex('facilities')
    .join('user_facility_associations', 'facilities.id', 'user_facility_associations.facility_id')
    .where('user_facility_associations.user_id', user.id);
}
```

## Access Control Schema

### Role-Based Access

**Global Roles** (access all facilities):
- `admin`: Global administrator
- `dev_admin`: System developer/administrator

**Facility-Scoped Roles** (require associations):
- `facility_admin`: Facility-specific administrator
- `tenant`: Storage facility customer
- `maintenance`: Facility maintenance personnel  
- `blulok_technician`: BluLok device technician

### Association Logic

```sql
-- Check user facility access
SELECT f.* 
FROM facilities f
LEFT JOIN user_facility_associations ufa ON f.id = ufa.facility_id
WHERE (
  ufa.user_id = ? OR 
  ? IN (SELECT id FROM users WHERE role IN ('admin', 'dev_admin'))
) AND f.is_active = true;
```

## Migration Commands

### Standard Operations

```bash
# Run pending migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Check migration status
npx knex migrate:status --knexfile knexfile.ts

# Create new migration
npx knex migrate:make migration_name --knexfile knexfile.ts

# Run seeds (development only)
npm run seed
```

### Database Setup

```bash
# Initialize database (create if missing)
npm run db:init

# Full setup: init + migrate + seed
npm run db:setup

# Reset database (DESTRUCTIVE - dev only)
npm run db:reset
```

## Migration File Template

### Standard Migration Structure

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if table exists before creating
  if (!(await knex.schema.hasTable('table_name'))) {
    await knex.schema.createTable('table_name', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
      // ... other columns
      table.timestamps(true, true);
      
      // Indexes
      table.index(['frequently_queried_column']);
    });
  }

  // Check if column exists before adding
  if (await knex.schema.hasTable('existing_table')) {
    const hasColumn = await knex.schema.hasColumn('existing_table', 'new_column');
    if (!hasColumn) {
      await knex.schema.alterTable('existing_table', (table) => {
        table.string('new_column').nullable();
      });
    }
  }

  // Check enum values before modifying (MySQL specific)
  const [enumCheck] = await knex.raw(`
    SELECT COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'table_name' 
    AND COLUMN_NAME = 'enum_column'
  `);

  const currentEnum = enumCheck[0]?.COLUMN_TYPE || '';
  if (!currentEnum.includes('new_enum_value')) {
    await knex.raw(`
      ALTER TABLE table_name 
      MODIFY COLUMN enum_column ENUM('value1', 'new_enum_value', 'value3') 
      NOT NULL DEFAULT 'value1'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Always use dropTableIfExists for safety
  await knex.schema.dropTableIfExists('table_name');
  
  // For column drops, check existence first
  if (await knex.schema.hasColumn('existing_table', 'column_to_drop')) {
    await knex.schema.alterTable('existing_table', (table) => {
      table.dropColumn('column_to_drop');
    });
  }
}
```

## Data Integrity Rules

### Cascading Behavior

**User Deletion:**
- `user_facility_associations`: CASCADE (remove associations)
- `access_logs`: SET NULL (preserve logs, anonymize user)

**Facility Deletion:**
- `user_facility_associations`: CASCADE (remove associations)
- `devices`: CASCADE (remove facility devices)
- `access_logs`: CASCADE (remove facility logs)

**Device Deletion:**
- `access_logs`: CASCADE (remove device logs)

### Validation Rules

**Email Validation:**
- Unique constraint at database level
- Format validation at application level
- Case-insensitive storage (lowercase)

**Role Validation:**
- ENUM constraint at database level
- Business logic validation at application level
- Role hierarchy enforcement in middleware

## Backup & Recovery

### Backup Strategy

**Development:**
- Manual exports for testing
- Git-tracked schema migrations
- Seed data recreation

**Production:**
- Automated daily backups
- Point-in-time recovery
- Cross-region replication

### Recovery Procedures

**Schema Recovery:**
```bash
# Recreate from migrations
npm run db:init
npm run migrate
npm run seed  # Development only
```

**Data Recovery:**
```bash
# Restore from backup (production)
mysql -u user -p database_name < backup_file.sql
```

## Environment Configuration

### Database Connections

**Development:**
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=blulok_dev
DB_USER=developer
DB_PASSWORD=mobile
```

**Production:**
```env
DB_HOST=cloud-sql-proxy-ip
DB_PORT=3306
DB_NAME=blulok_prod
DB_USER=blulok_prod_user
DB_PASSWORD=secure_password
```

**Testing:**
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=blulok_test
DB_USER=test_user
DB_PASSWORD=test_password
```

## Monitoring & Maintenance

### Performance Monitoring

**Query Analysis:**
```sql
-- Slow query log analysis
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';

-- Index usage analysis
SHOW INDEX FROM table_name;
EXPLAIN SELECT * FROM table_name WHERE conditions;
```

**Connection Monitoring:**
```sql
-- Active connections
SHOW PROCESSLIST;

-- Connection statistics
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';
```

### Maintenance Tasks

**Regular Maintenance:**
- Index optimization (`OPTIMIZE TABLE`)
- Statistics updates (`ANALYZE TABLE`)
- Log rotation and cleanup
- Backup verification

**Scaling Considerations:**
- Connection pool tuning
- Read replica setup
- Partitioning for large tables
- Query cache optimization

## Future Migration to BigTable

### Preparation for NoSQL Migration

**Design Considerations:**
- UUID keys (compatible with BigTable row keys)
- JSON columns (compatible with BigTable column families)
- Denormalized queries (prepare for NoSQL patterns)
- Application-level joins (reduce database dependencies)

**Migration Strategy:**
1. **Dual Write Phase**: Write to both MySQL and BigTable
2. **Validation Phase**: Compare data consistency
3. **Read Migration**: Gradually move reads to BigTable
4. **Cleanup Phase**: Remove MySQL dependencies

### BigTable Schema Design

```
Row Key: entity_type#entity_id
Column Families:
- metadata: Basic entity information
- relationships: Foreign key relationships
- audit: Timestamps and change logs
- content: Large text/JSON content
```

## Troubleshooting Guide

### Common Migration Errors

**"Table already exists"**
- Add `hasTable()` check before creation
- Review migration order and dependencies

**"Column already exists"**
- Add `hasColumn()` check before adding
- Consider if migration already ran partially

**"Duplicate key name"**
- Check for existing indexes before creation
- Use descriptive, unique index names

**"Cannot add foreign key constraint"**
- Ensure referenced table exists
- Verify data types match exactly
- Check for orphaned records

### Database Connection Issues

**"Access denied"**
- Verify credentials in .env file
- Check MySQL user permissions
- Ensure database exists

**"Connection timeout"**
- Check network connectivity
- Verify MySQL server is running
- Review connection pool settings

**"Too many connections"**
- Adjust connection pool limits
- Check for connection leaks
- Monitor active connections

### Recovery Procedures

**Corrupted Migration State:**
```bash
# Check migration table
SELECT * FROM knex_migrations ORDER BY id;

# Manually mark migration as complete (careful!)
INSERT INTO knex_migrations (name, batch, migration_time) 
VALUES ('migration_name.ts', 1, NOW());
```

**Schema Inconsistencies:**
```bash
# Compare schema with migration files
npx knex migrate:status
DESCRIBE table_name;

# Recreate from scratch (development only)
DROP DATABASE blulok_dev;
CREATE DATABASE blulok_dev;
npm run migrate
```

This comprehensive guide ensures consistent, reliable database operations and prevents migration issues in the future.
