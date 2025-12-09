/**
 * Asset Browser Panel
 * 
 * Browse and select assets for placement.
 * Renders as embedded content - wrap with FloatingPanel for standalone use.
 * No internal scrolling - the parent FloatingPanel handles overflow.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CubeIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  BuildingStorefrontIcon,
  Square3Stack3DIcon,
  BoltIcon,
  BuildingOfficeIcon,
  WindowIcon,
  Bars3Icon,
  SparklesIcon, // For decorations
} from '@heroicons/react/24/outline';
import { AssetCategory, AssetMetadata } from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ThumbnailGenerator } from '../../utils/ThumbnailGenerator';

// Fixed asset card size in pixels
export const ASSET_CARD_SIZE = 96;
export const ASSET_GRID_GAP = 8;

type FilterMode = 'all' | 'smart' | 'non-smart' | AssetCategory;

interface AssetBrowserPanelProps {
  assets: AssetMetadata[];
  activeAssetId: string | null;
  onSelectAsset: (assetId: string | null) => void;
  columns?: number;
}

export const AssetBrowserPanel: React.FC<AssetBrowserPanelProps> = ({
  assets,
  activeAssetId,
  onSelectAsset,
  columns = 4,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterMode>('all');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const generatorRef = useRef<ThumbnailGenerator | null>(null);

  // Generate thumbnails for all assets
  useEffect(() => {
    if (!generatorRef.current) {
      generatorRef.current = new ThumbnailGenerator();
    }

    const generateAll = async () => {
      if (!generatorRef.current) return;
      
      const generated: Record<string, string> = {};
      
      for (const asset of assets) {
        try {
          generated[asset.id] = await generatorRef.current.generate(asset);
        } catch (error) {
          console.error('Thumbnail generation failed:', asset.id, error);
        }
      }
      
      setThumbnails(generated);
    };

    generateAll();

    return () => {
      // Cleanup on unmount
      if (generatorRef.current) {
        generatorRef.current.dispose();
      }
    };
  }, [assets]);

  // Filter assets
  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFilter = true;
    if (selectedFilter === 'smart') {
      matchesFilter = asset.isSmart;
    } else if (selectedFilter === 'non-smart') {
      matchesFilter = !asset.isSmart;
    } else if (selectedFilter !== 'all') {
      matchesFilter = asset.category === selectedFilter;
    }
    
    return matchesSearch && matchesFilter;
  });

  // Define display groups that combine related categories
  type DisplayGroup = 'ground' | 'barriers' | AssetCategory;
  
  const groundCategories: AssetCategory[] = [
    AssetCategory.GRASS,
    AssetCategory.PAVEMENT,
    AssetCategory.GRAVEL,
    AssetCategory.FLOOR,
  ];
  
  const barrierCategories: AssetCategory[] = [
    AssetCategory.WALL,
    AssetCategory.FENCE,
  ];
  
  const getDisplayGroup = (category: AssetCategory): DisplayGroup => {
    if (groundCategories.includes(category)) return 'ground';
    if (barrierCategories.includes(category)) return 'barriers';
    return category;
  };
  
  // Group assets by display category (only if not in smart/non-smart mode)
  const shouldGroup = selectedFilter !== 'smart' && selectedFilter !== 'non-smart';
  
  const groupedAssets = shouldGroup 
    ? filteredAssets.reduce((groups, asset) => {
        const displayGroup = getDisplayGroup(asset.category);
        if (!groups[displayGroup]) {
          groups[displayGroup] = [];
        }
        groups[displayGroup].push(asset);
        return groups;
      }, {} as Record<DisplayGroup, AssetMetadata[]>)
    : { 'all': filteredAssets };

  const displayGroupIcons: Record<DisplayGroup, React.FC<{ className?: string }>> = {
    ground: CubeIcon,
    barriers: BuildingStorefrontIcon,
    [AssetCategory.STORAGE_UNIT]: LockClosedIcon,
    [AssetCategory.GATE]: BoltIcon,
    [AssetCategory.ELEVATOR]: Square3Stack3DIcon,
    [AssetCategory.ACCESS_CONTROL]: LockClosedIcon,
    [AssetCategory.BUILDING]: BuildingOfficeIcon,
    [AssetCategory.WALL]: BuildingStorefrontIcon,
    [AssetCategory.INTERIOR_WALL]: Bars3Icon,
    [AssetCategory.FLOOR]: CubeIcon,
    [AssetCategory.CEILING]: CubeIcon,
    [AssetCategory.STAIRWELL]: Square3Stack3DIcon,
    [AssetCategory.DOOR]: CubeIcon,
    [AssetCategory.WINDOW]: WindowIcon,
    [AssetCategory.PAVEMENT]: CubeIcon,
    [AssetCategory.GRASS]: CubeIcon,
    [AssetCategory.GRAVEL]: CubeIcon,
    [AssetCategory.FENCE]: CubeIcon,
    [AssetCategory.DECORATION]: SparklesIcon,
    [AssetCategory.MARKER]: CubeIcon,
    [AssetCategory.LABEL]: CubeIcon,
  };

  const displayGroupLabels: Record<DisplayGroup, string> = {
    ground: 'Ground Tiles',
    barriers: 'Walls & Fences',
    [AssetCategory.STORAGE_UNIT]: 'Storage Units',
    [AssetCategory.GATE]: 'Gates',
    [AssetCategory.ELEVATOR]: 'Elevators',
    [AssetCategory.ACCESS_CONTROL]: 'Access Control',
    [AssetCategory.BUILDING]: 'Buildings',
    [AssetCategory.WALL]: 'Walls',
    [AssetCategory.INTERIOR_WALL]: 'Interior Walls',
    [AssetCategory.FLOOR]: 'Floors',
    [AssetCategory.CEILING]: 'Ceilings',
    [AssetCategory.STAIRWELL]: 'Stairwells',
    [AssetCategory.DOOR]: 'Doors',
    [AssetCategory.WINDOW]: 'Windows',
    [AssetCategory.PAVEMENT]: 'Pavement',
    [AssetCategory.GRASS]: 'Grass',
    [AssetCategory.GRAVEL]: 'Gravel',
    [AssetCategory.FENCE]: 'Fences',
    [AssetCategory.DECORATION]: 'Decorations',
    [AssetCategory.MARKER]: 'Markers',
    [AssetCategory.LABEL]: 'Labels',
  };
  
  // Define the order for display groups
  const displayGroupOrder: DisplayGroup[] = [
    AssetCategory.BUILDING,
    AssetCategory.STORAGE_UNIT,
    'ground',
    'barriers',
    AssetCategory.INTERIOR_WALL,
    AssetCategory.GATE,
    AssetCategory.ELEVATOR,
    AssetCategory.STAIRWELL,
    AssetCategory.ACCESS_CONTROL,
    AssetCategory.DOOR,
    AssetCategory.WINDOW,
    AssetCategory.CEILING,
    AssetCategory.DECORATION,
    AssetCategory.MARKER,
    AssetCategory.LABEL,
  ];

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
        <input
          type="text"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full pl-8 pr-3 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 ${
            isDark 
              ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500' 
              : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
          }`}
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1">
        <button
          className={`px-2 py-1 text-xs rounded transition-colors ${
            selectedFilter === 'all'
              ? 'bg-primary-600 text-white'
              : isDark 
                ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50' 
                : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300/80'
          }`}
          onClick={() => setSelectedFilter('all')}
        >
          All
        </button>
        <button
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            selectedFilter === 'smart'
              ? 'bg-primary-600 text-white'
              : isDark 
                ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50' 
                : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300/80'
          }`}
          onClick={() => setSelectedFilter('smart')}
        >
          <BoltIcon className="w-3 h-3" />
          Smart
        </button>
        <button
          className={`px-2 py-1 text-xs rounded transition-colors ${
            selectedFilter === 'non-smart'
              ? 'bg-primary-600 text-white'
              : isDark 
                ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50' 
                : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300/80'
          }`}
          onClick={() => setSelectedFilter('non-smart')}
        >
          Visual
        </button>
        <button
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            selectedFilter === AssetCategory.STORAGE_UNIT
              ? 'bg-primary-600 text-white'
              : isDark 
                ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50' 
                : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300/80'
          }`}
          onClick={() => setSelectedFilter(AssetCategory.STORAGE_UNIT)}
        >
          <LockClosedIcon className="w-3 h-3" />
          Units
        </button>
        <button
          className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
            selectedFilter === AssetCategory.GATE
              ? 'bg-primary-600 text-white'
              : isDark 
                ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50' 
                : 'bg-gray-200/80 text-gray-600 hover:bg-gray-300/80'
          }`}
          onClick={() => setSelectedFilter(AssetCategory.GATE)}
        >
          <BoltIcon className="w-3 h-3" />
          Gates
        </button>
      </div>

      {/* Asset count */}
      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}
      </div>

      {/* Asset List */}
      <div className="space-y-4">
        {shouldGroup ? (
          /* Sort groups by display order when grouping */
          displayGroupOrder
            .filter(group => groupedAssets[group] && groupedAssets[group].length > 0)
            .map((group) => {
              const groupAssets = groupedAssets[group];
              if (!groupAssets || groupAssets.length === 0) return null;
              
              return (
                <div key={group}>
                  <div className={`flex items-center gap-1 text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {React.createElement(displayGroupIcons[group], { className: 'w-3 h-3' })}
                    <span>{displayGroupLabels[group]}</span>
                  </div>
                  <div 
                    className="grid"
                    style={{ 
                      gridTemplateColumns: `repeat(${columns}, ${ASSET_CARD_SIZE}px)`,
                      gap: `${ASSET_GRID_GAP}px`,
                    }}
                  >
                    {groupAssets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        isActive={activeAssetId === asset.id}
                        onClick={() => onSelectAsset(activeAssetId === asset.id ? null : asset.id)}
                        isDark={isDark}
                        thumbnail={thumbnails[asset.id]}
                      />
                    ))}
                  </div>
                </div>
              );
            })
        ) : (
          /* Show all assets in a single grid when not grouping */
          <div 
            className="grid"
            style={{ 
              gridTemplateColumns: `repeat(${columns}, ${ASSET_CARD_SIZE}px)`,
              gap: `${ASSET_GRID_GAP}px`,
            }}
          >
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isActive={activeAssetId === asset.id}
                onClick={() => onSelectAsset(activeAssetId === asset.id ? null : asset.id)}
                isDark={isDark}
                thumbnail={thumbnails[asset.id]}
              />
            ))}
          </div>
        )}
        
        {filteredAssets.length === 0 && (
          <div className={`text-center py-6 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            No assets found
          </div>
        )}
      </div>
    </div>
  );
};

// Asset Card Component - fixed size with visible labels
interface AssetCardProps {
  asset: AssetMetadata;
  isActive: boolean;
  onClick: () => void;
  isDark: boolean;
  thumbnail?: string;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, isActive, onClick, isDark, thumbnail }) => {
  return (
    <button
      className={`
        p-2 rounded-lg text-left transition-all flex flex-col
        ${isActive
          ? 'bg-primary-600 ring-2 ring-primary-400'
          : isDark 
            ? 'bg-gray-800/60 hover:bg-gray-700/60' 
            : 'bg-gray-100/80 hover:bg-gray-200/80'
        }
      `}
      style={{ 
        width: ASSET_CARD_SIZE,
        height: ASSET_CARD_SIZE + 12,
      }}
      onClick={onClick}
      title={asset.name} // Full name on hover
    >
      {/* Thumbnail placeholder */}
      <div 
        className={`
          w-full rounded-md flex items-center justify-center flex-shrink-0
          ${isActive 
            ? 'bg-primary-700' 
            : isDark ? 'bg-gray-700/50' : 'bg-gray-200/80'
          }
        `}
        style={{ height: ASSET_CARD_SIZE - 40 }} // Leave room for text below
      >
        {thumbnail ? (
          <img src={thumbnail} alt={asset.name} className="w-full h-full object-cover rounded-md" />
        ) : (
          <CubeIcon className={`w-8 h-8 ${
            isActive 
              ? 'text-primary-300' 
              : isDark ? 'text-gray-500' : 'text-gray-400'
          }`} />
        )}
      </div>
      
      {/* Footer with name and indicators */}
      <div className="flex-1 min-h-0 flex flex-col justify-center mt-1">
        {/* Name - truncated with ellipsis */}
        <div 
          className={`text-xs font-medium leading-tight mb-1 ${
            isActive 
              ? 'text-white' 
              : isDark ? 'text-gray-300' : 'text-gray-700'
          }`}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.3',
          }}
        >
          {asset.name}
        </div>
        
        {/* Size + Smart indicator row */}
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[10px] leading-none ${isActive ? 'text-primary-200' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {asset.gridUnits.x}×{asset.gridUnits.z}
          </span>
          {asset.isSmart && (
            <BoltIcon className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-yellow-300' : 'text-yellow-500'}`} />
          )}
        </div>
      </div>
    </button>
  );
};
