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
} from '../bludesign/viewer';
import {
  BuildingOffice2Icon,
  CubeIcon,
  MapIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
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
  type FacilityViewerWidgetConfig,
} from '@/types/widget.types';
import { ViewSettingsModal } from './facility-viewer/ViewSettingsModal';

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
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);

  const resolvedSkyPreset = normalizeSkyPreset(skyPreset);
  const resolvedGroundPreset = normalizeGroundPreset(groundPreset);

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

  const handleViewConfigChange = useCallback(
    (patch: Partial<FacilityViewerWidgetConfig>) => {
      onConfigChange?.(patch);
    },
    [onConfigChange]
  );

  const enhancedMenu = (
    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <BuildingOffice2Icon className="w-4 h-4" />
        <span>{use2d ? '2D Facility View' : '3D Facility Viewer'}</span>
      </div>
      {editable && !use2d && showViewer && (
        <button
          type="button"
          onClick={() => setViewSettingsOpen(true)}
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
      {has2dLayout && showViewer && (
        <div className="flex gap-1">
          <ModeToggle
            active={displayMode === '3d'}
            onClick={() => setDisplayMode('3d')}
            icon={<CubeIcon className="w-3.5 h-3.5" />}
            label="3D"
            isDark={isDark}
          />
          <ModeToggle
            active={displayMode === '2d'}
            onClick={() => setDisplayMode('2d')}
            icon={<MapIcon className="w-3.5 h-3.5" />}
            label="2D"
            isDark={isDark}
          />
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
              skyPreset={resolvedSkyPreset}
              groundPreset={resolvedGroundPreset}
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
      </div>
      {editable && (
        <ViewSettingsModal
          isOpen={viewSettingsOpen}
          onClose={() => setViewSettingsOpen(false)}
          skyPreset={resolvedSkyPreset}
          groundPreset={resolvedGroundPreset}
          onChange={handleViewConfigChange}
        />
      )}
    </Widget>
  );
};

const ModeToggle: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isDark: boolean;
}> = ({ active, onClick, icon, label, isDark }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
      active
        ? 'bg-[#147FD4] text-white'
        : isDark
          ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {icon}
    {label}
  </button>
);

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
