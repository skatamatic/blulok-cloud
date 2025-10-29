/**
 * User Role Hierarchy
 *
 * Defines the permission levels within the BluLok system.
 * Roles follow a hierarchical structure with increasing privileges:
 * - TENANT: Basic access to personal units/locks
 * - MAINTENANCE: Service technicians with unit-specific access
 * - FACILITY_ADMIN: Full facility management (gates, units, users)
 * - ADMIN: Multi-facility administration
 * - DEV_ADMIN: System-wide development and operations access
 *
 * Security Note: Role escalation requires explicit assignment and is audited.
 */
export enum UserRole {
  /** Basic tenant with access to assigned units/locks */
  TENANT = 'tenant',
  /** Global system administrator with all privileges */
  ADMIN = 'admin',
  /** Facility-scoped administrator managing specific facilities */
  FACILITY_ADMIN = 'facility_admin',
  /** Maintenance technician with unit-specific access rights */
  MAINTENANCE = 'maintenance',
  /** BluLok technician for device maintenance and diagnostics */
  BLULOK_TECHNICIAN = 'blulok_technician',
  /** Development administrator with system-wide operational access */
  DEV_ADMIN = 'dev_admin'
}

/**
 * JWT Payload Structure
 *
 * Contains authenticated user information embedded in JSON Web Tokens.
 * This payload is cryptographically signed and verified on each request.
 *
 * Security Considerations:
 * - Contains user identity and permissions
 * - Signed with HS256 algorithm using server-side secret
 * - Includes facility scoping for role-based access control
 * - Standard JWT claims (iat, exp) for token lifecycle management
 */
export interface JWTPayload {
  /** Unique user identifier (database primary key) */
  userId: string;
  /** User's email address for identity verification (may be null for phone-only users) */
  email: string | null;
  /** User's assigned role determining access permissions */
  role: UserRole;
  /** User's first name for display purposes */
  firstName: string;
  /** User's last name for display purposes */
  lastName: string;
  /** Facility IDs this user can access (facility-scoped roles only) */
  facilityIds?: string[];
  /** Issued at timestamp (JWT standard claim) */
  iat?: number;
  /** Expiration timestamp (JWT standard claim) */
  exp?: number;
}

/**
 * Login Request Payload
 *
 * Credentials submitted during user authentication.
 * Password is validated against stored bcrypt hash.
 *
 * Security: Transmitted over HTTPS, validated server-side.
 */
export interface LoginRequest {
  /** User's email address */
  email: string;
  /** User's password (plaintext, hashed server-side) */
  password: string;
}

/**
 * Login Response Structure
 *
 * Authentication result returned to client applications.
 * Contains JWT token for subsequent authenticated requests.
 */
export interface LoginResponse {
  /** Whether authentication was successful */
  success: boolean;
  /** Human-readable success/error message */
  message: string;
  /** User profile information (present on success) */
  user?: {
    /** Unique user identifier */
    id: string;
    /** User's email address (may be null for phone-only users) */
    email: string | null;
    /** User's first name */
    firstName: string;
    /** User's last name */
    lastName: string;
    /** User's assigned role */
    role: UserRole;
  };
  /** JWT token for authenticated requests (present on success) */
  token?: string;
}

/**
 * User Creation Request
 *
 * Data required to create a new user account in the system.
 * Used by administrators and facility managers.
 *
 * Security: Password must meet complexity requirements.
 * Audit: User creation is logged with performing user details.
 */
export interface CreateUserRequest {
  /** User's email address (must be unique) */
  email: string;
  /** Initial password (will be hashed with bcrypt) */
  password: string;
  /** User's first name */
  firstName: string;
  /** User's last name */
  lastName: string;
  /** Role to assign to the new user */
  role: UserRole;
}

/**
 * User Update Request
 *
 * Fields that can be modified on existing user accounts.
 * Used by administrators for user management.
 *
 * Security: Role changes are audited and require appropriate permissions.
 */
export interface UpdateUserRequest {
  /** Updated first name */
  firstName?: string;
  /** Updated last name */
  lastName?: string;
  /** Updated role (requires admin privileges) */
  role?: UserRole;
  /** Account activation status */
  isActive?: boolean;
}

import { Request } from 'express';

/**
 * Express Request with Authentication Context
 *
 * Extended Express Request interface that includes authenticated user information.
 * This interface is used throughout the application for type-safe access to
 * authenticated user data in route handlers and middleware.
 *
 * Security: The `user` property is populated by authentication middleware
 * after successful JWT verification. It should never be trusted for
 * authorization decisions without additional validation.
 */
export interface AuthenticatedRequest extends Request {
  /** Authenticated user information from JWT payload */
  user?: JWTPayload;
}
