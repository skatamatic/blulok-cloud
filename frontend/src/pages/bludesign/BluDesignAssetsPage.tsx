/**
 * BluDesign Assets Page
 * 
 * Catalog and skinning/texture system for branding and editing 3D assets.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PhotoIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  CubeIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetEditor } from '@/components/bludesign/ui/AssetEditor';
import { ThemeManagementPanel } from '@/components/bludesign/ui/panels/ThemeManagementPanel';
import { SkinsManagementPanel } from '@/components/bludesign/ui/panels/SkinsManagementPanel';
import { AssetService, AssetDefinition } from '@/components/bludesign/services/AssetService';
import { AssetRegistry } from '@/components/bludesign/assets/AssetRegistry';
import { AssetFactory } from '@/components/bludesign/assets/AssetFactory';
import { ThumbnailGenerator } from '@/components/bludesign/utils/ThumbnailGenerator';
import { AssetMetadata, AssetCategory } from '@/components/bludesign/core/types';
import { SkinManager } from '@/components/bludesign/core/SkinManager';

// Convert AssetMetadata to AssetDefinition for the editor
const assetMetadataToDefinition = (asset: AssetMetadata): AssetDefinition => ({
  id: asset.id,
  name: asset.name,
  description: asset.description,
  category: asset.category,
  modelType: 'primitive',
  dimensions: asset.dimensions,
  gridUnits: asset.gridUnits,
  isSmart: asset.isSmart,
  canRotate: asset.canRotate,
  canStack: asset.canStack,
  bindingContract: undefined,
  isBuiltin: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

type ViewMode = 'grid' | 'list';
type CategoryFilter = 'all' | AssetCategory;
type TabMode = 'assets' | 'skins' | 'themes';

export default function BluDesignAssetsPage() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Check URL for tab parameter
  const getInitialTab = (): TabMode => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'themes') return 'themes';
      if (tab === 'skins') return 'skins';
    }
    return 'assets';
  };
  
  const [activeTab, setActiveTab] = useState<TabMode>(getInitialTab());
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [customAssets, setCustomAssets] = useState<AssetDefinition[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showSmartOnly, setShowSmartOnly] = useState<boolean | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [skinCounts, setSkinCounts] = useState<Record<string, number>>({});
  const [skinManager] = useState(() => new SkinManager());

  // Load built-in assets from registry
  useEffect(() => {
    const builtInAssets = AssetRegistry.getInstance().getAllAssets();
    setAssets(builtInAssets);
    setIsLoading(false);
    
    // Generate thumbnails
    generateThumbnails(builtInAssets);
    
    // Count skins by category (skins apply to all assets of the same type)
    const counts: Record<string, number> = {};
    const categorySet = new Set(builtInAssets.map(a => a.category));
    categorySet.forEach(category => {
      const skins = skinManager.getSkins(category);
      if (skins.length > 0) {
        // Set count for all assets in this category
        builtInAssets.filter(a => a.category === category).forEach(asset => {
          counts[asset.id] = skins.length;
        });
      }
    });
    setSkinCounts(counts);
  }, [skinManager]);

  // Load custom assets from backend
  useEffect(() => {
    const loadCustomAssets = async () => {
      try {
        const definitions = await AssetService.getAssetDefinitions({ isBuiltin: false });
        setCustomAssets(definitions);
      } catch (error) {
        console.error('Failed to load custom assets:', error);
      }
    };
    
    loadCustomAssets();
  }, []);

  const generateThumbnails = useCallback(async (assetList: AssetMetadata[]) => {
    const generator = new ThumbnailGenerator();
    const newThumbnails: Record<string, string> = {};
    
    for (const asset of assetList) {
      try {
        newThumbnails[asset.id] = await generator.generate(asset);
      } catch (error) {
        console.error(`Failed to generate thumbnail for ${asset.id}:`, error);
      }
    }
    
    setThumbnails(newThumbnails);
    generator.dispose();
  }, []);

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || asset.category === categoryFilter;
    const matchesSmart = showSmartOnly === null || asset.isSmart === showSmartOnly;
    
    return matchesSearch && matchesCategory && matchesSmart;
  });

  // Get unique categories from assets
  const categories = Array.from(new Set(assets.map(a => a.category)));

  const handleAssetClick = useCallback((asset: AssetMetadata) => {
    setSelectedAsset(assetMetadataToDefinition(asset));
  }, []);

  const handleCloseEditor = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  const handleAssetUpdate = useCallback((updated: AssetDefinition) => {
    // For now, just log - in full implementation would save to backend
    console.log('Asset updated:', updated);
  }, []);

  const getCategoryLabel = (category: string): string => {
    return category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <PhotoIcon className={`h-8 w-8 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
              <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                BluDesign - Assets
              </h1>
            </div>
            <button
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                bg-primary-600 hover:bg-primary-700 text-white
              `}
            >
              <PlusIcon className="w-5 h-5" />
              <span>New Asset</span>
            </button>
          </div>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Catalog and skinning system for branding and editing 3D assets
          </p>
        </div>

        {/* Tabs */}
        <div className={`mb-6 flex gap-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            onClick={() => setActiveTab('assets')}
            className={`
              px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === 'assets'
                ? 'border-primary-500 text-primary-500'
                : isDark ? 'border-transparent text-gray-400 hover:text-gray-300' : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            Assets
          </button>
          <button
            onClick={() => setActiveTab('skins')}
            className={`
              px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === 'skins'
                ? 'border-primary-500 text-primary-500'
                : isDark ? 'border-transparent text-gray-400 hover:text-gray-300' : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            Skins
          </button>
          <button
            onClick={() => setActiveTab('themes')}
            className={`
              px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === 'themes'
                ? 'border-primary-500 text-primary-500'
                : isDark ? 'border-transparent text-gray-400 hover:text-gray-300' : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            Themes
          </button>
        </div>

        {/* Skins View */}
        {activeTab === 'skins' && (
          <div className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`} style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
            <SkinsManagementPanel />
          </div>
        )}

        {/* Themes View */}
        {activeTab === 'themes' && (
          <div className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`} style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
            <ThemeManagementPanel />
          </div>
        )}

        {/* Assets View */}
        {activeTab === 'assets' && (
          <>
        {/* Toolbar */}
        <div className={`
          flex items-center justify-between gap-4 p-4 mb-6 rounded-lg
          ${isDark ? 'bg-gray-800' : 'bg-white'} 
          shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}
        `}>
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className={`
              absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5
              ${isDark ? 'text-gray-500' : 'text-gray-400'}
            `} />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`
                w-full pl-10 pr-4 py-2 rounded-lg border
                ${isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'
                }
                focus:outline-none focus:ring-2 focus:ring-primary-500
              `}
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className={`
                px-3 py-2 rounded-lg border
                ${isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-900'
                }
              `}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
              ))}
            </select>

            {/* Smart filter */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => setShowSmartOnly(null)}
                className={`
                  px-3 py-2 text-sm transition-colors
                  ${showSmartOnly === null
                    ? 'bg-primary-600 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700'
                  }
                `}
              >
                All
              </button>
              <button
                onClick={() => setShowSmartOnly(true)}
                className={`
                  px-3 py-2 text-sm transition-colors border-l border-gray-300 dark:border-gray-600
                  ${showSmartOnly === true
                    ? 'bg-primary-600 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700'
                  }
                `}
              >
                Smart
              </button>
              <button
                onClick={() => setShowSmartOnly(false)}
                className={`
                  px-3 py-2 text-sm transition-colors border-l border-gray-300 dark:border-gray-600
                  ${showSmartOnly === false
                    ? 'bg-primary-600 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700'
                  }
                `}
              >
                Visual
              </button>
            </div>

            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                onClick={() => setViewMode('grid')}
                className={`
                  p-2 transition-colors
                  ${viewMode === 'grid'
                    ? 'bg-primary-600 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700'
                  }
                `}
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`
                  p-2 transition-colors border-l border-gray-300 dark:border-gray-600
                  ${viewMode === 'list'
                    ? 'bg-primary-600 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-700'
                  }
                `}
              >
                <ListBulletIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Asset count */}
        <div className={`mb-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Showing {filteredAssets.length} of {assets.length} assets
        </div>

        {/* Asset Grid/List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <ArrowPathIcon className={`w-8 h-8 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAssets.map((asset) => (
              <motion.button
                key={asset.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => handleAssetClick(asset)}
                className={`
                  p-4 rounded-lg transition-all text-left
                  ${isDark 
                    ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700' 
                    : 'bg-white hover:bg-gray-50 border border-gray-200'
                  }
                  ${selectedAsset?.id === asset.id ? 'ring-2 ring-primary-500' : ''}
                `}
              >
                {/* Thumbnail */}
                <div className={`
                  aspect-square rounded-lg mb-3 flex items-center justify-center
                  ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
                `}>
                  {thumbnails[asset.id] ? (
                    <img 
                      src={thumbnails[asset.id]} 
                      alt={asset.name}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <CubeIcon className={`w-12 h-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                  )}
                </div>
                
                {/* Info */}
                <h3 className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {asset.name}
                </h3>
                <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {getCategoryLabel(asset.category)}
                </p>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {asset.isSmart && (
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary-600/20 text-primary-400">
                      Smart
                    </span>
                  )}
                  {skinCounts[asset.id] > 0 && (
                    <span className={`
                      inline-block px-2 py-0.5 text-xs rounded-full
                      ${isDark ? 'bg-purple-600/20 text-purple-400' : 'bg-purple-100 text-purple-600'}
                    `}>
                      {skinCounts[asset.id]} skin{skinCounts[asset.id] !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAssets.map((asset) => (
              <motion.button
                key={asset.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => handleAssetClick(asset)}
                className={`
                  w-full p-4 rounded-lg transition-all text-left flex items-center gap-4
                  ${isDark 
                    ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700' 
                    : 'bg-white hover:bg-gray-50 border border-gray-200'
                  }
                  ${selectedAsset?.id === asset.id ? 'ring-2 ring-primary-500' : ''}
                `}
              >
                {/* Thumbnail */}
                <div className={`
                  w-16 h-16 rounded-lg flex-shrink-0 flex items-center justify-center
                  ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
                `}>
                  {thumbnails[asset.id] ? (
                    <img 
                      src={thumbnails[asset.id]} 
                      alt={asset.name}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  ) : (
                    <CubeIcon className={`w-8 h-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {asset.name}
                  </h3>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {asset.description || getCategoryLabel(asset.category)}
                  </p>
                </div>
                
                {/* Tags */}
                <div className="flex items-center gap-2">
                  <span className={`
                    px-2 py-1 text-xs rounded
                    ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}
                  `}>
                    {getCategoryLabel(asset.category)}
                  </span>
                  {asset.isSmart && (
                    <span className="px-2 py-1 text-xs rounded bg-primary-600/20 text-primary-400">
                      Smart
                    </span>
                  )}
                  {skinCounts[asset.id] > 0 && (
                    <span className={`
                      px-2 py-1 text-xs rounded
                      ${isDark ? 'bg-purple-600/20 text-purple-400' : 'bg-purple-100 text-purple-600'}
                    `}>
                      {skinCounts[asset.id]} skin{skinCounts[asset.id] !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredAssets.length === 0 && !isLoading && (
          <div className={`
            text-center py-20 rounded-lg border-2 border-dashed
            ${isDark ? 'border-gray-700' : 'border-gray-300'}
          `}>
            <CubeIcon className={`mx-auto h-12 w-12 ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-4`} />
            <h3 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
              No assets found
            </h3>
            <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Try adjusting your search or filters
            </p>
          </div>
        )}
          </>
        )}
      </div>

      {/* Asset Editor Modal */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseEditor();
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-auto"
            >
              <AssetEditor
                asset={selectedAsset}
                onUpdate={handleAssetUpdate}
                onClose={handleCloseEditor}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
