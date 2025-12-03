import { randomUUID } from 'crypto';
import { Ed25519Service } from '@/services/crypto/ed25519.service';

/**
 * Route Pass Claims Interface
 *
 * Defines the JWT payload structure for Route Passes used in the BluLok security model.
 * Route Passes are short-lived, cryptographically signed tokens that authorize
 * user access to specific locks/zones.
 *
 * Security Properties:
 * - Signed with Operations Private Key (Ed25519) for authenticity
 * - Contains device-bound public key for challenge-response verification
 * - Audience-scoped to prevent unauthorized lock access
 * - Includes unique JWT ID (jti) for replay attack prevention
 * - Standard JWT claims (iss, sub, aud, iat, exp) for token lifecycle
 */
export interface RoutePassClaims {
  /** Issuer claim - identifies BluLok Cloud as the token issuer */
  iss: 'BluCloud:Root';
  /** Subject claim - user ID this pass is issued for */
  sub: string;
  /**
   * Audience claim - array of audience-scoped targets this pass grants access to
   * Formats:
   * - Direct access to a lock:         lock:{lockId}
   * - Shared access via owner user:    shared_key:{primaryTenantId}:{lockId}
   */
  aud: string[];
  /** Issued at timestamp (JWT standard claim) */
  iat?: number;
  /** Expiration timestamp (JWT standard claim) */
  exp?: number;
  /** JWT ID - unique identifier to prevent replay attacks */
  jti: string;
  /** Device-bound public key for challenge-response verification */
  device_pubkey: string;
  /**
   * Schedule data for time-based access control
   * Maps facility IDs to their schedule time windows
   */
  schedule?: {
    facility_id: string;
    time_windows: Array<{
      day_of_week: number; // 0=Sunday, 6=Saturday
      start_time: string;  // "HH:MM:SS"
      end_time: string;    // "HH:MM:SS"
    }>;
  };
}

/**
 * Passes Service
 *
 * Responsible for issuing Route Pass JWTs that serve as short-lived "tickets"
 * for user access to BluLok locks. Route Passes implement the core security
 * mechanism of the centralized trust model.
 *
 * Key Security Features:
 * - Cryptographic signing with Ed25519 Operations Key
 * - Device binding prevents pass theft/reuse
 * - Audience scoping limits access to authorized locks only
 * - Unique JWT IDs prevent replay attacks
 * - Time-bounded validity (configurable TTL)
 *
 * Usage Flow:
 * 1. App requests pass with device ID and user credentials
 * 2. Service validates user permissions and device registration
 * 3. Issues signed JWT with appropriate audience claims
 * 4. App presents JWT to locks for access verification
 */
export class PassesService {
  /**
   * Issue a new Route Pass JWT for authorized user access.
   *
   * This method creates a cryptographically signed JWT that binds a user to
   * their registered device and specifies which locks/zones they can access.
   * The pass is valid for a configurable time period (default 24 hours).
   *
   * @param params - Route pass issuance parameters
   * @param params.userId - ID of the user requesting access
   * @param params.devicePublicKey - Public key of the user's registered device
   * @param params.audiences - Array of lock/zone IDs the user can access
   * @returns Promise resolving to the signed Route Pass JWT string
   *
   * @throws Error if JWT signing fails or parameters are invalid
   */
  public static async issueRoutePass(params: {
    userId: string;
    devicePublicKey: string;
    audiences: string[];
    schedule?: {
      facility_id: string;
      time_windows: Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>;
    };
  }): Promise<string> {
    const claims: RoutePassClaims = {
      iss: 'BluCloud:Root',
      sub: params.userId,
      aud: params.audiences,
      jti: randomUUID(),
      device_pubkey: params.devicePublicKey,
    } as RoutePassClaims;

    // Include schedule if provided
    if (params.schedule) {
      claims.schedule = params.schedule;
    }

    return await Ed25519Service.signJwt(claims as any);
  }
}


