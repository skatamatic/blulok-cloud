/**
 * Skins Management Panel
 * 
 * A dedicated panel for managing category-based skins.
 * Allows viewing, creating, editing, and deleting skins organized by asset category.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SwatchIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { getSkinRegistry, CategorySkin, SkinRegistryClass } from '../../core/SkinRegistry';
import { AssetCategory } from '../../core/types';
import { SkinEditorDialog } from '../dialogs/SkinEditorDialog';
import { AssetFactory } from '../../assets/AssetFactory';
import { AssetRegistry } from '../../assets/AssetRegistry';

/**
 * Map of categories to demo asset IDs for thumbnail generation
 */
const CATEGORY_DEMO_ASSETS: Partial<Record<AssetCategory, string>> = {
  [AssetCategory.STORAGE_UNIT]: 'unit-medium',
  [AssetCategory.GATE]: 'gate-entry',
  [AssetCategory.DOOR]: 'door-standard',
  [AssetCategory.FENCE]: 'fence-1m',
  [AssetCategory.ELEVATOR]: 'elevator-freight',
  [AssetCategory.STAIRWELL]: 'stairwell-standard',
  [AssetCategory.KIOSK]: 'kiosk-default', // May not exist, will fallback
  [AssetCategory.WINDOW]: 'window-standard',
  [AssetCategory.DECORATION]: 'tree-oak',
};

/**
 * Apply skin materials to a mesh for preview rendering
 */
function applySkinToPreviewMesh(mesh: THREE.Object3D, skin: CategorySkin): void {
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const partName = child.userData.partName as string;
      const partMaterial = partName ? skin.partMaterials[partName] : null;
      
      // Also check for generic part names
      const genericPartMaterial = !partMaterial ? (
        skin.partMaterials.body || 
        skin.partMaterials.frame || 
        skin.partMaterials.panel ||
        Object.values(skin.partMaterials)[0]
      ) : null;
      
      const materialToApply = partMaterial || genericPartMaterial;
      
      if (materialToApply && child.material instanceof THREE.MeshStandardMaterial) {
        child.material = child.material.clone();
        child.material.color.set(materialToApply.color);
        child.material.metalness = materialToApply.metalness;
        child.material.roughness = materialToApply.roughness;
        if (materialToApply.emissive) {
          child.material.emissive.set(materialToApply.emissive);
          child.material.emissiveIntensity = materialToApply.emissiveIntensity || 0;
        }
      }
    }
  });
}

/**
 * Component for generating and displaying skin thumbnails
 */
interface SkinPreviewThumbnailProps {
  skin: CategorySkin;
  size?: number;
  isDark: boolean;
}

