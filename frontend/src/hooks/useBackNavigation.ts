import { useCallback } from 'react';
import { useLocation, useNavigate, type Location, type NavigateFunction } from 'react-router-dom';
import { getBackButtonLabel } from '@/utils/back-navigation.utils';

type BackNavigationState = {
  fromPath?: string;
  /** Prior location.state to restore when falling back to fromPath without browser history. */
  returnState?: unknown;
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
  location: Pick<Location, 'pathname' | 'search' | 'hash' | 'state'>,
  state?: T,
): T & BackNavigationState => ({
  ...(state || ({} as T)),
  fromPath: getCurrentPath(location),
  returnState: location.state,
});

/** Replace URL search params without clearing location.state (keeps back-button context). */
export function replaceSearchParams(
  navigate: NavigateFunction,
  location: Pick<Location, 'pathname' | 'search' | 'state'>,
  mutate: (params: URLSearchParams) => void,
): void {
  const params = new URLSearchParams(location.search);
  mutate(params);
  navigate(
    { pathname: location.pathname, search: params.toString() },
    { replace: true, state: location.state },
  );
}

export const useBackNavigation = (fallbackPath: string, replaceFallback: boolean = true) => {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const navState = location.state as BackNavigationState | null;
    const fromPath = navState?.fromPath;
    const currentPath = getCurrentPath(location);

    if (fromPath && fromPath !== currentPath) {
      // Forward links use push + withReturnPath; pop the stack instead of pushing fromPath again.
      if (hasInAppHistory()) {
        navigate(-1);
        return;
      }

      navigate(fromPath, {
        replace: true,
        ...(navState?.returnState !== undefined && navState?.returnState !== null
          ? { state: navState.returnState }
          : {}),
      });
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

