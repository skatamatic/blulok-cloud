/**
 * Asset Editor Component
 * 
 * UI for editing asset materials, textures, and models.
 * Used on the BluDesign Assets page.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { useTheme } from '../../../contexts/ThemeContext';
import { 
  AssetDefinition, 
  MaterialConfig 
} from '../services/AssetService';
import { ThumbnailGenerator } from '../utils/ThumbnailGenerator';
import { AssetFactory } from '../assets/AssetFactory';
import { AssetMetadata, AssetCategory } from '../core/types';

interface AssetEditorProps {
  asset: AssetDefinition;
  onUpdate?: (asset: AssetDefinition) => void;
  onClose?: () => void;
}

export const AssetEditor: React.FC<AssetEditorProps> = ({
  asset,
  onUpdate: _onUpdate,
  onClose,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'model'>('info');
  const [partMaterials, setPartMaterials] = useState<Record<string, MaterialConfig>>({});
  
  // Extract available parts from asset
  useEffect(() => {
    const extractParts = async () => {
      try {
        const assetMetadata: AssetMetadata = {
          id: asset.id,
          name: asset.name,
          category: asset.category as AssetCategory,
          description: asset.description,
          dimensions: asset.dimensions,
          isSmart: asset.isSmart,
          canRotate: asset.canRotate,
          canStack: asset.canStack,
          gridUnits: asset.gridUnits,
        };
        
        const mesh = AssetFactory.createAssetMesh(assetMetadata);
        
        // Extract default materials for each part
        const materials: Record<string, MaterialConfig> = {};
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.partName) {
            const partName = child.userData.partName as string;
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat) {
              materials[partName] = {
                color: '#' + mat.color.getHexString(),
                metalness: mat.metalness,
                roughness: mat.roughness,
                emissive: mat.emissive ? '#' + mat.emissive.getHexString() : undefined,
                emissiveIntensity: mat.emissiveIntensity,
                transparent: mat.transparent,
                opacity: mat.opacity,
              };
            }
          }
        });
        setPartMaterials(materials);
        
        // Cleanup
        mesh.traverse((child) => {
          if ((child as THREE.Mesh).geometry) {
            (child as THREE.Mesh).geometry.dispose();
          }
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material;
            if (Array.isArray(mat)) {
              mat.forEach(m => m.dispose());
            } else {
              mat.dispose();
            }
          }
        });
      } catch (err) {
        console.error('Failed to extract parts:', err);
      }
    };
    
    extractParts();
  }, [asset]);
  
  // Generate preview thumbnail
  useEffect(() => {
    const generatePreview = async () => {
      try {
        // Convert AssetDefinition to AssetMetadata
        const assetMetadata: AssetMetadata = {
          id: asset.id,
          name: asset.name,
          category: asset.category as AssetCategory,
          description: asset.description,
          dimensions: asset.dimensions,
          isSmart: asset.isSmart,
          canRotate: asset.canRotate,
          canStack: asset.canStack,
          gridUnits: asset.gridUnits,
        };
        
        const mesh = AssetFactory.createAssetMesh(assetMetadata);
        
        // Apply part materials if any
        if (Object.keys(partMaterials).length > 0) {
          // Convert MaterialConfig to the format expected by applyMaterials
          const materials: Record<string, { color: string; metalness: number; roughness: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number }> = {};
          Object.entries(partMaterials).forEach(([key, val]) => {
            materials[key] = {
              color: val.color || '#808080',
              metalness: val.metalness ?? 0.5,
              roughness: val.roughness ?? 0.5,
              emissive: val.emissive,
              emissiveIntensity: val.emissiveIntensity,
              transparent: val.transparent,
              opacity: val.opacity,
            };
          });
          AssetFactory.applyMaterials(mesh, materials);
        }
        
        const thumbnail = await ThumbnailGenerator.generate(mesh, { size: 200 });
        setPreviewUrl(thumbnail);
        mesh.traverse((child) => {
          if ((child as THREE.Mesh).geometry) {
            (child as THREE.Mesh).geometry.dispose();
          }
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material;
            if (Array.isArray(mat)) {
              mat.forEach(m => m.dispose());
            } else {
              mat.dispose();
            }
          }
        });
      } catch (err) {
        console.error('Failed to generate preview:', err);
      }
    };
    
    generatePreview();
  }, [asset, partMaterials]);
  

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`
        rounded-lg shadow-xl overflow-hidden
        ${isDark ? 'bg-gray-800' : 'bg-white'}
      `}
    >
      {/* Header */}
      <div className={`
        flex items-center justify-between px-4 py-3 border-b
        ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}
      `}>
        <div className="flex items-center gap-3">
          {previewUrl && (
            <img 
              src={previewUrl} 
              alt={asset.name}
              className="w-10 h-10 rounded object-cover"
            />
          )}
          <div>
            <h2 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {asset.name}
            </h2>
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {asset.category} • {asset.modelType}
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`
              p-1.5 rounded-lg transition-colors
              ${isDark 
                ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}
            `}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={`
        flex border-b
        ${isDark ? 'border-gray-700' : 'border-gray-200'}
      `}>
        {(['info', 'model'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-4 py-2.5 text-sm font-medium transition-colors
              ${activeTab === tab
                ? isDark
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 min-h-[400px]">
        <AnimatePresence mode="wait">
          {activeTab === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Asset Info */}
              <div className={`
                p-4 rounded-lg
                ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}
              `}>
                <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Asset Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Name</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{asset.name}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Category</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Smart Asset</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.isSmart ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Grid Units</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.gridUnits.x} × {asset.gridUnits.z}
                    </p>
                  </div>
                </div>
                
                {asset.description && (
                  <div className="mt-4">
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Description</p>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{asset.description}</p>
                  </div>
                )}
              </div>

              {/* Customization Notice */}
              <div className={`
                p-4 rounded-lg border-2 border-dashed
                ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-300 bg-gray-50'}
              `}>
                <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Material Customization
                </h4>
                <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  To customize materials and colors for this asset category, use the Skins tab in the Assets page.
                  Skins apply to all assets of the same type.
                </p>
                <button
                  onClick={() => {
                    window.location.href = '/bludesign/assets?tab=skins';
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition-colors"
                >
                  Go to Skins
                </button>
              </div>

              {/* Dimensions */}
              <div className={`
                p-4 rounded-lg
                ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}
              `}>
                <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Dimensions
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className={`p-2 rounded ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Width</p>
                    <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.dimensions.width.toFixed(2)}m
                    </p>
                  </div>
                  <div className={`p-2 rounded ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Height</p>
                    <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.dimensions.height.toFixed(2)}m
                    </p>
                  </div>
                  <div className={`p-2 rounded ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Depth</p>
                    <p className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {asset.dimensions.depth.toFixed(2)}m
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'model' && (
            <motion.div
              key="model"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className={`
                p-4 rounded-lg
                ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}
              `}>
                <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Model Type
                </h4>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Current: <span className="font-mono">{asset.modelType}</span>
                </p>
                
                {asset.modelType === 'primitive' && asset.primitiveSpec && (
                  <div className="mt-3">
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Primitive Type: {asset.primitiveSpec.type}
                    </p>
                  </div>
                )}
                
                {asset.modelType !== 'primitive' && (
                  <div className={`mt-4 p-4 border-2 border-dashed rounded-lg text-center
                    ${isDark ? 'border-gray-600' : 'border-gray-300'}
                  `}>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Custom model upload coming soon
                    </p>
                  </div>
                )}
              </div>

              <div className={`
                p-4 rounded-lg
                ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}
              `}>
                <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  Dimensions
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  {(['width', 'height', 'depth'] as const).map((dim) => (
                    <div key={dim}>
                      <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {dim.charAt(0).toUpperCase() + dim.slice(1)}
                      </label>
                      <input
                        type="number"
                        value={asset.dimensions[dim]}
                        readOnly
                        className={`
                          w-full mt-1 px-3 py-2 rounded-lg text-sm
                          ${isDark 
                            ? 'bg-gray-800 border-gray-600 text-gray-300' 
                            : 'bg-gray-100 border-gray-300 text-gray-700'}
                          border
                        `}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AssetEditor;



