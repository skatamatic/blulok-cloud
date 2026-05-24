import { useCallback } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { getBackButtonLabel } from '@/utils/back-navigation.utils';

type BackNavigationState = {
  fromPath?: string;
};

export const getCurrentPath = (location: Pick<Location, 'pathname' | 'search' | 'hash'>): string =>
  `${location.pathname}${location.search}${location.hash}`;

export const hasInAppHistory = (): boolean => {
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

export type DetailsBackNavigationOptions = {
  fallbackPath?: string;
  /** When false, the back button only appears when navigation state includes fromPath. */
  showWithoutFromPath?: boolean;
};

export function useDetailsBackNavigation(options: DetailsBackNavigationOptions = {}) {
  const { fallbackPath, showWithoutFromPath = true } = options;
  const location = useLocation();
  const goBack = useBackNavigation(fallbackPath ?? '/dashboard');

  const fromPath = (location.state as BackNavigationState | null)?.fromPath;
  const currentPath = getCurrentPath(location);
  const hasValidFromPath = Boolean(fromPath && fromPath !== currentPath);

  let showBack = hasValidFromPath;
  let backLabel: string | undefined;

  if (hasValidFromPath && fromPath) {
    backLabel = getBackButtonLabel(fromPath);
  } else if (showWithoutFromPath) {
    if (hasInAppHistory()) {
      showBack = true;
      backLabel = 'Back';
    } else if (fallbackPath) {
      showBack = true;
      backLabel = getBackButtonLabel(fallbackPath);
    }
  }

  return { goBack, showBack, backLabel };
}

