/**
 * Smart Objects Panel
 * 
 * Lists all smart objects in the scene organized by floor,
 * plus buildings at the top.
 * Double-clicking an object focuses the camera on it.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  CubeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CpuChipIcon,
  BuildingOfficeIcon,
  BuildingOffice2Icon,
  EyeIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { PlacedObject, AssetCategory, Building } from '../../core/types';

interface SmartObjectsPanelProps {
  /** All placed objects in the scene */
  objects: PlacedObject[];
  /** All buildings in the scene */
  buildings: Building[];
  /** Currently selected object IDs */
  selectedIds: string[];
  /** Currently selected building ID */
  selectedBuildingId: string | null;
  /** Callback when object is selected (single click) */
  onSelectObject: (objectId: string) => void;
  /** Callback when building is selected (single click) */
  onSelectBuilding: (buildingId: string) => void;
  /** Callback when object should be focused (double click) */
  onFocusObject: (objectId: string, floor: number) => void;
  /** Callback when building should be focused (double click) */
  onFocusBuilding: (buildingId: string) => void;
}

/**
 * Check if an asset category is considered "smart"
 */
const isSmartCategory = (category: AssetCategory): boolean => {
  const smartCategories: AssetCategory[] = [
    AssetCategory.STORAGE_UNIT,
    AssetCategory.GATE,
    AssetCategory.DOOR,
    AssetCategory.ELEVATOR,
    AssetCategory.ACCESS_CONTROL,
  ];
  return smartCategories.includes(category);
};

/**
 * Get floor label for display
 */
const getFloorLabel = (level: number): string => {
  if (level === 0) return 'Ground Floor';
  if (level < 0) return `Basement ${Math.abs(level)}`;
  return `Floor ${level}`;
};

/**
 * Get icon for object category
 */
const getCategoryIcon = (category: AssetCategory) => {
  switch (category) {
    case AssetCategory.STORAGE_UNIT:
      return CubeIcon;
    case AssetCategory.GATE:
    case AssetCategory.DOOR:
      return BuildingOfficeIcon;
    default:
      return CpuChipIcon;
  }
};

