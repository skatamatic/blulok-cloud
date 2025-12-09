/**
 * BluDesign Core Types
 * 
 * Type definitions for the 3D editing system. These types form the foundation
 * of the asset system, state management, and editor functionality.
 */

import * as THREE from 'three';

// ============================================================================
// Grid & Positioning
// ============================================================================

/** Grid cell size presets based on storage unit sizes */
export enum GridSize {
  TINY = 1,      // 1 unit = ~3ft (tiny locker)
  SMALL = 2,     // 2 units = ~6ft (small unit)
  MEDIUM = 4,    // 4 units = ~12ft (medium unit)
  LARGE = 8,     // 8 units = ~24ft (large unit)
}

/** Fixed orientations (90-degree increments) */
export enum Orientation {
  NORTH = 0,
  EAST = 90,
  SOUTH = 180,
  WEST = 270,
}

/** Position on the grid */
export interface GridPosition {
  x: number;
  z: number;
  y?: number; // For multi-floor support
}

/** Snap configuration */
export interface SnapConfig {
  enabled: boolean;
  gridSize: GridSize;
}

// ============================================================================
// Camera & View
// ============================================================================

/** Camera mode */
export enum CameraMode {
  FREE = 'free',
  ISOMETRIC = 'isometric',
}

/** Isometric view angles (from corners) */
export enum IsometricAngle {
  NORTH_EAST = 45,
  SOUTH_EAST = 135,
  SOUTH_WEST = 225,
  NORTH_WEST = 315,
}

/** Camera state */
export interface CameraState {
  mode: CameraMode;
  isometricAngle: IsometricAngle;
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
}

// ============================================================================
// Assets & Objects
// ============================================================================

/** Asset categories */
export enum AssetCategory {
  // Smart assets (bind to real data)
  STORAGE_UNIT = 'storage_unit',
  GATE = 'gate',
  ELEVATOR = 'elevator',
  ACCESS_CONTROL = 'access_control',
  
  // Structural
  BUILDING = 'building',
  WALL = 'wall',
  INTERIOR_WALL = 'interior_wall',
  FLOOR = 'floor',
  CEILING = 'ceiling',
  STAIRWELL = 'stairwell',
  DOOR = 'door',
  WINDOW = 'window',
  
  // Outdoor
  PAVEMENT = 'pavement',
  GRASS = 'grass',
  GRAVEL = 'gravel',
  FENCE = 'fence',
  
  // Decorations (cosmetic only)
  DECORATION = 'decoration',
  
  // Utility
  MARKER = 'marker',
  LABEL = 'label',
}

/** Building skin types */
export enum BuildingSkinType {
  DEFAULT = 'default',
  BRICK = 'brick',
  GLASS = 'glass',
  CONCRETE = 'concrete',
  METAL = 'metal',
}

/** Geometry types for assets */
export enum GeometryType {
  PRIMITIVE = 'primitive',
  GLTF = 'gltf',
  GLB = 'glb',
  FBX = 'fbx',
}

/** Primitive types */
export enum PrimitiveType {
  BOX = 'box',
  CYLINDER = 'cylinder',
  SPHERE = 'sphere',
  PLANE = 'plane',
  CONE = 'cone',
  TORUS = 'torus',
}

/** Primitive specifications */
export interface BoxPrimitive {
  type: PrimitiveType.BOX;
  width: number;
  height: number;
  depth: number;
}

export interface CylinderPrimitive {
  type: PrimitiveType.CYLINDER;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  segments: number;
}

export interface SpherePrimitive {
  type: PrimitiveType.SPHERE;
  radius: number;
  widthSegments: number;
  heightSegments: number;
}

export interface PlanePrimitive {
  type: PrimitiveType.PLANE;
  width: number;
  height: number;
}

export type PrimitiveSpec = BoxPrimitive | CylinderPrimitive | SpherePrimitive | PlanePrimitive;

/** Asset geometry definition */
export interface AssetGeometry {
  type: GeometryType;
  source?: string;  // URL/path for external files
  primitiveSpec?: PrimitiveSpec;  // For procedural primitive assets
}

/** Material slot definition */
export interface MaterialSlot {
  name: string;
  defaultColor: string;
  defaultTexture?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  allowBrandingOverride: boolean;
}

/** Branding override */
export interface BrandingOverride {
  slotName: string;
  color?: string;
  textureUrl?: string;
}

