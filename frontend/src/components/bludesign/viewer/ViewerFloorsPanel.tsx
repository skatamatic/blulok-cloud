/**
 * Viewer Floors Panel
 * 
 * Compact, collapsible floor selector for the readonly facility viewer.
 * Fixed to bottom-right, shows current floor and allows navigation.
 * Includes camera rotation and reset view controls.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BuildingOfficeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

interface ViewerFloorsPanelProps {
  currentFloor: number;
  availableFloors: number[];
  isFullBuildingView: boolean;
  isIsometricMode?: boolean;
  onFloorChange: (floor: number) => void;
  onToggleFullView: () => void;
  onRotateCamera?: (direction: 'cw' | 'ccw') => void;
  onToggleCameraMode?: () => void;
}

/**
 * Get floor label for display (B2, B1, G, 1, 2, 3, etc.)
 */
const getFloorLabel = (level: number): string => {
  if (level === 0) return 'G';
  if (level < 0) return `B${Math.abs(level)}`;
  return level.toString();
};

/**
 * Get floor description
 */
const getFloorDescription = (level: number): string => {
  if (level === 0) return 'Ground';
  if (level < 0) return `Basement ${Math.abs(level)}`;
  return `Floor ${level}`;
};

export const ViewerFloorsPanel: React.FC<ViewerFloorsPanelProps> = ({
  currentFloor,
  availableFloors,
  isFullBuildingView,
  isIsometricMode = true,
  onFloorChange,
  onToggleFullView,
  onRotateCamera,
  onToggleCameraMode,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);

  const currentIndex = availableFloors.indexOf(currentFloor);
  const canGoUp = currentIndex < availableFloors.length - 1;
  const canGoDown = currentIndex > 0;

  const handleFloorUp = useCallback(() => {
    if (canGoUp) {
      onFloorChange(availableFloors[currentIndex + 1]);
    }
  }, [canGoUp, currentIndex, availableFloors, onFloorChange]);

  const handleFloorDown = useCallback(() => {
    if (canGoDown) {
      onFloorChange(availableFloors[currentIndex - 1]);
    }
  }, [canGoDown, currentIndex, availableFloors, onFloorChange]);

  const handleSelectFloor = useCallback((floor: number) => {
    if (isFullBuildingView) {
      onToggleFullView();
    }
    onFloorChange(floor);
    setIsExpanded(false);
  }, [isFullBuildingView, onToggleFullView, onFloorChange]);

  // Don't render if only one floor and no building view option
  if (availableFloors.length <= 1) {
    // Still show camera controls if available
    if (!onRotateCamera && !onToggleCameraMode) {
      return null;
    }
  }

  const buttonBase = `
    p-2 rounded-lg transition-all duration-200
    ${isDark 
      ? 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white' 
      : 'bg-white/80 hover:bg-gray-100 text-gray-600 hover:text-gray-900'
    }
    backdrop-blur-sm shadow-lg border
    ${isDark ? 'border-gray-700/50' : 'border-gray-200/80'}
    hover:scale-105 active:scale-95
  `;

  const disabledButton = `
    p-2 rounded-lg transition-all duration-200 cursor-not-allowed opacity-40
    ${isDark 
      ? 'bg-gray-800/80 text-gray-500' 
      : 'bg-white/80 text-gray-400'
    }
    backdrop-blur-sm shadow-lg border
    ${isDark ? 'border-gray-700/50' : 'border-gray-200/80'}
  `;

  return (
    <div className="absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {/* Main Control Row - Compact horizontal strip */}
      <div className={`
        flex items-center gap-1 p-1.5 rounded-xl shadow-xl border backdrop-blur-md
        ${isDark 
          ? 'bg-gray-900/90 border-gray-700/60' 
          : 'bg-white/90 border-gray-200/80'
        }
      `}>
        {/* Rotate Left */}
        {onRotateCamera && (
          <button
            onClick={() => onRotateCamera('ccw')}
            className={buttonBase}
            title="Rotate Left (Ctrl+←)"
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v4M3 10l4 4M3 10l4-4" />
            </svg>
          </button>
        )}

        {/* Toggle Camera Mode */}
        {onToggleCameraMode && (
          <button
            onClick={onToggleCameraMode}
            className={`
              ${buttonBase}
              ${isIsometricMode 
                ? '' 
                : isDark 
                  ? '!bg-primary-600 !text-white !border-primary-500' 
                  : '!bg-primary-500 !text-white !border-primary-400'
              }
            `}
            title={isIsometricMode ? "Switch to Free Camera" : "Switch to Isometric View"}
          >
            {isIsometricMode ? (
              // Free camera icon (cube with rotation arrows)
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            ) : (
              // Isometric/grid icon
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            )}
          </button>
        )}

        {/* Rotate Right */}
        {onRotateCamera && (
          <button
            onClick={() => onRotateCamera('cw')}
            className={buttonBase}
            title="Rotate Right (Ctrl+→)"
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v4M21 10l-4 4M21 10l-4-4" />
            </svg>
          </button>
        )}

        {/* Divider */}
        {availableFloors.length > 1 && (
          <div className={`w-px h-6 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        )}

        {/* Floor Controls - only show if multiple floors */}
        {availableFloors.length > 1 && (
          <>
            {/* Floor Up */}
            <button
              onClick={handleFloorUp}
              disabled={!canGoUp || isFullBuildingView}
              className={canGoUp && !isFullBuildingView ? buttonBase : disabledButton}
              title="Go Up One Floor"
            >
              <ChevronUpIcon className="w-4 h-4" />
            </button>

            {/* Current Floor / Floor Selector */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`
                flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all duration-200 min-w-[60px] justify-center
                ${isDark 
                  ? 'bg-gray-800/80 hover:bg-gray-700 text-white' 
                  : 'bg-white/80 hover:bg-gray-100 text-gray-900'
                }
                backdrop-blur-sm shadow-lg border
                ${isDark ? 'border-gray-700/50' : 'border-gray-200/80'}
              `}
              title="Select Floor"
            >
              <BuildingOfficeIcon className="w-4 h-4 text-primary-500" />
              <span className="font-semibold text-sm">
                {isFullBuildingView ? 'All' : getFloorLabel(currentFloor)}
              </span>
            </button>

            {/* Floor Down */}
            <button
              onClick={handleFloorDown}
              disabled={!canGoDown || isFullBuildingView}
              className={canGoDown && !isFullBuildingView ? buttonBase : disabledButton}
              title="Go Down One Floor"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Floor List Dropdown - appears above the control row */}
      <AnimatePresence>
        {isExpanded && availableFloors.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`
              rounded-xl shadow-xl border backdrop-blur-md overflow-hidden
              ${isDark 
                ? 'bg-gray-900/95 border-gray-700/60' 
                : 'bg-white/95 border-gray-200/80'
              }
            `}
          >
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto min-w-[160px]">
              {/* All Floors option */}
              <button
                onClick={() => {
                  onToggleFullView();
                  setIsExpanded(false);
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                  ${isFullBuildingView
                    ? 'bg-primary-600 text-white'
                    : isDark 
                      ? 'hover:bg-gray-800 text-gray-300' 
                      : 'hover:bg-gray-100 text-gray-700'
                  }
                `}
              >
                <EyeIcon className="w-4 h-4" />
                <span className="font-medium">All Floors</span>
              </button>

              {/* Divider */}
              <div className={`h-px my-1 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

              {/* Individual floors (reversed for top-to-bottom display) */}
              {[...availableFloors].reverse().map((floor) => (
                <button
                  key={floor}
                  onClick={() => handleSelectFloor(floor)}
                  className={`
                    w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                    ${!isFullBuildingView && floor === currentFloor
                      ? 'bg-primary-600 text-white'
                      : isDark 
                        ? 'hover:bg-gray-800 text-gray-300' 
                        : 'hover:bg-gray-100 text-gray-700'
                    }
                  `}
                >
                  <span className="font-medium">{getFloorLabel(floor)}</span>
                  <span className="text-xs opacity-70">{getFloorDescription(floor)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ViewerFloorsPanel;
