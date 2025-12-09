/**
 * Theme Editor Dialog
 * 
 * Dialog for creating and editing themes as bundles of skins.
 * Themes are collections of skin selections per category - no color pickers.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  XMarkIcon,
  SwatchIcon,
  CheckIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeManager, Theme } from '../../core/ThemeManager';
import { getSkinRegistry, CategorySkin, SkinRegistryClass } from '../../core/SkinRegistry';
import { AssetCategory, BuildingSkinType } from '../../core/types';

interface ThemeEditorDialogProps {
  open: boolean;
  editingThemeId?: string | null; // null = creating new
  baseThemeId?: string; // For creating new based on existing
  onClose: () => void;
  onSave: (theme: Theme) => void;
}

// Categories that can have skins assigned
const SKINNABLE_CATEGORIES: { category: AssetCategory; label: string }[] = [
  { category: AssetCategory.STORAGE_UNIT, label: 'Storage Units' },
  { category: AssetCategory.GATE, label: 'Gates' },
  { category: AssetCategory.DOOR, label: 'Doors' },
  { category: AssetCategory.FENCE, label: 'Fences' },
  { category: AssetCategory.ELEVATOR, label: 'Elevators' },
  { category: AssetCategory.KIOSK, label: 'Kiosks' },
];

// Building skin options
const BUILDING_SKIN_OPTIONS: { id: BuildingSkinType; label: string; description: string }[] = [
  { id: BuildingSkinType.DEFAULT, label: 'Default', description: 'Clean standard walls' },
  { id: BuildingSkinType.BRICK, label: 'Brick', description: 'Classic red brick' },
  { id: BuildingSkinType.GLASS, label: 'Glass', description: 'Transparent glass facade' },
  { id: BuildingSkinType.CONCRETE, label: 'Concrete', description: 'Industrial concrete' },
  { id: BuildingSkinType.METAL, label: 'Metal', description: 'Metal cladding' },
];

export const ThemeEditorDialog: React.FC<ThemeEditorDialogProps> = ({
  open,
  editingThemeId,
  baseThemeId,
  onClose,
  onSave,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const themeManager = getThemeManager();
  const skinRegistry = getSkinRegistry();
  
  const [name, setName] = useState('New Theme');
  const [description, setDescription] = useState('');
  const [categorySkins, setCategorySkins] = useState<Partial<Record<AssetCategory, string>>>({});
  const [buildingSkin, setBuildingSkin] = useState<BuildingSkinType>(BuildingSkinType.DEFAULT);
  
  // Initialize state when dialog opens
  useEffect(() => {
    if (!open) return;
    
    let baseTheme: Theme | undefined;
    
    if (editingThemeId) {
      baseTheme = themeManager.getSkinTheme(editingThemeId);
    } else if (baseThemeId) {
      baseTheme = themeManager.getSkinTheme(baseThemeId);
    } else {
      baseTheme = themeManager.getActiveSkinTheme();
    }
    
    if (baseTheme) {
      setName(editingThemeId ? baseTheme.name : `${baseTheme.name} Copy`);
      setDescription(baseTheme.description);
      setCategorySkins({ ...baseTheme.categorySkins });
      setBuildingSkin(baseTheme.buildingSkin);
    } else {
      // Default values
      setName('New Theme');
      setDescription('');
      setCategorySkins({});
      setBuildingSkin(BuildingSkinType.DEFAULT);
    }
  }, [open, editingThemeId, baseThemeId, themeManager]);
  
  const handleSkinChange = useCallback((category: AssetCategory, skinId: string | null) => {
    setCategorySkins(prev => ({
      ...prev,
      [category]: skinId || undefined,
    }));
  }, []);
  
  const handleSave = useCallback(() => {
    const newTheme: Theme = {
      id: editingThemeId || `theme-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      categorySkins,
      buildingSkin,
      environment: {
        grass: { color: '#3d7a3d', metalness: 0.0, roughness: 0.95 },
        pavement: { color: '#505860', metalness: 0.02, roughness: 0.85 },
        gravel: { color: '#a8957a', metalness: 0.05, roughness: 0.95 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    onSave(newTheme);
  }, [editingThemeId, name, description, categorySkins, buildingSkin, onSave]);
  
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-[100000]"
      onClick={onClose}
    >
      <div 
        className={`
          w-[700px] max-w-[95vw] max-h-[90vh] rounded-xl shadow-2xl border overflow-hidden flex flex-col
          ${isDark 
            ? 'bg-gray-900 text-gray-100 border-gray-700' 
            : 'bg-white text-gray-900 border-gray-200'
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isDark ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <SwatchIcon className="w-5 h-5 text-primary-500" />
            <div>
              <h2 className="text-lg font-semibold">
                {editingThemeId ? 'Edit Theme' : 'Create New Theme'}
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Select skins for each asset category
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Theme Name & Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs block mb-1.5 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Theme Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  isDark 
                    ? 'bg-gray-800 border border-gray-700 text-white' 
                    : 'bg-gray-50 border border-gray-200 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`text-xs block mb-1.5 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  isDark 
                    ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500' 
                    : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
          </div>
          
          {/* Building Skin */}
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <PaintBrushIcon className="w-4 h-4" />
              Building Style
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BUILDING_SKIN_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setBuildingSkin(option.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    buildingSkin === option.id
                      ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30'
                      : isDark
                        ? 'border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-xs font-medium mb-0.5 ${
                    buildingSkin === option.id ? 'text-primary-500' : ''
                  }`}>
                    {option.label}
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Category Skin Selections */}
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <SwatchIcon className="w-4 h-4" />
              Asset Skins
            </div>
            <div className="grid grid-cols-2 gap-4">
              {SKINNABLE_CATEGORIES.map(({ category, label }) => (
                <CategorySkinSelector
                  key={category}
                  category={category}
                  label={label}
                  selectedSkinId={categorySkins[category]}
                  onSelect={(skinId) => handleSkinChange(category, skinId)}
                  skinRegistry={skinRegistry}
                  isDark={isDark}
                />
              ))}
            </div>
          </div>
          
          {/* Preview Section */}
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Preview
            </div>
            <ThemePreview
              categorySkins={categorySkins}
              buildingSkin={buildingSkin}
              skinRegistry={skinRegistry}
              isDark={isDark}
            />
          </div>
        </div>
        
        {/* Footer */}
        <div className={`px-5 py-4 border-t flex items-center justify-end gap-3 ${
          isDark ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDark 
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckIcon className="w-4 h-4" />
            {editingThemeId ? 'Save Changes' : 'Create Theme'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Category skin selector component */
interface CategorySkinSelectorProps {
  category: AssetCategory;
  label: string;
  selectedSkinId: string | undefined;
  onSelect: (skinId: string | null) => void;
  skinRegistry: SkinRegistryClass;
  isDark: boolean;
}

const CategorySkinSelector: React.FC<CategorySkinSelectorProps> = ({
  category,
  label,
  selectedSkinId,
  onSelect,
  skinRegistry,
  isDark,
}) => {
  const availableSkins = skinRegistry.getSkinsForCategory(category);
  const selectedSkin = selectedSkinId ? skinRegistry.getSkin(selectedSkinId) : null;
  
  // Get primary color from skin for preview
  const getPreviewColor = (skin: CategorySkin | null): string => {
    if (!skin) return '#888888';
    const bodyMat = skin.partMaterials['body'];
    const firstMat = Object.values(skin.partMaterials)[0];
    return bodyMat?.color || firstMat?.color || '#888888';
  };

  return (
    <div className={`p-3 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
          {label}
        </span>
        {/* Color preview swatch */}
        <div 
          className="w-5 h-5 rounded border shadow-inner"
          style={{ 
            backgroundColor: getPreviewColor(selectedSkin),
            borderColor: isDark ? '#555' : '#ccc',
          }}
        />
      </div>
      
      <select
        value={selectedSkinId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className={`w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${
          isDark 
            ? 'bg-gray-900 border border-gray-600 text-white' 
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        {availableSkins.map(skin => (
          <option key={skin.id} value={skin.id}>
            {skin.name}{skin.isBuiltin ? '' : ' (custom)'}
          </option>
        ))}
      </select>
      
      {selectedSkin && (
        <div className={`text-[10px] mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {selectedSkin.description || `${selectedSkin.name} skin`}
        </div>
      )}
    </div>
  );
};

/** Theme preview showing all selected skins */
interface ThemePreviewProps {
  categorySkins: Partial<Record<AssetCategory, string>>;
  buildingSkin: BuildingSkinType;
  skinRegistry: SkinRegistryClass;
  isDark: boolean;
}

const ThemePreview: React.FC<ThemePreviewProps> = ({
  categorySkins,
  buildingSkin,
  skinRegistry,
  isDark,
}) => {
  // Get colors for preview
  const getSkinColor = (skinId: string | undefined, fallback: string): string => {
    if (!skinId) return fallback;
    const skin = skinRegistry.getSkin(skinId);
    if (!skin) return fallback;
    const bodyMat = skin.partMaterials['body'];
    const firstMat = Object.values(skin.partMaterials)[0];
    return bodyMat?.color || firstMat?.color || fallback;
  };

  const buildingColors: Record<BuildingSkinType, string> = {
    [BuildingSkinType.DEFAULT]: '#e8e4dc',
    [BuildingSkinType.BRICK]: '#a85032',
    [BuildingSkinType.GLASS]: '#a8d8f0',
    [BuildingSkinType.CONCRETE]: '#909090',
    [BuildingSkinType.METAL]: '#7a8a9a',
  };

  return (
    <div className={`p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-4">
        {/* Building preview */}
        <div className="flex flex-col items-center">
          <div 
            className="w-14 h-20 rounded-t shadow-inner border"
            style={{ 
              backgroundColor: buildingColors[buildingSkin],
              borderColor: isDark ? '#555' : '#ccc',
            }}
          />
          <div className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Building
          </div>
        </div>
        
        {/* Divider */}
        <div className={`w-px h-16 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        
        {/* Asset skin previews */}
        <div className="flex gap-3 flex-wrap">
          {SKINNABLE_CATEGORIES.slice(0, 4).map(({ category, label }) => (
            <div key={category} className="flex flex-col items-center">
              <div 
                className="w-8 h-8 rounded shadow-inner border"
                style={{ 
                  backgroundColor: getSkinColor(categorySkins[category], '#f7f7f7'),
                  borderColor: isDark ? '#555' : '#ccc',
                }}
              />
              <div className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {label.split(' ')[0]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
