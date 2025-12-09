/**
 * BluDesign Type Definitions
 * 
 * Comprehensive types for the BluDesign 3D facility design system.
 * Includes asset definitions, facility manifests, storage providers,
 * and smart binding contracts.
 */

// ============================================================================
// Asset Categories & Enums
// ============================================================================

export enum AssetCategory {
  // Smart assets (bind to real data)
  STORAGE_UNIT = 'storage_unit',
  GATE = 'gate',
  ELEVATOR = 'elevator',
  ACCESS_CONTROL = 'access_control',
  
  // Structural
  WALL = 'wall',
  FLOOR = 'floor',
  CEILING = 'ceiling',
  STAIRWELL = 'stairwell',
  DOOR = 'door',
  
  // Outdoor
  PAVEMENT = 'pavement',
  GRASS = 'grass',
  GRAVEL = 'gravel',
  FENCE = 'fence',
  
  // Utility
  MARKER = 'marker',
  LABEL = 'label',
}

export enum GeometryType {
  PRIMITIVE = 'primitive',
  GLTF = 'gltf',
  GLB = 'glb',
  FBX = 'fbx',
}

export enum PrimitiveType {
  BOX = 'box',
  CYLINDER = 'cylinder',
  SPHERE = 'sphere',
  PLANE = 'plane',
  CONE = 'cone',
  TORUS = 'torus',
}

export enum DeviceState {
  UNKNOWN = 'unknown',
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
  OFFLINE = 'offline',
}

export enum StorageProviderType {
  LOCAL = 'local',
  GCS = 'gcs',
  GDRIVE = 'gdrive',
}

export enum Orientation {
  NORTH = 0,
  EAST = 90,
  SOUTH = 180,
  WEST = 270,
}

// ============================================================================
// Primitive Specifications
// ============================================================================

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

// ============================================================================
// Materials & Textures
// ============================================================================

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

export interface BrandingOverride {
  slotName: string;
  color?: string;
  textureUrl?: string;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  overrides: BrandingOverride[];
}

// ============================================================================
// Smart Binding Contracts
// ============================================================================

export type DataFieldType = 'string' | 'number' | 'boolean' | 'object';

