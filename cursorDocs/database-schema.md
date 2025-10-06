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

### User Widget Layouts Table

```sql
CREATE TABLE user_widget_layouts (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  widget_id VARCHAR(100) NOT NULL,
  widget_type VARCHAR(50) NOT NULL,
  layout_config JSON NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_widget (user_id, widget_id),
  INDEX idx_user_id (user_id),
  INDEX idx_widget_type (widget_type),
  INDEX idx_is_visible (is_visible),
  INDEX idx_display_order (display_order)
);
```

**Purpose**: Store personalized widget layouts for each user  
**Key Features**:
- Per-user dashboard customization
- Widget position and size persistence
- Visibility control for individual widgets
- Display order management

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
