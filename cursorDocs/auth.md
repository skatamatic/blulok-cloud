# BluLok Cloud Authentication & Authorization System

## Overview

BluLok Cloud implements a comprehensive role-based access control (RBAC) system designed for secure management of storage facility locking systems. The authentication system uses JWT tokens with bcrypt password hashing and provides granular access control based on user roles.

## User Roles & Permissions

### Role Hierarchy

```
DEV_ADMIN (Highest Privilege)
├── Full system access across ALL facilities
├── Can manage all users including other dev_admins
├── Access to system settings and debug tools
├── Global facility management
└── All permissions of lower roles

ADMIN (Global Administrator)
├── Full system access across ALL facilities
├── Can manage users (except dev_admin)
├── Global facility and user management
├── Access to analytics and reporting across all facilities
├── Device configuration and monitoring for all facilities
└── All permissions of lower roles

FACILITY_ADMIN (Facility-Scoped Administrator)
├── Full administrative access to ASSIGNED facilities only
├── Can manage users within assigned facilities
├── Facility-specific analytics and reporting
├── Device configuration for assigned facilities
├── Cannot access facilities they're not assigned to
└── Facility-scoped permissions of lower roles

BLULOK_TECHNICIAN
├── Device maintenance and troubleshooting for assigned facilities
├── Firmware updates and device configuration
├── Technical diagnostics and support
├── Read-only access to user data within assigned facilities
└── Facility-scoped access

MAINTENANCE
├── Scheduled maintenance tasks for assigned facilities
├── Device status monitoring for assigned facilities
├── Maintenance reporting
└── Limited device control for maintenance

TENANT (Lowest Privilege)
├── View assigned facilities and devices only
├── Basic device control (lock/unlock) for assigned facilities
├── Access logs for assigned facilities only
└── Profile management only
```

### Role Descriptions

| Role | Code | Description | Primary Use Case | Facility Access |
|------|------|-------------|------------------|-----------------|
| **Dev Admin** | `dev_admin` | System developers and administrators | Full system control, debugging, development | ALL facilities |
| **Admin** | `admin` | Global system administrators | Global operations, user management | ALL facilities |
| **Facility Admin** | `facility_admin` | Facility-specific administrators | Facility-scoped operations and management | ASSIGNED facilities only |
| **BluLok Technician** | `blulok_technician` | BluLok technical support staff | Device support, troubleshooting | ASSIGNED facilities only |
| **Maintenance** | `maintenance` | Facility maintenance personnel | Scheduled maintenance, repairs | ASSIGNED facilities only |
| **Tenant** | `tenant` | Storage facility customers | Basic device access and monitoring | ASSIGNED facilities only |

## Database Schema

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

### Field Descriptions

- **id**: UUID primary key for user identification
- **email**: Unique email address used for login
- **password_hash**: bcrypt hashed password (12 salt rounds)
- **first_name/last_name**: User's display name
- **role**: User's permission level (see roles above)
- **is_active**: Soft delete flag - inactive users cannot login
- **last_login**: Timestamp of most recent successful login
- **created_at/updated_at**: Audit timestamps

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

### Field Descriptions

- **id**: UUID primary key for association
- **user_id**: Reference to user who has access
- **facility_id**: Reference to facility user can access
- **created_at/updated_at**: Audit timestamps

### Access Control Logic

- **Global Roles** (`admin`, `dev_admin`): Access ALL facilities automatically
- **Facility-Scoped Roles** (`facility_admin`, `tenant`, `maintenance`, `blulok_technician`): Access only ASSIGNED facilities
- **No Associations**: Facility-scoped users with no associations have no facility access

## Authentication Flow

### Login Process

1. **Client Request**: POST `/api/v1/auth/login`
   ```json
   {
     "email": "user@example.com",
     "password": "plaintext_password"
   }
   ```

2. **Server Validation**:
   - Email format validation
   - Password complexity check
   - User existence verification
   - Account active status check
   - Password hash comparison (bcrypt)

3. **Success Response**:
   ```json
   {
     "success": true,
     "message": "Login successful",
     "user": {
       "id": "uuid",
       "email": "user@example.com",
       "firstName": "John",
       "lastName": "Doe",
       "role": "admin"
     },
     "token": "jwt_token_string"
   }
   ```

