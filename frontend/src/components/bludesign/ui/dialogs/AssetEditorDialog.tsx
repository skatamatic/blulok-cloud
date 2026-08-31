/**
 * Asset Editor Dialog
 * 
 * Dialog for editing asset materials and textures.
 * Allows customizing colors, metalness, roughness per material slot.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetMetadata } from '../../core/types';
import { XMarkIcon, SwatchIcon, CubeIcon } from '@heroicons/react/24/outline';

interface MaterialSlot {
  name: string;
  color: string;
  metalness: number;
  roughness: number;
}

interface AssetEditorDialogProps {
  isOpen: boolean;
  asset: AssetMetadata | null;
  onClose: () => void;
  onSave: (assetId: string, materials: MaterialSlot[]) => Promise<void>;
}

// Default material slots for different asset categories
const getDefaultMaterials = (asset: AssetMetadata | null): MaterialSlot[] => {
  if (!asset) return [];
  
  switch (asset.category) {
    case 'storage_unit':
      return [
        { name: 'Body', color: '#f7f7f7', metalness: 0.3, roughness: 0.7 },
        { name: 'Door', color: '#7777fa', metalness: 0.4, roughness: 0.6 },
        { name: 'Handle', color: '#333333', metalness: 0.8, roughness: 0.2 },
      ];
    case 'gate':
      return [
        { name: 'Frame', color: '#1a202c', metalness: 0.6, roughness: 0.3 },
        { name: 'Bars', color: '#2d3748', metalness: 0.7, roughness: 0.3 },
      ];
    case 'elevator':
      return [
        { name: 'Frame', color: '#c0c8d0', metalness: 0.8, roughness: 0.25 },
        { name: 'Doors', color: '#d0d8e0', metalness: 0.9, roughness: 0.1 },
        { name: 'Trim', color: '#667788', metalness: 0.75, roughness: 0.25 },
      ];
    case 'wall':
      return [
        { name: 'Surface', color: '#f5f5f0', metalness: 0.1, roughness: 0.9 },
      ];
    case 'fence':
      return [
        { name: 'Material', color: '#2d3748', metalness: 0.5, roughness: 0.5 },
      ];
    default:
      return [
        { name: 'Main', color: '#a0aec0', metalness: 0.1, roughness: 0.8 },
      ];
  }
};

export const AssetEditorDialog: React.FC<AssetEditorDialogProps> = ({
  isOpen,
  asset,
  onClose,
  onSave,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [materials, setMaterials] = useState<MaterialSlot[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'materials' | 'geometry'>('materials');

  // Initialize materials when asset changes
  useEffect(() => {
    if (asset) {
      setMaterials(getDefaultMaterials(asset));
    }
  }, [asset]);

  const handleMaterialChange = useCallback((index: number, field: keyof MaterialSlot, value: string | number) => {
    setMaterials(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!asset) return;
    
    setIsSaving(true);
    try {
      await onSave(asset.id, materials);
      onClose();
    } catch (error) {
      console.error('Failed to save asset:', error);
    } finally {
      setIsSaving(false);
    }
  }, [asset, materials, onSave, onClose]);

  if (!isOpen || !asset) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black/60 z-[100000]"
      onClick={onClose}
    >
      <div 
        className={`
          rounded-lg shadow-2xl border w-[500px] max-h-[80vh] overflow-hidden flex flex-col
          ${isDark 
            ? 'bg-gray-900 text-gray-100 border-gray-700' 
            : 'bg-white text-gray-900 border-gray-200'
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`
          px-4 py-3 border-b flex items-center justify-between
          ${isDark ? 'border-gray-800' : 'border-gray-200'}
        `}>
          <div className="flex items-center gap-2">
            <CubeIcon className="w-5 h-5 text-primary-500" />
            <div>
              <div className="text-sm font-semibold">Edit Asset</div>
              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {asset.name}
              </div>
            </div>
          </div>
          <button
            className={`p-1 rounded transition-colors ${
              isDark 
                ? 'text-gray-400 hover:text-white hover:bg-gray-800' 
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            onClick={onClose}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            className={`
              flex-1 px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'materials'
                ? isDark 
                  ? 'text-primary-400 border-b-2 border-primary-400 bg-gray-800/50' 
                  : 'text-primary-600 border-b-2 border-primary-600 bg-gray-50'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }
            `}
            onClick={() => setActiveTab('materials')}
          >
            <SwatchIcon className="w-4 h-4 inline mr-2" />
            Materials
          </button>
          <button
            className={`
              flex-1 px-4 py-2 text-sm font-medium transition-colors
              ${activeTab === 'geometry'
                ? isDark 
                  ? 'text-primary-400 border-b-2 border-primary-400 bg-gray-800/50' 
                  : 'text-primary-600 border-b-2 border-primary-600 bg-gray-50'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }
            `}
            onClick={() => setActiveTab('geometry')}
          >
            <CubeIcon className="w-4 h-4 inline mr-2" />
            Geometry
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'materials' && (
            <div className="space-y-4">
              {materials.map((material, index) => (
                <div 
                  key={material.name}
                  className={`
                    p-3 rounded-lg border
                    ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                  `}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-8 h-8 rounded border shadow-inner"
                      style={{ backgroundColor: material.color }}
                    />
                    <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {material.name}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Color */}
                    <div className="flex items-center gap-3">
                      <label className={`text-xs w-20 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Color
                      </label>
                      <input
                        type="color"
                        value={material.color}
                        onChange={(e) => handleMaterialChange(index, 'color', e.target.value)}
                        className="w-10 h-8 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={material.color}
                        onChange={(e) => handleMaterialChange(index, 'color', e.target.value)}
                        className={`
                          flex-1 px-2 py-1 text-xs rounded border font-mono
                          ${isDark 
                            ? 'bg-gray-700 border-gray-600 text-gray-200' 
                            : 'bg-white border-gray-300 text-gray-700'
                          }
                        `}
                      />
                    </div>

                    {/* Metalness */}
                    <div className="flex items-center gap-3">
                      <label className={`text-xs w-20 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Metalness
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={material.metalness}
                        onChange={(e) => handleMaterialChange(index, 'metalness', parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className={`text-xs w-10 text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {material.metalness.toFixed(2)}
                      </span>
                    </div>

                    {/* Roughness */}
                    <div className="flex items-center gap-3">
                      <label className={`text-xs w-20 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Roughness
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={material.roughness}
                        onChange={(e) => handleMaterialChange(index, 'roughness', parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className={`text-xs w-10 text-right ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {material.roughness.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'geometry' && (
            <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <CubeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Geometry editing coming soon</p>
              <p className="text-xs mt-1">Upload custom 3D models or use primitive shapes</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`
          px-4 py-3 border-t flex justify-end gap-2
          ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}
        `}>
          <button
            className={`
              px-4 py-2 text-sm rounded transition-colors
              ${isDark 
                ? 'text-gray-300 hover:bg-gray-800' 
                : 'text-gray-600 hover:bg-gray-100'
              }
            `}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`
              px-4 py-2 text-sm rounded font-medium transition-colors
              bg-primary-500 text-white hover:bg-primary-600
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssetEditorDialog;

