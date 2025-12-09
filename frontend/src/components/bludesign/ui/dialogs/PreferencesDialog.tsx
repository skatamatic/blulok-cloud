/**
 * Preferences Dialog
 * 
 * User preferences configuration for the BluDesign editor.
 * Settings are saved to localStorage only.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  XMarkIcon,
  Cog6ToothIcon,
  EyeIcon,
  Square3Stack3DIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import {
  EditorPreferences,
  loadPreferences,
  savePreferences,
  resetPreferences,
  getDefaultPreferences,
} from '../../core/Preferences';

interface PreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPreferencesChange?: (prefs: EditorPreferences) => void;
}

export const PreferencesDialog: React.FC<PreferencesDialogProps> = ({
  isOpen,
  onClose,
  onPreferencesChange,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [prefs, setPrefs] = useState<EditorPreferences>(loadPreferences);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'ghosting' | 'grid' | 'performance'>('ghosting');
  
  // Load prefs when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPrefs(loadPreferences());
      setHasChanges(false);
    }
  }, [isOpen]);
  
  const handleChange = useCallback(<K extends keyof EditorPreferences>(
    category: K,
    key: keyof EditorPreferences[K],
    value: number | boolean
  ) => {
    setPrefs(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
    setHasChanges(true);
  }, []);
  
  const handleSave = useCallback(() => {
    savePreferences(prefs);
    setHasChanges(false);
    onPreferencesChange?.(prefs);
    onClose();
  }, [prefs, onPreferencesChange, onClose]);
  
  const handleReset = useCallback(() => {
    if (window.confirm('Reset all preferences to defaults?')) {
      const defaults = resetPreferences();
      setPrefs(defaults);
      setHasChanges(true);
      onPreferencesChange?.(defaults);
    }
  }, [onPreferencesChange]);
  
  const handleApply = useCallback(() => {
    savePreferences(prefs);
    setHasChanges(false);
    onPreferencesChange?.(prefs);
  }, [prefs, onPreferencesChange]);
  
  if (!isOpen) return null;
  
  const defaults = getDefaultPreferences();

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`
        w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden
        ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
      `}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center gap-3">
            <Cog6ToothIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Preferences
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          {[
            { id: 'ghosting', label: 'Floor Ghosting', icon: Square3Stack3DIcon },
            { id: 'grid', label: 'Grid', icon: EyeIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
                ${activeTab === tab.id
                  ? isDark
                    ? 'text-primary-400 border-primary-500 bg-gray-700/30'
                    : 'text-primary-600 border-primary-500 bg-primary-50/50'
                  : isDark
                    ? 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-700/20'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          {activeTab === 'ghosting' && (
            <div className="space-y-6">
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Configure how floors are displayed when in floor editing mode.
              </div>
              
              {/* Floors Above */}
              <SliderSetting
                label="Floors Above Opacity"
                description="Opacity of floors above the current floor"
                value={prefs.floorGhosting.floorsAboveOpacity}
                defaultValue={defaults.floorGhosting.floorsAboveOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => handleChange('floorGhosting', 'floorsAboveOpacity', v)}
                isDark={isDark}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
              
              {/* Floors Below */}
              <SliderSetting
                label="Floors Below Opacity"
                description="Opacity of floors below the current floor"
                value={prefs.floorGhosting.floorsBelowOpacity}
                defaultValue={defaults.floorGhosting.floorsBelowOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => handleChange('floorGhosting', 'floorsBelowOpacity', v)}
                isDark={isDark}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
              
              {/* Full Building View */}
              <SliderSetting
                label="Full Building View Opacity"
                description="Opacity when viewing all floors at once"
                value={prefs.floorGhosting.fullBuildingViewOpacity}
                defaultValue={defaults.floorGhosting.fullBuildingViewOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => handleChange('floorGhosting', 'fullBuildingViewOpacity', v)}
                isDark={isDark}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
              
              {/* Current Floor Wall Opacity */}
              <SliderSetting
                label="Current Floor Wall Opacity"
                description="Opacity for walls on the currently selected floor (lower = see inside better)"
                value={prefs.floorGhosting.currentFloorWallOpacity}
                defaultValue={defaults.floorGhosting.currentFloorWallOpacity}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => handleChange('floorGhosting', 'currentFloorWallOpacity', v)}
                isDark={isDark}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          )}
          
          {activeTab === 'grid' && (
            <div className="space-y-6">
              <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Configure grid display settings.
              </div>
              
              {/* Default Visible */}
              <ToggleSetting
                label="Show Grid by Default"
                description="Whether the grid is visible when opening the editor"
                value={prefs.grid.defaultVisible}
                onChange={(v) => handleChange('grid', 'defaultVisible', v)}
                isDark={isDark}
              />
              
              {/* Fade Distance */}
              <SliderSetting
                label="Fade Distance"
                description="Distance at which the grid fades out"
                value={prefs.grid.fadeDistance}
                defaultValue={defaults.grid.fadeDistance}
                min={20}
                max={200}
                step={10}
                onChange={(v) => handleChange('grid', 'fadeDistance', v)}
                isDark={isDark}
                formatValue={(v) => `${v} units`}
              />
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
        }`}>
          <button
            onClick={handleReset}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isDark
                ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ArrowPathIcon className="w-4 h-4" />
            Reset to Defaults
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={!hasChanges}
              className={`
                flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                ${hasChanges
                  ? isDark
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : isDark
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              Apply
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            >
              <CheckIcon className="w-4 h-4" />
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Slider setting component
interface SliderSettingProps {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  isDark: boolean;
  formatValue?: (value: number) => string;
}

const SliderSetting: React.FC<SliderSettingProps> = ({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  isDark,
  formatValue,
}) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-mono ${isDark ? 'text-primary-400' : 'text-primary-600'}`}>
          {formatValue ? formatValue(value) : value}
        </span>
        {value !== defaultValue && (
          <button
            onClick={() => onChange(defaultValue)}
            className={`text-xs px-1.5 py-0.5 rounded ${
              isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
            title="Reset to default"
          >
            Reset
          </button>
        )}
      </div>
    </div>
    <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
      {description}
    </p>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
        isDark ? 'bg-gray-700' : 'bg-gray-200'
      }`}
      style={{
        background: isDark
          ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((value - min) / (max - min)) * 100}%, #374151 ${((value - min) / (max - min)) * 100}%, #374151 100%)`
          : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((value - min) / (max - min)) * 100}%, #e5e7eb ${((value - min) / (max - min)) * 100}%, #e5e7eb 100%)`,
      }}
    />
  </div>
);

// Toggle setting component
interface ToggleSettingProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isDark: boolean;
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({
  label,
  description,
  value,
  onChange,
  isDark,
}) => (
  <div className="flex items-start justify-between">
    <div className="flex-1">
      <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
        {label}
      </label>
      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        {description}
      </p>
    </div>
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${value
          ? 'bg-primary-600'
          : isDark ? 'bg-gray-600' : 'bg-gray-300'
        }
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${value ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  </div>
);

export default PreferencesDialog;

