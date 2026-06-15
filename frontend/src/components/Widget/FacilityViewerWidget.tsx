/**
 * Facility Viewer Widget
 *
 * Displays the 3D facility viewer with real-time state updates when a single
 * facility is selected and that facility has a linked BluDesign model.
 * Imported facilities with stored layout data can switch to a 2D plan view.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import {
  FacilityViewer3D,
  FacilityViewer2D,
  FacilityViewerEmptyState,
  ViewerOnCanvasControls,
} from '../bludesign/viewer';
import { EyeIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import * as bludesignApi from '@/api/bludesign';
import type { FacilityResponse } from '@/api/bludesign';
import { hasLayoutImport } from '@/components/bludesign/layout-import/layoutImportMetadata';
import {
  normalizeGroundPreset,
  normalizeSkyPreset,
  type GroundPresetId,
  type SkyPresetId,
} from '@/components/bludesign/core/environment';
import {
  DEFAULT_FACILITY_VIEWER_CONFIG,
  type FacilityViewerEnvironmentOptions,
  type FacilityViewerWidgetConfig,
} from '@/types/widget.types';
import { ViewSettingsPanel } from './facility-viewer/ViewSettingsPanel';
import {
  applyViewSettingsDraftPatch,
  createViewSettingsDraft,
  type ViewSettingsDraft,
} from './facility-viewer/viewSettingsDraft';

export interface DesignFacilityOption {
  id: string;
  name: string;
  linkedBlulokId: string | null;
  linkedBlulokName: string | null;
}

export type ViewerDisplayMode = '3d' | '2d';

/** Resolve the BluDesign model linked to the globally selected facility. */
export function resolveActiveDesignFacility(
  options: DesignFacilityOption[],
  isAllFacilitiesSelected: boolean,
  selectedFacility: { id: string; name: string; bluDesignFacilityId?: string } | null
): DesignFacilityOption | null {
  if (isAllFacilitiesSelected || !selectedFacility) return null;

  if (selectedFacility.bluDesignFacilityId) {
    const match = options.find((f) => f.id === selectedFacility.bluDesignFacilityId);
    return (
      match ?? {
        id: selectedFacility.bluDesignFacilityId,
        name: selectedFacility.name,
        linkedBlulokId: selectedFacility.id,
        linkedBlulokName: selectedFacility.name,
      }
    );
  }

  return options.find((f) => f.linkedBlulokId === selectedFacility.id) ?? null;
}

interface FacilityViewerWidgetProps {
  id: string;
  title?: string;
  /** @deprecated Resolved from global facility scope */
  bluDesignFacilityId?: string;
  /** @deprecated Resolved from global facility scope */
  bluLokFacilityId?: string;
  /** @deprecated Resolved from global facility scope */
  facilityName?: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
  /** When false, 3D rendering is suspended (off-screen dashboard page or page transition). */
  isRenderActive?: boolean;
  skyPreset?: SkyPresetId;
  groundPreset?: GroundPresetId;
  environmentOptions?: FacilityViewerEnvironmentOptions;
  /** Admin layout edit — show view settings controls */
  editable?: boolean;
  onConfigChange?: (patch: Partial<FacilityViewerWidgetConfig>) => void;
}

