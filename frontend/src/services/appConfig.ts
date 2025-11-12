type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

const getRuntimeConfig = (): RuntimeConfig => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((globalThis as any)?.window?.__APP_CONFIG__ as RuntimeConfig) || {};
};

// Safely read Vite env in both browser and Jest/node (where import.meta is undefined)
const getViteEnv = (key: string): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const importMeta = (globalThis as any).import?.meta || (globalThis as any)['import.meta'];
  const val = importMeta?.env?.[key];
  // Fallback to process.env for Jest/node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (val as string | undefined) ?? (process.env as any)?.[key];
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


