/**
 * Theme Management Panel
 * 
 * Full theme management interface for the asset editor.
 * Allows viewing, creating, editing, and deleting themes.
 * Themes are bundles of skins for each asset category.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  SwatchIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { Theme, getThemeManager } from '../../core/ThemeManager';
import { getSkinRegistry } from '../../core/SkinRegistry';
import { ThemeEditorDialog } from '../dialogs/ThemeEditorDialog';
import { BuildingSkinType } from '../../core/types';

export const ThemeManagementPanel: React.FC = () => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const themeManager = getThemeManager();
  const skinRegistry = getSkinRegistry();
  
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [baseThemeId, setBaseThemeId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load themes
  const refreshThemes = useCallback(() => {
    setThemes(themeManager.getAllSkinThemes());
  }, [themeManager]);
  
  useEffect(() => {
    refreshThemes();
    
    // Listen for storage changes (when themes are saved/updated)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.includes('bludesign-custom-themes') || e.key?.includes('bludesign-skin-themes')) {
        refreshThemes();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Also poll for changes (in case same-window updates)
    const interval = setInterval(refreshThemes, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [refreshThemes]);
  
  const builtinThemes = useMemo(() => themes.filter(t => t.isBuiltin), [themes]);
  const customThemes = useMemo(() => themes.filter(t => !t.isBuiltin), [themes]);
  
  const handleCreateTheme = useCallback(() => {
    setEditingThemeId(null);
    setBaseThemeId(undefined);
    setThemeEditorOpen(true);
  }, []);
  
  const handleEditTheme = useCallback((themeId: string) => {
    setEditingThemeId(themeId);
    setBaseThemeId(undefined);
    setThemeEditorOpen(true);
  }, []);
  
  const handleDuplicateTheme = useCallback((themeId: string) => {
    setEditingThemeId(null);
    setBaseThemeId(themeId);
    setThemeEditorOpen(true);
  }, []);
  
  const handleDeleteTheme = useCallback((themeId: string) => {
    if (confirm('Delete this custom theme? This cannot be undone.')) {
      themeManager.deleteSkinTheme(themeId);
      refreshThemes();
      if (selectedTheme?.id === themeId) {
        setSelectedTheme(null);
      }
    }
  }, [themeManager, selectedTheme, refreshThemes]);
  
  const handleSaveTheme = useCallback((theme: Theme) => {
    if (editingThemeId) {
      themeManager.updateSkinTheme(editingThemeId, theme);
    } else {
      // Create new theme based on provided data
      const newTheme = themeManager.createSkinTheme(theme.name, baseThemeId);
      // Update with all the skin selections
      themeManager.updateSkinTheme(newTheme.id, {
        description: theme.description,
        categorySkins: theme.categorySkins,
        buildingSkin: theme.buildingSkin,
        environment: theme.environment,
      });
    }
    refreshThemes();
    setThemeEditorOpen(false);
    setEditingThemeId(null);
    setBaseThemeId(undefined);
  }, [editingThemeId, baseThemeId, themeManager, refreshThemes]);
  
  // Get skin colors for preview
  const getThemePreviewColors = (theme: Theme): string[] => {
    const colors: string[] = [];
    
    // Get colors from assigned skins
    Object.values(theme.categorySkins).forEach(skinId => {
      if (skinId) {
        const skin = skinRegistry.getSkin(skinId);
        if (skin) {
          const bodyMat = skin.partMaterials['body'];
          const firstMat = Object.values(skin.partMaterials)[0];
          colors.push(bodyMat?.color || firstMat?.color || '#888');
        }
      }
    });
    
    // Add building color based on building skin type
    const buildingColors: Record<BuildingSkinType, string> = {
      [BuildingSkinType.DEFAULT]: '#e8e4dc',
      [BuildingSkinType.BRICK]: '#a85032',
      [BuildingSkinType.GLASS]: '#a8d8f0',
      [BuildingSkinType.CONCRETE]: '#909090',
      [BuildingSkinType.METAL]: '#7a8a9a',
    };
    colors.unshift(buildingColors[theme.buildingSkin]);
    
    return colors.slice(0, 4);
  };
  
  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`p-6 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <SwatchIcon className="w-6 h-6 text-primary-500" />
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Theme Management
              </h1>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Create and manage skin bundles for your facilities
              </p>
            </div>
          </div>
          <button
            onClick={handleCreateTheme}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
              bg-primary-600 hover:bg-primary-500 text-white
            `}
          >
            <PlusIcon className="w-5 h-5" />
            <span>New Theme</span>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className={`
            absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5
            ${isDark ? 'text-gray-500' : 'text-gray-400'}
          `} />
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`
              w-full pl-10 pr-4 py-2 rounded-lg border
              ${isDark 
                ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }
              focus:outline-none focus:ring-2 focus:ring-primary-500
            `}
          />
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Built-in Themes */}
        <div className="mb-8">
          <div className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Built-in Themes
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtinThemes.filter(t => 
              !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
            ).map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                previewColors={getThemePreviewColors(theme)}
                isSelected={selectedTheme?.id === theme.id}
                isDark={isDark}
                onSelect={() => setSelectedTheme(theme)}
                onDuplicate={() => handleDuplicateTheme(theme.id)}
                isBuiltin={true}
              />
            ))}
          </div>
        </div>
        
        {/* Custom Themes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Custom Themes ({customThemes.length})
            </div>
          </div>
          {customThemes.filter(t => 
            !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
          ).length === 0 ? (
            <div className={`
              text-center py-12 rounded-lg border-2 border-dashed
              ${isDark ? 'border-gray-800 bg-gray-800/30' : 'border-gray-300 bg-white'}
            `}>
              <SwatchIcon className={`mx-auto h-12 w-12 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-3`} />
              <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No custom themes yet
              </p>
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Create your first theme to bundle skins together
              </p>
              <button
                onClick={handleCreateTheme}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
              >
                Create Theme
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customThemes.filter(t => 
                !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(theme => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  previewColors={getThemePreviewColors(theme)}
                  isSelected={selectedTheme?.id === theme.id}
                  isDark={isDark}
                  onSelect={() => setSelectedTheme(theme)}
                  onEdit={() => handleEditTheme(theme.id)}
                  onDelete={() => handleDeleteTheme(theme.id)}
                  onDuplicate={() => handleDuplicateTheme(theme.id)}
                  isBuiltin={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Theme Editor Dialog */}
      <ThemeEditorDialog
        open={themeEditorOpen}
        editingThemeId={editingThemeId}
        baseThemeId={baseThemeId}
        onClose={() => {
          setThemeEditorOpen(false);
          setEditingThemeId(null);
          setBaseThemeId(undefined);
        }}
        onSave={handleSaveTheme}
      />
    </div>
  );
};

