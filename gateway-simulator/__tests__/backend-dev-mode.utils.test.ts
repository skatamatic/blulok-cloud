import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBackendDevMode,
  isBackendDevEnvironment,
} from '../src/renderer/utils/backend-dev-mode.utils';

describe('backend-dev-mode.utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats development and test as dev', () => {
    expect(isBackendDevEnvironment('development')).toBe(true);
    expect(isBackendDevEnvironment('dev')).toBe(true);
    expect(isBackendDevEnvironment('test')).toBe(true);
  });

  it('rejects production', () => {
    expect(isBackendDevEnvironment('production')).toBe(false);
    expect(isBackendDevEnvironment(undefined)).toBe(false);
  });

  it('probes /health and returns true for dev environments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ environment: 'development' }),
      }),
    );

    await expect(fetchBackendDevMode('http://127.0.0.1:3000/')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3000/health', { method: 'GET' });
  });

  it('returns false when health is unavailable or non-dev', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );
    await expect(fetchBackendDevMode('http://127.0.0.1:3000')).resolves.toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ environment: 'production' }),
      }),
    );
    await expect(fetchBackendDevMode('http://127.0.0.1:3000')).resolves.toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(fetchBackendDevMode('http://127.0.0.1:3000')).resolves.toBe(false);
    await expect(fetchBackendDevMode('')).resolves.toBe(false);
  });
});
