/**
 * Facility Viewer 2D
 *
 * Read-only 2D layout view for imported facilities on the dashboard widget.
 * Live unit colors, selection, smart search focus, and pan/zoom — no WebGL.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import * as bludesignApi from '@/api/bludesign';
import {
  type PlacedObject,
  type Building,
} from '../core/types';
import {
  ImportedLayoutViewer,
  type ImportedLayoutViewerHandle,
} from '../layout-import/ImportedLayoutViewer';
import {
  buildViewerPlacedObjects,
  getLayoutImportFromFacility,
  layoutImportToEditableUnits,
  resolveLiveUnitColor,
  type LayoutImportMetadata,
  type LiveUnitTelemetry,
} from '../layout-import/layoutImportMetadata';
import type { FacilityResponse } from '@/api/bludesign';
import { fetchLayoutSourceObjectUrl } from '@/api/bludesign';
import { ViewerLoadingOverlay } from './ViewerLoadingOverlay';
import { ViewerPropertiesPanel } from './ViewerPropertiesPanel';
import { ViewerSmartObjectsPanel } from './ViewerSmartObjectsPanel';
import { ViewerLiveStateLegend } from './ViewerLiveStateLegend';
import { shouldUseExpandedViewerChrome } from './viewer-layout.utils';
import { useFacilityViewerLiveState } from './useFacilityViewerLiveState';
import { type ViewerSmartAssetState } from './viewerLiveState';
import type { BluLokUnit } from '@/api/bludesign';

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

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ImportedLayoutViewerHandle>(null);
  const assetStatesRef = useRef<Map<string, ViewerSmartAssetState>>(new Map());
  const selectedEntityIdRef = useRef<string | null>(null);

  const [layoutImport, setLayoutImport] = useState<LayoutImportMetadata | null>(null);
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<ViewerSmartAssetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [stateVersion, setStateVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [planImageUrl, setPlanImageUrl] = useState<string | null>(null);
  const [planImageLoading, setPlanImageLoading] = useState(false);
  const [planImageError, setPlanImageError] = useState<string | null>(null);
  const [planImageAttempt, setPlanImageAttempt] = useState(0);
  const [showPlanImage, setShowPlanImage] = useState(false);
  const [liveHydrated, setLiveHydrated] = useState(false);
  const [unitsCatalog, setUnitsCatalog] = useState<Map<string, BluLokUnit>>(new Map());
  const planImageUrlRef = useRef<string | null>(null);

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
      const meta = getLayoutImportFromFacility(facility.data);
      if (!meta) {
        throw new Error('This facility has no import layout data');
      }
      facility.data.layoutImport = meta;
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
    setLiveHydrated(false);
    setUnitsCatalog(new Map());

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

  const applyLiveStateUpdates = useCallback((updates: ViewerSmartAssetState[]) => {
    for (const update of updates) {
      assetStatesRef.current.set(update.entityId, update);
      if (selectedEntityIdRef.current === update.entityId) {
        setSelectedState(update);
      }
    }
    setStateVersion((v) => v + 1);
  }, []);

  const handleHydrationComplete = useCallback(() => {
    setLiveHydrated(true);
    setStateVersion((v) => v + 1);
  }, []);

  const selectedUnitInfo = useMemo(() => {
    const entityId = selectedObject?.binding?.entityId;
    if (selectedObject?.binding?.entityType !== 'unit' || !entityId) return null;
    return unitsCatalog.get(entityId) ?? null;
  }, [selectedObject, unitsCatalog]);

  const handleUnitsCatalog = useCallback((unitsById: Map<string, BluLokUnit>) => {
    setUnitsCatalog(unitsById);
  }, []);

  useFacilityViewerLiveState({
    bluLokFacilityId,
    enabled: !!bluLokFacilityId && !loading && !loadError,
    onUpdates: applyLiveStateUpdates,
    onUnitsCatalog: handleUnitsCatalog,
    onHydrationComplete: handleHydrationComplete,
  });

  useEffect(() => {
    setLiveHydrated(false);
    setUnitsCatalog(new Map());
  }, [bluLokFacilityId]);

  useEffect(() => {
    if (!layoutImport || loading || loadError || !showPlanImage) {
      if (!showPlanImage && planImageUrlRef.current) {
        URL.revokeObjectURL(planImageUrlRef.current);
        planImageUrlRef.current = null;
        setPlanImageUrl(null);
      }
      if (!showPlanImage) {
        setPlanImageLoading(false);
        setPlanImageError(null);
      }
      return;
    }

    let cancelled = false;
    setPlanImageLoading(true);
    setPlanImageError(null);

    void fetchLayoutSourceObjectUrl(bluDesignFacilityId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (planImageUrlRef.current) {
          URL.revokeObjectURL(planImageUrlRef.current);
        }
        planImageUrlRef.current = url;
        setPlanImageUrl(url);
        setPlanImageError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setPlanImageUrl(null);
          setPlanImageError('Import plan image unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setPlanImageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bluDesignFacilityId, layoutImport, loading, loadError, planImageAttempt, showPlanImage]);

  useEffect(
    () => () => {
      if (planImageUrlRef.current) {
        URL.revokeObjectURL(planImageUrlRef.current);
        planImageUrlRef.current = null;
      }
    },
    []
  );

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

      let telemetry: LiveUnitTelemetry = 'live';
      if (!entityId) {
        telemetry = 'unbound';
      } else if (!live) {
        telemetry = liveHydrated ? 'no-signal' : 'pending';
      }

      return resolveLiveUnitColor(live?.state, live?.lockStatus, 0.55, telemetry);
    },
    [bindingByObjectId, stateVersion, liveHydrated]
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
          <div
            className={`absolute top-3 left-3 z-20 flex items-center gap-1 rounded-lg border backdrop-blur-md shadow-sm ${
              isDark ? 'bg-gray-900/85 border-gray-700' : 'bg-white/90 border-gray-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowPlanImage((v) => !v)}
              aria-label={showPlanImage ? 'Hide plan image' : 'Show plan image'}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                isDark ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {showPlanImage ? (
                <EyeIcon className="w-3.5 h-3.5" />
              ) : (
                <EyeSlashIcon className="w-3.5 h-3.5" />
              )}
              {showPlanImage ? 'Hide plan image' : 'Show plan image'}
            </button>
            {planImageError && showPlanImage && (
              <button
                type="button"
                onClick={() => setPlanImageAttempt((n) => n + 1)}
                aria-label="Retry loading plan image"
                className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  isDark ? 'text-error-400 hover:bg-gray-800' : 'text-error-600 hover:bg-gray-100'
                }`}
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>

          {planImageLoading && showPlanImage && (
            <div
              className={`absolute top-14 left-3 z-20 rounded-lg px-3 py-1.5 text-xs backdrop-blur-md border ${
                isDark ? 'bg-gray-900/85 border-gray-700 text-gray-300' : 'bg-white/90 border-gray-200 text-gray-600'
              }`}
            >
              Loading plan image…
            </div>
          )}

          {planImageError && showPlanImage && !planImageLoading && (
            <div
              className={`absolute top-14 left-3 z-20 rounded-lg px-3 py-1.5 text-xs backdrop-blur-md border ${
                isDark ? 'bg-amber-900/40 border-amber-700/60 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {planImageError}. Vector overlay still available.
            </div>
          )}

          <ViewerLiveStateLegend
            className={`absolute z-20 ${useExpandedChrome ? 'bottom-20 left-3' : 'bottom-16 right-3 max-w-[min(100%,20rem)]'}`}
          />

          <ImportedLayoutViewer
            ref={viewerRef}
            imageWidth={layoutImport.imageWidth}
            imageHeight={layoutImport.imageHeight}
            units={units}
            imageUrl={planImageUrl}
            showImage={showPlanImage && !!planImageUrl}
            showLabels
            selectedIds={selectedIds}
            getUnitColor={getUnitColor}
            onSelect={handleSelect}
            className="absolute inset-0"
          />

          <ViewerPropertiesPanel
            selectedObject={selectedObject}
            onClose={handleClearSelection}
            liveState={selectedState ?? undefined}
            unitInfo={selectedUnitInfo}
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
