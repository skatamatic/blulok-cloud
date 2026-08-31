export type BackendHealthSummary = {
  environment?: string;
};

export function isBackendDevEnvironment(environment: string | undefined): boolean {
  if (!environment) return false;
  const normalized = environment.toLowerCase();
  return normalized === 'development' || normalized === 'dev' || normalized === 'test';
}

/** Probe GET /health to see if the backend is running in a non-production environment. */
export async function fetchBackendDevMode(backendUrl: string): Promise<boolean> {
  const base = backendUrl.replace(/\/+$/, '');
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    if (!res.ok) return false;
    const body = (await res.json()) as BackendHealthSummary;
    return isBackendDevEnvironment(body.environment);
  } catch {
    return false;
  }
}