/** Asset materials configuration */
export interface AssetMaterials {
  slots: Record<string, MaterialSlot>;
  brandingOverrides?: BrandingOverride[];
}

/** Complete BluDesign asset definition (backend structure) */
export interface BluDesignAsset {
  id: string;
  projectId: string;
  name: string;
  version: string;
  category: AssetCategory;
  
  geometry: AssetGeometry;
  materials: AssetMaterials;
  
  isSmart: boolean;
  binding?: StateBindingConfig;
  
  metadata: AssetMetadataBackend;
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Storage unit sizes */
export enum StorageUnitSize {
  TINY = 'tiny',       // 3x3 ft (locker)
  SMALL = 'small',     // 5x5 ft
  MEDIUM = 'medium',   // 5x10 ft
  LARGE = 'large',     // 10x10 ft
  XLARGE = 'xlarge',   // 10x15 ft
  HUGE = 'huge',       // 10x20+ ft
}

/** Device state for smart assets */
export enum DeviceState {
  UNKNOWN = 'unknown',
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
  OFFLINE = 'offline',
}

/** Asset dimensions */
export interface AssetDimensions {
  width: number;
  height: number;
  depth: number;
}

/** Asset grid units */
export interface AssetGridUnits {
  x: number;
  z: number;
}

/** Asset metadata (backend structure - just metadata fields) */
export interface AssetMetadataBackend {
  description?: string;
  thumbnail?: string;
  tags?: string[];
  author?: string;
  license?: string;
  dimensions: AssetDimensions;
  gridUnits: AssetGridUnits;
  canRotate: boolean;
  canStack: boolean;
}

/** Asset metadata (frontend structure - simplified asset definition for editor) */
export interface AssetMetadata {
  id: string;
  name: string;
  category: AssetCategory;
  description?: string;
  thumbnail?: string;
  dimensions: AssetDimensions;
  isSmart: boolean;
  canRotate: boolean;
  canStack: boolean;
  gridUnits: AssetGridUnits;
  
  // Multi-floor vertical shaft properties
  /** If true, this asset spans all floors when placed in a building (e.g., elevators, stairwells) */
  spansAllFloors?: boolean;
  /** If true and spansAllFloors is true, exclude from top floor (e.g., stairs don't go up from top floor) */
  excludeTopFloor?: boolean;
}

/** Data field type */
export type DataFieldType = 'string' | 'number' | 'boolean' | 'object';

/** Comparison operator */
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

/** State condition */
export interface StateCondition {
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

/** State mapping */
export interface StateMapping {
  condition: StateCondition;
  resultState: DeviceState;
  priority: number;
}

/** Binding contract for smart assets (alias for StateBindingConfig) */
export interface BindingContract {
  entityType: string;  // 'unit' | 'device' | 'gate' | 'elevator'
  dataShape: Record<string, DataFieldType>;
  stateMappings: StateMapping[];
  defaultState: DeviceState;
}

/** State binding configuration for smart assets (alias for BindingContract) */
export type StateBindingConfig = BindingContract;

// ============================================================================
// Enhanced Binding System
// ============================================================================

/** Bindable entity types */
export type BindableEntityType = 'unit' | 'device' | 'gate' | 'elevator' | 'door';

/**
 * Entity binding - links a placed object to real-world data
 */
export interface EntityBinding {
  /** Type of entity being bound */
  entityType: BindableEntityType;
  /** ID of the bound entity (from BluLok system) */
  entityId: string;
  /** Display name for reference */
  entityLabel?: string;
  /** Additional binding metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Live state data received from real-time updates
 */
export interface LiveStateData {
  /** Device/entity state */
  state: DeviceState;
  /** Lock status for lockable devices */
  lockStatus?: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error';
  /** Battery level (0-100) */
  batteryLevel?: number;
  /** Online status */
  isOnline?: boolean;
  /** Last activity timestamp */
  lastActivity?: Date;
  /** Raw data from the source */
  rawData?: Record<string, unknown>;
}

/**
 * Simulation state for previewing asset states
 */
export interface SimulationState {
  /** Whether simulation is active */
  isSimulating: boolean;
  /** Simulated device state */
  simulatedState?: DeviceState;
  /** Simulated lock status */
  simulatedLockStatus?: 'locked' | 'unlocked';
  /** Simulated battery level */
  simulatedBatteryLevel?: number;
}

/**
 * Data source configuration for the diagram
 */
export interface DataSourceConfig {
  /** Type of data source */
  type: 'blulok' | 'simulated' | 'none';
  /** BluLok facility ID if type is 'blulok' */
  facilityId?: string;
  /** Facility name for display */
  facilityName?: string;
  /** Whether to auto-connect on load */
  autoConnect?: boolean;
  /** Last sync timestamp */
  lastSync?: Date;
}

/**
 * Property definition for extensible object properties
 */
export interface PropertyDefinition {
  /** Property key */
  key: string;
  /** Display label */
  label: string;
  /** Property type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'color' | 'binding';
  /** Default value */
  defaultValue?: unknown;
  /** Options for select type */
  options?: { value: string; label: string }[];
  /** Whether property is editable */
  editable?: boolean;
  /** Property category for grouping */
  category?: string;
  /** Description/help text */
  description?: string;
}

/**
 * Property section for grouping properties in the editor
 */
export interface PropertySection {
  id: string;
  title: string;
  icon?: string;
  collapsed?: boolean;
  properties: PropertyDefinition[];
}

/** Placed object in the scene */
export interface PlacedObject {
  id: string;
  assetId: string;
  assetMetadata: AssetMetadata; // Full metadata for recreating the asset
  position: GridPosition;
  orientation: Orientation;
  canStack: boolean; // true for walls - can overlap with other assets
  
