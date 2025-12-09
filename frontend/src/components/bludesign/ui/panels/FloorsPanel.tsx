/**
 * Floors Panel
 * 
 * Clean, intuitive UI for floor navigation and management.
 * Features a visual floor stack with inline actions.
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  PlusIcon,
  TrashIcon,
  EyeIcon,
  BuildingOfficeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

interface FloorsPanelProps {
  currentFloor: number;
  availableFloors: number[];
  isFullBuildingView: boolean;
  fullViewOpacity: number;
  hasBuildings: boolean;
  onFloorChange: (floor: number) => void;
  onAddFloorAbove: (copyFromCurrent?: boolean) => void;
  onAddFloorBelow: (copyFromCurrent?: boolean) => void;
  onToggleFullView: () => void;
  onFullViewOpacityChange: (opacity: number) => void;
  onDeleteFloor?: (floor: number) => void;
  onInsertFloor?: (atLevel: number) => void;
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
  if (level === 0) return 'Ground Floor';
  if (level < 0) return `Basement ${Math.abs(level)}`;
  return `Floor ${level}`;
};

/**
 * Compact opacity slider
 */
interface OpacitySliderProps {
  value: number;
  onChange: (value: number) => void;
}

const OpacitySlider: React.FC<OpacitySliderProps> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const updateValue = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    onChange(percent);
  }, [onChange]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX);
  }, [updateValue]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateValue]);
  
  const percent = Math.round(value * 100);
  
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="text-[10px] text-white/60 uppercase tracking-wider">
        Opacity
      </span>
      <div 
        ref={trackRef}
        className="flex-1 h-4 relative cursor-pointer select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-white/15 rounded-full" />
        <div 
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-white/60 rounded-full transition-all duration-75"
          style={{ width: `${percent}%` }}
        />
        <div
          className={`
            absolute top-1/2 -translate-y-1/2 w-3 h-3 -ml-1.5
            bg-white rounded-full shadow-sm
            transition-transform duration-75
            ${isDragging ? 'scale-110' : ''}
          `}
          style={{ left: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] text-white/80 font-medium w-7 text-right tabular-nums">
        {percent}%
      </span>
    </div>
  );
};

/**
 * Add Floor Dialog - compact inline dialog for adding floors
 */
interface AddFloorDialogProps {
  direction: 'above' | 'below';
  onConfirm: (copyContents: boolean) => void;
  onCancel: () => void;
  isDark: boolean;
}

