# BluLok Cloud Authentication & Authorization System

## Overview

BluLok Cloud implements a comprehensive role-based access control (RBAC) system designed for secure management of storage facility locking systems. The authentication system uses JWT tokens with bcrypt password hashing and provides granular access control based on user roles.

**Route passes (device-bound access JWT):** payload shape, `aud` formats, and the compact **`schedules`** claim are documented in [route-pass-jwt.md](./route-pass-jwt.md).

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
  simplified_ui BOOLEAN NOT NULL DEFAULT false,
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
- **is_active**: Soft-deactivation flag — inactive users cannot login. “Delete user” in the admin UI deactivates (`is_active = false`); the row and unique identifiers (`email`, `login_identifier`, `phone_number`) are retained.
- **simplified_ui**: Presentation-only preference (API field `simplifiedUi`). Intended for `facility_admin` users who should see a simpler Cloud UI. **Not an authorization boundary** — REST/WS permissions remain those of `facility_admin`. Only `admin` / `dev_admin` may set it via `PUT /api/v1/users/:id`. Cleared automatically when the user’s role is no longer `facility_admin`. Returned on login and live on `GET /auth/profile` / verify-token / refresh-token. **Cloud UI gating (current):** Facility Setup hides Gateway and Access Groups / Access Codes tabs; FMS tab uses a sync-history–focused layout (test / sync / review, live WS updates in the history grid) without configuration/webhook technical surfaces. More surfaces may be gated over time.
- **last_login**: Timestamp of most recent successful login
- **created_at/updated_at**: Audit timestamps

#### Re-adding a deactivated user (`POST /api/v1/users`)

Creating a user whose email or phone matches an **inactive** account returns **409** with:

```json
{
  "success": false,
  "code": "USER_INACTIVE",
  "message": "An inactive user with this email already exists. Confirm to reactivate and update their profile.",
  "inactiveUser": {
    "id": "…",
    "email": "…",
    "firstName": "…",
    "lastName": "…",
    "role": "tenant",
    "phoneNumber": null
  }
}
```

The Add User UI prompts the admin to confirm. Retrying the same payload with `reactivateIfInactive: true` reactivates the existing row, applies the submitted profile fields (name, role, password/invite semantics, optional phone), syncs facility associations when provided, and runs activation side effects (denylist removal, share restore). Active-user identity collisions remain hard **400** errors. Callers outside the inactive user’s facility scope receive a generic “already exists” **400** (no `inactiveUser` payload).

Dedicated reactivation also remains available via `POST /api/v1/users/:id/activate` (and the Activate button on user details) and `PUT /api/v1/users/:id` with `isActive: true`.

**RBAC for activate / deactivate**

| Requester | Scope |
|-----------|--------|
| **dev_admin / admin** | Any user (only `dev_admin` may activate/deactivate other `dev_admin` accounts) |
| **facility_admin** | Users in their facilities with roles tenant / maintenance / BluLok technician |
| **Others** | Not allowed |

FMS sync reactivates tenants that are still present in FMS (including manually deactivated accounts) and updates profile fields on apply.

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

### User list API (`GET /api/v1/users`)

List scoping is enforced in `filterUsersForListScope` (`users-rbac.util.ts`) and `UserListScopeService`:

| Requester | Visible users |
|-----------|----------------|
| **admin / dev_admin** | All users |
| **facility_admin** | Users associated with at least one of the requester's facilities — **excluding** admin/dev_admin (global roles have no facility associations and must not appear) |
| **tenant / maintenance** | Self plus users they have actively shared unit access with (`key_sharing.primary_tenant_id` → `shared_with_user_id`). Route still returns **403** via `requireUserManagement`; scoping applies if list access is granted elsewhere. |
| **Other roles** | Empty list |

Single-user reads (`GET /users/:id`, `/details`) use `UserListScopeService.canRequesterViewUser` with the same rules (plus self-access).


### Login Process

1. **Client Request**: POST `/api/v1/auth/login`
   ```json
   {
     "email": "user@example.com",
     "password": "plaintext_password"
   }
   ```

2. **Server Validation**:
   - Identifier (email or phone) format validation
   - User existence verification
   - Account active status check
   - **FMS placeholder rejection**: users with `is_placeholder=true` (or reserved `fms-ph:` login) always fail with generic “Invalid email or password” — they have no usable login identity until upgraded
   - Password hash comparison (bcrypt)

   Placeholder tenants are also blocked from invite accept / set-password and password-reset request/complete paths (defense-in-depth). Upgrade via FMS sync or admin **Enable login** (`PUT /users/:id` with email/phone) uses shared `preparePlaceholderUpgrade` uniqueness checks.
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

4. **JWT Token**: Contains user ID, email, role, optional `facilityIds` snapshot, and expires in 30 days

### Token Management