/** Theme card component */
interface ThemeCardProps {
  theme: Theme;
  previewColors: string[];
  isSelected: boolean;
  isDark: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate: () => void;
  isBuiltin: boolean;
}

const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  previewColors,
  isSelected,
  isDark,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  isBuiltin,
}) => {
  // Count assigned skins
  const assignedSkinCount = Object.values(theme.categorySkins).filter(Boolean).length;
  
  return (
    <div
      onClick={onSelect}
      className={`
        group relative p-4 rounded-lg cursor-pointer transition-all
        ${isSelected
          ? 'ring-2 ring-primary-500 bg-primary-500/10'
          : isDark 
            ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700' 
            : 'bg-white hover:bg-gray-50 border border-gray-200'
        }
      `}
    >
      {/* Color preview */}
      <div className={`
        w-full h-20 rounded-lg overflow-hidden mb-3 grid grid-cols-4 gap-1 p-1
        ${isDark ? 'bg-gray-900' : 'bg-gray-100'}
      `}>
        {previewColors.map((color, i) => (
          <div key={i} className="rounded" style={{ backgroundColor: color }} />
        ))}
      </div>
      
      {/* Info */}
      <div className="mb-3">
        <h3 className={`font-semibold text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {theme.name}
          {isBuiltin && (
            <span className={`ml-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              (Built-in)
            </span>
          )}
        </h3>
        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {theme.description}
        </p>
        
        {/* Stats */}
        <div className={`flex items-center gap-3 mt-2 text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <div className="flex items-center gap-1">
            <PaintBrushIcon className="w-3 h-3" />
            <span>{theme.buildingSkin}</span>
          </div>
          <div className="flex items-center gap-1">
            <SwatchIcon className="w-3 h-3" />
            <span>{assignedSkinCount} skins</span>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className={`p-1.5 rounded transition-colors ${
            isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
          }`}
          title="Duplicate theme"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
        </button>
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className={`p-1.5 rounded transition-colors ${
              isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
            }`}
            title="Edit theme"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className={`p-1.5 rounded transition-colors hover:bg-red-500/30 text-red-400`}
            title="Delete theme"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