4. **JWT Token**: Contains user ID, email, role, and expires in 24 hours

### Token Management

- **Storage**: Client stores JWT in localStorage
- **Header**: Sent as `Authorization: Bearer <token>`
- **Expiration**: 24 hours (configurable)
- **Refresh**: Manual re-login required (future: refresh tokens)

## Authorization & Page Access

### Frontend Route Protection

```typescript
// Public routes (no authentication required)
/                    # Landing page
/login              # Login page

// Protected routes (authentication required)
/dashboard          # All authenticated users
/facilities         # All authenticated users
/devices            # All authenticated users

// Role-restricted routes
/users              # requireUserManagement: admin, dev_admin only
/maintenance        # maintenance, blulok_technician, admin, dev_admin
/analytics          # admin, dev_admin only
/settings           # requireAdmin: admin, dev_admin only
```

### Backend API Protection

```typescript
// Public endpoints
POST /api/v1/auth/login
GET /health

// Authenticated endpoints
GET /api/v1/auth/profile       # Any authenticated user
POST /api/v1/auth/logout       # Any authenticated user
POST /api/v1/auth/change-password # Any authenticated user

// Admin-only endpoints
GET /api/v1/users              # requireUserManagement
POST /api/v1/users             # requireUserManagement
PUT /api/v1/users/:id          # requireUserManagement
DELETE /api/v1/users/:id       # requireUserManagement
```

### Permission Helpers

```typescript
// Backend middleware
authenticateToken              # Requires valid JWT
requireRoles([UserRole.ADMIN]) # Requires specific role(s)
requireAdmin                   # Requires admin or dev_admin
requireUserManagement          # Requires admin or dev_admin

// Frontend hooks
useAuth().hasRole([UserRole.ADMIN])     # Check specific roles
useAuth().isAdmin()                     # Check admin privileges
useAuth().canManageUsers()              # Check user management access
```

## Security Features

### Password Security

- **Hashing**: bcrypt with 12 salt rounds (2^12 = 4,096 iterations)
- **Automatic Salting**: bcrypt generates unique random salt for each password
- **Salt Storage**: Salt embedded in hash string (format: $2b$12$salt$hash)
- **Complexity**: Minimum 8 characters with uppercase, lowercase, number, and special character
- **Storage**: Only hashed passwords stored, never plaintext
- **Validation**: Server-side password strength enforcement
- **Security Level**: Industry-standard protection against rainbow table and brute force attacks

### Token Security

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Secret**: 64-character random string (environment variable)
- **Expiration**: 24 hours maximum
- **Validation**: Signature and expiration checked on every request

### Session Management

- **Stateless**: JWT tokens contain all necessary information
- **Logout**: Client-side token removal (server-side blacklisting possible)
- **Concurrent Sessions**: Multiple sessions allowed per user
- **Auto-logout**: Client automatically redirects on token expiration

### Access Control

- **Route Guards**: Frontend routes protected by authentication status
- **API Middleware**: Backend endpoints protected by role-based middleware
- **Graceful Degradation**: Appropriate error messages for unauthorized access
- **Audit Logging**: All authentication events logged with IP and timestamp

## Default Accounts

### Development Environment

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| `admin@blulok.com` | `Admin123!@#` | admin | Facility administration |
| `devadmin@blulok.com` | `DevAdmin123!@#` | dev_admin | System development |

**Note**: These are created automatically by database seeds in development environment only.

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/login` | Public | User login |
| POST | `/api/v1/auth/logout` | Authenticated | User logout |
| GET | `/api/v1/auth/profile` | Authenticated | Get user profile |
| GET | `/api/v1/auth/verify-token` | Authenticated | Verify token validity |
| POST | `/api/v1/auth/change-password` | Authenticated | Change password |

### Password Reset Endpoints (Deeplink + Token Flow)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/forgot-password/request` | Public (rate-limited) | Request password reset - sends deeplink with token via configured channel |
| POST | `/api/v1/auth/forgot-password/verify` | Public | Verify password reset token is valid |
| POST | `/api/v1/auth/forgot-password/reset` | Public (rate-limited) | Reset password using token |

#### Password Reset Flow (Deeplink + Token - mirrors invite flow)

