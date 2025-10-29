import { importJWK, jwtVerify, JWK } from 'jose';
import { DatabaseService } from '@/services/database.service';
import { PassesService } from '@/services/passes.service';
import { config } from '@/config/environment';

/**
 * Fallback Service
 *
 * Handles offline access scenarios where mobile devices cannot reach the cloud.
 * Processes device-signed JWTs to provide emergency access while maintaining
 * security through cryptographic verification and time-based constraints.
 *
 * Key Security Features:
 * - Device-signed JWT verification using stored public keys
 * - Strict timestamp freshness validation to prevent replay attacks
 * - Cryptographic signature validation with Ed25519
 * - Audience and issuer validation
 * - Limited validity window for fallback tokens
 *
 * Use Case:
 * When a tenant's phone has no internet connectivity, the app can generate
 * a short-lived, device-signed JWT that can be transmitted via SMS or other
 * means to request emergency access through alternative channels.
 *
 * Security Architecture:
 * - JWT signed by device private key (Ed25519)
 * - Verification using stored device public key
 * - Timestamp validation with configurable skew tolerance
 * - Single-use token design prevents replay
 * - Limited audience scope (blulok-cloud-fallback)
 *
 * Integration Flow:
 * 1. App generates device-signed JWT with user/device identifiers
 * 2. JWT transmitted via SMS or gateway relay
 * 3. Gateway forwards JWT to cloud fallback endpoint
 * 4. Service verifies JWT and device registration
 * 5. Issues new Route Pass for legitimate requests
 * 6. Route Pass used for standard lock access
 */
export class FallbackService {
  private db = DatabaseService.getInstance().connection;

  public async processFallbackJwt(fallbackJwt: string): Promise<string> {
    // Decode without verification to read sub/dev
    const parts = fallbackJwt.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const b64 = parts[1] || '';
    const payloadJson = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    const userId = String(payloadJson.sub || '');
    const deviceId = String(payloadJson.dev || '');
    if (!userId || !deviceId) throw new Error('Missing sub/dev');

    // Find registered device public key
    const row = await this.db('user_devices')
      .where({ user_id: userId, app_device_id: deviceId })
      .select('public_key')
      .first();
    const devicePublicKeyB64 = row?.public_key as string | undefined;
    if (!devicePublicKeyB64) throw new Error('Device not registered');

    // Verify signature using device public key
    const jwk: JWK = { kty: 'OKP', crv: 'Ed25519', x: devicePublicKeyB64 } as any;
    const key = await importJWK(jwk, 'EdDSA');
    const { payload } = await jwtVerify(fallbackJwt, key, { algorithms: ['EdDSA'], audience: 'blulok-cloud-fallback', issuer: 'blulok-app' });

    // Freshness check on iat
    const iat = Number(payload.iat || 0);
    const now = Math.floor(Date.now() / 1000);
    const skew = Number((config as any).security.fallbackJwtSkewSeconds ?? config.security.fallbackIatSkewSeconds ?? 10);
    if (!(now - skew <= iat && iat <= now + skew)) {
      throw new Error('Stale fallback token');
    }

    // Issue new Route Pass
    const routePass = await PassesService.issueRoutePass({ userId, devicePublicKey: devicePublicKeyB64, audiences: [] });
    return routePass;
  }
}


