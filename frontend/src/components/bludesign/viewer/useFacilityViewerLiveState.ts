/**
 * Live unit/device state for BluDesign viewers via the shared lock realtime hook.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import type { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';
import {
  fetchFacilityViewerHydration,
  snapshotToViewerStates,
  type ViewerSmartAssetState,
} from './viewerLiveState';
import type { BluLokUnit } from '@/api/bludesign';

const HYDRATE_MAX_ATTEMPTS = 3;
const HYDRATE_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseFacilityViewerLiveStateParams {
  bluLokFacilityId?: string;
  /** When false, subscriptions and hydration are skipped. */
  enabled?: boolean;
  /** Called for each batch of mapped state updates (REST hydrate + WS pushes). */
  onUpdates: (updates: ViewerSmartAssetState[]) => void;
  /** Fired when the unit catalog is loaded or refreshed from REST. */
  onUnitsCatalog?: (unitsById: Map<string, BluLokUnit>) => void;
  /** Fired after initial REST hydration attempt finishes (success or exhausted retries). */
  onHydrationComplete?: () => void;
}

export function useFacilityViewerLiveState({
  bluLokFacilityId,
  enabled = true,
  onUpdates,
  onUnitsCatalog,
  onHydrationComplete,
}: UseFacilityViewerLiveStateParams): void {
  const onUpdatesRef = useRef(onUpdates);
  onUpdatesRef.current = onUpdates;
  const onUnitsCatalogRef = useRef(onUnitsCatalog);
  onUnitsCatalogRef.current = onUnitsCatalog;
  const onHydrationCompleteRef = useRef(onHydrationComplete);
  onHydrationCompleteRef.current = onHydrationComplete;

  const hydrateFromRest = useCallback(async () => {
    if (!bluLokFacilityId) return;

    let lastError: unknown;
    for (let attempt = 0; attempt < HYDRATE_MAX_ATTEMPTS; attempt++) {
      try {
        const { liveStates, unitsById } = await fetchFacilityViewerHydration(bluLokFacilityId);
        onUpdatesRef.current(liveStates);
        onUnitsCatalogRef.current?.(unitsById);
        onHydrationCompleteRef.current?.();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < HYDRATE_MAX_ATTEMPTS - 1) {
          await sleep(HYDRATE_RETRY_BASE_MS * (attempt + 1));
        }
      }
    }

    console.error('[FacilityViewer] Failed to hydrate live states:', lastError);
    onUpdatesRef.current([]);
    onHydrationCompleteRef.current?.();
  }, [bluLokFacilityId]);

  const hydrateRef = useRef(hydrateFromRest);
  hydrateRef.current = hydrateFromRest;

  useEffect(() => {
    if (!enabled || !bluLokFacilityId) return;
    void hydrateRef.current();
  }, [enabled, bluLokFacilityId]);

  const onDeviceRows = useCallback((rows: LockDeviceSnapshot[]) => {
    const updates = rows.flatMap((row) => snapshotToViewerStates(row));
    if (updates.length > 0) {
      onUpdatesRef.current(updates);
    }
  }, []);

  useLockDeviceRealtime({
    enabled: enabled && !!bluLokFacilityId,
    facilityId: bluLokFacilityId ?? null,
    onDeviceRows,
    debouncedRefresh: () => {
      void hydrateRef.current();
    },
    debounceRefreshFilter: (payload) =>
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { source?: string }).source === 'units_update',
    subscribeUnitsForRefresh: true,
    subscribeDeviceStatusForRefresh: false,
  });
}
