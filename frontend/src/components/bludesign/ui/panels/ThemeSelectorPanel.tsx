/**
 * Theme Selector Panel
 * 
 * UI for selecting and managing scene themes.
 * Themes are bundles of skins that apply to all assets in the scene.
 */

import React, { useCallback, useMemo } from 'react';
import {
  SwatchIcon,
  PlusIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { Theme, getThemeManager } from '../../core/ThemeManager';
import { getSkinRegistry } from '../../core/SkinRegistry';

interface ThemeSelectorPanelProps {
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onCreateTheme: () => void;
}

export const ThemeSelectorPanel: React.FC<ThemeSelectorPanelProps> = ({
  activeThemeId,
  onSelectTheme,
  onCreateTheme,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const themeManager = getThemeManager();
  const skinRegistry = getSkinRegistry();
  
  // Use the new skin-based themes
  const themes = useMemo(() => themeManager.getAllSkinThemes(), []);
  const builtinThemes = useMemo(() => themes.filter(t => t.isBuiltin), [themes]);
  const customThemes = useMemo(() => themes.filter(t => !t.isBuiltin), [themes]);
  
  // Get skin colors for a theme preview
  const getThemeSkinColors = useCallback((theme: Theme): string[] => {
    const colors: string[] = [];
    Object.values(theme.categorySkins).forEach(skinId => {
      if (skinId) {
        const skin = skinRegistry.getSkin(skinId);
        if (skin) {
          const firstMat = Object.values(skin.partMaterials)[0];
          if (firstMat) colors.push(firstMat.color);
        }
      }
    });
    // Add environment colors
    if (theme.environment?.grass) colors.push(theme.environment.grass.color);
    return colors.slice(0, 4); // Only show 4 colors max
  }, [skinRegistry]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SwatchIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Scene Theme
          </span>
        </div>
        <button
          onClick={onCreateTheme}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-primary-600 hover:bg-primary-500 text-white"
          title="Open theme editor in Assets page"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Manage Themes</span>
        </button>
      </div>

      {/* Built-in themes */}
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Built-in Themes
        </div>
        <div className="space-y-1">
          {builtinThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              colors={getThemeSkinColors(theme)}
              isActive={activeThemeId === theme.id}
              isDark={isDark}
              onSelect={() => onSelectTheme(theme.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom themes */}
      {customThemes.length > 0 && (
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Custom Themes
          </div>
          <div className="space-y-1">
            {customThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                colors={getThemeSkinColors(theme)}
                isActive={activeThemeId === theme.id}
                isDark={isDark}
                onSelect={() => onSelectTheme(theme.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state for custom themes */}
      {customThemes.length === 0 && (
        <div className={`
          text-center py-4 rounded-lg border-2 border-dashed
          ${isDark ? 'border-gray-700' : 'border-gray-300'}
        `}>
          <SwatchIcon className={`mx-auto h-8 w-8 ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-2`} />
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            No custom themes yet
          </p>
          <button
            onClick={onCreateTheme}
            className="mt-2 text-xs text-primary-500 hover:text-primary-600"
          >
            Create your first theme
          </button>
        </div>
      )}

      {/* Info */}
      <div className={`text-xs p-2 rounded ${isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
        <p>Themes are bundles of skins that apply to all assets. Edit skins in the Skins tab.</p>
      </div>
    </div>
  );
};

/** Theme preview card */
interface ThemeCardProps {
  theme: Theme;
  colors: string[];
  isActive: boolean;
  isDark: boolean;
  onSelect: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  colors,
  isActive,
  isDark,
  onSelect,
}) => {
  // Get skin count from theme
  const skinCount = Object.values(theme.categorySkins).filter(Boolean).length;
  
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all
        ${isActive
          ? 'bg-primary-600 text-white ring-2 ring-primary-400'
          : isDark 
            ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }
      `}
    >
      {/* Color preview from skins */}
      <div className={`
        w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5
        ${isActive ? 'bg-white/20' : isDark ? 'bg-gray-900' : 'bg-white'}
      `}>
        {colors.map((color, i) => (
          <div key={i} className="rounded-sm" style={{ backgroundColor: color }} />
        ))}
        {/* Fill remaining slots with placeholder */}
        {[...Array(4 - colors.length)].map((_, i) => (
          <div key={`empty-${i}`} className={`rounded-sm ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        ))}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate flex items-center gap-1">
          {theme.name}
          {isActive && <CheckIcon className="w-3.5 h-3.5" />}
        </div>
        <div className={`text-xs truncate ${isActive ? 'text-white/70' : 'opacity-60'}`}>
          {skinCount} skin{skinCount !== 1 ? 's' : ''} · {theme.buildingSkin}
        </div>
      </div>
    </div>
  );
};

