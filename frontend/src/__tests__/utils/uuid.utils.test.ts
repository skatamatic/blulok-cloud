import { generateUuid } from '@/utils/uuid.utils';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateUuid', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    });
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = jest.fn(() => '11111111-2222-4333-8444-555555555555');
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID, getRandomValues: jest.fn() },
      configurable: true,
    });

    expect(generateUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (target: Uint8Array) => {
          target.set(bytes);
          return target;
        },
      },
      configurable: true,
    });

    expect(generateUuid()).toMatch(UUID_V4);
  });
});
