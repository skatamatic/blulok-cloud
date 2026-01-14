/**
 * Locker Model Upload
 * 
 * Component for uploading GLB/FBX models and selecting parts for the locker.
 * Features:
 * - Drag and drop file upload
 * - Model parsing to extract mesh parts
 * - Part assignment (body, door, frame, other)
 * - Live preview of uploaded model
 */

import React, { useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  CubeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

type PartType = 'body' | 'door' | 'frame' | 'other';

interface LockerModelUploadProps {
  state: {
    uploadedFile?: File;
    modelParts: string[];
    selectedParts: Record<string, PartType>;
  };
  onStateChange: (updates: Partial<LockerModelUploadProps['state']>) => void;
}

const PART_COLORS: Record<PartType, string> = {
  body: '#147FD4',
  door: '#10B981',
  frame: '#F59E0B',
  other: '#6B7280',
};

const ACCEPTED_FORMATS = [
  '.glb',
  '.gltf',
  '.fbx',
];

export const LockerModelUpload: React.FC<LockerModelUploadProps> = ({
  state,
  onStateChange,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setModelPreview] = useState<string | null>(null);
  
  // Parse model to extract parts
  const parseModel = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const extension = file.name.toLowerCase().split('.').pop();
      const url = URL.createObjectURL(file);
      
      let scene: THREE.Object3D;
      
      if (extension === 'glb' || extension === 'gltf') {
        const loader = new GLTFLoader();
        const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
        scene = gltf.scene;
      } else if (extension === 'fbx') {
        const loader = new FBXLoader();
        scene = await new Promise<THREE.Object3D>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
      } else {
        throw new Error(`Unsupported format: .${extension}`);
      }
      
      // Extract mesh names
      const parts: string[] = [];
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name) {
          parts.push(child.name);
        } else if (child instanceof THREE.Group && child.name && child.name !== 'Scene') {
          parts.push(child.name);
        }
      });
      
      // Auto-assign parts based on name
      const selectedParts: Record<string, PartType> = {};
      parts.forEach((partName) => {
        const lowerName = partName.toLowerCase();
        if (lowerName.includes('door')) {
          selectedParts[partName] = 'door';
        } else if (lowerName.includes('frame')) {
          selectedParts[partName] = 'frame';
        } else if (lowerName.includes('body') || lowerName.includes('main') || lowerName.includes('box')) {
          selectedParts[partName] = 'body';
        } else {
          selectedParts[partName] = 'other';
        }
      });
      
      onStateChange({
        uploadedFile: file,
        modelParts: parts,
        selectedParts,
      });
      
      // Create preview thumbnail
      setModelPreview(url);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse model');
    } finally {
      setIsLoading(false);
    }
  }, [onStateChange]);
  
  // Handle file selection
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const extension = '.' + file.name.toLowerCase().split('.').pop();
    
    if (!ACCEPTED_FORMATS.includes(extension)) {
      setError(`Unsupported format. Please use: ${ACCEPTED_FORMATS.join(', ')}`);
      return;
    }
    
    parseModel(file);
  }, [parseModel]);
  
  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);
  
  // Clear uploaded file
  const clearFile = useCallback(() => {
    onStateChange({
      uploadedFile: undefined,
      modelParts: [],
      selectedParts: {},
    });
    setModelPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onStateChange]);
  
  // Update part assignment
  const updatePartType = useCallback((partName: string, type: PartType) => {
    onStateChange({
      selectedParts: {
        ...state.selectedParts,
        [partName]: type,
      },
    });
  }, [onStateChange, state.selectedParts]);
  
  return (
    <div className="space-y-6">
      {/* File Upload Zone */}
      {!state.uploadedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer
            ${isDragging
              ? isDark ? 'border-primary-500 bg-primary-900/20' : 'border-primary-500 bg-primary-50'
              : isDark ? 'border-gray-600 hover:border-gray-500 bg-gray-800/50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }
          `}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS.join(',')}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          
          <div className="flex flex-col items-center text-center">
            {isLoading ? (
              <>
                <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-4" />
                <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                  Loading model...
                </p>
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className={`w-12 h-12 mb-4 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Drop your 3D model here
                </p>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  or click to browse
                </p>
                <p className={`text-xs mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Supported: GLB, GLTF, FBX
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Uploaded File Info */}
          <div className={`
            flex items-center justify-between p-4 rounded-lg border
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
          `}>
            <div className="flex items-center gap-3">
              <div className={`
                p-2 rounded-lg
                ${isDark ? 'bg-primary-900/50' : 'bg-primary-100'}
              `}>
                <DocumentIcon className={`w-6 h-6 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
              </div>
              <div>
                <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {state.uploadedFile.name}
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {(state.uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={clearFile}
              className={`
                p-2 rounded-lg transition-colors
                ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}
              `}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          
          {/* Parts List */}
          {state.modelParts.length > 0 ? (
            <div>
              <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Model Parts ({state.modelParts.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {state.modelParts.map((partName) => (
                  <div
                    key={partName}
                    className={`
                      flex items-center justify-between p-3 rounded-lg border transition-colors
                      ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <CubeIcon className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {partName}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {(['body', 'door', 'frame', 'other'] as PartType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => updatePartType(partName, type)}
                          className={`
                            px-2 py-1 text-xs font-medium rounded capitalize transition-all
                            ${state.selectedParts[partName] === type
                              ? 'ring-2 ring-offset-1'
                              : 'opacity-50 hover:opacity-100'
                            }
                            ${isDark ? 'ring-offset-gray-800' : 'ring-offset-white'}
                          `}
                          style={{
                            backgroundColor: PART_COLORS[type] + '20',
                            color: PART_COLORS[type],
                            borderColor: PART_COLORS[type],
                            ...(state.selectedParts[partName] === type && {
                              ringColor: PART_COLORS[type],
                            }),
                          }}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Part Assignment Summary */}
              <div className={`
                mt-4 p-4 rounded-lg border
                ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}
              `}>
                <h5 className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Part Assignment Summary
                </h5>
                <div className="flex flex-wrap gap-3">
                  {(['body', 'door', 'frame', 'other'] as PartType[]).map((type) => {
                    const count = Object.values(state.selectedParts).filter(t => t === type).length;
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: PART_COLORS[type] }}
                        />
                        <span className={`text-sm capitalize ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {type}: {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Validation */}
              {!Object.values(state.selectedParts).includes('body') && (
                <p className="mt-3 text-sm text-amber-500">
                  ⚠️ At least one part should be assigned as "body"
                </p>
              )}
              {!Object.values(state.selectedParts).includes('door') && (
                <p className="text-sm text-amber-500">
                  ⚠️ At least one part should be assigned as "door" for smart functionality
                </p>
              )}
            </div>
          ) : (
            <div className={`
              p-4 rounded-lg border text-center
              ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'}
            `}>
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                No named parts found in model.
              </p>
              <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Ensure your model has named meshes or groups.
              </p>
            </div>
          )}
        </>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
          {error}
        </div>
      )}
      
      {/* Help Text */}
      <div className={`
        p-4 rounded-lg border
        ${isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-blue-50 border-blue-100'}
      `}>
        <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-primary-400' : 'text-primary-700'}`}>
          💡 Tips for Best Results
        </h4>
        <ul className={`text-sm space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          <li>• Name your meshes/groups descriptively (e.g., "body", "door", "frame")</li>
          <li>• Ensure the model is centered at origin</li>
          <li>• The door part will be used for smart state visualization</li>
          <li>• Use meters as the unit in your 3D software</li>
        </ul>
      </div>
    </div>
  );
};

export default LockerModelUpload;

