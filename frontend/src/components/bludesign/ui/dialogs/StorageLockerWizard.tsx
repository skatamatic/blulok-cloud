/**
 * Storage Locker Wizard
 * 
 * A wizard dialog for creating custom storage locker assets with:
 * - Interactive 3D preview with rotation and zoom
 * - Configurable dimensions in meters or feet
 * - Customizable door placement (side, size, position)
 * - Model upload option with parts selection
 * 
 * Grid standard: 1 grid tile = 2 feet = 0.6096 meters
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  CubeIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
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
import { LockerModelUpload } from './LockerModelUpload';
import { AssetService, CreateAssetDefinitionInput } from '../../services/AssetService';

type WizardMode = 'wizard' | 'upload';
type UnitSystem = 'metric' | 'imperial';
type DoorSide = 'front' | 'back' | 'left' | 'right';
type WizardStep = 'dimensions' | 'door' | 'review';

interface LockerWizardState {
  mode: WizardMode;
  name: string;
  unitSystem: UnitSystem;
  
  // Locker dimensions (stored in meters)
  width: number;
  height: number;
  depth: number;
  
  // Door configuration
  doorSide: DoorSide;
  doorWidth: number;
  doorHeight: number;
  doorPositionX: number;
  doorPositionY: number;
  doorCentered: boolean;
  
  // Upload mode
  uploadedFile?: File;
  modelParts: string[];
  selectedParts: Record<string, 'body' | 'door' | 'frame' | 'other'>;
}

// Min/max constraints in feet
const CONSTRAINTS = {
  minWidth: 1,    // 1 ft
  maxWidth: 20,   // 20 ft
  minHeight: 2,   // 2 ft
  maxHeight: 12,  // 12 ft
  minDepth: 1,    // 1 ft
  maxDepth: 30,   // 30 ft
  minDoorWidth: 1, // 1 ft
  minDoorHeight: 2, // 2 ft
};

interface StorageLockerWizardProps {
  onSave: (asset: CreateAssetDefinitionInput) => Promise<void>;
  onClose: () => void;
}

export const StorageLockerWizard: React.FC<StorageLockerWizardProps> = ({
  onSave,
  onClose,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [step, setStep] = useState<WizardStep>('dimensions');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize with default 5x8x5 ft locker
  const [state, setState] = useState<LockerWizardState>({
    mode: 'wizard',
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
    
    modelParts: [],
    selectedParts: {},
  });
  
  // Convert dimension for display based on unit system
  const displayValue = useCallback((meters: number): number => {
    return state.unitSystem === 'imperial' 
      ? Math.round(metersToFeet(meters) * 100) / 100 
      : Math.round(meters * 100) / 100;
  }, [state.unitSystem]);
  
  // Convert display value back to meters
  const toMeters = useCallback((value: number): number => {
    return state.unitSystem === 'imperial' ? feetToMeters(value) : value;
  }, [state.unitSystem]);
  
  // Get unit suffix
  const unitSuffix = state.unitSystem === 'imperial' ? 'ft' : 'm';
  
  // Calculate grid units
  const gridUnits = useMemo(() => ({
    x: metersToGridUnits(state.width),
    z: metersToGridUnits(state.depth),
  }), [state.width, state.depth]);
  
  // Calculate max door dimensions based on current locker size and side
  const maxDoorWidth = useMemo(() => {
    return state.doorSide === 'front' || state.doorSide === 'back' 
      ? state.width 
      : state.depth;
  }, [state.doorSide, state.width, state.depth]);
  
  const maxDoorHeight = state.height - feetToMeters(0.5);
  
  // Calculate max door position offset
  const maxPositionOffset = useMemo(() => {
    return Math.max(0, (maxDoorWidth - state.doorWidth) / 2);
  }, [maxDoorWidth, state.doorWidth]);
  
  // Constrain door when locker dimensions or door side changes
  const constrainDoor = useCallback(() => {
    setState(prev => {
      const newDoorWidth = Math.min(prev.doorWidth, maxDoorWidth);
      const newDoorHeight = Math.min(prev.doorHeight, maxDoorHeight);
      const newMaxOffset = Math.max(0, (maxDoorWidth - newDoorWidth) / 2);
      const newPositionX = prev.doorCentered ? 0 : Math.max(-newMaxOffset, Math.min(newMaxOffset, prev.doorPositionX));
      const newPositionY = Math.min(prev.doorPositionY, prev.height - newDoorHeight - feetToMeters(0.25));
      
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
  
  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      const assetInput: CreateAssetDefinitionInput = {
        name: state.name,
        description: `Custom storage locker (${displayValue(state.width)}×${displayValue(state.depth)} ${unitSuffix})`,
        category: AssetCategory.STORAGE_UNIT,
        modelType: state.mode === 'upload' && state.uploadedFile ? 'glb' : 'primitive',
        dimensions: {
          width: state.width,
          height: state.height,
          depth: state.depth,
        },
        gridUnits,
        isSmart: true,
        canRotate: true,
        canStack: false,
        lockerSpec,
      };
      
      await onSave(assetInput);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asset');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Step navigation
  const steps: WizardStep[] = ['dimensions', 'door', 'review'];
  const currentStepIndex = steps.indexOf(step);
  const canGoNext = currentStepIndex < steps.length - 1;
  const canGoBack = currentStepIndex > 0;
  
  const goNext = () => {
    if (canGoNext) {
      setStep(steps[currentStepIndex + 1]);
    }
  };
  
  const goBack = () => {
    if (canGoBack) {
      setStep(steps[currentStepIndex - 1]);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`
          relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl
          ${isDark ? 'bg-gray-900' : 'bg-white'}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-6 py-4 border-b
          ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              p-2 rounded-lg
              ${isDark ? 'bg-primary-900/50' : 'bg-primary-100'}
            `}>
              <CubeIcon className={`w-6 h-6 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
            </div>
            <div>
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Create Storage Locker
              </h2>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Step {currentStepIndex + 1} of {steps.length}: {step.charAt(0).toUpperCase() + step.slice(1)}
              </p>
            </div>
          </div>
          
          {/* Mode Toggle */}
          <div className="flex items-center gap-4">
            <div className={`
              flex rounded-lg overflow-hidden border
              ${isDark ? 'border-gray-700' : 'border-gray-200'}
            `}>
              <button
                onClick={() => setState(prev => ({ ...prev, mode: 'wizard' }))}
                className={`
                  px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2
                  ${state.mode === 'wizard'
                    ? isDark ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white'
                    : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }
                `}
              >
                <CubeIcon className="w-4 h-4" />
                Geometry
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, mode: 'upload' }))}
                className={`
                  px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2
                  ${state.mode === 'upload'
                    ? isDark ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white'
                    : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }
                `}
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                Upload
              </button>
            </div>
            
            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}
              `}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex h-[calc(90vh-180px)]">
          {/* Left: 3D Preview */}
          <div className={`
            w-1/2 p-4 border-r
            ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-100'}
          `}>
            <LockerPreview3D
              dimensions={{ width: state.width, height: state.height, depth: state.depth }}
              lockerSpec={lockerSpec}
              gridUnits={gridUnits}
            />
          </div>
          
          {/* Right: Form */}
          <div className={`
            w-1/2 p-6 overflow-y-auto
            ${isDark ? 'bg-gray-800/30' : 'bg-white'}
          `}>
            <AnimatePresence mode="wait">
              {state.mode === 'wizard' ? (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  {/* Step: Dimensions */}
                  {step === 'dimensions' && (
                    <>
                      {/* Name */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Asset Name
                        </label>
                        <input
                          type="text"
                          value={state.name}
                          onChange={(e) => setState(prev => ({ ...prev, name: e.target.value }))}
                          className={`
                            w-full px-4 py-2.5 rounded-lg border transition-colors
                            ${isDark 
                              ? 'bg-gray-800 border-gray-600 text-white focus:border-primary-500' 
                              : 'bg-white border-gray-300 text-gray-900 focus:border-primary-500'}
                            focus:outline-none focus:ring-2 focus:ring-primary-500/20
                          `}
                        />
                      </div>
                      
                      {/* Unit System Toggle */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Unit System
                        </label>
                        <div className={`
                          flex rounded-lg overflow-hidden border
                          ${isDark ? 'border-gray-600' : 'border-gray-300'}
                        `}>
                          <button
                            onClick={() => setState(prev => ({ ...prev, unitSystem: 'imperial' }))}
                            className={`
                              flex-1 px-4 py-2 text-sm font-medium transition-colors
                              ${state.unitSystem === 'imperial'
                                ? isDark ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white'
                                : isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'
                              }
                            `}
                          >
                            Feet (ft)
                          </button>
                          <button
                            onClick={() => setState(prev => ({ ...prev, unitSystem: 'metric' }))}
                            className={`
                              flex-1 px-4 py-2 text-sm font-medium transition-colors
                              ${state.unitSystem === 'metric'
                                ? isDark ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white'
                                : isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'
                              }
                            `}
                          >
                            Meters (m)
                          </button>
                        </div>
                      </div>
                      
                      {/* Dimensions */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Width ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            value={displayValue(state.width)}
                            onChange={(e) => updateDimension('width', parseFloat(e.target.value) || 0)}
                            min={state.unitSystem === 'imperial' ? CONSTRAINTS.minWidth : feetToMeters(CONSTRAINTS.minWidth)}
                            max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxWidth : feetToMeters(CONSTRAINTS.maxWidth)}
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            className={`
                              w-full px-4 py-2.5 rounded-lg border transition-colors
                              ${isDark 
                                ? 'bg-gray-800 border-gray-600 text-white focus:border-primary-500' 
                                : 'bg-white border-gray-300 text-gray-900 focus:border-primary-500'}
                              focus:outline-none focus:ring-2 focus:ring-primary-500/20
                            `}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Height ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            value={displayValue(state.height)}
                            onChange={(e) => updateDimension('height', parseFloat(e.target.value) || 0)}
                            min={state.unitSystem === 'imperial' ? CONSTRAINTS.minHeight : feetToMeters(CONSTRAINTS.minHeight)}
                            max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxHeight : feetToMeters(CONSTRAINTS.maxHeight)}
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            className={`
                              w-full px-4 py-2.5 rounded-lg border transition-colors
                              ${isDark 
                                ? 'bg-gray-800 border-gray-600 text-white focus:border-primary-500' 
                                : 'bg-white border-gray-300 text-gray-900 focus:border-primary-500'}
                              focus:outline-none focus:ring-2 focus:ring-primary-500/20
                            `}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Depth ({unitSuffix})
                          </label>
                          <input
                            type="number"
                            value={displayValue(state.depth)}
                            onChange={(e) => updateDimension('depth', parseFloat(e.target.value) || 0)}
                            min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDepth : feetToMeters(CONSTRAINTS.minDepth)}
                            max={state.unitSystem === 'imperial' ? CONSTRAINTS.maxDepth : feetToMeters(CONSTRAINTS.maxDepth)}
                            step={state.unitSystem === 'imperial' ? 0.5 : 0.1}
                            className={`
                              w-full px-4 py-2.5 rounded-lg border transition-colors
                              ${isDark 
                                ? 'bg-gray-800 border-gray-600 text-white focus:border-primary-500' 
                                : 'bg-white border-gray-300 text-gray-900 focus:border-primary-500'}
                              focus:outline-none focus:ring-2 focus:ring-primary-500/20
                            `}
                          />
                        </div>
                      </div>
                      
                      {/* Grid Units Display */}
                      <div className={`
                        p-4 rounded-lg border
                        ${isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                      `}>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Grid Footprint
                        </label>
                        <p className={`text-2xl font-bold ${isDark ? 'text-primary-400' : 'text-primary-600'}`}>
                          {gridUnits.x} × {gridUnits.z} tiles
                        </p>
                        <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          1 tile = 2 ft ({GRID_UNIT_METERS.toFixed(2)} m)
                        </p>
                      </div>
                    </>
                  )}
                  
                  {/* Step: Door Configuration */}
                  {step === 'door' && (
                    <>
                      {/* Door Side */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Door Side
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['front', 'back', 'left', 'right'] as DoorSide[]).map((side) => (
                            <button
                              key={side}
                              onClick={() => updateDoorConfig({ doorSide: side })}
                              className={`
                                px-4 py-3 rounded-lg text-sm font-medium capitalize transition-colors
                                ${state.doorSide === side
                                  ? isDark ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white'
                                  : isDark ? 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700' 
                                           : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                                }
                              `}
                            >
                              {side}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Door Size */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Door Width ({unitSuffix})
                          </label>
                          <input
                            type="range"
                            value={displayValue(state.doorWidth)}
                            onChange={(e) => updateDoorConfig({ doorWidth: toMeters(parseFloat(e.target.value)) })}
                            min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDoorWidth : feetToMeters(CONSTRAINTS.minDoorWidth)}
                            max={displayValue(maxDoorWidth)}
                            step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                            className="w-full"
                          />
                          <p className={`text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {displayValue(state.doorWidth)} {unitSuffix}
                          </p>
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Door Height ({unitSuffix})
                          </label>
                          <input
                            type="range"
                            value={displayValue(state.doorHeight)}
                            onChange={(e) => updateDoorConfig({ doorHeight: toMeters(parseFloat(e.target.value)) })}
                            min={state.unitSystem === 'imperial' ? CONSTRAINTS.minDoorHeight : feetToMeters(CONSTRAINTS.minDoorHeight)}
                            max={displayValue(maxDoorHeight)}
                            step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                            className="w-full"
                          />
                          <p className={`text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {displayValue(state.doorHeight)} {unitSuffix}
                          </p>
                        </div>
                      </div>
                      
                      {/* Door Position */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Door Position
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
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
                          min={-displayValue(maxPositionOffset)}
                          max={displayValue(maxPositionOffset)}
                          step={state.unitSystem === 'imperial' ? 0.25 : 0.05}
                          disabled={state.doorCentered}
                          className={`w-full ${state.doorCentered ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <p className={`text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          Offset: {displayValue(state.doorPositionX)} {unitSuffix}
                        </p>
                      </div>
                      
                      {/* Vertical Position */}
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
              ) : (
                <LockerModelUpload
                  state={state}
                  onStateChange={(updates) => setState(prev => ({ ...prev, ...updates }))}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Footer */}
        <div className={`
          flex items-center justify-between px-6 py-4 border-t
          ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}
        `}>
          <button
            onClick={goBack}
            disabled={!canGoBack || state.mode === 'upload'}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
              ${canGoBack && state.mode !== 'upload'
                ? isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'opacity-50 cursor-not-allowed'
              }
              ${isDark ? 'text-gray-300' : 'text-gray-600'}
            `}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg transition-colors
                ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}
              `}
            >
              Cancel
            </button>
            
            {canGoNext && state.mode === 'wizard' ? (
              <button
                onClick={goNext}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
              >
                Next
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`
                  flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg transition-colors
                  ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-500'}
                `}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    Create Asset
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default StorageLockerWizard;

