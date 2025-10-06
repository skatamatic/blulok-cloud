-- Initialize BluLok database
CREATE DATABASE IF NOT EXISTS blulok_dev;
CREATE DATABASE IF NOT EXISTS blulok_test;

-- Create user if not exists
CREATE USER IF NOT EXISTS 'blulok_user'@'%' IDENTIFIED BY 'blulok_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON blulok_dev.* TO 'blulok_user'@'%';
GRANT ALL PRIVILEGES ON blulok_test.* TO 'blulok_user'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Use the development database
USE blulok_dev;

-- Create device_types table for reference data
CREATE TABLE IF NOT EXISTS device_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  capabilities JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert device types
INSERT IGNORE INTO device_types (id, name, description) VALUES
('blulok_smart_lock', 'BluLok Smart Lock', 'IoT-enabled smart lock for storage units'),
('access_gate', 'Access Control Gate', 'Automated gate for facility access'),
('elevator_control', 'Elevator Access Control', 'Elevator access control system'),
('door_control', 'Door Access Control', 'Door access control system');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'dev_admin', 'facility_admin', 'maintenance', 'tenant') NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Users will be seeded by the 002_default_users.ts seed file