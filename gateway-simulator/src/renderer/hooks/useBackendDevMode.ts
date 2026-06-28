import { useEffect, useState } from 'react';
import { fetchBackendDevMode } from '../utils/backend-dev-mode.utils';

/** True when backend /health reports a dev/test environment; false when prod or unreachable. */
export function useBackendDevMode(backendUrl: string): boolean | null {
  const [isDev, setIsDev] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsDev(null);
    const timer = setTimeout(() => {
      void fetchBackendDevMode(backendUrl).then((dev) => {
        if (!cancelled) setIsDev(dev);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendUrl]);

  return isDev;
}
