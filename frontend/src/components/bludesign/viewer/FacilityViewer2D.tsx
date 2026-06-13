/**
 * Facility Viewer 2D
 *
 * Read-only 2D layout view for imported facilities on the dashboard widget.
 * Live unit colors, selection, smart search focus, and pan/zoom — no WebGL.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import * as bludesignApi from '@/api/bludesign';
import {
  DeviceState,
  type PlacedObject,
  type Building,
} from '../core/types';
import {
  ImportedLayoutViewer,
  type ImportedLayoutViewerHandle,
} from '../layout-import/ImportedLayoutViewer';
import {
  buildViewerPlacedObjects,
  hasLayoutImport,
  layoutImportToEditableUnits,
  resolveLiveUnitColor,
  type LayoutImportMetadata,
} from '../layout-import/layoutImportMetadata';
import type { FacilityResponse } from '@/api/bludesign';
import { ViewerLoadingOverlay } from './ViewerLoadingOverlay';
import { ViewerPropertiesPanel } from './ViewerPropertiesPanel';
import { ViewerSmartObjectsPanel } from './ViewerSmartObjectsPanel';
import { shouldUseExpandedViewerChrome } from './viewer-layout.utils';

interface SmartAssetState {
  entityId: string;
  entityType: 'unit' | 'gate' | 'elevator' | 'door';
  state: DeviceState;
  lockStatus?: string;
  batteryLevel?: number;
  lastActivity?: string;
}

interface FacilityViewer2DProps {
  bluDesignFacilityId: string;
  bluLokFacilityId?: string;
  /** When provided, skips an initial facility fetch (e.g. from the widget). */
  prefetchedFacility?: FacilityResponse | null;
  className?: string;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export const FacilityViewer2D: React.FC<FacilityViewer2DProps> = ({
  bluDesignFacilityId,
  bluLokFacilityId,
  prefetchedFacility,
  className,
  onReady,
  onError,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const { subscribe, unsubscribe } = useWebSocket();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ImportedLayoutViewerHandle>(null);
  const assetStatesRef = useRef<Map<string, SmartAssetState>>(new Map());
  const selectedEntityIdRef = useRef<string | null>(null);

  const [layoutImport, setLayoutImport] = useState<LayoutImportMetadata | null>(null);
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<SmartAssetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [stateVersion, setStateVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const units = useMemo(
    () => (layoutImport ? layoutImportToEditableUnits(layoutImport) : []),
    [layoutImport]
  );

  const selectedIds = useMemo(
    () => (selectedId ? new Set([selectedId]) : new Set<string>()),
    [selectedId]
  );

  const bindingByObjectId = useMemo(() => {
    const map = new Map<string, string>();
    for (const obj of placedObjects) {
      if (obj.binding?.entityId) map.set(obj.id, obj.binding.entityId);
    }
    return map;
  }, [placedObjects]);

  const selectedObject = useMemo(
    () => placedObjects.find((o) => o.id === selectedId) ?? null,
    [placedObjects, selectedId]
  );

  selectedEntityIdRef.current = selectedObject?.binding?.entityId ?? null;

  const applyFacility = useCallback(
    (facility: FacilityResponse) => {
      if (!hasLayoutImport(facility.data)) {
        throw new Error('This facility has no import layout data');
      }
      const meta = facility.data.layoutImport;
      setLayoutImport(meta);
      setPlacedObjects(buildViewerPlacedObjects(facility.data.placedObjects, meta));
    },
    []
  );

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setLayoutImport(null);
    setSelectedId(null);
    setSelectedState(null);
    assetStatesRef.current.clear();

    let cancelled = false;

    const load = async () => {
      try {
        const facility =
          prefetchedFacility ?? (await bludesignApi.getFacility(bluDesignFacilityId));
        if (cancelled) return;
        applyFacility(facility);
        setLoading(false);
        onReady?.();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load facility';
        setLoadError(message);
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(message));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bluDesignFacilityId, prefetchedFacility, applyFacility, onReady, onError, loadAttempt]);

  const handleRetry = useCallback(() => {
    setLoadAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!bluLokFacilityId || loading || loadError) return;

    const subscriptionId = subscribe(
      'facility_state_update',
      (data: { facilityId?: string; updates?: SmartAssetState[] }) => {
        if (data.facilityId !== bluLokFacilityId) return;
        if (!data.updates?.length) return;

        data.updates.forEach((update) => {
          assetStatesRef.current.set(update.entityId, update);
          if (selectedEntityIdRef.current === update.entityId) {
            setSelectedState(update);
          }
        });
        setStateVersion((v) => v + 1);
      },
      (error) => console.error('WebSocket error:', error)
    );

    return () => {
      if (subscriptionId) unsubscribe(subscriptionId);
    };
  }, [bluLokFacilityId, loading, loadError, subscribe, unsubscribe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setContainerHeight(container.offsetHeight);
      setContainerWidth(container.offsetWidth);
    });
    ro.observe(container);
    setContainerHeight(container.offsetHeight);
    setContainerWidth(container.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const getUnitColor = useCallback(
    (unitId: string) => {
      const entityId = bindingByObjectId.get(unitId);
      const live = entityId ? assetStatesRef.current.get(entityId) : undefined;
      return resolveLiveUnitColor(live?.state, live?.lockStatus);
    },
    [bindingByObjectId, stateVersion]
  );

  const handleSelect = useCallback(
    (unitId: string | null) => {
      setSelectedId(unitId);
      if (!unitId) {
        setSelectedState(null);
        return;
      }
      const obj = placedObjects.find((o) => o.id === unitId);
      const entityId = obj?.binding?.entityId;
      setSelectedState(entityId ? assetStatesRef.current.get(entityId) ?? null : null);
    },
    [placedObjects]
  );

  const handleFocusObject = useCallback((objectId: string, _floor: number) => {
    viewerRef.current?.focusUnit(objectId);
    handleSelect(objectId);
  }, [handleSelect]);

  const handleFocusBuilding = useCallback((_buildingId: string) => {
    viewerRef.current?.fit();
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedState(null);
  }, []);

  const useExpandedChrome = shouldUseExpandedViewerChrome(containerWidth, containerHeight);

  const bgGradient = useMemo(() => {
    if (isDark) {
      return 'radial-gradient(circle at 20% 20%, rgba(40,80,140,0.15), transparent 40%), linear-gradient(135deg, #1e293b, #0f172a)';
    }
    return 'radial-gradient(circle at 20% 20%, rgba(100,150,220,0.15), transparent 40%), linear-gradient(135deg, #f1f5f9, #e2e8f0)';
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ''}`}
      style={{ background: bgGradient }}
    >
      <ViewerLoadingOverlay
        isVisible={loading}
        progress={loading ? undefined : 100}
        message="Loading 2D layout…"
      />

      {loadError && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 z-50 px-6">
          <p className={`text-sm text-center max-w-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {loadError}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {layoutImport && !loading && !loadError && (
        <>
          <ImportedLayoutViewer
            ref={viewerRef}
            imageWidth={layoutImport.imageWidth}
            imageHeight={layoutImport.imageHeight}
            units={units}
            showImage={false}
            showLabels
            selectedIds={selectedIds}
            getUnitColor={getUnitColor}
            onSelect={handleSelect}
            className="absolute inset-0"
          />

          <ViewerPropertiesPanel
            selectedObject={selectedObject}
            onClose={handleClearSelection}
            liveState={
              selectedState
                ? {
                    state: selectedState.state,
                    lockStatus: selectedState.lockStatus,
                    batteryLevel: selectedState.batteryLevel,
                    lastActivity: selectedState.lastActivity,
                  }
                : undefined
            }
          />

          <ViewerSmartObjectsPanel
            objects={placedObjects}
            buildings={[] as Building[]}
            onFocusObject={handleFocusObject}
            onFocusBuilding={handleFocusBuilding}
            maxExpandedHeight={containerHeight > 0 ? Math.floor(containerHeight / 2) - 80 : undefined}
            anchor={useExpandedChrome ? 'corner' : 'above-controls'}
          />
        </>
      )}
    </div>
  );
};

export default FacilityViewer2D;
