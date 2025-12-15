/**
 * Building Skin Panel
 * 
 * UI for editing building properties including name, skin, and actions.
 * Shows when a building is selected.
 */

import React, { useState, useCallback } from 'react';
import {
  SwatchIcon,
  CheckIcon,
  BuildingOffice2Icon,
  TrashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { BuildingSkinType, Building } from '../../core/types';
import { getBuildingSkinManager } from '../../core/BuildingSkinManager';

interface BuildingSkinPanelProps {
  /** Currently selected building (null when no building selected) */
  building: Building | null;
  /** Callback when skin is changed */
  onSkinChange: (buildingId: string, skinType: BuildingSkinType | string) => void;
  /** Callback when building name is changed */
  onRename?: (buildingId: string, newName: string) => void;
  /** Callback when building is deleted */
  onDelete?: (buildingId: string) => void;
}

/** Preview colors for each skin type */
const SKIN_PREVIEW_COLORS: Record<string, { primary: string; secondary: string }> = {
  [BuildingSkinType.DEFAULT]: { primary: '#e8e4dc', secondary: '#cccccc' },
  [BuildingSkinType.BRICK]: { primary: '#a85032', secondary: '#8b4526' },
  [BuildingSkinType.GLASS]: { primary: '#88c4e8', secondary: '#60a0c8' },
  [BuildingSkinType.CONCRETE]: { primary: '#909090', secondary: '#707070' },
  [BuildingSkinType.METAL]: { primary: '#7a8a9a', secondary: '#5a6a7a' },
};

export const BuildingSkinPanel: React.FC<BuildingSkinPanelProps> = ({
  building,
  onSkinChange,
  onRename,
  onDelete,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const skinManager = getBuildingSkinManager();
  
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  
  const availableSkins = skinManager.getAllSkins();
  const currentSkin = building?.skinType || BuildingSkinType.DEFAULT;
  
  const handleSkinSelect = useCallback((skinId: BuildingSkinType | string) => {
    if (building) {
      onSkinChange(building.id, skinId);
    }
  }, [building, onSkinChange]);
  
  const handleStartEditName = useCallback(() => {
    if (building) {
      setNameValue(building.name);
      setEditingName(true);
    }
  }, [building]);
  
  const handleSaveName = useCallback(() => {
    if (building && onRename && nameValue.trim()) {
      onRename(building.id, nameValue.trim());
    }
    setEditingName(false);
  }, [building, onRename, nameValue]);
  
  const handleDeleteBuilding = useCallback(() => {
    if (building && onDelete) {
      if (confirm(`Delete building "${building.name}"? This will remove all walls, floors, and roof.`)) {
        onDelete(building.id);
      }
    }
  }, [building, onDelete]);

  // Show empty state if no building is selected
  if (!building) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SwatchIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Building Skin
          </span>
        </div>
        <div className={`
          text-center py-6 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-300 bg-gray-50'}
        `}>
          <BuildingOffice2Icon className={`mx-auto h-10 w-10 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No building selected
          </p>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Select a building to change its appearance
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Building Info Header */}
      <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-800/50' : 'bg-gray-100/80'}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-8 h-8 rounded flex items-center justify-center ${isDark ? 'bg-primary-600/20' : 'bg-primary-100'}`}>
            <BuildingOffice2Icon className="w-4 h-4 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
                className={`w-full px-2 py-1 text-sm rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                  isDark 
                    ? 'bg-gray-700 border border-gray-600 text-white' 
                    : 'bg-white border border-gray-300 text-gray-900'
                }`}
              />
            ) : (
              <div className="flex items-center gap-1">
                <span className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  {building.name}
                </span>
                {onRename && (
                  <button
                    onClick={handleStartEditName}
                    className={`p-1 rounded transition-colors ${
                      isDark ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                    }`}
                    title="Rename building"
                  >
                    <PencilIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {building.floors.length} floor{building.floors.length !== 1 ? 's' : ''} • {building.footprints.length} section{building.footprints.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={handleDeleteBuilding}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-900/30 rounded text-xs text-red-400 hover:bg-red-900/50 transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            <span>Delete Building</span>
          </button>
        )}
      </div>

      {/* Skin Section Header */}
      <div className="flex items-center gap-2">
        <SwatchIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Building Style
        </span>
      </div>

      {/* Skin options grid */}
      <div className="grid grid-cols-2 gap-2">
        {availableSkins.map((skin) => {
          const isActive = currentSkin === skin.id;
          const colors = SKIN_PREVIEW_COLORS[skin.id] || { primary: '#808080', secondary: '#606060' };
          
          return (
            <button
              key={skin.id}
              onClick={() => handleSkinSelect(skin.id)}
              className={`
                relative flex flex-col items-center p-3 rounded-lg transition-all
                ${isActive
                  ? 'ring-2 ring-primary-500 bg-primary-500/10'
                  : isDark 
                    ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700' 
                    : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                }
              `}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-1 right-1">
                  <CheckIcon className="w-4 h-4 text-primary-500" />
                </div>
              )}
              
              {/* Preview */}
              <div className={`
                w-12 h-12 rounded-lg overflow-hidden mb-2 shadow-inner
                ${isDark ? 'bg-gray-900' : 'bg-white'}
              `}>
                <SkinPreview skinId={skin.id} colors={colors} isTransparent={skin.isTransparent} />
              </div>
              
              {/* Label */}
              <span className={`
                text-xs font-medium truncate w-full text-center
                ${isActive 
                  ? 'text-primary-600 dark:text-primary-400' 
                  : isDark ? 'text-gray-300' : 'text-gray-700'
                }
              `}>
                {skin.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected skin info */}
      <div className={`
        p-3 rounded-lg
        ${isDark ? 'bg-gray-800' : 'bg-gray-100'}
      `}>
        <div className="flex items-start gap-2">
          <BuildingOffice2Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <div>
            <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {skinManager.getSkin(currentSkin)?.name || 'Default'}
            </p>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              {skinManager.getSkin(currentSkin)?.description || 'Standard building appearance'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Mini building preview showing the skin */
const SkinPreview: React.FC<{ 
  skinId: string; 
  colors: { primary: string; secondary: string };
  isTransparent?: boolean;
}> = ({ colors, isTransparent }) => {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      {/* Background */}
      <rect x="0" y="0" width="48" height="48" fill="#1a1a2e" />
      
      {/* Ground */}
      <rect x="0" y="36" width="48" height="12" fill="#2d4a32" />
      
      {/* Building base */}
      <rect 
        x="8" y="12" width="32" height="24" 
        fill={isTransparent ? 'rgba(136, 196, 232, 0.4)' : colors.primary}
        stroke={colors.secondary}
        strokeWidth="1"
      />
      
      {/* Windows if not glass */}
      {!isTransparent && (
        <>
          <rect x="12" y="16" width="6" height="6" fill="#88c4e8" opacity="0.5" />
          <rect x="21" y="16" width="6" height="6" fill="#88c4e8" opacity="0.5" />
          <rect x="30" y="16" width="6" height="6" fill="#88c4e8" opacity="0.5" />
          <rect x="12" y="26" width="6" height="6" fill="#88c4e8" opacity="0.5" />
          <rect x="21" y="26" width="6" height="6" fill="#88c4e8" opacity="0.5" />
          <rect x="30" y="26" width="6" height="6" fill="#88c4e8" opacity="0.5" />
        </>
      )}
      
      {/* Glass reflections for glass skin */}
      {isTransparent && (
        <>
          <line x1="12" y1="12" x2="16" y2="36" stroke="white" strokeWidth="0.5" opacity="0.3" />
          <line x1="24" y1="12" x2="28" y2="36" stroke="white" strokeWidth="0.5" opacity="0.3" />
          <line x1="36" y1="12" x2="40" y2="36" stroke="white" strokeWidth="0.5" opacity="0.3" />
        </>
      )}
      
      {/* Roof */}
      <polygon 
        points="4,12 24,2 44,12" 
        fill={colors.secondary}
      />
    </svg>
  );
};

