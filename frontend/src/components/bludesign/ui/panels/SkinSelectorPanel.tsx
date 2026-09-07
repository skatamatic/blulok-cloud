/**
 * Skin Selector Panel
 * 
 * UI for selecting and managing asset skins (material overrides).
 * Shows available skins for the currently selected asset during placement.
 */

import React, { useCallback } from 'react';
import {
  SwatchIcon,
  PlusIcon,
  PencilIcon,
  CheckIcon,
  GlobeAltIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetSkin, AssetMetadata } from '../../core/types';

interface SkinSelectorPanelProps {
  asset: AssetMetadata | null;  // null when no asset is being placed
  availableSkins: AssetSkin[];
  activeSkinId: string | null;
  onSelectSkin: (skinId: string | null) => void;
  onCreateSkin: () => void;
  onEditSkin: (skinId: string) => void;
}

export const SkinSelectorPanel: React.FC<SkinSelectorPanelProps> = ({
  asset,
  availableSkins,
  activeSkinId,
  onSelectSkin,
  onCreateSkin,
  onEditSkin,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const handleSkinClick = useCallback((skinId: string | null) => {
    onSelectSkin(skinId);
  }, [onSelectSkin]);

  // Show empty state if no asset is being placed
  if (!asset) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SwatchIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Skins
          </span>
        </div>
        <div className={`
          text-center py-6 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-300 bg-gray-50'}
        `}>
          <SwatchIcon className={`mx-auto h-10 w-10 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No asset selected
          </p>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Select an asset from the browser to choose skins
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SwatchIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Skins
          </span>
        </div>
        <button
          onClick={onCreateSkin}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-primary-600 hover:bg-primary-500 text-white"
          title="Create new skin"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>

      {/* Default (no skin) option */}
      <button
        onClick={() => handleSkinClick(null)}
        className={`
          w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left
          ${activeSkinId === null
            ? 'bg-primary-600 text-white'
            : isDark 
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }
        `}
      >
        <div className={`
          w-8 h-8 rounded border-2 flex-shrink-0
          ${activeSkinId === null ? 'border-white' : 'border-gray-400 dark:border-gray-600'}
        `}>
          <div className="w-full h-full rounded bg-gradient-to-br from-gray-300 to-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Default</div>
          <div className={`text-xs ${activeSkinId === null ? 'text-white/70' : 'text-gray-500'}`}>
            Standard materials
          </div>
        </div>
        {activeSkinId === null && (
          <CheckIcon className="w-4 h-4 flex-shrink-0" />
        )}
      </button>

      {/* Available skins */}
      <div className="space-y-1">
        {availableSkins.map((skin) => (
          <div
            key={skin.id}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
              ${activeSkinId === skin.id
                ? 'bg-primary-600 text-white'
                : isDark 
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }
            `}
          >
            <button
              onClick={() => handleSkinClick(skin.id)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              {/* Thumbnail or color preview */}
              <div className={`
                w-8 h-8 rounded border-2 flex-shrink-0
                ${activeSkinId === skin.id ? 'border-white' : 'border-gray-400 dark:border-gray-600'}
              `}>
                {skin.thumbnail ? (
                  <img src={skin.thumbnail} alt={skin.name} className="w-full h-full object-cover rounded" />
                ) : (
                  <div className="w-full h-full rounded grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
                    {Object.values(skin.partMaterials).slice(0, 4).map((mat, i) => (
                      <div
                        key={i}
                        className="rounded"
                        style={{ backgroundColor: mat.color }}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Skin info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{skin.name}</div>
                <div className={`flex items-center gap-1 text-xs ${activeSkinId === skin.id ? 'text-white/70' : 'text-gray-500'}`}>
                  {skin.isGlobal ? (
                    <>
                      <GlobeAltIcon className="w-3 h-3" />
                      <span>Global</span>
                    </>
                  ) : (
                    <>
                      <BuildingOfficeIcon className="w-3 h-3" />
                      <span>Facility</span>
                    </>
                  )}
                </div>
              </div>
              
              {activeSkinId === skin.id && (
                <CheckIcon className="w-4 h-4 flex-shrink-0" />
              )}
            </button>
            
            {/* Edit button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditSkin(skin.id);
              }}
              className={`
                p-1.5 rounded transition-colors flex-shrink-0
                ${activeSkinId === skin.id
                  ? 'hover:bg-primary-700 text-white'
                  : isDark 
                    ? 'hover:bg-gray-600 text-gray-400' 
                    : 'hover:bg-gray-300 text-gray-600'
                }
              `}
              title="Edit skin"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {availableSkins.length === 0 && (
        <div className={`
          text-center py-4 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700' : 'border-gray-300'}
        `}>
          <SwatchIcon className={`mx-auto h-8 w-8 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            No custom skins yet
          </p>
          <button
            onClick={onCreateSkin}
            className={`
              mt-2 text-xs text-primary-500 hover:text-primary-600
            `}
          >
            Create your first skin
          </button>
        </div>
      )}
    </div>
  );
};

