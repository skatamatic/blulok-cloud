/**
 * Ed25519Service
 *
 * Centralized cryptography helpers for the security model:
 * - Signs and verifies EdDSA (Ed25519) JWTs for Route Passes
 * - Signs compact JWS packets for commands (denylist/time-sync)
 * - Uses canonical JSON (sorted keys) for deterministic payload signatures
 *
 * Invariants and security notes:
 * - Operations private key (Ops) is hot: used for Route Pass and command signing.
 * - Verification uses Ops public key; locks store this to verify packets locally.
 * - In test, if env keys are not provided, a throwaway test keypair is generated to keep tests deterministic.
 */
import { importJWK, SignJWT, jwtVerify, JWK, CompactSign, KeyLike, generateKeyPair, exportJWK } from 'jose';
import { config } from '@/config/environment';

export class Ed25519Service {
	private static opsPrivateKeyPromise: Promise<KeyLike> | null = null;
	private static opsPublicKeyPromise: Promise<KeyLike> | null = null;
  private static testGenerated: { d: string; x: string } | null = null;

	private static async getOpsPrivateKey(): Promise<KeyLike> {
		if (!this.opsPrivateKeyPromise) {
			let d = config.security.opsPrivateKeyB64 as string;
			let x = config.security.opsPublicKeyB64 as string;
			// In test, generate a valid keypair to avoid invalid env defaults
			if (config.nodeEnv === 'test') {
				if (!this.testGenerated) {
					const { privateKey, publicKey } = await generateKeyPair('EdDSA');
					const jwkPriv = await exportJWK(privateKey as unknown as KeyLike) as any;
					const jwkPub = await exportJWK(publicKey as unknown as KeyLike) as any;
					this.testGenerated = { d: jwkPriv.d as string, x: jwkPub.x as string };
				}
				d = this.testGenerated.d;
				x = this.testGenerated.x;
			}
			const jwk: JWK = { kty: 'OKP', crv: 'Ed25519', d, x };
			this.opsPrivateKeyPromise = importJWK(jwk, 'EdDSA') as unknown as Promise<KeyLike>;
		}
		return this.opsPrivateKeyPromise as Promise<KeyLike>;
	}

	private static async getOpsPublicKey(): Promise<KeyLike> {
		if (!this.opsPublicKeyPromise) {
			let x = config.security.opsPublicKeyB64 as string;
			if (config.nodeEnv === 'test') {
				if (!this.testGenerated) {
					const { privateKey, publicKey } = await generateKeyPair('EdDSA');
					const jwkPriv = await exportJWK(privateKey as unknown as KeyLike) as any;
					const jwkPub = await exportJWK(publicKey as unknown as KeyLike) as any;
					this.testGenerated = { d: jwkPriv.d as string, x: jwkPub.x as string };
				}
				x = this.testGenerated.x;
			}
			const jwk: JWK = { kty: 'OKP', crv: 'Ed25519', x } as any;
			this.opsPublicKeyPromise = importJWK(jwk, 'EdDSA') as unknown as Promise<KeyLike>;
		}
		return this.opsPublicKeyPromise as Promise<KeyLike>;
	}

  /**
   * Sign an EdDSA JWT containing the provided payload. Adds iat/exp.
   * Intended for Route Pass issuance.
   */
  public static async signJwt(payload: Record<string, any>): Promise<string> {
		const privateKey = await this.getOpsPrivateKey();
		const now = Math.floor(Date.now() / 1000);
		const ttlSeconds = (config.security.routePassTtlHours || 24) * 3600;
		return await new SignJWT(payload as any)
			.setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
			.setIssuedAt(now)
			.setExpirationTime(now + ttlSeconds)
			.sign(privateKey);
	}

  /** Verify EdDSA JWT using the Ops public key. */
  public static async verifyJwt(token: string): Promise<Record<string, any>> {
		const publicKey = await this.getOpsPublicKey();
		const { payload } = await jwtVerify(token, publicKey, { algorithms: ['EdDSA'] });
		return payload as any;
	}

  /** Deterministically stringify object with sorted keys to avoid signature drift. */
  public static canonicalJSONStringify(obj: Record<string, any>): string {
		const keys = Object.keys(obj).sort();
		const sorted: Record<string, any> = {};
		for (const k of keys) sorted[k] = obj[k];
		return JSON.stringify(sorted);
	}

  /**
   * Sign a command packet payload as compact JWS.
   * Returns original payload and detached signature (base64url) for transmission as [payload, signature].
   */
  public static async signPacket(payload: Record<string, any>): Promise<{ payload: Record<string, any>; signature: string }> {
		const privateKey = await this.getOpsPrivateKey();
		const data = new TextEncoder().encode(this.canonicalJSONStringify(payload));
		const signer = new CompactSign(data).setProtectedHeader({ alg: 'EdDSA' });
		const jws = await signer.sign(privateKey);
		const signature = jws.split('.')[2];
		return { payload, signature };
	}
}


