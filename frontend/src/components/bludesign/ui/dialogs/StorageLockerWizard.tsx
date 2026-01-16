/**
 * Storage Locker Wizard
 * 
 * Step-by-step wizard for creating custom storage locker assets:
 * 1. Mode Selection: Choose between primitive geometry or upload 3D model
 * 2a. Primitive Path: Dimensions → Door Configuration → Review
 * 2b. Upload Path: Upload Model → Scale to Size → Position Offset → Review
 * 
 * Grid standard: 1 grid tile = 2 feet = 0.6096 meters
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  CubeIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  GRID_UNIT_METERS, 
  feetToMeters, 
  metersToFeet, 
  metersToGridUnits,
  AssetCategory,
} from '../../core/types';
import { LockerSpec } from '../../assets/AssetFactory';
import { LockerPreview3D } from './LockerPreview3D';
import { CreateAssetDefinitionInput, AssetDefinition, UpdateAssetDefinitionInput } from '../../services/AssetService';

type WizardMode = 'primitive' | 'upload';
type UnitSystem = 'metric' | 'imperial';
type DoorSide = 'front' | 'back' | 'left' | 'right';
type ScaleMode = 'uniform' | 'dimensions';
type PrimitiveStep = 'modeSelect' | 'dimensions' | 'door' | 'review';
type UploadStep = 'modeSelect' | 'upload' | 'scale' | 'offset' | 'components' | 'review';
type WizardStep = PrimitiveStep | UploadStep;

// Model hierarchy node for smart component detection
interface ModelNode {
  name: string;
  path: string;
  type: 'group' | 'mesh';
  children: ModelNode[];
}

// Smart component mapping
interface SmartComponents {
  body?: string;  // Path to body mesh
  door?: string;  // Path to door mesh
}

interface LockerWizardState {
  mode: WizardMode | null;
  name: string;
  unitSystem: UnitSystem;
  
  // Locker dimensions (stored in meters)
  width: number;
  height: number;
  depth: number;
  
  // Door configuration (primitive mode only)
  doorSide: DoorSide;
  doorWidth: number;
  doorHeight: number;
  doorPositionX: number;
  doorPositionY: number;
  doorCentered: boolean;
  
  // Upload mode
  uploadedFile?: File;
  
  // Scaling mode for uploaded models
  scaleMode: ScaleMode;
  scaleFactor: number;  // For uniform mode
  
  // Original model dimensions (natural size from file, in meters)
  originalWidth: number;
  originalHeight: number;
  originalDepth: number;
  
  // Physical dimensions for scaling uploaded models (target size)
  physicalWidth: number;
  physicalHeight: number;
  physicalDepth: number;
  
  // Position offset for uploaded models (meters)
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  
  // Model hierarchy for smart component detection
  modelHierarchy: ModelNode[];
  smartComponents: SmartComponents;
  selectedComponentPath: string | null;
}

// Min/max constraints in feet (significantly increased)
const CONSTRAINTS = {
  minWidth: 0.5,    // 0.5 ft
  maxWidth: 100,    // 100 ft
  minHeight: 0.5,   // 0.5 ft
  maxHeight: 50,    // 50 ft
  minDepth: 0.5,    // 0.5 ft
  maxDepth: 100,    // 100 ft
  minDoorWidth: 1,  // 1 ft
  minDoorHeight: 2, // 2 ft
  minScale: 0.01,   // 1%
  maxScale: 100,    // 10000%
};

// Model Hierarchy Tree component for smart component selection
interface ModelHierarchyTreeProps {
  nodes: ModelNode[];
  isDark: boolean;
  selectedPath: string | null;
  linkedPaths: string[];
  onSelect: (path: string) => void;
  onLinkBody: (path: string) => void;
  onLinkDoor: (path: string) => void;
  depth?: number;
}

const ModelHierarchyTree: React.FC<ModelHierarchyTreeProps> = ({
  nodes,
  isDark,
  selectedPath,
  linkedPaths,
  onSelect,
  onLinkBody,
  onLinkDoor,
  depth = 0,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-gray-600/30 pl-2' : ''}>
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path);
        const hasChildren = node.children.length > 0;
        const isSelected = selectedPath === node.path;
        const isLinked = linkedPaths.includes(node.path);

        return (
          <div key={node.path}>
            <div
              className={`
                flex items-center gap-1 py-1 px-2 rounded cursor-pointer group
                ${isSelected 
                  ? isDark ? 'bg-primary-500/20' : 'bg-primary-100' 
                  : isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-200/50'
                }
                ${isLinked ? isDark ? 'ring-1 ring-green-500/50' : 'ring-1 ring-green-500/50' : ''}
              `}
              onClick={() => onSelect(node.path)}
            >
              {/* Expand/collapse button */}
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }}
                  className={`p-0.5 rounded ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-300'}`}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-3 h-3" />
                  ) : (
                    <ChevronRightIcon className="w-3 h-3" />
                  )}
                </button>
              ) : (
                <span className="w-4" />
              )}

              {/* Icon */}
              <CubeIcon className={`w-4 h-4 flex-shrink-0 ${
                node.type === 'mesh' 
                  ? isDark ? 'text-blue-400' : 'text-blue-600'
                  : isDark ? 'text-gray-400' : 'text-gray-600'
              }`} />

              {/* Name */}
              <span className={`text-sm truncate flex-1 ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {node.name}
              </span>

              {/* Link buttons (shown on hover or when selected) */}
              <div className={`flex gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <button
                  onClick={(e) => { e.stopPropagation(); onLinkBody(node.path); }}
                  className={`
                    text-xs px-2 py-0.5 rounded transition-colors
                    ${isDark 
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }
                  `}
                  title="Link as Body"
                >
                  Body
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onLinkDoor(node.path); }}
                  className={`
                    text-xs px-2 py-0.5 rounded transition-colors
                    ${isDark 
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }
                  `}
                  title="Link as Door"
                >
                  Door
                </button>
              </div>
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
              <ModelHierarchyTree
                nodes={node.children}
                isDark={isDark}
                selectedPath={selectedPath}
                linkedPaths={linkedPaths}
                onSelect={onSelect}
                onLinkBody={onLinkBody}
                onLinkDoor={onLinkDoor}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface StorageLockerWizardProps {
  onSave: (asset: CreateAssetDefinitionInput | UpdateAssetDefinitionInput, assetId?: string) => Promise<void>;
  onClose: () => void;
  existingAsset?: AssetDefinition;
}

