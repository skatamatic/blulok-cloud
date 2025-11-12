type RuntimeConfig = {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

const getRuntimeConfig = (): RuntimeConfig => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((globalThis as any)?.window?.__APP_CONFIG__ as RuntimeConfig) || {};
};

export const getApiBaseUrl = (): string => {
  const runtime = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteApi = ((import.meta as any)?.env?.VITE_API_URL as string | undefined) || '';
  return (runtime.apiBaseUrl || viteApi || '').replace(/\/+$/, '');
};

export const getWsBaseUrl = (): string => {
  const runtime = getRuntimeConfig();
  if (runtime.wsBaseUrl) return runtime.wsBaseUrl.replace(/\/+$/, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteWs = ((import.meta as any)?.env?.VITE_WS_URL as string | undefined) || '';
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


