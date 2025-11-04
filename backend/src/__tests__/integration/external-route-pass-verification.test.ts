import { importJWK, jwtVerify, exportSPKI } from 'jose';

// Developer-provided dev keys and token (will be rotated later)
const OPS_ED25519_PUBLIC_KEY_B64 = '6_EjIe_oJ_JnS36muKFk3jDgB_xlEyi5OLzF5JIAI5o';
const ROOT_ED25519_PUBLIC_KEY_B64 = 'kfySghlAttAnifL4VKTBTfj16edmwvGkS6NZiFOIuwI';

const ROUTE_PASS =
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6IjZfRWpJZV9vSl9KblMzNm11S0ZrM2pEZ0JfeGxFeWk1T0x6RjVKSUFJNW8ifQ.eyJpc3MiOiJCbHVDbG91ZDpSb290Iiwic3ViIjoiNDVkZDM3MTgtMTU3Ny00N2Y1LWFlNTctMGRkODkyZTBmZGZiIiwiYXVkIjpbImxvY2s6Y2YzNzNlZWUtMGQxNy00NGVlLTk2NDAtNmM1MDExYzVhZjg1IiwibG9jazoyNjkyOGY4YS00ZDc0LTQ0OTctODdlNC01MzM4NjhkZmNiMDMiLCJsb2NrOjAzMzVhZjhlLTA2NzctNDc1ZC1iMDg3LTIyMjRiNTBmYThhYyJdLCJqdGkiOiIzNzRiOTY4NC04OGEyLTQyNTUtOGZmNC0yMzc0YjM2MjM3YzIiLCJkZXZpY2VfcHVia2V5IjoiYUZwZzNVdXlBVkZOeHErTHdleFJLWG1DcEhvQnBnd01DVHEvZk1PYXJSQT0iLCJpYXQiOjE3NjIyNjQwNTcsImV4cCI6MTc2MjM1MDQ1N30.mzIpzHw9otSLfXF1bkTJfg6MWLM-mTHRqp73C5m0CW1rIAlZAVByPMCJYGzloj_N3tnvtize67A1R-8hbJO6AQ';

describe('External route pass verification against provided dev keys', () => {
  it('verifies the provided route pass using the OPS public key (EdDSA/Ed25519)', async () => {
    const opsJwk = { kty: 'OKP', crv: 'Ed25519', x: OPS_ED25519_PUBLIC_KEY_B64 } as const;
    const opsKey = await importJWK(opsJwk, 'EdDSA');

    const { payload, protectedHeader } = await jwtVerify(ROUTE_PASS, opsKey, {
      algorithms: ['EdDSA'],
    });

    expect(protectedHeader.alg).toBe('EdDSA');
    expect(protectedHeader.kid).toBe(OPS_ED25519_PUBLIC_KEY_B64);
    expect(payload.iss).toBe('BluCloud:Root');
    expect(Array.isArray(payload.aud)).toBe(true);
    expect(typeof payload.sub).toBe('string');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload).toHaveProperty('device_pubkey');
  });

  it('fails verification if using the ROOT public key (since token is signed by OPS)', async () => {
    const rootJwk = { kty: 'OKP', crv: 'Ed25519', x: ROOT_ED25519_PUBLIC_KEY_B64 } as const;
    const rootKey = await importJWK(rootJwk, 'EdDSA');

    await expect(jwtVerify(ROUTE_PASS, rootKey, { algorithms: ['EdDSA'] })).rejects.toBeTruthy();
  });

  it('exports OPS public key in SPKI (PEM) format for Android/jwt.io usage', async () => {
    const opsJwk = { kty: 'OKP', crv: 'Ed25519', x: OPS_ED25519_PUBLIC_KEY_B64 } as const;
    const opsKey = await importJWK(opsJwk, 'EdDSA');
    const spki = await exportSPKI(opsKey as any);
    expect(spki.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true);
    expect(spki.endsWith('-----END PUBLIC KEY-----\n')).toBe(true);
  });
});