export const SmartObjectsPanel: React.FC<SmartObjectsPanelProps> = ({
  objects,
  buildings,
  selectedIds,
  selectedBuildingId,
  onSelectObject,
  onSelectBuilding,
  onFocusObject,
  onFocusBuilding,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track which sections are expanded
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set([0]));
  const [buildingsExpanded, setBuildingsExpanded] = useState(true);
  
  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);
  
  // Filter buildings by search query
  const filteredBuildings = useMemo(() => {
    if (!searchQuery.trim()) return buildings;
    
    const query = searchQuery.toLowerCase().trim();
    return buildings.filter(building => 
      building.name.toLowerCase().includes(query)
    );
  }, [buildings, searchQuery]);
  
  // Filter and group smart objects by floor (with search)
  const floorGroups = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    const smartObjects = objects.filter(obj => {
      // Must be a smart category
      if (!obj.assetMetadata || !isSmartCategory(obj.assetMetadata.category)) {
        return false;
      }
      
      // If no search, include all
      if (!query) return true;
      
      // Check if name matches search
      const displayName = obj.name ?? obj.assetMetadata?.name ?? '';
      return displayName.toLowerCase().includes(query);
    });
    
    // Group by floor
    const groups = new Map<number, PlacedObject[]>();
    smartObjects.forEach(obj => {
      const floor = obj.floor ?? 0;
      if (!groups.has(floor)) {
        groups.set(floor, []);
      }
      groups.get(floor)!.push(obj);
    });
    
    // Sort by floor (descending) and convert to array
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([floor, objs]) => ({
        floor,
        objects: objs.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
      }));
  }, [objects, searchQuery]);
  
  const toggleFloor = (floor: number) => {
    setExpandedFloors(prev => {
      const next = new Set(prev);
      if (next.has(floor)) {
        next.delete(floor);
      } else {
        next.add(floor);
      }
      return next;
    });
  };
  
  const handleDoubleClick = (obj: PlacedObject) => {
    onFocusObject(obj.id, obj.floor ?? 0);
  };
  
  const totalSmartObjects = floorGroups.reduce((sum, g) => sum + g.objects.length, 0);
  const totalFilteredItems = totalSmartObjects + filteredBuildings.length;
  const totalItems = objects.filter(obj => obj.assetMetadata && isSmartCategory(obj.assetMetadata.category)).length + buildings.length;
  
  // Show empty state only when there are no items at all (not when search returns empty)
  if (totalItems === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CpuChipIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Smart Objects
          </span>
        </div>
        <div className={`
          text-center py-6 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-300 bg-gray-50'}
        `}>
          <CpuChipIcon className={`mx-auto h-10 w-10 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No smart objects
          </p>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Place buildings, units, or other smart assets
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CpuChipIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Smart Objects
          </span>
        </div>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {searchQuery ? `${totalFilteredItems} of ${totalItems}` : `${totalItems} items`}
        </span>
      </div>
      
      {/* Search Input */}
      <div className="relative">
        <MagnifyingGlassIcon 
          className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`} 
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search objects..."
          className={`
            w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border
            transition-colors duration-150
            ${isDark 
              ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30' 
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30'
            }
            outline-none
          `}
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
              isDark ? 'hover:bg-gray-700 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
            }`}
            title="Clear search"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* No results message */}
      {searchQuery && totalFilteredItems === 0 && (
        <div className={`
          text-center py-4 rounded-lg
          ${isDark ? 'bg-gray-800/50' : 'bg-gray-100'}
        `}>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No objects match "{searchQuery}"
          </p>
        </div>
      )}
      
      {/* Buildings section */}
      {filteredBuildings.length > 0 && (
        <div className={`rounded-lg overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
          {/* Buildings header */}
          <button
            onClick={() => setBuildingsExpanded(!buildingsExpanded)}
            className={`
              w-full flex items-center justify-between px-3 py-2 transition-colors
              ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-700'}
            `}
          >
            <span className="flex items-center gap-2">
              {buildingsExpanded ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
              <BuildingOffice2Icon className="w-4 h-4" />
              <span className="font-medium text-sm">Buildings</span>
            </span>
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {filteredBuildings.length}
            </span>
          </button>
          
          {/* Buildings list */}
          {buildingsExpanded && (
            <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              {filteredBuildings.map(building => {
                const isSelected = selectedBuildingId === building.id;
                const floorCount = building.floors.length;
                
                return (
                  <div
                    key={building.id}
                    onClick={() => onSelectBuilding(building.id)}
                    onDoubleClick={() => onFocusBuilding(building.id)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group
                      ${isSelected
                        ? isDark 
                          ? 'bg-primary-600/30 text-primary-300' 
                          : 'bg-primary-100 text-primary-700'
                        : isDark
                          ? 'hover:bg-gray-700/50 text-gray-400'
                          : 'hover:bg-gray-200/50 text-gray-600'
                      }
                    `}
                  >
                    <BuildingOffice2Icon className="w-4 h-4 flex-shrink-0" />
                    <span 
                      className="flex-1 text-sm truncate"
                      title={building.name}
                    >
                      {building.name}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {floorCount} floor{floorCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusBuilding(building.id);
                      }}
                      className={`
                        p-1 rounded transition-colors opacity-0 group-hover:opacity-100
                        ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}
                      `}
                      title="Focus camera on building"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Floor groups */}
      <div className="space-y-1">
        {floorGroups.map(({ floor, objects: floorObjects }) => {
          const isExpanded = expandedFloors.has(floor);
          
          return (
            <div key={floor} className={`rounded-lg overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
              {/* Floor header */}
              <button
                onClick={() => toggleFloor(floor)}
                className={`
                  w-full flex items-center justify-between px-3 py-2 transition-colors
                  ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-700'}
                `}
              >
                <span className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium text-sm">{getFloorLabel(floor)}</span>
                </span>
                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {floorObjects.length}
                </span>
              </button>
              
              {/* Objects list */}
              {isExpanded && (
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  {floorObjects.map(obj => {
                    const Icon = getCategoryIcon(obj.assetMetadata?.category ?? AssetCategory.STORAGE_UNIT);
                    const isSelected = selectedIds.includes(obj.id);
                    const displayName = obj.name ?? obj.assetMetadata?.name ?? 'Unknown';
                    
                    return (
                      <div
                        key={obj.id}
                        onClick={() => onSelectObject(obj.id)}
                        onDoubleClick={() => handleDoubleClick(obj)}
                        className={`
                          flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group
                          ${isSelected
                            ? isDark 
                              ? 'bg-primary-600/30 text-primary-300' 
                              : 'bg-primary-100 text-primary-700'
                            : isDark
                              ? 'hover:bg-gray-700/50 text-gray-400'
                              : 'hover:bg-gray-200/50 text-gray-600'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span 
                          className="flex-1 text-sm truncate"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDoubleClick(obj);
                          }}
                          className={`
                            p-1 rounded transition-colors opacity-0 group-hover:opacity-100
                            ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}
                          `}
                          title="Focus camera on object"
                        >
                          <EyeIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Hint - only show when there are items and no search query */}
      {totalItems > 0 && !searchQuery && (
        <p className={`text-xs text-center ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
          Double-click to focus • Rename in Properties panel
        </p>
      )}
    </div>
  );
};