export const FacilityViewerWidget: React.FC<FacilityViewerWidgetProps> = ({
  id,
  title,
  initialSize = 'huge',
  currentSize,
  availableSizes = ['huge', 'huge-wide', 'mega-tall'],
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  onFullscreenToggle,
  isFullscreen = false,
  isRenderActive = true,
  skyPreset = DEFAULT_FACILITY_VIEWER_CONFIG.skyPreset!,
  groundPreset = DEFAULT_FACILITY_VIEWER_CONFIG.groundPreset!,
  environmentOptions,
  editable = false,
  onConfigChange,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const {
    selectedFacility,
    isAllFacilitiesSelected,
    isLoading: globalFacilitiesLoading,
  } = useGlobalFacility();

  const [size, setSize] = useState<WidgetSize>(currentSize ?? initialSize);
  const [designFacilities, setDesignFacilities] = useState<DesignFacilityOption[]>([]);
  const [isLoadingDesign, setIsLoadingDesign] = useState(false);
  const [has2dLayout, setHas2dLayout] = useState(false);
  const [cachedFacility, setCachedFacility] = useState<FacilityResponse | null>(null);
  const [prefetchError, setPrefetchError] = useState(false);
  const [displayMode, setDisplayMode] = useState<ViewerDisplayMode>('3d');
  const [bindingEffectsEnabled, setBindingEffectsEnabled] = useState(true);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [viewSettingsDraft, setViewSettingsDraft] = useState<ViewSettingsDraft | null>(null);

  const resolvedSkyPreset = normalizeSkyPreset(skyPreset);
  const resolvedGroundPreset = normalizeGroundPreset(groundPreset);

  const previewSkyPreset =
    viewSettingsOpen && viewSettingsDraft ? viewSettingsDraft.skyPreset : resolvedSkyPreset;
  const previewGroundPreset =
    viewSettingsOpen && viewSettingsDraft ? viewSettingsDraft.groundPreset : resolvedGroundPreset;
  const previewEnvironmentOptions =
    viewSettingsOpen && viewSettingsDraft
      ? viewSettingsDraft.environmentOptions
      : environmentOptions;

  const openViewSettings = useCallback(() => {
    setViewSettingsDraft(
      createViewSettingsDraft({
        skyPreset: resolvedSkyPreset,
        groundPreset: resolvedGroundPreset,
        environmentOptions,
      })
    );
    setViewSettingsOpen(true);
  }, [resolvedSkyPreset, resolvedGroundPreset, environmentOptions]);

  const closeViewSettings = useCallback(() => {
    setViewSettingsOpen(false);
    setViewSettingsDraft(null);
  }, []);

  const handleViewSettingsDraftChange = useCallback(
    (patch: Partial<FacilityViewerWidgetConfig>) => {
      setViewSettingsDraft((current) =>
        current ? applyViewSettingsDraftPatch(current, patch) : current
      );
    },
    []
  );

  const handleViewSettingsApply = useCallback(() => {
    if (!viewSettingsDraft) {
      closeViewSettings();
      return;
    }
    onConfigChange?.({
      skyPreset: viewSettingsDraft.skyPreset,
      groundPreset: viewSettingsDraft.groundPreset,
      environmentOptions: viewSettingsDraft.environmentOptions,
    });
    closeViewSettings();
  }, [viewSettingsDraft, onConfigChange, closeViewSettings]);

  const handleViewSettingsCancel = useCallback(() => {
    closeViewSettings();
  }, [closeViewSettings]);

  useEffect(() => {
    if (currentSize) setSize(currentSize);
  }, [currentSize]);

  useEffect(() => {
    if (isAllFacilitiesSelected) {
      setDesignFacilities([]);
      setIsLoadingDesign(false);
      return;
    }

    let cancelled = false;

    const loadDesignFacilities = async () => {
      setIsLoadingDesign(true);
      try {
        const facilities = await bludesignApi.getBluDesignFacilitiesWithLinks();
        if (cancelled) return;
        setDesignFacilities(facilities);
      } catch (error) {
        console.error('Failed to load BluDesign facilities:', error);
      } finally {
        if (!cancelled) setIsLoadingDesign(false);
      }
    };

    void loadDesignFacilities();
    return () => {
      cancelled = true;
    };
  }, [isAllFacilitiesSelected]);

  const activeDesignFacility = useMemo(
    () =>
      resolveActiveDesignFacility(
        designFacilities,
        isAllFacilitiesSelected,
        selectedFacility
      ),
    [designFacilities, isAllFacilitiesSelected, selectedFacility]
  );

  useEffect(() => {
    setDisplayMode('3d');
    setHas2dLayout(false);
    setCachedFacility(null);
    setPrefetchError(false);
    if (!activeDesignFacility) return;

    let cancelled = false;
    void bludesignApi
      .getFacility(activeDesignFacility.id)
      .then((facility) => {
        if (cancelled) return;
        setCachedFacility(facility);
        setHas2dLayout(hasLayoutImport(facility.data));
        setPrefetchError(false);
      })
      .catch(() => {
        if (!cancelled) {
          setHas2dLayout(false);
          setCachedFacility(null);
          setPrefetchError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDesignFacility?.id]);

  const retryPrefetch = useCallback(() => {
    if (!activeDesignFacility) return;
    setPrefetchError(false);
    void bludesignApi
      .getFacility(activeDesignFacility.id)
      .then((facility) => {
        setCachedFacility(facility);
        setHas2dLayout(hasLayoutImport(facility.data));
        setPrefetchError(false);
      })
      .catch(() => setPrefetchError(true));
  }, [activeDesignFacility]);

  const displayTitle =
    title ||
    (isAllFacilitiesSelected ? 'Facility View' : selectedFacility?.name) ||
    'Facility View';

  const showViewer = !isAllFacilitiesSelected && !!activeDesignFacility;
  const isLoading =
    !isAllFacilitiesSelected && (globalFacilitiesLoading || isLoadingDesign);
  const use2d = displayMode === '2d' && has2dLayout;
  const run3d = showViewer && !use2d && isRenderActive;

  const handleReady = useCallback(() => {}, []);

  const handleError = useCallback((error: Error) => {
    console.error('Facility viewer error:', error);
  }, []);

  const enhancedMenu = (
    <div className="space-y-2">
      {editable && !use2d && showViewer && (
        <button
          type="button"
          onClick={openViewSettings}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
        >
          <EyeIcon className="w-4 h-4 text-primary-500" />
          View settings…
        </button>
      )}
      {prefetchError && showViewer && (
        <div className="flex items-center justify-between gap-2 text-xs text-amber-600 dark:text-amber-400">
          <span>Could not verify 2D layout.</span>
          <button
            type="button"
            onClick={retryPrefetch}
            className="font-medium underline text-primary-500"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Widget
      id={id}
      title={displayTitle}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={(next) => {
        setSize(next);
        onSizeChange?.(next);
      }}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      onFullscreenToggle={onFullscreenToggle}
      isFullscreen={isFullscreen}
      enhancedMenu={enhancedMenu}
      suppressTitleOverlay={false}
      edgeToEdge
    >
      <div className="relative h-full min-h-0 w-full overflow-hidden rounded-b-xl">
        {isLoading ? (
          <LoadingPlaceholder isDark={isDark} />
        ) : showViewer && activeDesignFacility ? (
          use2d ? (
            <FacilityViewer2D
              key={`2d-${activeDesignFacility.id}`}
              bluDesignFacilityId={activeDesignFacility.id}
              bluLokFacilityId={activeDesignFacility.linkedBlulokId ?? undefined}
              prefetchedFacility={cachedFacility}
              onReady={handleReady}
              onError={handleError}
            />
          ) : (
            <FacilityViewer3D
              key={activeDesignFacility.id}
              bluDesignFacilityId={activeDesignFacility.id}
              bluLokFacilityId={activeDesignFacility.linkedBlulokId ?? undefined}
              prefetchedFacility={cachedFacility}
              isRenderActive={run3d}
              skyPreset={previewSkyPreset}
              groundPreset={previewGroundPreset}
              environmentOptions={previewEnvironmentOptions}
              bindingEffectsEnabled={bindingEffectsEnabled}
              onReady={handleReady}
              onError={handleError}
            />
          )
        ) : (
          <FacilityViewerEmptyState
            variant={isAllFacilitiesSelected ? 'select-facility' : 'no-model'}
            facilityName={selectedFacility?.name}
          />
        )}
        {!isLoading && showViewer && activeDesignFacility && (
          <ViewerOnCanvasControls
            isDark={isDark}
            show2dToggle={has2dLayout}
            displayMode={displayMode}
            onToggleDisplayMode={() =>
              setDisplayMode((prev) => (prev === '3d' ? '2d' : '3d'))
            }
            showBindingToggle={!use2d}
            bindingEffectsEnabled={bindingEffectsEnabled}
            onToggleBindingEffects={() => setBindingEffectsEnabled((prev) => !prev)}
            className="absolute bottom-4 left-4 z-20"
          />
        )}
        {editable && !use2d && showViewer && (
          <ViewSettingsPanel
            isOpen={viewSettingsOpen}
            skyPreset={viewSettingsDraft?.skyPreset ?? previewSkyPreset}
            groundPreset={viewSettingsDraft?.groundPreset ?? previewGroundPreset}
            environmentOptions={viewSettingsDraft?.environmentOptions ?? previewEnvironmentOptions}
            onDraftChange={handleViewSettingsDraftChange}
            onApply={handleViewSettingsApply}
            onCancel={handleViewSettingsCancel}
          />
        )}
      </div>
    </Widget>
  );
};

const LoadingPlaceholder: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div
    className={`flex h-full w-full items-center justify-center ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}
  >
    <div
      className="h-7 w-7 animate-spin rounded-full border-2 border-[#147FD4]/30 border-t-[#147FD4]"
      aria-label="Loading facility viewer"
      role="status"
    />
  </div>
);

export default FacilityViewerWidget;
