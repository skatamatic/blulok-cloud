/**
 * Asset Registry
 * 
 * Central registry for all available assets.
 * Manages asset metadata and loading.
 */

import {
  AssetMetadata,
  AssetCategory,
  StateBindingConfig,
  DeviceState,
} from '../core/types';

// Default state binding for smart storage units
const STORAGE_UNIT_BINDING: StateBindingConfig = {
  entityType: 'unit',
  dataShape: {
    status: 'string',
    locked: 'boolean',
    batteryLevel: 'number',
  },
  stateMappings: [
    {
      condition: { field: 'status', operator: '==', value: 'error' },
      resultState: DeviceState.ERROR,
      priority: 100,
    },
    {
      condition: { field: 'status', operator: '==', value: 'maintenance' },
      resultState: DeviceState.MAINTENANCE,
      priority: 90,
    },
    {
      condition: { field: 'status', operator: '==', value: 'offline' },
      resultState: DeviceState.OFFLINE,
      priority: 80,
    },
    {
      condition: { field: 'locked', operator: '==', value: false },
      resultState: DeviceState.UNLOCKED,
      priority: 50,
    },
    {
      condition: { field: 'locked', operator: '==', value: true },
      resultState: DeviceState.LOCKED,
      priority: 40,
    },
  ],
  defaultState: DeviceState.UNKNOWN,
};

// Default state binding for gates
const GATE_BINDING: StateBindingConfig = {
  entityType: 'gate',
  dataShape: {
    status: 'string',
    isOpen: 'boolean',
  },
  stateMappings: [
    {
      condition: { field: 'status', operator: '==', value: 'error' },
      resultState: DeviceState.ERROR,
      priority: 100,
    },
    {
      condition: { field: 'status', operator: '==', value: 'offline' },
      resultState: DeviceState.OFFLINE,
      priority: 90,
    },
    {
      condition: { field: 'isOpen', operator: '==', value: true },
      resultState: DeviceState.UNLOCKED,
      priority: 50,
    },
    {
      condition: { field: 'isOpen', operator: '==', value: false },
      resultState: DeviceState.LOCKED,
      priority: 40,
    },
  ],
  defaultState: DeviceState.LOCKED,
};