- **Storage**: Client stores JWT in localStorage
- **Header**: Sent as `Authorization: Bearer <token>`
- **Expiration**: 30 days (configurable via `JWT_EXPIRES_IN`)
- **Refresh**: `POST /auth/refresh-token` re-issues JWT with live scope; clients should also call `GET /auth/profile` for UI scope

### Live facility scope (JWT is not authoritative)

JWT `facilityIds` are a **login snapshot only**. The backend **never** uses raw JWT claims for authorization:

| Layer | Behavior |
|-------|----------|
| **REST** | `authenticateToken` replaces `req.user.facilityIds` on every request via `FacilityAccessService` |
| **Facility resolution** | `facility_admin` → `user_facility_associations`; `tenant` / `maintenance` → active `unit_assignments` + `key_sharing` |
| **Dashboard WebSocket** | Loads scope at connect; refreshes on heartbeat and on association changes (`scope_update` message) |
| **Gateway WebSocket** | `facility_admin` AUTH checks live DB access, not JWT |
| **Frontend UI** | `GlobalFacilityContext` (`GET /facilities`) and `GET /auth/profile` — not JWT decode |

Use `applyFacilityScope(req)` or `FacilityAccessService.hasAccessToFacility()` for new routes instead of reading JWT payloads directly.

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
/settings           # requireSettingsAccess: tenant, maintenance, facility_admin, blulok_technician, admin, dev_admin (tab visibility varies by role)
/settings/add-facility # requireAdmin: admin, dev_admin only
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

// Settings RBAC (`settings-rbac.utils.ts`)
canAccessSystemSettings(role)           # Settings page + sidebar link
canEditDashboardLayout(role)            # Personal dashboard tab + layout mutation (admin/dev_admin)
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
- **Expiration**: 30 days (default)
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
| `dev.facilityadmin@blulok.com` | `DevTest123!@#` | facility_admin | Linked to first facility (dev startup) |
| `dev.maintenance@blulok.com` | `DevTest123!@#` | maintenance | Linked to first facility (dev startup) |
| `dev.tenant@blulok.com` | `DevTest123!@#` | tenant | Linked to first facility (dev startup) |

