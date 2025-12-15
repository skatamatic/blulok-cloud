/**
 * Facility Viewer Widget
 * 
 * A huge widget that displays the 3D facility viewer with real-time state updates.
 * Only available for facilities that have a linked BluDesign 3D model.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { FacilityViewer3D } from '../bludesign/viewer';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import * as bludesignApi from '@/api/bludesign';

interface FacilityViewerWidgetProps {
  id: string;
  title?: string;
  /** BluDesign facility ID (the 3D model) */
  bluDesignFacilityId: string;
  /** BluLok facility ID (for WebSocket subscriptions) */
  bluLokFacilityId?: string;
  /** Facility name for display */
  facilityName?: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

export const FacilityViewerWidget: React.FC<FacilityViewerWidgetProps> = ({
  id,
  title,
  bluDesignFacilityId: initialBluDesignFacilityId,
  bluLokFacilityId,
  facilityName,
  initialSize = 'huge',
  availableSizes = ['huge', 'huge-wide', 'mega-tall'],
  onGridSizeChange,
  onRemove,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [size, setSize] = useState<WidgetSize>(initialSize);
  
  // Facility selection state
  const [bluDesignFacilities, setBluDesignFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBluDesignFacilityId, setSelectedBluDesignFacilityId] = useState<string | null>(initialBluDesignFacilityId || null);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);

  const displayTitle = title || facilityName || 'Facility View';
  
  // Load available BluDesign facilities
  useEffect(() => {
    const loadFacilities = async () => {
      setIsLoadingFacilities(true);
      try {
        const facilities = await bludesignApi.getFacilities();
        setBluDesignFacilities(facilities.map(f => ({ id: f.id, name: f.name })));
        
        // If initial ID is provided and exists, use it; otherwise select first
        if (initialBluDesignFacilityId && facilities.find(f => f.id === initialBluDesignFacilityId)) {
          setSelectedBluDesignFacilityId(initialBluDesignFacilityId);
        } else if (facilities.length > 0 && !selectedBluDesignFacilityId) {
          setSelectedBluDesignFacilityId(facilities[0].id);
        }
      } catch (error) {
        console.error('Failed to load BluDesign facilities:', error);
      } finally {
        setIsLoadingFacilities(false);
      }
    };
    
    loadFacilities();
  }, [initialBluDesignFacilityId]);

  const handleReady = useCallback(() => {
    // Viewer is ready
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('Facility viewer error:', error);
  }, []);

  // Custom menu items for enhanced dropdown
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
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      enhancedMenu={enhancedMenu}
      suppressTitleOverlay={true}
    >
      <div className="h-full w-full relative -m-5" style={{ marginTop: '-1rem' }}>
        {/* Make the viewer take full widget space */}
        <div className="absolute inset-0" style={{ 
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          marginLeft: '-1.25rem',
          marginRight: '-1.25rem',
          marginBottom: '-1.25rem',
          width: 'calc(100% + 2.5rem)',
          height: 'calc(100% + 1.25rem)',
        }}>
          {/* Facility Selector - Top Right */}
          {bluDesignFacilities.length > 0 && (
            <div className="absolute top-4 right-4 z-30">
              <div className={`
                flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-md shadow-lg border
                ${isDark 
                  ? 'bg-gray-900/90 border-gray-700/60' 
                  : 'bg-white/90 border-gray-200/80'
                }
              `}>
                <label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  3D Model:
                </label>
                <select
                  value={selectedBluDesignFacilityId || ''}
                  onChange={(e) => setSelectedBluDesignFacilityId(e.target.value || null)}
                  disabled={isLoadingFacilities}
                  className={`
                    text-sm px-2 py-1 rounded border
                    ${isDark 
                      ? 'bg-gray-800 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                    }
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  `}
                >
                  {bluDesignFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          
          {selectedBluDesignFacilityId ? (
            <FacilityViewer3D
              bluDesignFacilityId={selectedBluDesignFacilityId}
              bluLokFacilityId={bluLokFacilityId}
              onReady={handleReady}
              onError={handleError}
            />
          ) : (
            <NoFacilityPlaceholder isDark={isDark} />
          )}
        </div>
      </div>
    </Widget>
  );
};

/**
 * Placeholder shown when no facility is linked
 */
const NoFacilityPlaceholder: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div className={`
    h-full w-full flex items-center justify-center
    ${isDark ? 'bg-gray-900' : 'bg-gray-100'}
  `}>
    <div className="text-center max-w-sm px-6">
      <div className={`
        w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
        ${isDark ? 'bg-gray-800' : 'bg-gray-200'}
      `}>
        <BuildingOffice2Icon className={`w-8 h-8 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
      </div>
      <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
        No 3D Model Linked
      </h3>
      <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
        This facility doesn't have a linked 3D model. Use BluDesign to create one and link it to this facility.
      </p>
    </div>
  </div>
);

export default FacilityViewerWidget;

