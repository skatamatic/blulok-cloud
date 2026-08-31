type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

const getRuntimeConfig = (): RuntimeConfig => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((globalThis as any)?.window?.__APP_CONFIG__ as RuntimeConfig) || {};
};

// Safely read Vite env in both browser and Jest/node without crashing when process is undefined
const getViteEnv = (key: string): string | undefined => {
  const readFromMetaEnv = (env: Record<string, unknown> | undefined): string | undefined => {
    if (!env || env[key] === undefined || env[key] === null) return undefined;
    const s = String(env[key]).trim();
    return s === '' ? undefined : s;
  };

  try {
    // Access import.meta via eval to avoid syntax errors in Jest/CommonJS
    const meta = (0, eval)('import.meta') as { env?: Record<string, unknown> };
    const fromEval = readFromMetaEnv(meta?.env);
    if (fromEval !== undefined) return fromEval;
  } catch {
    // ignore if import.meta is not available (e.g., Jest/node without ESM)
  }

  // Jest: src/test/setup.ts defines globalThis['import.meta'].env (eval('import.meta') may not see it)
  try {
    const gim = (globalThis as unknown as { 'import.meta'?: { env?: Record<string, unknown> } })['import.meta'];
    const fromGlobal = readFromMetaEnv(gim?.env);
    if (fromGlobal !== undefined) return fromGlobal;
  } catch {
    /* ignore */
  }

  if (typeof process !== 'undefined' && (process as { env?: Record<string, string> }).env?.[key] !== undefined) {
    const v = String((process as { env: Record<string, string> }).env[key]).trim();
    return v === '' ? undefined : v;
  }
  return undefined;
};

declare global {
  interface Window {
    /** Set from `main.tsx` via `import.meta.env.DEV` so this module stays Jest-parseable (no `import.meta` here). */
    __BLULOK_VITE_DEV__?: boolean;
  }
}

/**
 * True when running the Vite dev server.
 * Reads `window.__BLULOK_VITE_DEV__` set in `main.tsx` (indirect `eval('import.meta')` does not work in browsers).
 * Jest: `src/test/setup.ts` polyfills `globalThis['import.meta'].env.DEV`.
 */
export const isViteDev = (): boolean => {
  if (typeof window !== 'undefined' && typeof window.__BLULOK_VITE_DEV__ === 'boolean') {
    return window.__BLULOK_VITE_DEV__;
  }
  try {
    const gim = (globalThis as unknown as { 'import.meta'?: { env?: { DEV?: boolean } } })['import.meta'];
    if (gim?.env && Object.prototype.hasOwnProperty.call(gim.env, 'DEV')) {
      return Boolean(gim.env.DEV);
    }
  } catch {
    /* ignore */
  }
  return false;
};

export const getApiBaseUrl = (): string => {
  const runtime = getRuntimeConfig();
  const viteApi = getViteEnv('VITE_API_URL') || '';
  return (runtime.apiBaseUrl || viteApi || '').replace(/\/+$/, '');
};

/**
 * WebSocket origin (no path). From, in order: runtime `wsBaseUrl`, `VITE_WS_URL`, or same host as `VITE_API_URL` / runtime `apiBaseUrl`.
 * Returns empty string if none are set — configure `VITE_WS_URL` and/or `VITE_API_URL` (see `.env.example`).
 */
export const getWsBaseUrl = (): string => {
  // In Vite dev, use the page origin so `/ws` is proxied to the API server (same-origin WS).
  if (isViteDev() && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  const runtime = getRuntimeConfig();
  if (runtime.wsBaseUrl) return runtime.wsBaseUrl.replace(/\/+$/, '');
  const viteWs = getViteEnv('VITE_WS_URL') || '';
  if (viteWs) return viteWs.replace(/\/+$/, '');
  const apiBase = getApiBaseUrl();
  if (apiBase) {
    try {
      const u = new URL(apiBase);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.origin;
    } catch {
      // fallthrough
    }
  }
  return '';
};