1. **Request Reset**: User submits email or phone number
   ```json
   POST /api/v1/auth/forgot-password/request
   { "email": "user@example.com" }
   // OR
   { "phone": "+15551234567" }
   ```
   Response includes `expiresAt` and `deliveryMethod` (sms or email).
   A deeplink containing a secure reset token is sent via SMS or email (e.g., `blulok://reset-password?token=abc123...`).

2. **Verify Token** (optional, for UX): Frontend verifies token before showing password form
   ```json
   POST /api/v1/auth/forgot-password/verify
   { "token": "abc123..." }
   ```
   Response includes `success: true` and optionally the user's email for display.

3. **Reset Password**: User submits token + new password
   ```json
   POST /api/v1/auth/forgot-password/reset
   { 
     "token": "abc123...",
     "newPassword": "NewPassword123!" 
   }
   ```
   Token is single-use and expires after 30 minutes (configurable via `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES`).

#### Database Table: `password_reset_tokens`
- `id`: UUID primary key
- `user_id`: Reference to user
- `token`: Unique ~32-character base64url token (24 bytes = 192 bits of entropy)
- `expires_at`: Token expiration timestamp
- `used_at`: When token was used (prevents reuse)
- `created_at`: Creation timestamp

**Token Security**: 24 bytes provides 2^192 possible tokens, which is cryptographically secure for a time-limited (30-minute) reset token while keeping SMS messages concise.

### User Management Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/users` | Admin | List all users |
| GET | `/api/v1/users/:id` | Admin | Get user by ID |
| POST | `/api/v1/users` | Admin | Create new user |
| PUT | `/api/v1/users/:id` | Admin | Update user |
| DELETE | `/api/v1/users/:id` | Admin | Deactivate user |
| POST | `/api/v1/users/:id/activate` | Admin | Reactivate user |

## Error Handling

### Authentication Errors

- **401 Unauthorized**: Invalid credentials, expired token, missing token
- **403 Forbidden**: Valid token but insufficient permissions
- **400 Bad Request**: Invalid input format or validation errors
- **503 Service Unavailable**: Database connection issues

### Error Response Format

```json
{
  "success": false,
  "message": "Human-readable error message"
}
```

## Migration System

### Database Migrations

- **Auto-run**: Migrations execute automatically on server startup
- **Versioned**: Each migration has a timestamp and description
- **Rollback**: Support for rolling back migrations
- **Environment-aware**: Seeds only run in development

### Migration Commands

```bash
npm run migrate              # Run pending migrations
npm run migrate:rollback     # Rollback last migration
npm run seed                # Run seeds manually
npm run db:init             # Create database if missing
npm run db:setup            # Full setup: init + migrate + seed
```

## Security Considerations

### Production Deployment

1. **Environment Variables**: All secrets stored in environment variables
2. **HTTPS Only**: All communication encrypted in production
3. **Rate Limiting**: Login attempts limited to prevent brute force
4. **CORS**: Restricted to known frontend origins
5. **Security Headers**: Helmet.js provides comprehensive security headers

### Database Security

1. **Connection Encryption**: SSL/TLS for database connections in production
2. **Credential Management**: Database credentials in environment variables
3. **Connection Pooling**: Limited connections to prevent resource exhaustion
4. **Prepared Statements**: Protection against SQL injection

### Token Security

1. **Secret Rotation**: JWT secret should be rotated periodically
2. **Short Expiration**: 24-hour maximum token lifetime
3. **Secure Storage**: Tokens stored in httpOnly cookies (recommended) or localStorage
4. **Blacklisting**: Consider implementing token blacklisting for logout

## Future Enhancements

### Planned Security Improvements

1. **Refresh Tokens**: Implement refresh token rotation
2. **Multi-Factor Authentication**: TOTP support (SMS OTP already implemented for invites)
3. **Session Management**: Server-side session tracking
4. **Account Lockout**: Temporary lockout after failed attempts
5. **Audit Trail**: Comprehensive activity logging
6. **Device Registration**: Trusted device management

### Scalability Considerations

1. **Redis Integration**: Session storage and rate limiting
2. **OAuth Integration**: Third-party authentication providers
3. **Microservices**: Separate authentication service
4. **Load Balancing**: Stateless design supports horizontal scaling