export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface StateCondition {
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

export interface StateMapping {
  condition: StateCondition;
  resultState: DeviceState;
  priority: number;
}

export interface BindingContract {
  entityType: string;  // 'unit' | 'device' | 'gate' | 'elevator'
  dataShape: Record<string, DataFieldType>;
  stateMappings: StateMapping[];
  defaultState: DeviceState;
}

// ============================================================================
// Asset Definition
// ============================================================================

export interface AssetDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface AssetGridUnits {
  x: number;
  z: number;
}

export interface AssetMetadata {
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

export interface AssetGeometry {
  type: GeometryType;
  source?: string;  // URL/path for external files (gltf, glb, fbx)
  primitiveSpec?: PrimitiveSpec;  // For procedural primitive assets
}

export interface AssetMaterials {
  slots: Record<string, MaterialSlot>;
  brandingOverrides?: BrandingOverride[];
}

export interface BluDesignAsset {
  id: string;
  projectId: string;
  name: string;
  version: string;
  category: AssetCategory;
  
  geometry: AssetGeometry;
  materials: AssetMaterials;
  
  isSmart: boolean;
  binding?: BindingContract;
  
  metadata: AssetMetadata;
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Placed Object (Instance of Asset in Facility)
// ============================================================================

export interface GridPosition {
  x: number;
  z: number;
  y?: number;  // For multi-floor support
}

export interface ObjectBinding {
  entityType: string;
  entityId?: string;  // Bound BluLok entity ID
  currentState: DeviceState;
}

export interface PlacedObject {
  id: string;
  assetId: string;
  position: GridPosition;
  orientation: Orientation;
  
  binding?: ObjectBinding;
  
  materialOverrides?: BrandingOverride[];
  customProperties?: Record<string, unknown>;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Scene Settings
// ============================================================================

export interface LightingSettings {
  ambientColor: string;
  ambientIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
  castShadows: boolean;
}

export interface GridSettings {
  size: number;
  divisions: number;
  primaryColor: string;
  secondaryColor: string;
  fadeDistance: number;
}

export interface SceneSettings {
  backgroundColor: string;
  lighting: LightingSettings;
  grid: GridSettings;
  bounds?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

// ============================================================================
// Facility Definition
// ============================================================================

export interface BluDesignFacility {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  version: string;
  
  assetManifest: string[];  // Asset IDs used in this facility
  objects: PlacedObject[];
  settings: SceneSettings;
  
  brandingConfig?: BrandingConfig;
  
  // Optional link to actual BluLok facility for smart binding
  linkedFacilityId?: string;
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Project (Multi-tenant Container)
// ============================================================================

export interface BluDesignProject {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  
  storageProvider: StorageProviderType;
  storageConfig?: Record<string, unknown>;  // Provider-specific config
  
  // Default branding for all facilities in project
  defaultBranding?: BrandingConfig;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Storage Configuration
// ============================================================================

export interface StorageConfig {
  id: string;
  userId: string;
  providerType: StorageProviderType;
  credentials: Record<string, unknown>;  // Encrypted in DB
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalStorageConfig {
  basePath: string;
}

export interface GCSStorageConfig {
  bucketName: string;
  projectId: string;
  keyFile?: string;  // Path to service account key
}

export interface GDriveStorageConfig {
  folderId: string;
  accessToken?: string;
  refreshToken?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateAssetRequest {
  name: string;
  category: AssetCategory;
  geometry: AssetGeometry;
  materials?: AssetMaterials;
  isSmart?: boolean;
  binding?: BindingContract;
  metadata: AssetMetadata;
}

export interface UpdateAssetRequest {
  name?: string;
  geometry?: AssetGeometry;
  materials?: AssetMaterials;
  binding?: BindingContract;
  metadata?: Partial<AssetMetadata>;
}

export interface CreateFacilityRequest {
  name: string;
  description?: string;
  settings?: Partial<SceneSettings>;
  brandingConfig?: BrandingConfig;
  linkedFacilityId?: string;
}

export interface UpdateFacilityRequest {
  name?: string;
  description?: string;
  objects?: PlacedObject[];
  settings?: Partial<SceneSettings>;
  brandingConfig?: BrandingConfig;
  linkedFacilityId?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  storageProvider?: StorageProviderType;
  storageConfig?: Record<string, unknown>;
  defaultBranding?: BrandingConfig;
}

export interface PlaceObjectRequest {
  assetId: string;
  position: GridPosition;
  orientation: Orientation;
  binding?: {
    entityType: string;
    entityId?: string;
  };
  materialOverrides?: BrandingOverride[];
}

export interface UpdateObjectRequest {
  position?: GridPosition;
  orientation?: Orientation;
  binding?: {
    entityType: string;
    entityId?: string;
  };
  materialOverrides?: BrandingOverride[];
}

// ============================================================================
// Loading Progress Types (for frontend)
// ============================================================================

export interface LoadingProgress {
  phase: 'initializing' | 'downloading' | 'parsing' | 'creating' | 'complete' | 'error';
  current: number;
  total: number;
  percentage: number;
  currentItem?: string;
  message?: string;
  error?: string;
}

export interface AssetLoadResult {
  assetId: string;
  success: boolean;
  error?: string;
}

export interface FacilityLoadResult {
  facilityId: string;
  success: boolean;
  assetsLoaded: number;
  assetsFailed: number;
  errors: string[];
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportOptions {
  format: 'zip' | 'glb';
  includeAssets: boolean;
  embedTextures: boolean;
  optimizeGeometry: boolean;
}

export interface ExportResult {
  success: boolean;
  downloadUrl?: string;
  fileSize?: number;
  error?: string;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundColor: '#1a1a2e',
  lighting: {
    ambientColor: '#ffffff',
    ambientIntensity: 0.6,
    directionalColor: '#ffffff',
    directionalIntensity: 0.8,
    directionalPosition: [50, 100, 50],
    castShadows: true,
  },
  grid: {
    size: 200,
    divisions: 200,
    primaryColor: '#147FD4',
    secondaryColor: '#333333',
    fadeDistance: 80,
  },
};

export const DEFAULT_MATERIAL_SLOT: MaterialSlot = {
  name: 'default',
  defaultColor: '#808080',
  metalness: 0.3,
  roughness: 0.7,
  allowBrandingOverride: true,
};