const AddFloorDialog: React.FC<AddFloorDialogProps> = ({ direction, onConfirm, onCancel, isDark }) => {
  const [copyContents, setCopyContents] = useState(false);
  
  return (
    <div className={`
      p-3 rounded-lg border mb-2 animate-in fade-in slide-in-from-top-2 duration-200
      ${isDark ? 'bg-gray-800/95 border-gray-700' : 'bg-white border-gray-200 shadow-lg'}
    `}>
      <div className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
        Add floor {direction}
      </div>
      
      <label className="flex items-center gap-2 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={copyContents}
          onChange={(e) => setCopyContents(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
        />
        <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          Copy current floor contents
        </span>
      </label>
      
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(copyContents)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded bg-primary-600 hover:bg-primary-700 text-white transition-colors"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          Add
        </button>
        <button
          onClick={onCancel}
          className={`
            px-2 py-1.5 text-xs rounded transition-colors
            ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}
          `}
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/**
 * Delete Floor Confirmation
 */
interface DeleteConfirmProps {
  floor: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDark: boolean;
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({ floor, onConfirm, onCancel, isDark }) => (
  <div className={`
    p-3 rounded-lg border mb-2 animate-in fade-in slide-in-from-top-2 duration-200
    ${isDark ? 'bg-red-900/40 border-red-700/50' : 'bg-red-50 border-red-200'}
  `}>
    <div className={`text-xs font-medium mb-1 ${isDark ? 'text-red-300' : 'text-red-800'}`}>
      Delete {getFloorDescription(floor)}?
    </div>
    <div className={`text-[10px] mb-2 ${isDark ? 'text-red-400/80' : 'text-red-600'}`}>
      All objects will be removed. Floors above will shift down.
    </div>
    <div className="flex gap-2">
      <button
        onClick={onConfirm}
        className="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
      >
        Delete
      </button>
      <button
        onClick={onCancel}
        className={`
          px-2 py-1.5 text-xs rounded transition-colors
          ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}
        `}
      >
        Cancel
      </button>
    </div>
  </div>
);

export const FloorsPanel: React.FC<FloorsPanelProps> = ({
  currentFloor,
  availableFloors,
  isFullBuildingView,
  fullViewOpacity,
  hasBuildings,
  onFloorChange,
  onAddFloorAbove,
  onAddFloorBelow,
  onToggleFullView,
  onFullViewOpacityChange,
  onDeleteFloor,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [showAddDialog, setShowAddDialog] = useState<'above' | 'below' | null>(null);
  const [deleteConfirmFloor, setDeleteConfirmFloor] = useState<number | null>(null);
  
  const handleFloorClick = useCallback((floor: number) => {
    // Exit full view if active, then select floor
    if (isFullBuildingView) {
      onToggleFullView();
    }
    onFloorChange(floor);
  }, [onFloorChange, isFullBuildingView, onToggleFullView]);

  const handleAddFloor = useCallback((direction: 'above' | 'below', copyContents: boolean) => {
    if (direction === 'above') {
      onAddFloorAbove(copyContents);
    } else {
      onAddFloorBelow(copyContents);
    }
    setShowAddDialog(null);
  }, [onAddFloorAbove, onAddFloorBelow]);

  // Show empty state if no buildings
  if (!hasBuildings) {
    return (
      <div className="space-y-3">
        <div className={`
          text-center py-8 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-300 bg-gray-50'}
        `}>
          <BuildingOfficeIcon className={`mx-auto h-10 w-10 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No buildings yet
          </p>
          <p className={`text-xs mt-1 px-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Place a building to manage floors
          </p>
        </div>
      </div>
    );
  }

  const sortedFloors = [...availableFloors].sort((a, b) => b - a);
  const maxFloor = Math.max(...availableFloors);
  const minFloor = Math.min(...availableFloors);

  return (
    <div className="space-y-2">
      {/* All Floors View Toggle */}
      <div
        className={`
          rounded-lg overflow-hidden transition-all
          ${isFullBuildingView
            ? 'bg-primary-600 ring-2 ring-primary-400/50'
            : isDark 
              ? 'bg-gray-800 hover:bg-gray-750' 
              : 'bg-gray-100 hover:bg-gray-150'
          }
        `}
      >
        <button
          onClick={onToggleFullView}
          className={`
            w-full flex items-center gap-2 px-3 py-2.5 transition-colors
            ${isFullBuildingView
              ? 'text-white'
              : isDark 
                ? 'text-gray-300' 
                : 'text-gray-700'
            }
          `}
        >
          <EyeIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left text-sm font-medium">All Floors</span>
          {isFullBuildingView && (
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">
              View Mode
            </span>
          )}
        </button>
        {isFullBuildingView && (
          <OpacitySlider 
            value={fullViewOpacity} 
            onChange={onFullViewOpacityChange} 
          />
        )}
      </div>

      {/* Add Floor Above button */}
      {showAddDialog === 'above' ? (
        <AddFloorDialog
          direction="above"
          onConfirm={(copy) => handleAddFloor('above', copy)}
          onCancel={() => setShowAddDialog(null)}
          isDark={isDark}
        />
      ) : (
        <button
          onClick={() => setShowAddDialog('above')}
          className={`
            w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-all
            border-2 border-dashed
            ${isDark 
              ? 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400 hover:bg-gray-800/50' 
              : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500 hover:bg-gray-50'
            }
          `}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <ChevronUpIcon className="w-3 h-3" />
          Add above
        </button>
      )}

      {/* Delete confirmation */}
      {deleteConfirmFloor !== null && (
        <DeleteConfirm
          floor={deleteConfirmFloor}
          onConfirm={() => {
            onDeleteFloor?.(deleteConfirmFloor);
            setDeleteConfirmFloor(null);
          }}
          onCancel={() => setDeleteConfirmFloor(null)}
          isDark={isDark}
        />
      )}

      {/* Floor Stack */}
      <div className="space-y-1">
        {sortedFloors.map((floor, index) => {
          const isSelected = !isFullBuildingView && floor === currentFloor;
          const isTop = floor === maxFloor;
          const isBottom = floor === minFloor;
          
          return (
            <div
              key={floor}
              className={`
                group relative flex items-center rounded-lg transition-all
                ${isSelected
                  ? 'bg-primary-600 text-white shadow-md'
                  : isDark 
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-750' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-150'
                }
              `}
            >
              {/* Floor button */}
              <button
                onClick={() => handleFloorClick(floor)}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left"
              >
                {/* Floor level badge */}
                <span className={`
                  w-8 h-8 flex items-center justify-center rounded-md text-sm font-bold
                  ${isSelected
                    ? 'bg-white/20'
                    : isDark
                      ? 'bg-gray-700'
                      : 'bg-gray-200'
                  }
                `}>
                  {getFloorLabel(floor)}
                </span>
                
                {/* Floor info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {getFloorDescription(floor)}
                  </div>
                  <div className={`text-[10px] ${isSelected ? 'text-white/60' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {isTop && isBottom ? 'Only floor' : isTop ? 'Top floor' : isBottom ? (floor < 0 ? 'Lowest basement' : 'Ground level') : ''}
                  </div>
                </div>
              </button>

              {/* Actions - show on hover or when selected */}
              {availableFloors.length > 1 && onDeleteFloor && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmFloor(floor);
                    setShowAddDialog(null);
                  }}
                  className={`
                    mr-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity
                    ${isSelected
                      ? 'text-white/70 hover:text-white hover:bg-white/10'
                      : isDark 
                        ? 'text-gray-500 hover:text-red-400 hover:bg-gray-700' 
                        : 'text-gray-400 hover:text-red-500 hover:bg-gray-200'
                    }
                  `}
                  title={`Delete ${getFloorDescription(floor)}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Floor Below button */}
      {showAddDialog === 'below' ? (
        <AddFloorDialog
          direction="below"
          onConfirm={(copy) => handleAddFloor('below', copy)}
          onCancel={() => setShowAddDialog(null)}
          isDark={isDark}
        />
      ) : (
        <button
          onClick={() => setShowAddDialog('below')}
          className={`
            w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-all
            border-2 border-dashed
            ${isDark 
              ? 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400 hover:bg-gray-800/50' 
              : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500 hover:bg-gray-50'
            }
          `}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <ChevronDownIcon className="w-3 h-3" />
          Add below (basement)
        </button>
      )}

      {/* Full view mode hint */}
      {isFullBuildingView && (
        <div className={`
          text-center py-2 px-3 rounded-lg text-[10px]
          ${isDark ? 'bg-amber-900/30 text-amber-400/80' : 'bg-amber-50 text-amber-600'}
        `}>
          <span className="font-medium">View-only mode</span>
          <br />
          Select a floor to place assets
        </div>
      )}
    </div>
  );
};
