/**
 * Facility Viewer Widget
 *
 * Displays the 3D facility viewer with real-time state updates when a single
 * facility is selected and that facility has a linked BluDesign model.
 * All-facilities scope shows an empty canvas (no picker, no placeholder).
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
  const [isLoadingDesign, setIsLoadingDesign] = useState(false);

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

  const displayTitle =
    title ||
    (isAllFacilitiesSelected ? 'Facility View' : selectedFacility?.name) ||
    'Facility View';

  const showViewer = !isAllFacilitiesSelected && !!activeDesignFacility;
  const isLoading =
    !isAllFacilitiesSelected && (globalFacilitiesLoading || isLoadingDesign);

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
          <FacilityViewer3D
            key={activeDesignFacility.id}
            bluDesignFacilityId={activeDesignFacility.id}
            bluLokFacilityId={activeDesignFacility.linkedBlulokId ?? undefined}
            isRenderActive={isRenderActive}
            onReady={handleReady}
            onError={handleError}
          />
        ) : null}
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

export default FacilityViewerWidget;
