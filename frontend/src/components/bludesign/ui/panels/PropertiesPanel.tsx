/**
 * Properties Panel
 * 
 * Shows properties of selected object(s) and allows editing.
 * Includes skin override, data binding, and simulation controls.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CubeIcon,
  LinkIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  SwatchIcon,
  BeakerIcon,
  BoltIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import {
  PlacedObject,
  Orientation,
  DeviceState,
  EntityBinding,
  SimulationState,
  BindableEntityType,
} from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetRegistry } from '../../assets/AssetRegistry';
import { getSkinRegistry, CategorySkin } from '../../core/SkinRegistry';
import {
  getBluLokUnits,
  getBluLokDevices,
  BluLokUnit,
  BluLokAccessControlDevice,
} from '@/api/bludesign';

interface PropertiesPanelProps {
  selectedObjects: PlacedObject[];
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: (orientation: Orientation) => void;
  onUpdateProperty: (id: string, property: string, value: unknown) => void;
  onRename?: (id: string, newName: string) => void;
  onUpdateBinding?: (id: string, binding: EntityBinding | undefined) => void;
  onUpdateSkin?: (id: string, skinId: string | undefined) => void;
  onSimulateState?: (id: string, state: SimulationState) => void;
  dataSourceFacilityId?: string;
  availableSkins?: { id: string; name: string; assetId: string }[];
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObjects,
  onDelete,
  onDuplicate,
  onRotate,
  onUpdateProperty,
  onRename,
  onUpdateBinding,
  onUpdateSkin,
  onSimulateState,
  dataSourceFacilityId,
  availableSkins: _availableSkins = [],
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    transform: false,
    binding: true,
    skin: true,
    simulation: true,
    verticalShaft: true,
  });
  
  // Binding search state
  const [bindingSearch, setBindingSearch] = useState('');
  const [units, setUnits] = useState<BluLokUnit[]>([]);
  const [devices, setDevices] = useState<BluLokAccessControlDevice[]>([]);
  const [loadingBindables, setLoadingBindables] = useState(false);
  
  // Simulation state
  const [localSimState, setLocalSimState] = useState<SimulationState>({
    isSimulating: false,
  });
  
  const selectionCount = selectedObjects.length;
  const singleSelection = selectionCount === 1 ? selectedObjects[0] : null;
  
  // Get asset metadata from registry if not on the object
  const assetMetadata = singleSelection?.assetMetadata || 
    (singleSelection ? AssetRegistry.getInstance().getAsset(singleSelection.assetId) : null);
  const isSmart = assetMetadata?.isSmart ?? false;
  
  // Multi-selection analysis: check if all selected objects share the same category
  const allCategories = selectedObjects.map(obj => 
    obj.assetMetadata?.category || AssetRegistry.getInstance().getAsset(obj.assetId)?.category
  );
  const uniqueCategories = [...new Set(allCategories.filter(Boolean))];
  const sharedCategory = uniqueCategories.length === 1 ? uniqueCategories[0] : null;
  
  // Get skins for multi-selection if all same category
  const multiSelectCategorySkins: CategorySkin[] = sharedCategory 
    ? getSkinRegistry().getSkinsForCategory(sharedCategory)
    : [];
  
  // Check if all selected objects have the same skin (for showing current value)
  const allSkinIds = selectedObjects.map(obj => obj.skinId);
  const uniqueSkinIds = [...new Set(allSkinIds)];
  const sharedSkinId = uniqueSkinIds.length === 1 ? uniqueSkinIds[0] : undefined;
  const hasMixedSkins = uniqueSkinIds.length > 1;
  
  // Load bindable entities when data source changes
  useEffect(() => {
    if (!dataSourceFacilityId) {
      setUnits([]);
      setDevices([]);
      return;
    }
    
    const loadBindables = async () => {
      setLoadingBindables(true);
      try {
        const [unitsData, devicesData] = await Promise.all([
          getBluLokUnits(dataSourceFacilityId),
          getBluLokDevices(dataSourceFacilityId),
        ]);
        setUnits(unitsData);
        setDevices(devicesData);
      } catch (error) {
        console.error('Failed to load bindable entities:', error);
      } finally {
        setLoadingBindables(false);
      }
    };
    
    loadBindables();
  }, [dataSourceFacilityId]);
  
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);
  
  const handleBindingChange = useCallback((entityType: BindableEntityType, entityId: string, entityLabel?: string) => {
    if (!singleSelection || !onUpdateBinding) return;
    
    if (!entityId) {
      onUpdateBinding(singleSelection.id, undefined);
    } else {
      onUpdateBinding(singleSelection.id, {
        entityType,
        entityId,
        entityLabel,
      });
    }
  }, [singleSelection, onUpdateBinding]);
  
  const handleSkinChange = useCallback((skinId: string | undefined) => {
    if (!onUpdateSkin) return;
    
    // Apply to single selection
    if (singleSelection) {
      onUpdateSkin(singleSelection.id, skinId);
    }
  }, [singleSelection, onUpdateSkin]);
  
  // Handle multi-selection skin change
  const handleMultiSkinChange = useCallback((skinId: string | undefined) => {
    if (!onUpdateSkin || selectedObjects.length === 0) return;
    
    // Apply to all selected objects
    for (const obj of selectedObjects) {
      onUpdateSkin(obj.id, skinId);
    }
  }, [selectedObjects, onUpdateSkin]);
  
  const handleSimulationToggle = useCallback(() => {
    if (!singleSelection || !onSimulateState) return;
    
    const newState: SimulationState = {
      isSimulating: !localSimState.isSimulating,
      simulatedState: localSimState.simulatedState ?? DeviceState.LOCKED,
      simulatedLockStatus: localSimState.simulatedLockStatus ?? 'locked',
    };
    setLocalSimState(newState);
    onSimulateState(singleSelection.id, newState);
  }, [singleSelection, localSimState, onSimulateState]);
  
  const handleSimulatedStateChange = useCallback((state: DeviceState) => {
    if (!singleSelection || !onSimulateState) return;
    
    const newState: SimulationState = {
      ...localSimState,
      simulatedState: state,
      simulatedLockStatus: state === DeviceState.LOCKED ? 'locked' : 
                          state === DeviceState.UNLOCKED ? 'unlocked' : 
                          localSimState.simulatedLockStatus,
    };
    setLocalSimState(newState);
    onSimulateState(singleSelection.id, newState);
  }, [singleSelection, localSimState, onSimulateState]);
  
  // Filter bindables by search
  const filteredUnits = units.filter(u => 
    u.unit_number.toLowerCase().includes(bindingSearch.toLowerCase()) ||
    u.tenant?.name?.toLowerCase().includes(bindingSearch.toLowerCase())
  );
  
  const filteredDevices = devices.filter(d =>
    d.name.toLowerCase().includes(bindingSearch.toLowerCase()) ||
    d.device_type.toLowerCase().includes(bindingSearch.toLowerCase())
  );
  
  // Get skins for current asset's category from the SkinRegistry
  const categorySkins: CategorySkin[] = singleSelection?.assetMetadata?.category
    ? getSkinRegistry().getSkinsForCategory(singleSelection.assetMetadata.category)
    : [];

  if (selectionCount === 0) {
    return (
      <div className={`text-sm text-center py-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        <CubeIcon className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'opacity-30' : 'opacity-40'}`} />
        <p>No selection</p>
        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Click an object to select it</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with asset info */}
      {singleSelection && (
        <div className={`flex items-center gap-2 p-2 rounded-lg ${isDark ? 'bg-gray-800/50' : 'bg-gray-100/80'}`}>
          <div className={`w-8 h-8 rounded flex items-center justify-center ${isDark ? 'bg-primary-600/20' : 'bg-primary-100'}`}>
            <CubeIcon className="w-4 h-4 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {assetMetadata?.name ?? singleSelection.assetId}
            </div>
            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {assetMetadata?.category ?? 'Asset'} 
              {isSmart && <span className="ml-1 text-primary-400">• Smart</span>}
            </div>
          </div>
        </div>
      )}
      
      {/* Name field for smart assets */}
      {singleSelection && isSmart && onRename && (
        <div className="space-y-1">
          <label className={`text-xs block ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Object Name
          </label>
          <input
            type="text"
            value={singleSelection.name ?? ''}
            onChange={(e) => onRename(singleSelection.id, e.target.value)}
            placeholder={assetMetadata?.name ?? 'Enter name...'}
            className={`w-full rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 ${
              isDark 
                ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-600' 
                : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
            }`}
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
            isDark 
              ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50' 
              : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
          }`}
          onClick={onDuplicate}
        >
          <DocumentDuplicateIcon className="w-3.5 h-3.5" />
          <span>Duplicate</span>
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-900/30 rounded text-xs text-red-400 hover:bg-red-900/50 transition-colors"
          onClick={onDelete}
        >
          <TrashIcon className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>

      {/* Single Object Properties */}
      {singleSelection && (
        <>
          {/* Skin Override Section */}
          {categorySkins.length > 0 && (
            <PropertySectionComponent
              title="Skin Override"
              icon={<SwatchIcon className="w-4 h-4" />}
              expanded={expandedSections.skin}
              onToggle={() => toggleSection('skin')}
              isDark={isDark}
            >
              <div className="space-y-2">
                <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Override theme's skin for this object
                </p>
                <select
                  className={`w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    isDark 
                      ? 'bg-gray-800 border border-gray-700 text-white' 
                      : 'bg-gray-100 border border-gray-200 text-gray-900'
                  }`}
                  value={singleSelection.skinId ?? ''}
                  onChange={(e) => handleSkinChange(e.target.value || undefined)}
                >
                  <option value="">Use Theme Default</option>
                  {categorySkins.map(skin => (
                    <option key={skin.id} value={skin.id}>
                      {skin.name}{skin.isBuiltin ? ' (built-in)' : ''}
                    </option>
                  ))}
                </select>
                
                {/* Show current skin preview */}
                {singleSelection.skinId && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Current:
                    </span>
                    {(() => {
                      const currentSkin = categorySkins.find(s => s.id === singleSelection.skinId);
                      if (!currentSkin) return null;
                      return (
                        <div className="flex items-center gap-1">
                          {Object.entries(currentSkin.partMaterials).slice(0, 3).map(([part, mat]) => (
                            <div
                              key={part}
                              className="w-4 h-4 rounded border border-black/10"
                              style={{ backgroundColor: mat.color }}
                              title={part}
                            />
                          ))}
                          <span className={`text-xs ml-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
                            {currentSkin.name}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </PropertySectionComponent>
          )}

          {/* Vertical Shaft Section (for elevators/stairwells) */}
          {singleSelection.verticalShaftId && (
            <PropertySectionComponent
              title="Multi-Floor Placement"
              icon={<BuildingOffice2Icon className="w-4 h-4" />}
              expanded={expandedSections.verticalShaft ?? true}
              onToggle={() => toggleSection('verticalShaft')}
              isDark={isDark}
            >
              <div className="space-y-3">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-900/20 border border-blue-700/50' : 'bg-blue-50 border border-blue-200'}`}>
                  <div className={`text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                    <BuildingOffice2Icon className="w-3.5 h-3.5 inline mr-1" />
                    Vertical Shaft Object
                  </div>
                  <div className={`text-[10px] mt-1 ${isDark ? 'text-blue-400/70' : 'text-blue-600'}`}>
                    This {assetMetadata?.category?.includes('elevator') ? 'elevator' : 'stairwell'} is 
                    automatically placed on all floors.
                  </div>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!singleSelection.disableVerticalShaft}
                    onChange={(e) => onUpdateProperty(singleSelection.id, 'disableVerticalShaft', !e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 text-primary-500 focus:ring-primary-500"
                  />
                  <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Auto-add to new floors
                  </span>
                </label>
                
                <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  When disabled, this object won't be automatically added when new floors are created.
                </p>
              </div>
            </PropertySectionComponent>
          )}

          {/* Data Binding Section (for smart assets) */}
          {isSmart && (
            <PropertySectionComponent
              title="Data Binding"
              icon={<LinkIcon className="w-4 h-4" />}
              expanded={expandedSections.binding}
              onToggle={() => toggleSection('binding')}
              isDark={isDark}
            >
              {!dataSourceFacilityId ? (
                <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <p>No data source configured.</p>
                  <p className="mt-1">Open the Data Source panel to connect to a facility.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Current binding */}
                  {singleSelection.binding?.entityId && (
                    <div className={`flex items-center gap-2 p-2 rounded border ${
                      isDark 
                        ? 'bg-green-900/20 border-green-700/50' 
                        : 'bg-green-50 border-green-200'
                    }`}>
                      <BoltIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                          Bound to: {singleSelection.binding.entityType}
                        </div>
                        <div className={`text-xs truncate ${isDark ? 'text-green-400/70' : 'text-green-600'}`}>
                          {(singleSelection.binding as EntityBinding).entityLabel || singleSelection.binding.entityId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleBindingChange(singleSelection.binding!.entityType as BindableEntityType, '', undefined)}
                        className="p-1 rounded hover:bg-red-500/20"
                      >
                        <XMarkIcon className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                  
                  {/* Search */}
                  <div className="relative">
                    <MagnifyingGlassIcon className={`absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <input
                      type="text"
                      placeholder="Search units & devices..."
                      value={bindingSearch}
                      onChange={(e) => setBindingSearch(e.target.value)}
                      className={`w-full pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                        isDark 
                          ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500' 
                          : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  </div>
                  
                  {/* Bindable list */}
                  {loadingBindables ? (
                    <div className={`text-xs text-center py-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Loading...
                    </div>
                  ) : (
                    <div className={`max-h-40 overflow-y-auto rounded border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      {/* Units */}
                      {filteredUnits.length > 0 && (
                        <div>
                          <div className={`sticky top-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                            isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                          }`}>
                            Units
                          </div>
                          {filteredUnits.map(unit => (
                            <button
                              key={unit.id}
                              className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                                singleSelection.binding?.entityId === unit.id
                                  ? isDark ? 'bg-primary-600/20 text-primary-300' : 'bg-primary-100 text-primary-700'
                                  : isDark ? 'hover:bg-gray-700/50 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                              onClick={() => handleBindingChange('unit', unit.id, `Unit ${unit.unit_number}`)}
                            >
                              <div className="font-medium">Unit {unit.unit_number}</div>
                              <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {unit.status} {unit.tenant?.name && `• ${unit.tenant.name}`}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Devices */}
                      {filteredDevices.length > 0 && (
                        <div>
                          <div className={`sticky top-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                            isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                          }`}>
                            Access Control
                          </div>
                          {filteredDevices.map(device => (
                            <button
                              key={device.id}
                              className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                                singleSelection.binding?.entityId === device.id
                                  ? isDark ? 'bg-primary-600/20 text-primary-300' : 'bg-primary-100 text-primary-700'
                                  : isDark ? 'hover:bg-gray-700/50 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                              onClick={() => handleBindingChange(device.device_type as BindableEntityType, device.id, device.name)}
                            >
                              <div className="font-medium">{device.name}</div>
                              <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {device.device_type} • {device.status}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {filteredUnits.length === 0 && filteredDevices.length === 0 && (
                        <div className={`text-xs text-center py-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          No entities found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </PropertySectionComponent>
          )}

          {/* Simulation Section (for smart assets) */}
          {isSmart && (
            <PropertySectionComponent
              title="Simulate State"
              icon={<BeakerIcon className="w-4 h-4" />}
              expanded={expandedSections.simulation}
              onToggle={() => toggleSection('simulation')}
              isDark={isDark}
            >
              <div className="space-y-2">
                {/* Toggle simulation */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSimState.isSimulating}
                    onChange={handleSimulationToggle}
                    className="w-4 h-4 rounded border-gray-600 text-primary-500 focus:ring-primary-500"
                  />
                  <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enable Simulation
                  </span>
                </label>
                
                {localSimState.isSimulating && (
                  <>
                    {/* State selector */}
                    <div>
                      <label className={`text-xs block mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Simulated State
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {Object.values(DeviceState).map(state => (
                          <button
                            key={state}
                            className={`px-2 py-1.5 text-xs rounded transition-colors ${
                              localSimState.simulatedState === state
                                ? 'bg-primary-600 text-white'
                                : isDark 
                                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            onClick={() => handleSimulatedStateChange(state)}
                          >
                            {state.charAt(0).toUpperCase() + state.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Preview indicator */}
                    <div className={`p-2 rounded border ${isDark ? 'border-yellow-700/50 bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50'}`}>
                      <div className={`text-xs ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                        <BeakerIcon className="w-3.5 h-3.5 inline mr-1" />
                        Preview mode active
                      </div>
                      <div className={`text-[10px] mt-0.5 ${isDark ? 'text-yellow-400/70' : 'text-yellow-600'}`}>
                        Changes are for preview only
                      </div>
                    </div>
                  </>
                )}
              </div>
            </PropertySectionComponent>
          )}

          {/* Transform Section (collapsed by default) */}
          <PropertySectionComponent
            title="Transform"
            icon={<CubeIcon className="w-4 h-4" />}
            expanded={expandedSections.transform}
            onToggle={() => toggleSection('transform')}
            isDark={isDark}
          >
            <div className="space-y-2">
              {/* Position (read-only) */}
              <div>
                <label className={`text-xs block mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Grid Position
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <div className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                    X: {singleSelection.position.x}
                  </div>
                  <div className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                    Z: {singleSelection.position.z}
                  </div>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className={`text-xs block mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Orientation</label>
                <div className="grid grid-cols-4 gap-1">
                  {[Orientation.NORTH, Orientation.EAST, Orientation.SOUTH, Orientation.WEST].map((orient) => (
                    <button
                      key={orient}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        singleSelection.orientation === orient
                          ? 'bg-primary-600 text-white'
                          : isDark 
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      onClick={() => onRotate(orient)}
                    >
                      {orient}°
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Floor */}
              <div>
                <label className={`text-xs block mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Floor</label>
                <div className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                  {singleSelection.floor === 0 ? 'Ground Floor' : `Floor ${singleSelection.floor}`}
                </div>
              </div>
            </div>
          </PropertySectionComponent>

          {/* Live State Display (if bound) */}
          {singleSelection.binding?.entityId && singleSelection.binding.currentState && (
            <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-800/50' : 'bg-gray-100/80'}`}>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Live State
              </div>
              <StateIndicator state={singleSelection.binding.currentState} isDark={isDark} />
            </div>
          )}
        </>
      )}

      {/* Multi-selection info and common properties */}
      {selectionCount > 1 && (
        <div className="space-y-3">
          {/* Selection summary */}
          <div className={`p-3 rounded-lg ${isDark ? 'bg-gray-800/50' : 'bg-gray-100/80'}`}>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Selection
            </div>
            <div className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <p className="font-medium">{selectionCount} objects selected</p>
              {sharedCategory && (
                <p className={isDark ? 'text-primary-400' : 'text-primary-600'}>
                  All same category: {sharedCategory.replace(/_/g, ' ')}
                </p>
              )}
              {!sharedCategory && uniqueCategories.length > 1 && (
                <p className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                  Mixed categories ({uniqueCategories.length} types)
                </p>
              )}
            </div>
          </div>
          
          {/* Quick Actions for multi-selection */}
          <div className="flex gap-2">
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                isDark 
                  ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50' 
                  : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
              }`}
              onClick={onDuplicate}
            >
              <DocumentDuplicateIcon className="w-3.5 h-3.5" />
              <span>Duplicate All</span>
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-900/30 rounded text-xs text-red-400 hover:bg-red-900/50 transition-colors"
              onClick={onDelete}
            >
              <TrashIcon className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          </div>
          
          {/* Common properties - Skin (only if all same category) */}
          {sharedCategory && multiSelectCategorySkins.length > 0 && (
            <PropertySectionComponent
              title="Common Skin"
              icon={<SwatchIcon className="w-4 h-4" />}
              expanded={expandedSections.skin}
              onToggle={() => toggleSection('skin')}
              isDark={isDark}
            >
              <div className="space-y-2">
                <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Apply skin to all {selectionCount} selected objects
                </p>
                <select
                  className={`w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    isDark 
                      ? 'bg-gray-800 border border-gray-700 text-white' 
                      : 'bg-gray-100 border border-gray-200 text-gray-900'
                  }`}
                  value={hasMixedSkins ? '__mixed__' : (sharedSkinId ?? '')}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__mixed__') return;
                    handleMultiSkinChange(value || undefined);
                  }}
                >
                  {hasMixedSkins && (
                    <option value="__mixed__" disabled>Mixed values</option>
                  )}
                  <option value="">Use Theme Default</option>
                  {multiSelectCategorySkins.map(skin => (
                    <option key={skin.id} value={skin.id}>
                      {skin.name}{skin.isBuiltin ? ' (built-in)' : ''}
                    </option>
                  ))}
                </select>
                
                {/* Show preview of selected/mixed skins */}
                {hasMixedSkins && (
                  <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className={isDark ? 'text-yellow-400' : 'text-yellow-600'}>⚠</span>
                    {' '}Objects have different skins. Selecting a skin will apply it to all.
                  </div>
                )}
                
                {!hasMixedSkins && sharedSkinId && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Current:
                    </span>
                    {(() => {
                      const currentSkin = multiSelectCategorySkins.find(s => s.id === sharedSkinId);
                      if (!currentSkin) return null;
                      return (
                        <div className="flex items-center gap-1">
                          {Object.entries(currentSkin.partMaterials).slice(0, 3).map(([part, mat]) => (
                            <div
                              key={part}
                              className="w-4 h-4 rounded border border-black/10"
                              style={{ backgroundColor: mat.color }}
                              title={part}
                            />
                          ))}
                          <span className={`text-xs ml-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
                            {currentSkin.name}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </PropertySectionComponent>
          )}
          
          {/* Notice for non-common properties */}
          <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <p>Select a single object to edit name, binding, and simulation settings.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Collapsible section component
interface PropertySectionComponentProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
  children: React.ReactNode;
}

const PropertySectionComponent: React.FC<PropertySectionComponentProps> = ({
  title,
  icon,
  expanded,
  onToggle,
  isDark,
  children,
}) => (
  <div className={`rounded-lg overflow-hidden ${isDark ? 'bg-gray-800/30' : 'bg-gray-100/50'}`}>
    <button
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
        isDark ? 'hover:bg-gray-700/30' : 'hover:bg-gray-200/50'
      }`}
      onClick={onToggle}
    >
      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{icon}</span>
      <span className={`flex-1 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        {title}
      </span>
      {expanded ? (
        <ChevronDownIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      ) : (
        <ChevronRightIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      )}
    </button>
    {expanded && (
      <div className="px-3 pb-3">
        {children}
      </div>
    )}
  </div>
);

// State indicator component
const StateIndicator: React.FC<{ state: DeviceState; isDark: boolean }> = ({ state }) => {
  const stateStyles: Record<DeviceState, { bg: string; text: string; label: string }> = {
    [DeviceState.UNKNOWN]: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Unknown' },
    [DeviceState.LOCKED]: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Locked' },
    [DeviceState.UNLOCKED]: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Unlocked' },
    [DeviceState.ERROR]: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error' },
    [DeviceState.MAINTENANCE]: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Maintenance' },
    [DeviceState.OFFLINE]: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Offline' },
  };

  const style = stateStyles[state];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${style.bg}`}>
      <div className={`w-2 h-2 rounded-full ${style.text.replace('text-', 'bg-')}`} />
      <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
    </div>
  );
};