  /** Display name for the object (user-editable) */
  name?: string;
  
  /** Building and floor information */
  floor: number; // Which floor this object is on (0 = ground, -1 = basement, 1 = second floor)
  buildingId?: string; // If part of a building
  wallAttachment?: {
    wallId: string;
    position: number; // Position along wall (0-1)
  };
  
  /** For smart assets - binding to real data */
  binding?: {
    /** Type of entity to bind to */
    entityType: 'unit' | 'device' | 'facility';
    /** ID of the bound entity */
    entityId?: string;
    /** Current state (updated via subscription) */
    currentState: DeviceState;
  };
  
  /** Custom properties */
  properties: Record<string, unknown>;
  
  /** Visual customization */
  material?: {
    color?: string;
    texture?: string;
  };
  
  /** Skin override ID (reference to a saved skin) */
  skinId?: string;
  
  /** Vertical shaft group - links objects that span multiple floors (e.g., elevators, stairwells) */
  verticalShaftId?: string;
  /** If true, this object should NOT be auto-duplicated to new floors (user opted out) */
  disableVerticalShaft?: boolean;
  
  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Buildings & Floors
// ============================================================================

/** Building footprint - a rectangle that forms part of a building */
export interface BuildingFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Floor in a building */
export interface Floor {
  level: number; // 0 = ground, -1 = basement, 1 = second floor, etc.
  height: number; // Height in grid units (default 4)
  groundTileIds: string[]; // IDs of concrete floor tiles
}

/** Wall opening (door or window) */
export interface WallOpening {
  id: string;
  type: 'door' | 'window';
  objectId: string; // ID of the door/window object
  position: number; // Position along wall (0-1)
  width: number; // Width in grid units
}

/** Building wall segment */
export interface BuildingWall {
  id: string;
  buildingId: string;
  startPos: GridPosition;
  endPos: GridPosition;
  floorLevel: number;
  isExterior: boolean;
  openings: WallOpening[];
  meshId?: string; // ID of the wall mesh in the scene
}

/** Interior wall segment */
export interface InteriorWall {
  id: string;
  buildingId: string;
  startPos: GridPosition;
  endPos: GridPosition;
  floorLevel: number;
  meshId?: string;
}

/** Building entity */
export interface Building {
  id: string;
  name: string;
  footprints: BuildingFootprint[]; // Can have multiple rectangles that merge
  floors: Floor[];
  walls: BuildingWall[];
  interiorWalls: InteriorWall[];
  roofMeshId?: string; // ID of the roof mesh (only visible in Full View mode)
  skinType?: BuildingSkinType; // Wall material skin
  createdAt: Date;
  updatedAt: Date;
}

/** Decoration subtypes for cosmetic assets */
export enum DecorationType {
  TREE_OAK = 'tree_oak',
  TREE_PINE = 'tree_pine',
  TREE_PALM = 'tree_palm',
  SHRUB = 'shrub',
  PLANTER = 'planter',
  BENCH = 'bench',
  LAMP_POST = 'lamp_post',
}

/** Floor height constant (in grid units) */
export const FLOOR_HEIGHT = 4;

// ============================================================================
// Skins & Materials
// ============================================================================

/** Building materials configuration - used for applying themes to buildings */
export interface BuildingMaterials {
  wall: PartMaterial;
  floor: PartMaterial;
  roof: PartMaterial;
}

/** Material configuration for a single part of an asset */
export interface PartMaterial {
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  /** Optional texture URL - loaded on-demand */
  textureUrl?: string;
  /** Normal map URL for bump/detail */
  normalMapUrl?: string;
  /** Roughness map URL for surface detail */
  roughnessMapUrl?: string;
  /** Optional shader hint for special themes (e.g., wireframe, glass panes) */
  shader?: 'wireframe' | 'paned-glass' | 'glass-floor' | 'glass-roof';
  /** 
   * Base opacity of the material (used for ghosting calculations).
   * When ghosting is applied, the effective opacity = baseOpacity * ghostOpacity.
   * Defaults to 1.0 for opaque materials, automatically set to material's opacity for transparent materials.
   */
  baseOpacity?: number;
}

/** Asset skin - a collection of material overrides for an asset CATEGORY (not specific asset) */
export interface AssetSkin {
  id: string;
  name: string;
  category: AssetCategory;   // Which asset category this skin applies to (e.g., all storage units)
  isGlobal: boolean;         // Global (shared) or facility-specific
  facilityId?: string;       // If facility-specific
  partMaterials: Record<string, PartMaterial>; // e.g., { "body": {...}, "door": {...} }
  thumbnail?: string;        // Preview image
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Selection
// ============================================================================

/** Selection state */
export interface SelectionState {
  selectedIds: string[];
  hoveredId: string | null;
  isMultiSelect: boolean;
  selectedBuildingId?: string; // When a whole building is selected via double-click
}

/** Selection event */
export interface SelectionEvent {
  type: 'select' | 'deselect' | 'hover' | 'clear';
  objectIds: string[];
  additive: boolean; // Shift-click behavior
}

// ============================================================================
// Editor State
// ============================================================================

/** Editor tool */
export enum EditorTool {
  SELECT = 'select',
  SELECT_BUILDING = 'select_building',  // Building selection mode - for selecting/modifying buildings
  PLACE = 'place',
  MOVE = 'move',
}

/** Editor mode */
export enum EditorMode {
  EDIT = 'edit',
  VIEW = 'view',
  PREVIEW = 'preview',
}

/** Complete editor state */
export interface EditorState {
  mode: EditorMode;
  activeTool: EditorTool;
  camera: CameraState;
  selection: SelectionState;
  snap: SnapConfig;
  
