import { useCallback } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';

type BackNavigationState = {
  fromPath?: string;
};

const getCurrentPath = (location: Pick<Location, 'pathname' | 'search' | 'hash'>): string =>
  `${location.pathname}${location.search}${location.hash}`;

const hasInAppHistory = (): boolean => {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number') {
    return idx > 0;
  }
  return window.history.length > 1;
};

export const withReturnPath = <T extends Record<string, unknown> = Record<string, never>>(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  state?: T,
): T & BackNavigationState => ({
  ...(state || ({} as T)),
  fromPath: getCurrentPath(location),
});

export const useBackNavigation = (fallbackPath: string, replaceFallback: boolean = true) => {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const fromPath = (location.state as BackNavigationState | null)?.fromPath;
    const currentPath = getCurrentPath(location);

    if (fromPath && fromPath !== currentPath) {
      navigate(fromPath);
      return;
    }

    if (hasInAppHistory()) {
      navigate(-1);
      return;
    }

    navigate(fallbackPath, { replace: replaceFallback });
  }, [fallbackPath, location, navigate, replaceFallback]);
};

