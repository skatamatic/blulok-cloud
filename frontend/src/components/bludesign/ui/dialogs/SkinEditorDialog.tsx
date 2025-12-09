/**
 * Skin Editor Dialog
 * 
 * Dialog for creating and editing category-based skins.
 * Allows setting part materials (colors, metalness, roughness) with live preview.
 * Supports texture uploads and shader selection.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  SwatchIcon,
  PlusIcon,
  TrashIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { CategorySkin, SkinRegistryClass } from '../../core/SkinRegistry';
import { AssetCategory, PartMaterial } from '../../core/types';

// Available shader hints
const SHADER_OPTIONS = [
  { value: 'default', label: 'Standard' },
  { value: 'wireframe', label: 'Wireframe' },
  { value: 'paned-glass', label: 'Glass (Paned)' },
  { value: 'glass-floor', label: 'Glass Floor' },
  { value: 'glass-roof', label: 'Glass Roof' },
] as const;

interface SkinEditorDialogProps {
  skin: CategorySkin | null; // null for creating new
  category: AssetCategory;
  onCategoryChange?: (category: AssetCategory) => void;
  onSave: (skin: Partial<CategorySkin>) => void;
  onClose: () => void;
}

// Common part names for each category
const CATEGORY_PARTS: Record<AssetCategory, string[]> = {
  [AssetCategory.STORAGE_UNIT]: ['body', 'door', 'handle', 'lock'],
  [AssetCategory.GATE]: ['frame', 'bars', 'motor'],
  [AssetCategory.DOOR]: ['frame', 'panel', 'handle'],
  [AssetCategory.FENCE]: ['frame', 'mesh'],
  [AssetCategory.ELEVATOR]: ['frame', 'doors', 'cabin'],
  [AssetCategory.KIOSK]: ['cabinet', 'counter', 'awning'],
  [AssetCategory.ACCESS_CONTROL]: ['housing', 'screen', 'keypad'],
  [AssetCategory.WINDOW]: ['frame', 'glass', 'sill'],
  [AssetCategory.DECORATION]: ['trunk', 'foliage', 'pot'],
  [AssetCategory.CAMERA]: ['housing', 'lens'],
  [AssetCategory.LIGHTING]: ['fixture', 'lens'],
};

const DEFAULT_MATERIAL: PartMaterial = {
  color: '#808080',
  metalness: 0.3,
  roughness: 0.6,
};

export const SkinEditorDialog: React.FC<SkinEditorDialogProps> = ({
  skin,
  category,
  onCategoryChange,
  onSave,
  onClose,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [name, setName] = useState(skin?.name || 'New Skin');
  const [description, setDescription] = useState(skin?.description || '');
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [partMaterials, setPartMaterials] = useState<Record<string, PartMaterial>>(
    skin?.partMaterials || {}
  );
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get available parts for the selected category
  const availableParts = CATEGORY_PARTS[selectedCategory] || ['body'];
  
  // Initialize part materials for new skins
  useEffect(() => {
    if (!skin && Object.keys(partMaterials).length === 0) {
      const initialMaterials: Record<string, PartMaterial> = {};
      availableParts.forEach(part => {
        initialMaterials[part] = { ...DEFAULT_MATERIAL };
      });
      setPartMaterials(initialMaterials);
      setSelectedPart(availableParts[0]);
    } else if (Object.keys(partMaterials).length > 0 && !selectedPart) {
      setSelectedPart(Object.keys(partMaterials)[0]);
    }
  }, [skin, availableParts, partMaterials, selectedPart]);
  
  const handleCategoryChange = useCallback((newCategory: AssetCategory) => {
    setSelectedCategory(newCategory);
    onCategoryChange?.(newCategory);
    
    // Reset part materials for new category
    const newParts = CATEGORY_PARTS[newCategory] || ['body'];
    const initialMaterials: Record<string, PartMaterial> = {};
    newParts.forEach(part => {
      initialMaterials[part] = { ...DEFAULT_MATERIAL };
    });
    setPartMaterials(initialMaterials);
    setSelectedPart(newParts[0]);
  }, [onCategoryChange]);
  
  const handlePartMaterialChange = useCallback((partName: string, updates: Partial<PartMaterial>) => {
    setPartMaterials(prev => ({
      ...prev,
      [partName]: {
        ...(prev[partName] || DEFAULT_MATERIAL),
        ...updates,
      },
    }));
  }, []);
  
  const handleAddPart = useCallback(() => {
    const newPartName = `part_${Object.keys(partMaterials).length + 1}`;
    setPartMaterials(prev => ({
      ...prev,
      [newPartName]: { ...DEFAULT_MATERIAL },
    }));
    setSelectedPart(newPartName);
  }, [partMaterials]);
  
  const handleRemovePart = useCallback((partName: string) => {
    setPartMaterials(prev => {
      const newMaterials = { ...prev };
      delete newMaterials[partName];
      return newMaterials;
    });
    if (selectedPart === partName) {
      const remaining = Object.keys(partMaterials).filter(p => p !== partName);
      setSelectedPart(remaining[0] || null);
    }
  }, [selectedPart, partMaterials]);
  
  const handleTextureUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedPart) return;
    
    setIsUploading(true);
    try {
      // Create a data URL for local preview (for now)
      // In production, this would upload to the backend
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        handlePartMaterialChange(selectedPart, { textureUrl: dataUrl });
        setIsUploading(false);
      };
      reader.onerror = () => {
        console.error('Failed to read texture file');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading texture:', error);
      setIsUploading(false);
    }
    
    // Reset input value for re-uploading same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedPart, handlePartMaterialChange]);
  
  const handleRemoveTexture = useCallback(() => {
    if (selectedPart) {
      handlePartMaterialChange(selectedPart, { textureUrl: undefined });
    }
  }, [selectedPart, handlePartMaterialChange]);
  
  const handleSave = useCallback(() => {
    onSave({
      name,
      description: description || undefined,
      category: selectedCategory,
      partMaterials,
    });
  }, [name, description, selectedCategory, partMaterials, onSave]);
  
  const selectedMaterial = selectedPart ? partMaterials[selectedPart] : null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`
          w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl
          ${isDark ? 'bg-gray-800' : 'bg-white'}
        `}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <SwatchIcon className={`w-6 h-6 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
            <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {skin ? 'Edit Skin' : 'Create Skin'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Basic Info and Part List */}
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Skin Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                />
              </div>
              
              {/* Category (only for new skins) */}
              {!skin && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Asset Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value as AssetCategory)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      isDark
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                  >
                    {Object.values(AssetCategory).map(cat => (
                      <option key={cat} value={cat}>
                        {SkinRegistryClass.getCategoryLabel(cat)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Description */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                />
              </div>
              
              {/* Parts List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Part Materials
                  </label>
                  <button
                    onClick={handleAddPart}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${isDark ? 'text-primary-400 hover:bg-gray-700' : 'text-primary-600 hover:bg-gray-100'}`}
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Part
                  </button>
                </div>
                
                <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  {Object.entries(partMaterials).map(([partName, mat]) => (
                    <div
                      key={partName}
                      onClick={() => setSelectedPart(partName)}
                      className={`
                        flex items-center gap-3 p-3 cursor-pointer border-b last:border-b-0
                        ${isDark ? 'border-gray-700' : 'border-gray-200'}
                        ${selectedPart === partName
                          ? isDark ? 'bg-primary-500/20' : 'bg-primary-50'
                          : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }
                      `}
                    >
                      <div
                        className="w-8 h-8 rounded border border-black/10"
                        style={{ backgroundColor: mat.color }}
                      />
                      <span className={`flex-1 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {partName}
                      </span>
                      {!availableParts.includes(partName) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemovePart(partName); }}
                          className={`p-1 rounded hover:bg-red-500/20 ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Right: Material Editor for Selected Part */}
            <div>
              {selectedPart && selectedMaterial ? (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <h3 className={`text-sm font-medium mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Editing: {selectedPart}
                  </h3>
                  
                  {/* Color Picker */}
                  <div className="mb-4">
                    <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={selectedMaterial.color}
                        onChange={(e) => handlePartMaterialChange(selectedPart, { color: e.target.value })}
                        className="w-12 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedMaterial.color}
                        onChange={(e) => handlePartMaterialChange(selectedPart, { color: e.target.value })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                          isDark
                            ? 'bg-gray-700 border-gray-600 text-white'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                    </div>
                  </div>
                  
                  {/* Metalness Slider */}
                  <div className="mb-4">
                    <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Metalness: {selectedMaterial.metalness.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedMaterial.metalness}
                      onChange={(e) => handlePartMaterialChange(selectedPart, { metalness: parseFloat(e.target.value) })}
                      className="w-full accent-primary-500"
                    />
                  </div>
                  
                  {/* Roughness Slider */}
                  <div className="mb-4">
                    <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Roughness: {selectedMaterial.roughness.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedMaterial.roughness}
                      onChange={(e) => handlePartMaterialChange(selectedPart, { roughness: parseFloat(e.target.value) })}
                      className="w-full accent-primary-500"
                    />
                  </div>
                  
                  {/* Shader Type Selection */}
                  <div className="mb-4">
                    <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Shader Type
                    </label>
                    <select
                      value={selectedMaterial.shader || 'default'}
                      onChange={(e) => {
                        const value = e.target.value;
                        // 'default' should be undefined (no shader override)
                        handlePartMaterialChange(selectedPart, { 
                          shader: value === 'default' ? undefined : value as PartMaterial['shader']
                        });
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      {SHADER_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Special rendering mode for this part
                    </p>
                  </div>
                  
                  {/* Texture Upload */}
                  <div className="mb-4">
                    <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Texture Map (optional)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleTextureUpload}
                      className="hidden"
                    />
                    
                    {selectedMaterial.textureUrl ? (
                      <div className="space-y-2">
                        <div className={`relative w-full h-20 rounded-lg border overflow-hidden ${
                          isDark ? 'border-gray-600' : 'border-gray-300'
                        }`}>
                          <img 
                            src={selectedMaterial.textureUrl} 
                            alt="Texture preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={handleRemoveTexture}
                            className="absolute top-1 right-1 p-1 rounded bg-red-500/80 hover:bg-red-500 text-white"
                            title="Remove texture"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          Texture applied - color will tint the texture
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className={`
                          w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed
                          transition-colors
                          ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          ${isDark 
                            ? 'border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300' 
                            : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-600'
                          }
                        `}
                      >
                        {isUploading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
                            <span className="text-sm">Uploading...</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span className="text-sm">Upload Texture</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {/* Transparency Settings (when applicable) */}
                  {(selectedMaterial.shader?.includes('glass') || selectedPart === 'glass') && (
                    <div className="mb-4">
                      <label className={`block text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Opacity: {((selectedMaterial.opacity ?? 1) * 100).toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedMaterial.opacity ?? 1}
                        onChange={(e) => handlePartMaterialChange(selectedPart, { 
                          opacity: parseFloat(e.target.value),
                          transparent: parseFloat(e.target.value) < 1,
                        })}
                        className="w-full accent-primary-500"
                      />
                    </div>
                  )}
                  
                  {/* Preview */}
                  <div className={`mt-6 p-4 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Preview</p>
                    <div className="flex gap-4 items-center">
                      <div
                        className="w-24 h-24 rounded-lg shadow-inner"
                        style={{
                          backgroundColor: selectedMaterial.color,
                          backgroundImage: selectedMaterial.metalness > 0.5
                            ? 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)'
                            : undefined,
                        }}
                      />
                      <div className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <p>Metalness: {(selectedMaterial.metalness * 100).toFixed(0)}%</p>
                        <p>Roughness: {(selectedMaterial.roughness * 100).toFixed(0)}%</p>
                        <p className="mt-2">
                          {selectedMaterial.metalness > 0.7 ? 'Highly metallic' : selectedMaterial.metalness > 0.3 ? 'Semi-metallic' : 'Non-metallic'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`h-full flex items-center justify-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Select a part to edit its material
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isDark
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {skin ? 'Save Changes' : 'Create Skin'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