export const StorageLockerWizard: React.FC<StorageLockerWizardProps> = ({
  onSave,
  onClose,
  existingAsset,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Determine initial step based on whether we're editing
  const getInitialStep = (): WizardStep => {
    if (!existingAsset) return 'modeSelect';
    // For editing, skip mode selection and go to the first editable step
    return existingAsset.modelType === 'primitive' ? 'dimensions' : 'scale';
  };
  
  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [modelChanged, setModelChanged] = useState(false); // Track if user uploaded a new file
  
  // Initialize state from existing asset or defaults
  const initialState: LockerWizardState = existingAsset ? {
    mode: existingAsset.modelType === 'primitive' ? 'primitive' : 'upload',
    name: existingAsset.name,
    unitSystem: 'imperial',
    
    width: existingAsset.dimensions.width,
    height: existingAsset.dimensions.height,
    depth: existingAsset.dimensions.depth,
    
    doorSide: existingAsset.lockerSpec?.doorSide || 'front',
    doorWidth: existingAsset.lockerSpec?.doorWidth || feetToMeters(3),
    doorHeight: existingAsset.lockerSpec?.doorHeight || feetToMeters(6),
    doorPositionX: existingAsset.lockerSpec?.doorPositionX || 0,
    doorPositionY: existingAsset.lockerSpec?.doorPositionY || feetToMeters(0.5),
    doorCentered: Math.abs(existingAsset.lockerSpec?.doorPositionX || 0) < 0.01,
    
    scaleMode: 'uniform',
    scaleFactor: 1.0,
    originalWidth: existingAsset.dimensions.width,
    originalHeight: existingAsset.dimensions.height,
    originalDepth: existingAsset.dimensions.depth,
    
    physicalWidth: existingAsset.dimensions.width,
    physicalHeight: existingAsset.dimensions.height,
    physicalDepth: existingAsset.dimensions.depth,
    
    offsetX: existingAsset.positionOffset?.x || 0,
    offsetY: existingAsset.positionOffset?.y || 0,
    offsetZ: existingAsset.positionOffset?.z || 0,
    
    modelHierarchy: [],
    smartComponents: {},
    selectedComponentPath: null,
  } : {
    mode: null,
    name: 'Custom Storage Locker',
    unitSystem: 'imperial',
    
    width: feetToMeters(5),
    height: feetToMeters(8),
    depth: feetToMeters(5),
    
    doorSide: 'front',
    doorWidth: feetToMeters(3),
    doorHeight: feetToMeters(6),
    doorPositionX: 0,
    doorPositionY: feetToMeters(0.5),
    doorCentered: true,
    
    scaleMode: 'uniform',
    scaleFactor: 1.0,
    originalWidth: 1,
    originalHeight: 1,
    originalDepth: 1,
    
    physicalWidth: feetToMeters(5),
    physicalHeight: feetToMeters(8),
    physicalDepth: feetToMeters(5),
    
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    
    modelHierarchy: [],
    smartComponents: {},
    selectedComponentPath: null,
  };
  
  const [state, setState] = useState<LockerWizardState>(initialState);
  
  // Load existing model file when editing a custom model asset
  useEffect(() => {
    if (!existingAsset || existingAsset.modelType === 'primitive' || !existingAsset.globalModelId) {
      return;
    }
    
    const loadExistingModel = async () => {
      setIsLoadingModel(true);
      try {
        const { AssetService } = await import('../../services/AssetService');
        
        // Get the model URL and construct full API path
        const relativePath = AssetService.getGlobalModelUrl(existingAsset.globalModelId!);
        const { getApiBaseUrl } = await import('@/services/appConfig');
        const apiBaseUrl = getApiBaseUrl();
        const modelUrl = `${apiBaseUrl}/api/v1${relativePath}`;
        
        // Use axios directly with blob responseType since apiService.get returns JSON
        const axios = (await import('axios')).default;
        const token = localStorage.getItem('authToken');
        const response = await axios.get(modelUrl, {
          responseType: 'blob',
          headers: {
            'Authorization': token ? `Bearer ${token}` : undefined,
          },
        });
        
        const blob = response.data;
        
        // Determine filename from content-disposition header or use default
        const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
        let filename = 'model.glb';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match) {
            filename = match[1];
          }
        }
        
        // Create a File object from the blob
        const file = new File([blob], filename, { type: blob.type || 'model/gltf-binary' });
        
        // Update state with the loaded file
        setState(prev => ({ ...prev, uploadedFile: file }));
      } catch (err) {
        console.error('Failed to load existing model:', err);
        setError('Failed to load existing model. You can upload a new one.');
      } finally {
        setIsLoadingModel(false);
      }
    };
    
    loadExistingModel();
  }, [existingAsset]);
  
  // Convert dimension for display based on unit system
  const displayValue = useCallback((meters: number): number => {
    return state.unitSystem === 'imperial' 
      ? Math.round(metersToFeet(meters) * 100) / 100 
      : Math.round(meters * 100) / 100;
  }, [state.unitSystem]);
  
  const toMeters = useCallback((value: number): number => {
    return state.unitSystem === 'imperial' ? feetToMeters(value) : value;
  }, [state.unitSystem]);
  
  const unitSuffix = state.unitSystem === 'imperial' ? 'ft' : 'm';
  
  // Calculate grid units
  const gridUnits = useMemo(() => {
    return {
      x: Math.ceil(metersToGridUnits(state.width)),
      z: Math.ceil(metersToGridUnits(state.depth)),
    };
  }, [state.width, state.depth]);
  
  // Max door dimensions
  const maxDoorWidth = useMemo(() => 
    state.width - feetToMeters(0.5), 
    [state.width]
  );
  
  const maxDoorHeight = useMemo(() => 
    state.height - feetToMeters(1), 
    [state.height]
  );
  
  // Constrain door dimensions when locker dimensions change
  const constrainDoor = useCallback(() => {
    setState(prev => {
      let newDoorWidth = prev.doorWidth;
      let newDoorHeight = prev.doorHeight;
      let newPositionX = prev.doorPositionX;
      let newPositionY = prev.doorPositionY;
      
      if (newDoorWidth > maxDoorWidth) {
        newDoorWidth = maxDoorWidth;
      }
      if (newDoorHeight > maxDoorHeight) {
        newDoorHeight = maxDoorHeight;
      }
      
      const maxPositionOffset = (prev.width - newDoorWidth) / 2;
      if (Math.abs(newPositionX) > maxPositionOffset) {
        newPositionX = Math.sign(newPositionX) * maxPositionOffset;
      }
      
      if (newPositionY + newDoorHeight > prev.height - feetToMeters(0.25)) {
        newPositionY = Math.max(feetToMeters(0.25), prev.height - newDoorHeight - feetToMeters(0.25));
      }
      
      return {
        ...prev,
        doorWidth: newDoorWidth,
        doorHeight: newDoorHeight,
        doorPositionX: newPositionX,
        doorPositionY: Math.max(feetToMeters(0.25), newPositionY),
      };
    });
  }, [maxDoorWidth, maxDoorHeight]);
  
  // Update dimension and constrain door
  const updateDimension = useCallback((key: 'width' | 'height' | 'depth', value: number) => {
    const meters = toMeters(value);
    setState(prev => ({ ...prev, [key]: meters }));
    setTimeout(constrainDoor, 0);
  }, [toMeters, constrainDoor]);
  
  // Update physical dimension (for upload mode - dimensions mode)
  const updatePhysicalDimension = useCallback((key: 'physicalWidth' | 'physicalHeight' | 'physicalDepth', value: number) => {
    const meters = toMeters(value);
    setState(prev => {
      const newState = { ...prev, [key]: meters };
      // Also update the actual dimensions for grid calculation
      if (key === 'physicalWidth') newState.width = meters;
      if (key === 'physicalHeight') newState.height = meters;
      if (key === 'physicalDepth') newState.depth = meters;
      return newState;
    });
  }, [toMeters]);
  
  // Update scale factor (for upload mode - uniform mode)
  const updateScaleFactor = useCallback((factor: number) => {
    const clampedFactor = Math.max(CONSTRAINTS.minScale, Math.min(CONSTRAINTS.maxScale, factor));
    setState(prev => {
      // Calculate new dimensions from original size * scale factor
      const newWidth = prev.originalWidth * clampedFactor;
      const newHeight = prev.originalHeight * clampedFactor;
      const newDepth = prev.originalDepth * clampedFactor;
      return {
        ...prev,
        scaleFactor: clampedFactor,
        physicalWidth: newWidth,
        physicalHeight: newHeight,
        physicalDepth: newDepth,
        width: newWidth,
        height: newHeight,
        depth: newDepth,
      };
    });
  }, []);
  
  // Toggle scale mode
  const toggleScaleMode = useCallback((mode: ScaleMode) => {
    setState(prev => {
      if (mode === 'uniform') {
        // Switching to uniform - calculate current scale factor from width
        const factor = prev.originalWidth > 0 ? prev.physicalWidth / prev.originalWidth : 1;
        return { ...prev, scaleMode: mode, scaleFactor: factor };
      } else {
        // Switching to dimensions mode - keep current dimensions
        return { ...prev, scaleMode: mode };
      }
    });
  }, []);
  
  // Extract model hierarchy from THREE.js object
  const extractModelHierarchy = useCallback((object: THREE.Object3D, parentPath: string = ''): ModelNode[] => {
    const nodes: ModelNode[] = [];
    
    object.children.forEach((child, index) => {
      const name = child.name || `Object_${index}`;
      const path = parentPath ? `${parentPath}/${name}` : name;
      const type = child.type === 'Mesh' ? 'mesh' : 'group';
      
      nodes.push({
        name,
        path,
        type: type as 'mesh' | 'group',
        children: extractModelHierarchy(child, path),
      });
    });
    
    return nodes;
  }, []);
  
  // Set original dimensions from loaded model
  const setOriginalDimensionsFromModel = useCallback((width: number, height: number, depth: number) => {
    setState(prev => ({
      ...prev,
      originalWidth: width,
      originalHeight: height,
      originalDepth: depth,
      // Initialize physical dimensions to match original (scale factor 1.0)
      physicalWidth: width,
      physicalHeight: height,
      physicalDepth: depth,
      width: width,
      height: height,
      depth: depth,
      scaleFactor: 1.0,
    }));
  }, []);
  
  // Update smart component mapping
  const updateSmartComponent = useCallback((component: 'body' | 'door', path: string | undefined) => {
    setState(prev => ({
      ...prev,
      smartComponents: {
        ...prev.smartComponents,
        [component]: path,
      },
    }));
  }, []);
  
  // Set selected component for highlighting
  const setSelectedComponentPath = useCallback((path: string | null) => {
    setState(prev => ({ ...prev, selectedComponentPath: path }));
  }, []);
  
  // Update offset
  const updateOffset = useCallback((key: 'offsetX' | 'offsetY' | 'offsetZ', value: number) => {
    const meters = toMeters(value);
    setState(prev => ({ ...prev, [key]: meters }));
  }, [toMeters]);
  
  // Update door configuration
  const updateDoorConfig = useCallback((updates: Partial<LockerWizardState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      
      // If centered toggle changed to true, reset X position
      if (updates.doorCentered === true) {
        newState.doorPositionX = 0;
      }
      
      // If door side changed, reset position
      if (updates.doorSide && updates.doorSide !== prev.doorSide) {
        newState.doorPositionX = 0;
        newState.doorCentered = true;
      }
      
      return newState;
    });
    setTimeout(constrainDoor, 0);
  }, [constrainDoor]);
  
  // Create locker spec from state
  const lockerSpec: LockerSpec = useMemo(() => ({
    doorSide: state.doorSide,
    doorWidth: state.doorWidth,
    doorHeight: state.doorHeight,
    doorPositionX: state.doorPositionX,
    doorPositionY: state.doorPositionY,
  }), [state.doorSide, state.doorWidth, state.doorHeight, state.doorPositionX, state.doorPositionY]);
  
  // Memoize dimensions to prevent unnecessary re-renders of the preview
  const previewDimensions = useMemo(() => ({
    width: state.width,
    height: state.height,
    depth: state.depth,
  }), [state.width, state.height, state.depth]);
  
  // Memoize offset to prevent unnecessary re-renders of the preview
  const previewOffset = useMemo(() => 
    state.mode === 'upload' 
      ? { x: state.offsetX, y: state.offsetY, z: state.offsetZ } 
      : undefined,
    [state.mode, state.offsetX, state.offsetY, state.offsetZ]
  );
  
  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      // Determine globalModelId and modelType based on mode and whether file changed
      let globalModelId: string | undefined;
      let modelType: 'primitive' | 'gltf' | 'glb' | 'custom' = 'primitive';
      
      if (state.mode === 'upload' && state.uploadedFile) {
        // Determine if we need to upload a new model
        const needsUpload = !existingAsset || modelChanged || !existingAsset.globalModelId;
        
        if (needsUpload) {
          // Upload the model file
          const { AssetService } = await import('../../services/AssetService');
          const globalModel = await AssetService.uploadGlobalModel(
            state.uploadedFile,
            state.name,
            `Custom storage locker model`
          );
          globalModelId = globalModel.id;
        } else {
          // Keep existing model
          globalModelId = existingAsset.globalModelId;
        }
        
        // Detect model type from file extension
        const ext = state.uploadedFile.name.toLowerCase().split('.').pop();
        if (ext === 'glb') modelType = 'glb';
        else if (ext === 'gltf') modelType = 'gltf';
        else if (ext === 'fbx' || ext === 'obj') modelType = 'custom';
        else modelType = 'glb'; // Default fallback
      } else if (state.mode === 'upload' && existingAsset?.globalModelId) {
        // Editing a custom model but uploadedFile somehow not loaded - keep existing
        globalModelId = existingAsset.globalModelId;
        modelType = existingAsset.modelType as 'primitive' | 'gltf' | 'glb' | 'custom';
      }
      
      const assetInput: CreateAssetDefinitionInput | UpdateAssetDefinitionInput = {
        name: state.name,
        description: state.mode === 'upload' 
          ? `Custom storage locker (uploaded model)`
          : `Custom storage locker (${displayValue(state.width)}×${displayValue(state.depth)} ${unitSuffix})`,
        category: existingAsset ? undefined : AssetCategory.STORAGE_UNIT,
        modelType,
        globalModelId,
        dimensions: {
          width: state.width,
          height: state.height,
          depth: state.depth,
        },
        gridUnits,
        isSmart: existingAsset ? existingAsset.isSmart : true,
        canRotate: existingAsset ? existingAsset.canRotate : true,
        canStack: existingAsset ? existingAsset.canStack : false,
        lockerSpec: state.mode === 'primitive' ? lockerSpec : undefined,
        positionOffset: state.mode === 'upload' ? {
          x: state.offsetX,
          y: state.offsetY,
          z: state.offsetZ,
        } : undefined,
      };
      
      await onSave(assetInput, existingAsset?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asset');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Step navigation - when editing, skip mode selection and upload steps
  const getPrimitiveSteps = (): PrimitiveStep[] => {
    if (existingAsset) {
      return ['dimensions', 'door', 'review']; // Skip mode select when editing
    }
    return ['modeSelect', 'dimensions', 'door', 'review'];
  };
  
  const getUploadSteps = (): UploadStep[] => {
    if (existingAsset) {
      return ['scale', 'offset', 'components', 'review']; // Skip mode select and upload when editing
    }
    return ['modeSelect', 'upload', 'scale', 'offset', 'components', 'review'];
  };
  
  const steps = state.mode === 'primitive' ? getPrimitiveSteps() : getUploadSteps();
  const currentStepIndex = steps.indexOf(step as any);
  const canGoNext = currentStepIndex < steps.length - 1 && (
    step !== 'modeSelect' || state.mode !== null
  ) && (
    step !== 'upload' || state.uploadedFile !== undefined
  ) && !isLoadingModel; // Don't allow next while loading model
  const canGoBack = currentStepIndex > 0;
  
  const goNext = () => {
    if (canGoNext) {
      setStep(steps[currentStepIndex + 1] as WizardStep);
    }
  };
  
  const goBack = () => {
    if (canGoBack) {
      const prevStep = steps[currentStepIndex - 1];
      // If going back to mode select, reset mode
      if (prevStep === 'modeSelect') {
        setState(prev => ({ ...prev, mode: null, uploadedFile: undefined }));
      }
      setStep(prevStep as WizardStep);
    }
  };
  
  // Mode selection handler
  const handleModeSelect = (mode: WizardMode) => {
    setState(prev => ({ ...prev, mode }));
    setStep(mode === 'primitive' ? 'dimensions' : 'upload');
  };
  
  // File upload handler
  const handleFileUpload = (file: File) => {
    setState(prev => ({ ...prev, uploadedFile: file }));
    setModelChanged(true); // User explicitly uploaded a new file
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`
          relative w-full max-w-6xl max-h-[90vh] mx-4 rounded-xl shadow-2xl overflow-hidden flex flex-col
          ${isDark ? 'bg-gray-900' : 'bg-white'}
        `}
      >
        {/* Header */}
        <div className={`
          flex-shrink-0 flex items-center justify-between p-6 border-b
          ${isDark ? 'border-gray-700' : 'border-gray-200'}
        `}>
          <div>
            <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {existingAsset ? 'Edit' : 'Create'} Storage Locker
            </h2>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {step === 'modeSelect' && 'Choose how to create your asset'}
              {step === 'dimensions' && 'Set the overall dimensions'}
              {step === 'door' && 'Configure door placement'}
              {step === 'upload' && 'Upload your 3D model'}
              {step === 'scale' && 'Set physical dimensions'}
              {step === 'offset' && 'Adjust position on grid'}
              {step === 'components' && 'Configure smart components (optional)'}
              {step === 'review' && 'Review and save'}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-lg transition-colors
              ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
            `}
          >
            <XMarkIcon className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel - Form */}
          <div className="w-1/2 p-6 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Step: Mode Selection */}
                {step === 'modeSelect' && (
                  <div className="space-y-4">
                    <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      How would you like to create your locker?
                    </h3>
                    
                    <button
                      onClick={() => handleModeSelect('primitive')}
                      className={`
                        w-full p-6 rounded-lg border-2 text-left transition-all
                        ${state.mode === 'primitive'
                          ? 'border-primary-500 bg-primary-500/10'
                          : isDark
                            ? 'border-gray-700 hover:border-gray-600'
                            : 'border-gray-300 hover:border-gray-400'
                        }
                      `}
                    >
                      <div className="flex items-start gap-4">
                        <CubeIcon className="w-8 h-8 text-primary-500 flex-shrink-0" />
                        <div>
                          <h4 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Build from Dimensions
                          </h4>
                          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Create a locker by specifying dimensions and door configuration. 
                            Perfect for standard rectangular storage units.
                          </p>
                        </div>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => handleModeSelect('upload')}
                      className={`
                        w-full p-6 rounded-lg border-2 text-left transition-all
                        ${state.mode === 'upload'
                          ? 'border-primary-500 bg-primary-500/10'
                          : isDark
                            ? 'border-gray-700 hover:border-gray-600'
                            : 'border-gray-300 hover:border-gray-400'
                        }
                      `}
                    >
                      <div className="flex items-start gap-4">
                        <ArrowUpTrayIcon className="w-8 h-8 text-primary-500 flex-shrink-0" />
                        <div>
                          <h4 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Upload 3D Model
                          </h4>
                          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Upload a custom 3D model (GLB, GLTF, or FBX). 
                            Ideal for unique shapes and detailed designs.
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Step: Dimensions (Primitive) */}
                {step === 'dimensions' && state.mode === 'primitive' && (
                  <>
                    {/* Name */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Locker Name
                      </label>
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => setState(prev => ({ ...prev, name: e.target.value }))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Unit System Toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setState(prev => ({ ...prev, unitSystem: 'imperial' }))}
                        className={`
                          flex-1 px-4 py-2 rounded-lg transition-colors
                          ${state.unitSystem === 'imperial'
                            ? 'bg-primary-500 text-white'
                            : isDark
                              ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
                        `}
                      >
                        Feet
                      </button>
                      <button
                        onClick={() => setState(prev => ({ ...prev, unitSystem: 'metric' }))}
                        className={`
                          flex-1 px-4 py-2 rounded-lg transition-colors
                          ${state.unitSystem === 'metric'
                            ? 'bg-primary-500 text-white'
                            : isDark
                              ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
                        `}
                      >
                        Meters
                      </button>
                    </div>

                    {/* Width */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Width ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                        min={state.unitSystem === 'imperial' ? CONSTRAINTS.minWidth : feetToMeters(CONSTRAINTS.minWidth)}
                        max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxWidth : feetToMeters(CONSTRAINTS.maxWidth)}
                        value={displayValue(state.width)}
                        onChange={(e) => updateDimension('width', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Height */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Height ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                        min={state.unitSystem === 'imperial' ? CONSTRAINTS.minHeight : feetToMeters(CONSTRAINTS.minHeight)}
                        max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxHeight : feetToMeters(CONSTRAINTS.maxHeight)}
                        value={displayValue(state.height)}
                        onChange={(e) => updateDimension('height', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Depth */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Depth ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                        min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDepth : feetToMeters(CONSTRAINTS.minDepth)}
                        max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxDepth : feetToMeters(CONSTRAINTS.maxDepth)}
                        value={displayValue(state.depth)}
                        onChange={(e) => updateDimension('depth', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Grid footprint info */}
                    <div className={`
                      p-4 rounded-lg border
                      ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                    `}>
                      <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Grid Footprint: {gridUnits.x} × {gridUnits.z} tiles
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                        1 grid tile = 2 feet (0.6096 m)
                      </p>
                    </div>
                  </>
                )}

                {/* Step: Door Configuration (Primitive) */}
                {step === 'door' && state.mode === 'primitive' && (
                  <>
                    {/* Door Side */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Door Side
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['front', 'back', 'left', 'right'] as DoorSide[]).map(side => (
                          <button
                            key={side}
                            onClick={() => updateDoorConfig({ doorSide: side })}
                            className={`
                              px-4 py-2 rounded-lg capitalize transition-colors
                              ${state.doorSide === side
                                ? 'bg-primary-500 text-white'
                                : isDark
                                  ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }
                            `}
                          >
                            {side}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Door Width */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Door Width ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                        min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDoorWidth : feetToMeters(CONSTRAINTS.minDoorWidth)}
                        max={displayValue(maxDoorWidth)}
                        value={displayValue(state.doorWidth)}
                        onChange={(e) => updateDoorConfig({ doorWidth: toMeters(parseFloat(e.target.value)) })}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Door Height */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Door Height ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                        min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDoorHeight : feetToMeters(CONSTRAINTS.minDoorHeight)}
                        max={displayValue(maxDoorHeight)}
                        value={displayValue(state.doorHeight)}
                        onChange={(e) => updateDoorConfig({ doorHeight: toMeters(parseFloat(e.target.value)) })}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* Door Position X */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Door Horizontal Position ({unitSuffix})
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={state.doorCentered}
                            onChange={(e) => updateDoorConfig({ doorCentered: e.target.checked })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Center
                          </span>
                        </label>
                      </div>
                      <input
                        type="range"
                        value={displayValue(state.doorPositionX)}
                        onChange={(e) => updateDoorConfig({ doorPositionX: toMeters(parseFloat(e.target.value)) })}
                        min={-displayValue((state.width - state.doorWidth) / 2)}
                        max={displayValue((state.width - state.doorWidth) / 2)}
                        step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                        disabled={state.doorCentered}
                        className={`w-full ${state.doorCentered ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                      <p className={`text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Offset: {displayValue(state.doorPositionX)} {unitSuffix}
                      </p>
                    </div>

                    {/* Door Position Y */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Door Vertical Position ({unitSuffix})
                      </label>
                      <input
                        type="range"
                        value={displayValue(state.doorPositionY)}
                        onChange={(e) => updateDoorConfig({ doorPositionY: toMeters(parseFloat(e.target.value)) })}
                        min={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                        max={displayValue(state.height - state.doorHeight - feetToMeters(0.25))}
                        step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                        className="w-full"
                      />
                      <p className={`text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        From bottom: {displayValue(state.doorPositionY)} {unitSuffix}
                      </p>
                    </div>
                  </>
                )}

                {/* Step: Upload Model */}
                {step === 'upload' && state.mode === 'upload' && (
                  <>
                    {/* Name */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Locker Name
                      </label>
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => setState(prev => ({ ...prev, name: e.target.value }))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                    </div>

                    {/* File Upload */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        3D Model File
                      </label>
                      <div className={`
                        border-2 border-dashed rounded-lg p-8 text-center
                        ${isDark ? 'border-gray-700' : 'border-gray-300'}
                      `}>
                        <input
                          type="file"
                          id="model-upload"
                          accept=".glb,.gltf,.fbx"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                          className="hidden"
                        />
                        <label
                          htmlFor="model-upload"
                          className="cursor-pointer"
                        >
                          <ArrowUpTrayIcon className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                          <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {state.uploadedFile ? state.uploadedFile.name : 'Click to upload or drag and drop'}
                          </p>
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                            GLB, GLTF, or FBX (max 100MB)
                          </p>
                        </label>
                      </div>
                    </div>

                    {state.uploadedFile && (
                      <div className={`
                        p-4 rounded-lg border
                        ${isDark ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'}
                      `}>
                        <p className={`text-sm font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          ✓ File uploaded successfully
                        </p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-green-500/70' : 'text-green-700'}`}>
                          {state.uploadedFile.name} ({(state.uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Step: Scale (Upload) */}
                {step === 'scale' && state.mode === 'upload' && (
                  <>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Scale your model to real-world dimensions. Use uniform scaling to maintain proportions, 
                      or set each dimension independently.
                    </p>

                    {/* Scaling Mode Toggle */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Scaling Mode
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleScaleMode('uniform')}
                          className={`
                            flex-1 px-4 py-2 rounded-lg transition-colors
                            ${state.scaleMode === 'uniform'
                              ? 'bg-primary-500 text-white'
                              : isDark
                                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                        >
                          Uniform Scale
                        </button>
                        <button
                          onClick={() => toggleScaleMode('dimensions')}
                          className={`
                            flex-1 px-4 py-2 rounded-lg transition-colors
                            ${state.scaleMode === 'dimensions'
                              ? 'bg-primary-500 text-white'
                              : isDark
                                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                        >
                          Set Dimensions
                        </button>
                      </div>
                    </div>

                    {/* Unit System Toggle */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Unit System
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setState(prev => ({ ...prev, unitSystem: 'imperial' }))}
                          className={`
                            flex-1 px-4 py-2 rounded-lg transition-colors
                            ${state.unitSystem === 'imperial'
                              ? 'bg-primary-500 text-white'
                              : isDark
                                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                        >
                          Feet
                        </button>
                        <button
                          onClick={() => setState(prev => ({ ...prev, unitSystem: 'metric' }))}
                          className={`
                            flex-1 px-4 py-2 rounded-lg transition-colors
                            ${state.unitSystem === 'metric'
                              ? 'bg-primary-500 text-white'
                              : isDark
                                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
                          `}
                        >
                          Meters
                        </button>
                      </div>
                    </div>

                    {/* Uniform Scale Mode */}
                    {state.scaleMode === 'uniform' && (
                      <>
                        {/* Scale Factor */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Scale Factor: {(state.scaleFactor * 100).toFixed(0)}%
                          </label>
                          <input
                            type="range"
                            min={CONSTRAINTS.minScale}
                            max={10}
                            step={0.01}
                            value={state.scaleFactor}
                            onChange={(e) => updateScaleFactor(parseFloat(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex justify-between mt-1">
                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>1%</span>
                            <input
                              type="number"
                              step={0.1}
                              min={CONSTRAINTS.minScale}
                              max={CONSTRAINTS.maxScale}
                              value={Math.round(state.scaleFactor * 100) / 100}
                              onChange={(e) => updateScaleFactor(parseFloat(e.target.value) || 1)}
                              className={`
                                w-20 px-2 py-1 text-center text-sm rounded border
                                ${isDark 
                                  ? 'bg-gray-800 border-gray-700 text-white' 
                                  : 'bg-white border-gray-300 text-gray-900'
                                }
                              `}
                            />
                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>1000%</span>
                          </div>
                        </div>

                        {/* Resulting Dimensions (readonly) */}
                        <div className={`
                          p-4 rounded-lg border
                          ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                        `}>
                          <p className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Resulting Dimensions
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Width</p>
                              <p className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {displayValue(state.physicalWidth).toFixed(2)} {unitSuffix}
                              </p>
                            </div>
                            <div>
                              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Height</p>
                              <p className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {displayValue(state.physicalHeight).toFixed(2)} {unitSuffix}
                              </p>
                            </div>
                            <div>
                              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Depth</p>
                              <p className={`font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {displayValue(state.physicalDepth).toFixed(2)} {unitSuffix}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Original Model Size Info */}
                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Original model size: {displayValue(state.originalWidth).toFixed(2)} × {displayValue(state.originalHeight).toFixed(2)} × {displayValue(state.originalDepth).toFixed(2)} {unitSuffix}
                        </div>
                      </>
                    )}

                    {/* Dimensions Mode */}
                    {state.scaleMode === 'dimensions' && (
                      <>
                        {/* Physical Width */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Width ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            min={0.01}
                            value={displayValue(state.physicalWidth)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) {
                                updatePhysicalDimension('physicalWidth', val);
                              }
                            }}
                            className={`
                              w-full px-4 py-2 rounded-lg border
                              ${isDark 
                                ? 'bg-gray-800 border-gray-700 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                              }
                            `}
                          />
                        </div>

                        {/* Physical Height */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Height ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            min={0.01}
                            value={displayValue(state.physicalHeight)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) {
                                updatePhysicalDimension('physicalHeight', val);
                              }
                            }}
                            className={`
                              w-full px-4 py-2 rounded-lg border
                              ${isDark 
                                ? 'bg-gray-800 border-gray-700 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                              }
                            `}
                          />
                        </div>

                        {/* Physical Depth */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Depth ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            min={0.01}
                            value={displayValue(state.physicalDepth)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) {
                                updatePhysicalDimension('physicalDepth', val);
                              }
                            }}
                            className={`
                              w-full px-4 py-2 rounded-lg border
                              ${isDark 
                                ? 'bg-gray-800 border-gray-700 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                              }
                            `}
                          />
                        </div>
                      </>
                    )}

                    {/* Grid footprint info */}
                    <div className={`
                      p-4 rounded-lg border
                      ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                    `}>
                      <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Grid Footprint: {gridUnits.x} × {gridUnits.z} tiles
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                        1 grid tile = 2 feet (0.6096 m)
                      </p>
                    </div>
                  </>
                )}

                {/* Step: Offset (Upload) */}
                {step === 'offset' && state.mode === 'upload' && (
                  <>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Adjust the position offset to align your model. By default, the model's bottom 
                      sits on the ground (Y=0). Use the "Ground Model" button to reset to flush with ground.
                    </p>

                    {/* Offset X */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        X Offset ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.1 : 0.05}
                        value={displayValue(state.offsetX)}
                        onChange={(e) => updateOffset('offsetX', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                        Positive = right, Negative = left
                      </p>
                    </div>

                    {/* Offset Y */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Y Offset ({unitSuffix})
                        </label>
                        <button
                          onClick={() => setState(prev => ({ ...prev, offsetY: 0 }))}
                          className={`
                            text-xs px-3 py-1 rounded-lg transition-colors
                            ${isDark
                              ? 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30'
                              : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                            }
                          `}
                          title="Places the bottom of the model flush with the ground"
                        >
                          Ground Model
                        </button>
                      </div>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.1 : 0.05}
                        value={displayValue(state.offsetY)}
                        onChange={(e) => updateOffset('offsetY', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                        Positive = up, Negative = down (0 = flush with ground)
                      </p>
                    </div>

                    {/* Offset Z */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Z Offset ({unitSuffix})
                      </label>
                      <input
                        type="number"
                        step={state.unitSystem === 'imperial' ? 0.1 : 0.05}
                        value={displayValue(state.offsetZ)}
                        onChange={(e) => updateOffset('offsetZ', parseFloat(e.target.value))}
                        className={`
                          w-full px-4 py-2 rounded-lg border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-700 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                        `}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                        Positive = forward, Negative = backward
                      </p>
                    </div>

                    {/* Quick Reset */}
                    <button
                      onClick={() => setState(prev => ({ ...prev, offsetX: 0, offsetY: 0, offsetZ: 0 }))}
                      className={`
                        w-full px-4 py-2 rounded-lg transition-colors
                        ${isDark
                          ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      Reset to Center
                    </button>
                  </>
                )}

                {/* Step: Smart Components (Upload) */}
                {step === 'components' && state.mode === 'upload' && (
                  <>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Link parts of your model to smart components. This enables features like door animations.
                      This step is optional - you can skip it if your model doesn't have separate parts.
                    </p>

                    {/* Component Mapping */}
                    <div className="space-y-4">
                      {/* Body Component */}
                      <div className={`
                        p-4 rounded-lg border
                        ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                      `}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CubeIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              Body (Main Structure)
                            </span>
                          </div>
                          {state.smartComponents.body && (
                            <button
                              onClick={() => updateSmartComponent('body', undefined)}
                              className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          The static main body of the locker
                        </p>
                        {state.smartComponents.body ? (
                          <div className={`
                            flex items-center gap-2 px-3 py-2 rounded
                            ${isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'}
                          `}>
                            <LinkIcon className="w-4 h-4" />
                            <span className="text-sm font-mono truncate">{state.smartComponents.body}</span>
                          </div>
                        ) : (
                          <p className={`text-sm italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            Not linked - select from model tree below
                          </p>
                        )}
                      </div>

                      {/* Door Component */}
                      <div className={`
                        p-4 rounded-lg border
                        ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                      `}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ArrowRightIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              Door (Animated)
                            </span>
                          </div>
                          {state.smartComponents.door && (
                            <button
                              onClick={() => updateSmartComponent('door', undefined)}
                              className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          The door that opens/closes (will be animated)
                        </p>
                        {state.smartComponents.door ? (
                          <div className={`
                            flex items-center gap-2 px-3 py-2 rounded
                            ${isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'}
                          `}>
                            <LinkIcon className="w-4 h-4" />
                            <span className="text-sm font-mono truncate">{state.smartComponents.door}</span>
                          </div>
                        ) : (
                          <p className={`text-sm italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            Not linked - select from model tree below
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Model Hierarchy Tree */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Model Hierarchy
                      </label>
                      {state.modelHierarchy.length > 0 ? (
                        <div className={`
                          max-h-64 overflow-y-auto rounded-lg border p-2
                          ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                        `}>
                          <ModelHierarchyTree
                            nodes={state.modelHierarchy}
                            isDark={isDark}
                            selectedPath={state.selectedComponentPath}
                            linkedPaths={[state.smartComponents.body, state.smartComponents.door].filter(Boolean) as string[]}
                            onSelect={(path) => setSelectedComponentPath(path)}
                            onLinkBody={(path) => updateSmartComponent('body', path)}
                            onLinkDoor={(path) => updateSmartComponent('door', path)}
                          />
                        </div>
                      ) : (
                        <div className={`
                          p-4 rounded-lg border text-center
                          ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                        `}>
                          <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            Model hierarchy will appear here after loading
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Auto-detect hint */}
                    <div className={`
                      p-3 rounded-lg border
                      ${isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}
                    `}>
                      <p className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                        <strong>Tip:</strong> Name your model parts "body" and "door" in your 3D software 
                        for automatic detection.
                      </p>
                    </div>
                  </>
                )}

                {/* Step: Review */}
                {step === 'review' && (
                  <>
                    <div className={`
                      p-4 rounded-lg border
                      ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                    `}>
                      <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {state.name}
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Type</span>
                          <span className={`font-medium capitalize ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {state.mode === 'primitive' ? 'Built from Dimensions' : 'Uploaded Model'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Dimensions</span>
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {displayValue(state.width)} × {displayValue(state.height)} × {displayValue(state.depth)} {unitSuffix}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Grid Footprint</span>
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {gridUnits.x} × {gridUnits.z} tiles
                          </span>
                        </div>
                        {state.mode === 'primitive' && (
                          <>
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Door Side</span>
                              <span className={`font-medium capitalize ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {state.doorSide}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Door Size</span>
                              <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {displayValue(state.doorWidth)} × {displayValue(state.doorHeight)} {unitSuffix}
                              </span>
                            </div>
                          </>
                        )}
                        {state.mode === 'upload' && (
                          <>
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Model File</span>
                              <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'} truncate max-w-xs`}>
                                {state.uploadedFile?.name || 'None'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Scale Mode</span>
                              <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {state.scaleMode === 'uniform' ? `Uniform (${(state.scaleFactor * 100).toFixed(0)}%)` : 'Custom Dimensions'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Position Offset</span>
                              <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                X:{displayValue(state.offsetX)} Y:{displayValue(state.offsetY)} Z:{displayValue(state.offsetZ)} {unitSuffix}
                              </span>
                            </div>
                            {(state.smartComponents.body || state.smartComponents.door) && (
                              <>
                                <div className="flex justify-between">
                                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Body Component</span>
                                  <span className={`font-medium font-mono text-xs ${state.smartComponents.body ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-500' : 'text-gray-400')}`}>
                                    {state.smartComponents.body || 'Not linked'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Door Component</span>
                                  <span className={`font-medium font-mono text-xs ${state.smartComponents.door ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-500' : 'text-gray-400')}`}>
                                    {state.smartComponents.door || 'Not linked'}
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Smart Asset</span>
                          <span className={`font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            Yes
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {error && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                        {error}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right panel - 3D Preview */}
          <div className={`
            w-1/2 border-l relative
            ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}
          `}>
            {step !== 'modeSelect' && !isLoadingModel && (
              <LockerPreview3D
                dimensions={previewDimensions}
                lockerSpec={lockerSpec}
                gridUnits={gridUnits}
                uploadedFile={state.uploadedFile}
                offset={previewOffset}
                scaleMode={state.scaleMode}
                highlightedPath={step === 'components' ? state.selectedComponentPath : null}
                onModelLoaded={(data) => {
                  // Set original dimensions and model hierarchy when model loads
                  setOriginalDimensionsFromModel(data.dimensions.width, data.dimensions.height, data.dimensions.depth);
                  setState(prev => ({ ...prev, modelHierarchy: data.hierarchy }));
                }}
              />
            )}
            {isLoadingModel && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`
                    animate-spin w-12 h-12 border-4 border-t-primary-500 rounded-full mx-auto mb-4
                    ${isDark ? 'border-gray-700' : 'border-gray-300'}
                  `} />
                  <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                    Loading existing model...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Navigation */}
        <div className={`
          flex-shrink-0 flex items-center justify-between p-6 border-t
          ${isDark ? 'border-gray-700' : 'border-gray-200'}
        `}>
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
              ${canGoBack
                ? isDark
                  ? 'text-gray-300 hover:bg-gray-800'
                  : 'text-gray-700 hover:bg-gray-100'
                : 'text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`
                  w-2 h-2 rounded-full transition-colors
                  ${i === currentStepIndex
                    ? 'bg-primary-500'
                    : i < currentStepIndex
                      ? 'bg-primary-500/50'
                      : isDark
                        ? 'bg-gray-700'
                        : 'bg-gray-300'
                  }
                `}
              />
            ))}
          </div>

          {step !== 'review' ? (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className={`
                flex items-center gap-2 px-6 py-2 rounded-lg transition-colors font-medium
                ${canGoNext
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }
              `}
            >
              Next
              <ArrowRightIcon className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`
                flex items-center gap-2 px-6 py-2 rounded-lg transition-colors font-medium
                ${isSaving
                  ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                  : 'bg-primary-500 text-white hover:bg-primary-600'
                }
              `}
            >
              <CheckIcon className="w-5 h-5" />
              {isSaving ? 'Saving...' : 'Save Locker'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
