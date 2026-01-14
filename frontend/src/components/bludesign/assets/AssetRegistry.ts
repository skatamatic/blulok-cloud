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
  GRID_UNIT_METERS,
  feetToMeters,
  feetToGridUnits,
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
// Grid standard: 1 grid unit = 2 feet = 0.6096 meters
// All dimensions are in meters, gridUnits = ceil(dimension_ft / 2)
const BUILTIN_ASSETS: AssetMetadata[] = [
  // Storage Units - dimensions based on 2ft grid standard
  {
    id: 'unit-tiny',
    name: 'Tiny Locker',
    category: AssetCategory.STORAGE_UNIT,
    description: '3×3 ft storage locker - perfect for small items',
    dimensions: { width: feetToMeters(3), height: feetToMeters(7), depth: feetToMeters(3) }, // 0.91m x 2.13m x 0.91m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(3), z: feetToGridUnits(3) }, // 2x2
  },
  {
    id: 'unit-small',
    name: 'Small Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '5×5 ft storage unit',
    dimensions: { width: feetToMeters(5), height: feetToMeters(8), depth: feetToMeters(5) }, // 1.52m x 2.44m x 1.52m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(5), z: feetToGridUnits(5) }, // 3x3
  },
  {
    id: 'unit-medium',
    name: 'Medium Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '5×10 ft storage unit',
    dimensions: { width: feetToMeters(5), height: feetToMeters(8), depth: feetToMeters(10) }, // 1.52m x 2.44m x 3.05m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(5), z: feetToGridUnits(10) }, // 3x5
  },
  {
    id: 'unit-large',
    name: 'Large Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×10 ft storage unit',
    dimensions: { width: feetToMeters(10), height: feetToMeters(10), depth: feetToMeters(10) }, // 3.05m x 3.05m x 3.05m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(10), z: feetToGridUnits(10) }, // 5x5
  },
  {
    id: 'unit-xlarge',
    name: 'XL Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×15 ft storage unit',
    dimensions: { width: feetToMeters(10), height: feetToMeters(10), depth: feetToMeters(15) }, // 3.05m x 3.05m x 4.57m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(10), z: feetToGridUnits(15) }, // 5x8
  },
  {
    id: 'unit-huge',
    name: 'Huge Unit',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×20 ft storage unit',
    dimensions: { width: feetToMeters(10), height: feetToMeters(12), depth: feetToMeters(20) }, // 3.05m x 3.66m x 6.10m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(10), z: feetToGridUnits(20) }, // 5x10
  },
  
  // Gates - dimensions based on 2ft grid standard
  {
    id: 'gate-entry',
    name: 'Entry Gate',
    category: AssetCategory.GATE,
    description: 'Main facility entry/exit gate (12ft wide)',
    dimensions: { width: feetToMeters(12), height: feetToMeters(8), depth: feetToMeters(1) }, // 3.66m x 2.44m x 0.30m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(12), z: 1 }, // 6x1
  },
  {
    id: 'gate-pedestrian',
    name: 'Pedestrian Gate',
    category: AssetCategory.GATE,
    description: 'Walk-through access gate (4ft wide)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(7), depth: feetToMeters(1) }, // 1.22m x 2.13m x 0.30m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: 1 }, // 2x1
  },
  
  // Elevators - dimensions based on 2ft grid standard
  {
    id: 'elevator-freight',
    name: 'Freight Elevator',
    category: AssetCategory.ELEVATOR,
    description: 'Large freight elevator (10×12 ft)',
    dimensions: { width: feetToMeters(10), height: feetToMeters(12), depth: feetToMeters(12) }, // 3.05m x 3.66m x 3.66m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(10), z: feetToGridUnits(12) }, // 5x6
    spansAllFloors: true, // Auto-place on all floors
  },
  {
    id: 'elevator-passenger',
    name: 'Passenger Elevator',
    category: AssetCategory.ELEVATOR,
    description: 'Standard passenger elevator (6×6 ft)',
    dimensions: { width: feetToMeters(6), height: feetToMeters(10), depth: feetToMeters(6) }, // 1.83m x 3.05m x 1.83m
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(6), z: feetToGridUnits(6) }, // 3x3
    spansAllFloors: true, // Auto-place on all floors
  },
  
  // Stairwells - dimensions based on 2ft grid standard
  {
    id: 'stairwell-standard',
    name: 'Standard Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Enclosed fire-escape stairwell (10×12 ft)',
    dimensions: { width: feetToMeters(10), height: feetToMeters(12), depth: feetToMeters(12) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(10), z: feetToGridUnits(12) }, // 5x6
    spansAllFloors: true,
  },
  {
    id: 'stairwell-compact',
    name: 'Compact Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Space-efficient enclosed stairwell (8×10 ft)',
    dimensions: { width: feetToMeters(8), height: feetToMeters(12), depth: feetToMeters(10) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(8), z: feetToGridUnits(10) }, // 4x5
    spansAllFloors: true,
  },
  {
    id: 'stairwell-wide',
    name: 'Wide Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Large commercial-grade stairwell (12×16 ft)',
    dimensions: { width: feetToMeters(12), height: feetToMeters(12), depth: feetToMeters(16) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(12), z: feetToGridUnits(16) }, // 6x8
    spansAllFloors: true,
  },
  
  // Structural - Walls (1 grid unit = 2ft wide)
  {
    id: 'wall-1m',
    name: 'Wall',
    category: AssetCategory.WALL,
    description: '2ft wall section (1 grid unit)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(10), depth: feetToMeters(0.66) }, // 10ft tall, 8" thick
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Ground Tiles - 1 grid unit = 2ft x 2ft
  {
    id: 'ground-concrete',
    name: 'Concrete',
    category: AssetCategory.FLOOR,
    description: 'Polished concrete floor tile (2×2 ft)',
    dimensions: { width: GRID_UNIT_METERS, height: 0.05, depth: GRID_UNIT_METERS },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-pavement',
    name: 'Pavement',
    category: AssetCategory.PAVEMENT,
    description: 'Asphalt pavement tile (2×2 ft)',
    dimensions: { width: GRID_UNIT_METERS, height: 0.05, depth: GRID_UNIT_METERS },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-grass',
    name: 'Grass',
    category: AssetCategory.GRASS,
    description: 'Natural grass ground cover (2×2 ft)',
    dimensions: { width: GRID_UNIT_METERS, height: 0.05, depth: GRID_UNIT_METERS },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'ground-gravel',
    name: 'Gravel',
    category: AssetCategory.GRAVEL,
    description: 'Loose gravel surface (2×2 ft)',
    dimensions: { width: GRID_UNIT_METERS, height: 0.05, depth: GRID_UNIT_METERS },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Doors - depth matches wall thickness for flush appearance
  {
    id: 'door-single',
    name: 'Single Door',
    category: AssetCategory.DOOR,
    description: 'Standard single door (3ft wide)',
    dimensions: { width: feetToMeters(3), height: feetToMeters(7), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(3), z: 1 }, // 2x1
  },
  {
    id: 'door-double',
    name: 'Double Door',
    category: AssetCategory.DOOR,
    description: 'Double door entrance (6ft wide)',
    dimensions: { width: feetToMeters(6), height: feetToMeters(7), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(6), z: 1 }, // 3x1
  },
  
  // Outdoor - Fence (1 grid unit = 2ft)
  {
    id: 'fence-1m',
    name: 'Fence',
    category: AssetCategory.FENCE,
    description: '2ft fence section (1 grid unit)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(6), depth: feetToMeters(0.33) },
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
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(12), depth: GRID_UNIT_METERS },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  
  // Doors - additional types
  {
    id: 'door-standard',
    name: 'Standard Door',
    category: AssetCategory.DOOR,
    description: 'Standard interior/exterior door (3ft wide)',
    dimensions: { width: feetToMeters(3), height: feetToMeters(8), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(3), z: 1 }, // 2x1
  },
  {
    id: 'door-smart',
    name: 'Smart Access Door',
    category: AssetCategory.DOOR,
    description: 'Door with access control indicator (3ft wide)',
    dimensions: { width: feetToMeters(3), height: feetToMeters(8), depth: feetToMeters(0.66) },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(3), z: 1 }, // 2x1
  },
  {
    id: 'door-double-wide',
    name: 'Wide Double Door',
    category: AssetCategory.DOOR,
    description: 'Wide double door for main entrances (8ft wide)',
    dimensions: { width: feetToMeters(8), height: feetToMeters(8), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(8), z: 1 }, // 4x1
  },
  
  // Windows - depth matches wall thickness for flush appearance
  {
    id: 'window-standard',
    name: 'Standard Window',
    category: AssetCategory.WINDOW,
    description: 'Centered window for walls (2ft wide)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(10), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'window-floor-to-ceiling',
    name: 'Floor-to-Ceiling Window',
    category: AssetCategory.WINDOW,
    description: 'Full height glass window (2ft wide)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(10), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'window-wide-floor-to-ceiling',
    name: 'Wide Floor-to-Ceiling Window',
    category: AssetCategory.WINDOW,
    description: 'Wide full height glass window (4ft wide)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(10), depth: feetToMeters(0.66) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: 1 }, // 2x1
  },
  
  // Interior Walls - 1 grid unit = 2ft
  {
    id: 'interior-wall-1m',
    name: 'Interior Wall',
    category: AssetCategory.INTERIOR_WALL,
    description: '2ft interior wall section (1 grid unit)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(10), depth: feetToMeters(0.5) },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'interior-wall-2m',
    name: 'Interior Wall 4ft',
    category: AssetCategory.INTERIOR_WALL,
    description: '4ft interior wall section (2 grid units)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(10), depth: feetToMeters(0.5) },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 2, z: 1 },
  },
  
  // ============================================================================
  // Decorations - Cosmetic elements for landscaping
  // Dimensions based on 2ft grid standard
  // ============================================================================
  
  // Trees
  {
    id: 'tree-oak',
    name: 'Oak Tree',
    category: AssetCategory.DECORATION,
    description: 'Mature oak tree with full canopy (6ft spread)',
    dimensions: { width: feetToMeters(6), height: feetToMeters(14), depth: feetToMeters(6) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(6), z: feetToGridUnits(6) }, // 3x3
    metadata: { decorationType: 'tree_oak' },
  },
  {
    id: 'tree-oak-small',
    name: 'Small Oak Tree',
    category: AssetCategory.DECORATION,
    description: 'Young oak tree (4ft spread)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(10), depth: feetToMeters(4) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: feetToGridUnits(4) }, // 2x2
    metadata: { decorationType: 'tree_oak' },
  },
  {
    id: 'tree-pine',
    name: 'Pine Tree',
    category: AssetCategory.DECORATION,
    description: 'Tall conifer/pine tree (4ft spread)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(16), depth: feetToMeters(4) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: feetToGridUnits(4) }, // 2x2
    metadata: { decorationType: 'tree_pine' },
  },
  {
    id: 'tree-pine-large',
    name: 'Large Pine Tree',
    category: AssetCategory.DECORATION,
    description: 'Tall mature pine tree (6ft spread)',
    dimensions: { width: feetToMeters(6), height: feetToMeters(22), depth: feetToMeters(6) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(6), z: feetToGridUnits(6) }, // 3x3
    metadata: { decorationType: 'tree_pine' },
  },
  {
    id: 'tree-palm',
    name: 'Palm Tree',
    category: AssetCategory.DECORATION,
    description: 'Tropical palm tree (4ft spread)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(20), depth: feetToMeters(4) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: feetToGridUnits(4) }, // 2x2
    metadata: { decorationType: 'tree_palm' },
  },
  
  // Shrubs & Plants
  {
    id: 'shrub-round',
    name: 'Round Shrub',
    category: AssetCategory.DECORATION,
    description: 'Rounded ornamental shrub (2ft diameter)',
    dimensions: { width: GRID_UNIT_METERS, height: feetToMeters(2.5), depth: GRID_UNIT_METERS },
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
    description: 'Rectangular hedge section (4ft long)',
    dimensions: { width: feetToMeters(4), height: feetToMeters(4), depth: feetToMeters(2) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(4), z: 1 }, // 2x1
    metadata: { decorationType: 'shrub' },
  },
  
  // Planters
  {
    id: 'planter-small',
    name: 'Small Planter',
    category: AssetCategory.DECORATION,
    description: 'Small decorative planter with plant',
    dimensions: { width: feetToMeters(1.5), height: feetToMeters(2.5), depth: feetToMeters(1.5) },
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
    dimensions: { width: feetToMeters(3), height: feetToMeters(4), depth: feetToMeters(3) },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: feetToGridUnits(3), z: feetToGridUnits(3) }, // 2x2
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

