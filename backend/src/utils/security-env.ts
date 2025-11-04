import { config } from '@/config/environment';

function isBase64Url(str: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(str);
}

export function validateEd25519Env(): void {
  if (config.nodeEnv === 'test') return;
  const { opsPrivateKeyB64, opsPublicKeyB64, rootPublicKeyB64 } = config.security as any;

  const checks: Array<{ name: string; value: string | undefined }> = [
    { name: 'OPS_ED25519_PRIVATE_KEY_B64', value: opsPrivateKeyB64 },
    { name: 'OPS_ED25519_PUBLIC_KEY_B64', value: opsPublicKeyB64 },
    { name: 'ROOT_ED25519_PUBLIC_KEY_B64', value: rootPublicKeyB64 },
  ];

  for (const { name, value } of checks) {
    if (!value || typeof value !== 'string') {
      throw new Error(`Security configuration error: ${name} is missing`);
    }
    if (!isBase64Url(value)) {
      throw new Error(`Security configuration error: ${name} must be base64url format`);
    }
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length !== 32) {
      throw new Error(`Security configuration error: ${name} must decode to 32 bytes`);
    }
  }
}