// Built-in assets
const BUILTIN_ASSETS: AssetMetadata[] = [
  // Storage Units
  {
    id: 'unit-tiny',
    name: 'Tiny Locker',
    category: AssetCategory.STORAGE_UNIT,
    description: '3×3 ft storage locker - perfect for small items',
    dimensions: { width: 1, height: 2, depth: 1 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'unit-small',
    name: 'Small Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '5×5 ft storage unit',
    dimensions: { width: 1.7, height: 2.5, depth: 1.7 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
  },
  {
    id: 'unit-medium',
    name: 'Medium Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '5×10 ft storage unit',
    dimensions: { width: 1.7, height: 2.5, depth: 3.3 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 4 },
  },
  {
    id: 'unit-large',
    name: 'Large Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×10 ft storage unit',
    dimensions: { width: 3.3, height: 3, depth: 3.3 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 4 },
  },
  {
    id: 'unit-xlarge',
    name: 'XL Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×15 ft storage unit',
    dimensions: { width: 3.3, height: 3, depth: 5 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 6 },
  },
  {
    id: 'unit-huge',
    name: 'Huge Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×20+ ft storage unit',
    dimensions: { width: 3.3, height: 3.5, depth: 6.6 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 8 },
  },
  
  // Gates
  {
    id: 'gate-entry',
    name: 'Entry Gate',
    category: AssetCategory.GATE,
    description: 'Main facility entry/exit gate',
    dimensions: { width: 4, height: 2.5, depth: 0.3 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 1 },
  },
  {
    id: 'gate-pedestrian',
    name: 'Pedestrian Gate',
    category: AssetCategory.GATE,
    description: 'Walk-through access gate',
    dimensions: { width: 1.2, height: 2.2, depth: 0.2 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 1 },
  },
  
  // Elevators
  {
    id: 'elevator-freight',
    name: 'Freight Elevator',
    category: AssetCategory.ELEVATOR,
    description: 'Large freight elevator for moving items',
    dimensions: { width: 3, height: 3.5, depth: 4 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 5 },
    spansAllFloors: true, // Auto-place on all floors
  },
  {
    id: 'elevator-passenger',
    name: 'Passenger Elevator',
    category: AssetCategory.ELEVATOR,
    description: 'Standard passenger elevator',
    dimensions: { width: 2, height: 3, depth: 2 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 3, z: 3 },
    spansAllFloors: true, // Auto-place on all floors
  },
  
  // Stairwells
  {
    id: 'stairwell-standard',
    name: 'Standard Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Enclosed fire-escape stairwell with doors',
    dimensions: { width: 3, height: 3.5, depth: 4 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 3, z: 4 },
    spansAllFloors: true,
  },
  {
    id: 'stairwell-compact',
    name: 'Compact Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Space-efficient enclosed stairwell',
    dimensions: { width: 2.5, height: 3.5, depth: 3 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 3, z: 3 },
    spansAllFloors: true,
  },
  {
    id: 'stairwell-wide',
    name: 'Wide Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Large commercial-grade stairwell with wide stairs',
    dimensions: { width: 4, height: 3.5, depth: 5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 4, z: 5 },
    spansAllFloors: true,
  },
  
  // Structural - Walls (1x1 only)
  {
    id: 'wall-1m',
    name: 'Wall',
    category: AssetCategory.WALL,
    description: '1 meter wall section',
    dimensions: { width: 1, height: 3, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Ground Tiles - 1x1 only
  {
    id: 'ground-concrete',
    name: 'Concrete',
    category: AssetCategory.FLOOR,
    description: 'Polished concrete floor tile',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-pavement',
    name: 'Pavement',
    category: AssetCategory.PAVEMENT,
    description: 'Asphalt pavement tile',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-grass',
    name: 'Grass',
    category: AssetCategory.GRASS,
    description: 'Natural grass ground cover',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-gravel',
    name: 'Gravel',
    category: AssetCategory.GRAVEL,
    description: 'Loose gravel surface',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Doors - depth matches wall thickness (0.2) for flush appearance
  {
    id: 'door-single',
    name: 'Single Door',
    category: AssetCategory.DOOR,
    description: 'Standard single door',
    dimensions: { width: 1, height: 2.2, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'door-double',
    name: 'Double Door',
    category: AssetCategory.DOOR,
    description: 'Double door entrance',
    dimensions: { width: 2, height: 2.2, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 1 },
  },
  
  // Outdoor (1x1 only)
  {
    id: 'fence-1m',
    name: 'Fence',
    category: AssetCategory.FENCE,
    description: '1 meter fence section',
    dimensions: { width: 1, height: 2, depth: 0.1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Building
  {
    id: 'building',
    name: 'Draw Building',
    category: AssetCategory.BUILDING,
    description: 'Create a building with walls and floors by drawing a rectangle',
    dimensions: { width: 1, height: 4, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Doors - depth matches wall thickness (0.2) for flush appearance
  {
    id: 'door-standard',
    name: 'Standard Door',
    category: AssetCategory.DOOR,
    description: 'Standard interior/exterior door',
    dimensions: { width: 1, height: 2.5, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'door-smart',
    name: 'Smart Access Door',
    category: AssetCategory.DOOR,
    description: 'Door with access control indicator',
    dimensions: { width: 1, height: 2.5, depth: 0.2 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'door-double',
    name: 'Double Door',
    category: AssetCategory.DOOR,
    description: 'Wide double door for main entrances',
    dimensions: { width: 2, height: 2.5, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 1 },
  },
  
  // Windows - depth matches wall thickness (0.2) for flush appearance
  {
    id: 'window-standard',
    name: 'Standard Window',
    category: AssetCategory.WINDOW,
    description: 'Centered window for walls',
    dimensions: { width: 1, height: 4, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'window-floor-to-ceiling',
    name: 'Floor-to-Ceiling Window',
    category: AssetCategory.WINDOW,
    description: 'Full height glass window',
    dimensions: { width: 1, height: 4, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'window-wide-floor-to-ceiling',
    name: 'Wide Floor-to-Ceiling Window',
    category: AssetCategory.WINDOW,
    description: 'Wide full height glass window',
    dimensions: { width: 2, height: 4, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 1 },
  },
  
  // Interior Walls
  {
    id: 'interior-wall-1m',
    name: 'Interior Wall 1m',
    category: AssetCategory.INTERIOR_WALL,
    description: '1 meter interior wall section',
    dimensions: { width: 1, height: 4, depth: 0.15 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'interior-wall-2m',
    name: 'Interior Wall 2m',
    category: AssetCategory.INTERIOR_WALL,
    description: '2 meter interior wall section',
    dimensions: { width: 2, height: 4, depth: 0.15 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 2, z: 1 },
  },
  
  // ============================================================================
  // Decorations - Cosmetic elements for landscaping
  // ============================================================================
  
  // Trees
  {
    id: 'tree-oak',
    name: 'Oak Tree',
    category: AssetCategory.DECORATION,
    description: 'Mature oak tree with full canopy',
    dimensions: { width: 2, height: 4, depth: 2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
    metadata: { decorationType: 'tree_oak' },
  },
  {
    id: 'tree-oak-small',
    name: 'Small Oak Tree',
    category: AssetCategory.DECORATION,
    description: 'Young oak tree',
    dimensions: { width: 1.5, height: 3, depth: 1.5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
    metadata: { decorationType: 'tree_oak' },
  },
  {
    id: 'tree-pine',
    name: 'Pine Tree',
    category: AssetCategory.DECORATION,
    description: 'Tall conifer/pine tree',
    dimensions: { width: 1.5, height: 5, depth: 1.5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
    metadata: { decorationType: 'tree_pine' },
  },
  {
    id: 'tree-pine-large',
    name: 'Large Pine Tree',
    category: AssetCategory.DECORATION,
    description: 'Tall mature pine tree',
    dimensions: { width: 2, height: 7, depth: 2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
    metadata: { decorationType: 'tree_pine' },
  },
  {
    id: 'tree-palm',
    name: 'Palm Tree',
    category: AssetCategory.DECORATION,
    description: 'Tropical palm tree',
    dimensions: { width: 1.5, height: 6, depth: 1.5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
    metadata: { decorationType: 'tree_palm' },
  },
  
  // Shrubs & Plants
  {
    id: 'shrub-round',
    name: 'Round Shrub',
    category: AssetCategory.DECORATION,
    description: 'Rounded ornamental shrub',
    dimensions: { width: 1, height: 0.8, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
    metadata: { decorationType: 'shrub' },
  },
  {
    id: 'shrub-hedge',
    name: 'Hedge Section',
    category: AssetCategory.DECORATION,
    description: 'Rectangular hedge section',
    dimensions: { width: 2, height: 1.2, depth: 0.5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 1 },
    metadata: { decorationType: 'shrub' },
  },
  
  // Planters
  {
    id: 'planter-small',
    name: 'Small Planter',
    category: AssetCategory.DECORATION,
    description: 'Small decorative planter with plant',
    dimensions: { width: 0.5, height: 0.8, depth: 0.5 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
    metadata: { decorationType: 'planter' },
  },
  {
    id: 'planter-large',
    name: 'Large Planter',
    category: AssetCategory.DECORATION,
    description: 'Large decorative planter with plant',
    dimensions: { width: 1, height: 1.2, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
    metadata: { decorationType: 'planter' },
  },
];

export class AssetRegistry {
  private static instance: AssetRegistry;
  private assets: Map<string, AssetMetadata> = new Map();
  private bindings: Map<string, StateBindingConfig> = new Map();

  private constructor() {
    // Register built-in assets
    BUILTIN_ASSETS.forEach((asset) => {
      this.assets.set(asset.id, asset);
    });
    
    // Register default bindings for smart assets
    this.bindings.set(AssetCategory.STORAGE_UNIT, STORAGE_UNIT_BINDING);
    this.bindings.set(AssetCategory.GATE, GATE_BINDING);
  }

  static getInstance(): AssetRegistry {
    if (!AssetRegistry.instance) {
      AssetRegistry.instance = new AssetRegistry();
    }
    return AssetRegistry.instance;
  }

  /**
   * Get all registered assets
   */
  getAllAssets(): AssetMetadata[] {
    return Array.from(this.assets.values());
  }

  /**
   * Get assets by category
   */
  getAssetsByCategory(category: AssetCategory): AssetMetadata[] {
    return this.getAllAssets().filter((asset) => asset.category === category);
  }

  /**
   * Get asset by ID
   */
  getAsset(id: string): AssetMetadata | undefined {
    return this.assets.get(id);
  }

  /**
   * Register a custom asset
   */
  registerAsset(asset: AssetMetadata): void {
    this.assets.set(asset.id, asset);
  }

  /**
   * Unregister an asset
   */
  unregisterAsset(id: string): boolean {
    return this.assets.delete(id);
  }

  /**
   * Get state binding for an asset category
   */
  getBindingConfig(category: AssetCategory): StateBindingConfig | undefined {
    return this.bindings.get(category);
  }

  /**
   * Register a custom state binding
   */
  registerBinding(category: AssetCategory, config: StateBindingConfig): void {
    this.bindings.set(category, config);
  }

  /**
   * Evaluate state from data using binding config
   */
  evaluateState(
    category: AssetCategory,
    data: Record<string, unknown>
  ): DeviceState {
    const binding = this.bindings.get(category);
    if (!binding) return DeviceState.UNKNOWN;
    
    // Sort mappings by priority (highest first)
    const sortedMappings = [...binding.stateMappings].sort(
      (a, b) => b.priority - a.priority
    );
    
    // Find first matching condition
    for (const mapping of sortedMappings) {
      const { field, operator, value } = mapping.condition;
      const dataValue = data[field];
      
      let matches = false;
      switch (operator) {
        case '==':
          matches = dataValue === value;
          break;
        case '!=':
          matches = dataValue !== value;
          break;
        case '>':
          matches = (dataValue as number) > (value as number);
          break;
        case '<':
          matches = (dataValue as number) < (value as number);
          break;
        case '>=':
          matches = (dataValue as number) >= (value as number);
          break;
        case '<=':
          matches = (dataValue as number) <= (value as number);
          break;
      }
      
      if (matches) {
        return mapping.resultState;
      }
    }
    
    return binding.defaultState;
  }

  /**
   * Get smart assets only
   */
  getSmartAssets(): AssetMetadata[] {
    return this.getAllAssets().filter((asset) => asset.isSmart);
  }

  /**
   * Get non-smart (decorative) assets only
   */
  getDecorativeAssets(): AssetMetadata[] {
    return this.getAllAssets().filter((asset) => !asset.isSmart);
  }
}