**Note**: Admin/dev_admin accounts are created by database seeds. Role test accounts (`dev.*`) are ensured on every backend startup when `NODE_ENV=development` and appear as quick-login buttons on the login page in Vite dev mode only.

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/login` | Public | User login |
| POST | `/api/v1/auth/logout` | Authenticated | User logout |
| GET | `/api/v1/auth/profile` | Authenticated | Get user profile |
| GET | `/api/v1/auth/verify-token` | Authenticated | Verify token validity |
| POST | `/api/v1/auth/change-password` | Authenticated | Change password |

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
2. **Token Expiration**: 30-day default token lifetime
3. **Secure Storage**: Tokens stored in httpOnly cookies (recommended) or localStorage
4. **Blacklisting**: Consider implementing token blacklisting for logout

## Admin user provisioning (dashboard / operator UI)

- **Phone number**: Stored as normalized E.164 in `users.phone_number` (unique when set). Admin APIs:
  - `POST /api/v1/users` accepts optional `phoneNumber`, optional `password`, optional `sendInvite`, and optional **`facilityIds`** (UUID array).
  - `PUT /api/v1/users/:id` accepts optional `phoneNumber`; empty string clears the number.
- **Facility assignment on create**: For roles that are **not** globally scoped (`admin`, `dev_admin`), the API requires **at least one** `facilityId`. Associations are applied with `UserFacilityAssociationModel.addUserToFacility` per ID (same behavior as `PUT /user-facilities/:userId`). Global roles must send **no** `facilityIds` (empty array). If association insert fails (e.g. invalid FK), the user row is rolled back via `UserModel.deleteById`.
- **RBAC (create)**:
  - **`facility_admin`** may only create **`tenant`**, **`maintenance`**, **`blulok_technician`** (enforced in `users-rbac.util.ts` + route).
  - Only **`dev_admin`** may create **`dev_admin`** users (unchanged).
  - **`facility_admin`** may only include facility IDs that appear in **`req.user.facilityIds`** (same idea as `PUT /user-facilities/:userId`).
- **RBAC (update role)**: **`facility_admin`** cannot assign **`admin`**, **`facility_admin`**, or **`dev_admin`**; only global administrators (`admin` / `dev_admin`) may assign **`admin`** or **`facility_admin`** (`assertRequesterMayAssignRoleOnUpdate`).
- **RBAC (update user / PUT)**: **`facility_admin`** may only **update** accounts whose **existing** role is **`tenant`**, **`maintenance`**, or **`blulok_technician`** (matches create scope). They must not edit **`admin`**, **`facility_admin`**, **`dev_admin`**, or another peer **`facility_admin`**—even when **`checkFacilityAccess`** passes due to a shared facility—except for **self** (`id === req.user.userId`). Enforced in `users.routes.ts` using `FACILITY_ADMIN_CREATABLE_ROLES`.
- **Resend invite**: `POST /users/:id/resend-invite` now uses **`checkFacilityAccess`** so facility admins cannot resend for users outside their facilities. Also clears any `deferred_user_invites` row for that user.
- **Reset account & re-invite**: `POST /users/:id/reset-account` (user-management roles, facility-scoped). Scorched-earth **auth identity** wipe: password → unusable hash, `requires_password_reset=true`, `last_login=null`, revoke all `user_devices`, delete invites/OTPs/password-reset tokens, push denylist for the user’s units. **Preserves** unit assignments, facility associations, key shares, and FMS mappings. Then sends a fresh invite (bypasses FMS `invitePolicy`). Blocked for self, placeholders, and roles outside the caller’s scope (same guards as deactivate). UI: User Details → Invites tab, and the dashboard **User Management** widget. **Session invalidation:** `authenticateToken`, dashboard WS, and gateway JWT AUTH reject tokens when `requires_password_reset` is true (or the account is inactive), so prior JWTs cannot linger for the default 30-day lifetime after a reset.
- **Invite status on list**: `GET /users` includes `inviteStatus` (`never_invited` | `invite_pending` | `active` | `placeholder`) and `invitedAt`.
- **Password optional**: If `password` is omitted or blank, `AuthService.createUser` stores a non-login placeholder hash (`!`) and sets `requires_password_reset` so the user must complete first-time setup.
- **Invite SMS / email**: When `sendInvite: true` and no password was set, the server calls `FirstTimeUserService.sendInvite` after create. Delivery uses **SMS** when `phone_number` is set, otherwise **email** (if enabled in notification settings). Clients may omit `sendInvite` or use **Resend invite** on the user profile later. FMS-created tenants follow per-facility **`invitePolicy`** (default `none`) — see `fms-webhooks.md`.
- **UI** (`AddUserModal`): “Skip password” enables first-time flow; “Send invite SMS or email now” maps to `sendInvite` (can be unchecked to skip both phone requirement and invite). Role options are filtered for **facility admins** to match the backend. **Facilities** multi-select sends `facilityIds` when the role requires facility scope.

## Future Enhancements

### Planned Security Improvements

1. **Refresh Tokens**: Implement refresh token rotation
2. **Multi-Factor Authentication**: SMS/TOTP support
3. **Session Management**: Server-side session tracking
4. **Password Reset**: Secure password reset flow
5. **Account Lockout**: Temporary lockout after failed attempts
6. **Audit Trail**: Comprehensive activity logging
7. **Device Registration**: Trusted device management

### Scalability Considerations

1. **Redis Integration**: Session storage and rate limiting
2. **OAuth Integration**: Third-party authentication providers
3. **Microservices**: Separate authentication service
4. **Load Balancing**: Stateless design supports horizontal scaling

## Access Event Security Model

### Internal Ingestion Authentication

- `POST /api/v1/internal/gateway/access-events` is authenticated with the same gateway proxy JWT flow used by other internal gateway endpoints.
- `facility_admin`, `admin`, and `dev_admin` are allowed to call the endpoint; facility scope is still enforced through `resolveScopedFacilityId` + `AuthService.canAccessFacility`.
- Facility-scoped gateway sessions cannot override `facility_id` outside their scope.

### Access History RBAC

- Canonical access history now reads from `activity_logs` entries with `activity_type=access_attempt`.
- **tenant/shared** users see:
  - their own actor events, and
  - events for units they currently have access to (primary assignment or active shared access).
- **facility_admin** users see only events from facilities they administer.
- **admin/dev_admin** users can query all facilities.
- **maintenance** users are restricted to their own actor events.

### Denial Reason Taxonomy

The canonical ingestion contract supports explicit deny reasons for security and forensic workflows:

- `out_of_schedule`
- `route_pass_expired`
- `route_pass_invalid_signature`
- `route_pass_wrong_lock`
- `internal_error`
- `denylist_blocked`
- `insufficient_permissions`
- `invalid_credential`
- `unknown_error`
- `other`

## Login: `key_generation_required` (no `X-App-Device-Id`)

Web and gateway tooling often log in **without** `X-App-Device-Id`. In that case, **`facility_admin`**, **`admin`**, and **`dev_admin`** must **not** receive `key_generation_required: true` (mobile key onboarding is not applicable). **`tenant`** and **`maintenance`** still receive the flag so app clients can complete device registration when appropriate.

**Regression tests:**

- `backend/src/__tests__/services/auth.service.login-key-generation.test.ts` — real `AuthService.login` without `X-App-Device-Id` (`jest.unmock('@/services/auth.service')`; global `setup-mocks` otherwise replaces `AuthService` with a stub).
- `backend/src/__tests__/services/auth.service.login-app-device.test.ts` — with `appDeviceId`, `key_generation_required` when no active device row vs omitted when a row exists (mocks `UserDeviceModel`).