  /** Currently selected asset for placement */
  activeAssetId: string | null;
  activeOrientation: Orientation;
  
  /** Ghost/preview of object being placed */
  placementPreview: {
    assetId: string;
    gridPosition: GridPosition;
    isValid: boolean; // Can place here?
  } | null;
  
  /** Building and floor state */
  activeFloor: number; // Current floor level (0 = ground)
  isFloorMode: boolean; // Whether in floor editing mode
  buildings: Building[];
  
  /** UI state */
  ui: {
    showGrid: boolean;
    showCallouts: boolean;
    showBoundingBoxes: boolean;
    panelsCollapsed: Record<string, boolean>;
  };
}

// ============================================================================
// Scene Data
// ============================================================================

/** Complete scene/facility data */
export interface SceneData {
  id: string;
  name: string;
  description?: string;
  
  /** Scene dimensions */
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  
  /** All placed objects */
  objects: PlacedObject[];
  
  /** Scene settings */
  settings: {
    gridSize: GridSize;
    ambientLightIntensity: number;
    sunLightIntensity: number;
    backgroundColor: string;
  };
  
  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Events
// ============================================================================

/** Engine event types */
export type EngineEventType = 
  | 'ready'
  | 'resize'
  | 'selection-changed'
  | 'object-placed'
  | 'objects-placed'
  | 'object-moved'
  | 'object-deleted'
  | 'camera-changed'
  | 'tool-changed'
  | 'state-updated'
  | 'theme-changed'
  | 'theme-missing'
  | 'scene-theme-applied'
  | 'placement-started'
  | 'placement-blocked'
  | 'history-changed'
  | 'autosave-complete';

/** Engine event */
export interface EngineEvent<T = unknown> {
  type: EngineEventType;
  data: T;
  timestamp: number;
}

/** Event handler */
export type EngineEventHandler<T = unknown> = (event: EngineEvent<T>) => void;

// ============================================================================
// Render Configuration
// ============================================================================

/** Renderer configuration */
export interface RendererConfig {
  antialias: boolean;
  pixelRatio: number;
  shadowMap: boolean;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
}

/** Default renderer config */
export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  antialias: true,
  pixelRatio: Math.min(window.devicePixelRatio, 2), // Cap for performance
  shadowMap: true,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0,
};

/** Grid visual config */
export interface GridConfig {
  size: number;           // Total grid size
  divisions: number;      // Number of divisions
  fadeDistance: number;   // Distance at which grid fades
  primaryColor: string;
  secondaryColor: string;
  opacity: number;
  secondaryOpacity?: number; // Fine grid line opacity (higher for dark theme)
}

/** Default grid config for light theme */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  size: 200,
  divisions: 200,
  fadeDistance: 90,
  primaryColor: '#1f8bff',
  secondaryColor: '#5a6a8a', // Brighter for visibility
  opacity: 0.55,
  secondaryOpacity: 0.5,
};

/** Dark theme grid config - brighter lines */
export const DARK_THEME_GRID_CONFIG: GridConfig = {
  size: 200,
  divisions: 200,
  fadeDistance: 90,
  primaryColor: '#4da6ff', // Brighter primary
  secondaryColor: '#8899bb', // Much brighter secondary for dark bg
  opacity: 0.65,           // Higher overall opacity
  secondaryOpacity: 0.7,   // Much more visible fine grid
};

/** Lighting config */
export interface LightingConfig {
  ambient: {
    color: string;
    intensity: number;
  };
  directional: {
    color: string;
    intensity: number;
    position: [number, number, number];
    castShadow: boolean;
    shadowMapSize: number;
  };
}

/** Default lighting config */
export const DEFAULT_LIGHTING_CONFIG: LightingConfig = {
  ambient: {
    color: '#ffffff',
    intensity: 0.6,
  },
  directional: {
    color: '#ffffff',
    intensity: 0.8,
    position: [50, 100, 50],
    castShadow: true,
    shadowMapSize: 2048,
  },
};

// ============================================================================
// Save/Load System
// ============================================================================

/**
 * Serialized (minimal) version of PlacedObject for efficient storage.
 * Does NOT include assetMetadata - that's reconstructed from AssetRegistry on load.
 */
export interface SerializedPlacedObject {
  id: string;
  assetId: string;
  position: GridPosition;
  orientation: Orientation;
  floor?: number;
  buildingId?: string;
  name?: string;  // User-defined display name
  wallAttachment?: {
    wallId: string;
    position: number;
  };
  binding?: {
    entityType: 'unit' | 'device' | 'facility';
    entityId?: string;
  };
  skinId?: string;  // Reference to skin by ID, not full material data
  properties?: Record<string, unknown>;
}

/**
 * Serialized building for efficient storage.
 * Wall meshIds are runtime-generated, don't store them.
 */
export interface SerializedBuilding {
  id: string;
  name: string;
  footprints: BuildingFootprint[];
  floors: { level: number; height: number }[]; // Don't store groundTileIds - regenerated
}

/** Facility data for saving/loading (optimized) */
export interface FacilityData {
  name: string;
  version: string;
  camera: CameraState;
  placedObjects: SerializedPlacedObject[];  // Optimized format
  buildings: SerializedBuilding[];          // Optimized format
  activeFloor: number;
  activeSkins: Record<string, string>;      // category -> skinId mapping for active skins per asset type
  activeThemeId?: string;                   // Selected scene theme ID
  gridSize: GridSize;
  showGrid: boolean;
  /** Data source configuration for live data binding */
  dataSource?: DataSourceConfig;
  /** Whether simulation mode is enabled */
  simulationMode?: boolean;
}

/**
 * Legacy facility data format (for backwards compatibility)
 */
export interface LegacyFacilityData {
  name: string;
  version: string;
  camera: CameraState;
  placedObjects: PlacedObject[];
  buildings: Building[];
  activeFloor: number;
  skins?: AssetSkin[];
  gridSize: GridSize;
  showGrid: boolean;
}

/** Facility summary for list/catalog views */
export interface FacilitySummary {
  id: string;
  name: string;
  thumbnail: string | null;
  lastOpened: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

