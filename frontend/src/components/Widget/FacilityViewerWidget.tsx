/**
 * Facility Viewer Widget
 *
 * Displays the 3D facility viewer with real-time state updates.
 * - Single-facility scope: shows the linked model for the global facility selector (no picker).
 * - All-facilities scope: shows a model picker across linked BluDesign facilities.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { FacilityViewer3D } from '../bludesign/viewer';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import * as bludesignApi from '@/api/bludesign';

export interface DesignFacilityOption {
  id: string;
  name: string;
  linkedBlulokId: string | null;
  linkedBlulokName: string | null;
}

/** Resolve the BluDesign model + BluLok facility for the current global scope. */
export function resolveActiveDesignFacility(
  options: DesignFacilityOption[],
  isAllFacilitiesSelected: boolean,
  allModeSelectedId: string | null,
  selectedFacility: { id: string; name: string; bluDesignFacilityId?: string } | null
): DesignFacilityOption | null {
  if (isAllFacilitiesSelected) {
    if (!allModeSelectedId) return null;
    return options.find((f) => f.id === allModeSelectedId) ?? null;
  }

  if (!selectedFacility) return null;

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
  const [allModeSelectedId, setAllModeSelectedId] = useState<string | null>(null);
  const [isLoadingDesign, setIsLoadingDesign] = useState(false);

  useEffect(() => {
    if (currentSize) setSize(currentSize);
  }, [currentSize]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!isAllFacilitiesSelected || designFacilities.length === 0) return;
    setAllModeSelectedId((prev) => {
      if (prev && designFacilities.some((f) => f.id === prev)) return prev;
      const linked = designFacilities.filter((f) => f.linkedBlulokId);
      return linked[0]?.id ?? designFacilities[0]?.id ?? null;
    });
  }, [isAllFacilitiesSelected, designFacilities]);

  const activeDesignFacility = useMemo(
    () =>
      resolveActiveDesignFacility(
        designFacilities,
        isAllFacilitiesSelected,
        allModeSelectedId,
        selectedFacility
      ),
    [designFacilities, isAllFacilitiesSelected, allModeSelectedId, selectedFacility]
  );

  const displayTitle =
    title ||
    (isAllFacilitiesSelected
      ? 'Facility View'
      : selectedFacility?.name ?? activeDesignFacility?.linkedBlulokName) ||
    'Facility View';

  const isLoading = globalFacilitiesLoading || isLoadingDesign;

  const handleReady = useCallback(() => {}, []);

  const handleError = useCallback((error: Error) => {
    console.error('Facility viewer error:', error);
  }, []);

  const enhancedMenu = (
    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <BuildingOffice2Icon className="w-4 h-4" />
        <span>3D Facility Viewer</span>
      </div>
    </div>
  );

  const scopeBadgeClass = `
    flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-md shadow-md border pointer-events-none
    ${isDark ? 'bg-gray-900/90 border-gray-700/60' : 'bg-white/90 border-gray-200/80'}
  `;

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
        {isAllFacilitiesSelected && designFacilities.length > 0 && (
          <div className="absolute top-2 right-2 z-30 pointer-events-auto">
            <div
              className={`
                flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-md shadow-md border
                ${isDark ? 'bg-gray-900/90 border-gray-700/60' : 'bg-white/90 border-gray-200/80'}
              `}
            >
              <label
                htmlFor={`facility-viewer-model-${id}`}
                className={`text-[10px] font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
              >
                Model
              </label>
              <select
                id={`facility-viewer-model-${id}`}
                value={allModeSelectedId ?? ''}
                onChange={(e) => setAllModeSelectedId(e.target.value || null)}
                disabled={isLoading}
                className={`
                  text-xs max-w-[180px] px-2 py-0.5 rounded border truncate
                  ${isDark ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
                  focus:outline-none focus:ring-2 focus:ring-[#147FD4]
                `}
              >
                {designFacilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.linkedBlulokName
                      ? `${facility.name} · ${facility.linkedBlulokName}`
                      : facility.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!isAllFacilitiesSelected && activeDesignFacility && (
          <div className="absolute top-2 right-2 z-30">
            <div className={scopeBadgeClass}>
              <BuildingOffice2Icon
                className={`h-4 w-4 shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
              />
              <span
                className={`text-xs font-medium truncate max-w-[160px] ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
                title={selectedFacility?.name ?? activeDesignFacility.linkedBlulokName ?? undefined}
              >
                {selectedFacility?.name ?? activeDesignFacility.linkedBlulokName}
              </span>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingPlaceholder isDark={isDark} />
        ) : activeDesignFacility ? (
          <FacilityViewer3D
            key={activeDesignFacility.id}
            bluDesignFacilityId={activeDesignFacility.id}
            bluLokFacilityId={activeDesignFacility.linkedBlulokId ?? undefined}
            isRenderActive={isRenderActive}
            onReady={handleReady}
            onError={handleError}
          />
        ) : (
          <NoFacilityPlaceholder
            isDark={isDark}
            message={
              isAllFacilitiesSelected
                ? 'No 3D facility models are available yet. Create and link a model in BluDesign.'
                : selectedFacility
                  ? `${selectedFacility.name} does not have a linked 3D model yet.`
                  : undefined
            }
          />
        )}
      </div>
    </Widget>
  );
};

const LoadingPlaceholder: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div
    className={`flex h-full w-full items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
  >
    <div
      className={`h-8 w-8 animate-spin rounded-full border-2 border-[#147FD4]/30 border-t-[#147FD4]`}
      aria-label="Loading facility viewer"
    />
  </div>
);

const NoFacilityPlaceholder: React.FC<{ isDark: boolean; message?: string }> = ({
  isDark,
  message,
}) => (
  <div
    className={`flex h-full w-full items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
  >
    <div className="max-w-sm px-6 text-center">
      <div
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}
      >
        <BuildingOffice2Icon className={`h-8 w-8 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
      </div>
      <h3 className={`mb-2 text-lg font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
        No 3D Model Linked
      </h3>
      <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
        {message ??
          "This facility doesn't have a linked 3D model. Use BluDesign to create one and link it to this facility."}
      </p>
    </div>
  </div>
);

export default FacilityViewerWidget;
