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
  try {
    // Access import.meta via eval to avoid syntax errors in Jest/CommonJS
    // eslint-disable-next-line no-eval
    const meta = (0, eval)('import.meta') as any;
    const env = meta?.env;
    if (env && env[key] !== undefined) {
      return env[key] as string;
    }
  } catch {
    // ignore if import.meta is not available (e.g., Jest/node without ESM)
  }
  // Fallback to process.env for Jest/node environments
  if (typeof process !== 'undefined' && (process as any)?.env && (process as any).env[key] !== undefined) {
    return (process as any).env[key] as string;
  }
  return undefined;
};

export const getApiBaseUrl = (): string => {
  const runtime = getRuntimeConfig();
  const viteApi = getViteEnv('VITE_API_URL') || '';
  return (runtime.apiBaseUrl || viteApi || '').replace(/\/+$/, '');
};

export const getWsBaseUrl = (): string => {
  const runtime = getRuntimeConfig();
  if (runtime.wsBaseUrl) return runtime.wsBaseUrl.replace(/\/+$/, '');
  const viteWs = getViteEnv('VITE_WS_URL') || '';
  if (viteWs) return viteWs.replace(/\/+$/, '');
  const apiBase = getApiBaseUrl();
  if (apiBase) {
    try {
      const u = new URL(apiBase);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      // return base (we will append /ws where needed)
      return u.origin;
    } catch {
      // fallthrough
    }
  }
  return 'ws://localhost:3000';
};