const SkinPreviewThumbnail: React.FC<SkinPreviewThumbnailProps> = ({ skin, size = 80, isDark }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  
  // Memoize a unique key based on skin id and part materials to avoid unnecessary regeneration
  const skinKey = useMemo(() => {
    const materialColors = Object.values(skin.partMaterials).map(m => m.color).join('-');
    return `${skin.id}-${materialColors}`;
  }, [skin.id, skin.partMaterials]);
  
  useEffect(() => {
    let mounted = true;
    
    const generateThumbnail = async () => {
      setIsGenerating(true);
      
      try {
        // Get the demo asset for this category
        const demoAssetId = CATEGORY_DEMO_ASSETS[skin.category];
        if (!demoAssetId) {
          setThumbnail(null);
          setIsGenerating(false);
          return;
        }
        
        const assetRegistry = AssetRegistry.getInstance();
        const assetMetadata = assetRegistry.getAsset(demoAssetId);
        
        if (!assetMetadata) {
          // Fallback: try to find any asset of this category
          const allAssets = assetRegistry.getAllAssets();
          const categoryAsset = allAssets.find(a => a.category === skin.category);
          if (!categoryAsset) {
            setThumbnail(null);
            setIsGenerating(false);
            return;
          }
        }
        
        const asset = assetMetadata || assetRegistry.getAllAssets().find(a => a.category === skin.category);
        if (!asset) {
          setThumbnail(null);
          setIsGenerating(false);
          return;
        }
        
        // Create the mesh
        const mesh = AssetFactory.createAssetMesh(asset);
        
        // Apply the skin
        applySkinToPreviewMesh(mesh, skin);
        
        // Create offscreen renderer
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(size * 2, size * 2); // Higher resolution for quality
        renderer.setClearColor(0x000000, 0);
        
        // Create scene
        const scene = new THREE.Scene();
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        scene.add(directionalLight);
        
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-5, 5, -3);
        scene.add(fillLight);
        
        // Camera
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        
        // Add mesh and calculate bounding box
        scene.add(mesh);
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const meshSize = box.getSize(new THREE.Vector3());
        
        mesh.position.sub(center);
        
        // Position camera to fit object
        const maxDim = Math.max(meshSize.x, meshSize.y, meshSize.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
        
        // Isometric angle
        const distance = cameraZ * 1.2;
        camera.position.set(distance * 0.7, distance * 0.7, distance * 0.7);
        camera.lookAt(0, 0, 0);
        
        // Render
        renderer.render(scene, camera);
        
        if (mounted) {
          const dataUrl = renderer.domElement.toDataURL('image/png');
          setThumbnail(dataUrl);
        }
        
        // Cleanup
        renderer.dispose();
        AssetFactory.disposeAsset(mesh);
        scene.clear();
        
      } catch (error) {
        console.error('Failed to generate skin preview:', error);
        if (mounted) setThumbnail(null);
      }
      
      if (mounted) setIsGenerating(false);
    };
    
    generateThumbnail();
    
    return () => {
      mounted = false;
    };
  }, [skinKey, skin.category, size]);
  
  if (isGenerating) {
    return (
      <div 
        className={`rounded-lg flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}
        style={{ width: size, height: size }}
      >
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!thumbnail) {
    // Fallback: show color swatches in a grid
    const colors = Object.values(skin.partMaterials).slice(0, 4).map(m => m.color);
    return (
      <div 
        className={`rounded-lg overflow-hidden grid grid-cols-2 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}
        style={{ width: size, height: size }}
      >
        {colors.map((color, i) => (
          <div key={i} style={{ backgroundColor: color }} className="w-full h-full" />
        ))}
        {colors.length < 4 && Array.from({ length: 4 - colors.length }).map((_, i) => (
          <div key={`empty-${i}`} className={isDark ? 'bg-gray-600' : 'bg-gray-300'} />
        ))}
      </div>
    );
  }
  
  return (
    <div 
      className={`rounded-lg overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
      style={{ width: size, height: size }}
    >
      <img 
        src={thumbnail} 
        alt={skin.name}
        className="w-full h-full object-contain"
      />
    </div>
  );
};

interface SkinsManagementPanelProps {
  onSkinSelect?: (skin: CategorySkin) => void;
  selectedCategory?: AssetCategory;
}

export const SkinsManagementPanel: React.FC<SkinsManagementPanelProps> = ({
  onSkinSelect,
  selectedCategory: initialCategory,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [skins, setSkins] = useState<CategorySkin[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'all'>(initialCategory || 'all');
  const [editingSkin, setEditingSkin] = useState<CategorySkin | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createCategory, setCreateCategory] = useState<AssetCategory>(AssetCategory.STORAGE_UNIT);
  
  const skinRegistry = getSkinRegistry();
  
  // Load skins
  const loadSkins = useCallback(() => {
    setSkins(skinRegistry.getAllSkins());
  }, [skinRegistry]);
  
  useEffect(() => {
    loadSkins();
  }, [loadSkins]);
  
  // Get categories that have skins
  const categories = skinRegistry.getCategoriesWithSkins();
  
  // Filter skins
  const filteredSkins = skins.filter(skin => {
    const matchesSearch = skin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         skin.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || skin.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  
  // Group filtered skins by category
  const skinsByCategory = filteredSkins.reduce((acc, skin) => {
    if (!acc[skin.category]) {
      acc[skin.category] = [];
    }
    acc[skin.category].push(skin);
    return acc;
  }, {} as Record<AssetCategory, CategorySkin[]>);
  
  const handleCreateSkin = useCallback(() => {
    setIsCreating(true);
    setEditingSkin(null);
  }, []);
  
  const handleEditSkin = useCallback((skin: CategorySkin) => {
    setEditingSkin(skin);
    setIsCreating(false);
  }, []);
  
  const handleDeleteSkin = useCallback((skin: CategorySkin) => {
    if (skin.isBuiltin) {
      alert('Cannot delete built-in skins');
      return;
    }
    
    if (confirm(`Delete skin "${skin.name}"? This cannot be undone.`)) {
      skinRegistry.deleteSkin(skin.id);
      loadSkins();
    }
  }, [skinRegistry, loadSkins]);
  
  const handleDuplicateSkin = useCallback((skin: CategorySkin) => {
    skinRegistry.duplicateSkin(skin.id, `${skin.name} Copy`);
    loadSkins();
  }, [skinRegistry, loadSkins]);
  
  const handleSaveSkin = useCallback((skin: Partial<CategorySkin>) => {
    if (editingSkin) {
      // Update existing skin
      skinRegistry.updateSkin(editingSkin.id, skin);
    } else if (isCreating) {
      // Create new skin
      skinRegistry.createSkin({
        name: skin.name || 'New Skin',
        description: skin.description,
        category: createCategory,
        partMaterials: skin.partMaterials || {},
      });
    }
    
    setEditingSkin(null);
    setIsCreating(false);
    loadSkins();
  }, [editingSkin, isCreating, createCategory, skinRegistry, loadSkins]);
  
  const handleCloseEditor = useCallback(() => {
    setEditingSkin(null);
    setIsCreating(false);
  }, []);
  
  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SwatchIcon className={`w-6 h-6 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
            <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Category Skins
            </h2>
          </div>
          <button
            onClick={handleCreateSkin}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            <span>New Skin</span>
          </button>
        </div>
        
        <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Skins apply to all assets of a category. Select a skin in themes or override per-object in properties.
        </p>
        
        {/* Search and Category Filter */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search skins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-primary-500`}
            />
          </div>
          
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as AssetCategory | 'all')}
            className={`px-4 py-2 rounded-lg border ${
              isDark
                ? 'bg-gray-800 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            } focus:outline-none focus:ring-2 focus:ring-primary-500`}
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {SkinRegistryClass.getCategoryLabel(category)}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Skins List */}
      <div className="flex-1 overflow-y-auto p-4">
        {Object.entries(skinsByCategory).length === 0 ? (
          <div className={`text-center py-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <SwatchIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No skins found</p>
            <p className="text-sm mt-2">Create a new skin or adjust your filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(skinsByCategory).map(([category, categorySkins]) => (
              <div key={category}>
                <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {SkinRegistryClass.getCategoryLabel(category as AssetCategory)}
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categorySkins.map(skin => (
                    <motion.div
                      key={skin.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`
                        rounded-lg border p-4 cursor-pointer transition-all
                        ${isDark
                          ? 'bg-gray-800 border-gray-700 hover:border-primary-500'
                          : 'bg-white border-gray-200 hover:border-primary-400 hover:shadow-md'
                        }
                      `}
                      onClick={() => onSkinSelect?.(skin)}
                    >
                      {/* Preview Row: 3D Thumbnail + Color Swatches */}
                      <div className="flex gap-3 mb-3">
                        {/* 3D Thumbnail */}
                        <SkinPreviewThumbnail skin={skin} size={72} isDark={isDark} />
                        
                        {/* Color Swatches Grid */}
                        <div className="flex-1 min-w-0">
                          <div className="grid grid-cols-4 gap-1.5">
                            {Object.entries(skin.partMaterials).slice(0, 8).map(([partName, mat]) => (
                              <div
                                key={partName}
                                className="aspect-square rounded border border-black/10"
                                style={{ backgroundColor: mat.color }}
                                title={partName}
                              />
                            ))}
                          </div>
                          {Object.keys(skin.partMaterials).length > 8 && (
                            <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              +{Object.keys(skin.partMaterials).length - 8} more
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {skin.name}
                          </h4>
                          {skin.description && (
                            <p className={`text-xs truncate mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {skin.description}
                            </p>
                          )}
                          {skin.isBuiltin && (
                            <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                              Built-in
                            </span>
                          )}
                        </div>
                        
                        {/* Actions */}
                        <div className="flex gap-1 ml-2">
                          {!skin.isBuiltin && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditSkin(skin); }}
                                className={`p-1.5 rounded hover:bg-primary-500/20 ${isDark ? 'text-gray-400 hover:text-primary-400' : 'text-gray-500 hover:text-primary-600'}`}
                                title="Edit"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteSkin(skin); }}
                                className={`p-1.5 rounded hover:bg-red-500/20 ${isDark ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-600'}`}
                                title="Delete"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicateSkin(skin); }}
                            className={`p-1.5 rounded hover:bg-primary-500/20 ${isDark ? 'text-gray-400 hover:text-primary-400' : 'text-gray-500 hover:text-primary-600'}`}
                            title="Duplicate"
                          >
                            <DocumentDuplicateIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Skin Editor Dialog */}
      <AnimatePresence>
        {(editingSkin || isCreating) && (
          <SkinEditorDialog
            skin={editingSkin}
            category={editingSkin?.category || createCategory}
            onCategoryChange={!editingSkin ? setCreateCategory : undefined}
            onSave={handleSaveSkin}
            onClose={handleCloseEditor}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

