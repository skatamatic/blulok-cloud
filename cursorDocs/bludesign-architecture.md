# BluDesign Architecture

BluDesign is a high-performance 3D facility design and visualization system built on Three.js. It provides tools for creating interactive 3D renders of storage facilities with smart asset binding capabilities.

## Overview

The system consists of:
- **Editor Mode**: Full 3D editing environment for creating/editing facilities
- **View Mode**: Read-only catalog and viewer for inspecting facilities
- **Assets View**: Asset catalog and skinning/texture system

## System Architecture

BluDesign is a full-stack system with:
- **Frontend**: Three.js-based 3D editor with React UI components
- **Backend**: Isolated API module for projects, assets, and facilities
- **Storage**: Pluggable storage providers (local, GCS, Google Drive)
- **Database**: Dedicated tables for BluDesign entities (isolated from BluLok)

## Backend Architecture (`backend/src/bludesign/`)

### Types (`types/bludesign.types.ts`)
Comprehensive type definitions:
- Asset categories and geometry types
- Material slots and branding overrides
- Smart binding contracts with state mappings
- Facility and project structures
- Storage provider configurations

### Storage Providers (`services/storage/`)

#### `storage-provider.interface.ts`
Abstract interface for storage backends:
- Asset file upload/download
- Texture management
- Facility manifest storage
- Project initialization/cleanup
- Zip export/import
- Signed URL generation

#### `local.provider.ts`
File-based storage implementation:
- Project directory structure
- Asset and texture file management
- Zip export with archiver
- Storage usage calculation

#### `storage.factory.ts`
Provider factory and validation:
- Creates provider instances from config
- Validates storage configuration
- Provider caching for reuse

### Models (`models/`)

#### `bludesign-project.model.ts`
Multi-tenant project containers:
- CRUD operations with ownership checks
- Storage provider configuration
- Default branding settings

#### `bludesign-asset.model.ts`
Asset metadata storage:
- Category and geometry filtering
- Smart binding contracts
- Version management
- Project scoping

#### `bludesign-facility.model.ts`
Facility scene storage:
- Placed objects with transforms
- Asset manifest tracking
- Scene settings
- Object CRUD operations

### Routes (`routes/`)

#### `projects.routes.ts`
Project management API:
- `GET /api/v1/bludesign/projects` - List user's projects
- `POST /api/v1/bludesign/projects` - Create project
- `PUT /api/v1/bludesign/projects/:id` - Update project
- `DELETE /api/v1/bludesign/projects/:id` - Delete project
- `GET /api/v1/bludesign/projects/:id/storage-usage` - Get storage stats

#### `assets.routes.ts`
Asset management API:
- `GET .../assets` - List project assets
- `POST .../assets` - Create asset
- `PUT .../assets/:id` - Update asset
- `DELETE .../assets/:id` - Delete asset
- `POST .../assets/:id/upload` - Upload geometry file
- `POST .../assets/:id/textures` - Upload texture
- `GET .../assets/:id/download/:filename` - Download file

#### `facilities.routes.ts`
Facility management API:
- `GET .../facilities` - List project facilities
- `POST .../facilities` - Create facility
- `PUT .../facilities/:id` - Update facility
- `DELETE .../facilities/:id` - Delete facility
- `POST .../facilities/:id/objects` - Place object
- `PUT .../facilities/:id/objects/:objectId` - Update object
- `DELETE .../facilities/:id/objects/:objectId` - Remove object
- `PUT .../facilities/:id/objects` - Bulk update (save scene)
- `GET .../facilities/:id/export` - Export as zip

### Database Schema (`migrations/037_bludesign_tables.ts`)

```
bludesign_projects
├── id, name, description
├── owner_id (FK → users)
├── storage_provider, storage_config
└── default_branding

bludesign_assets
├── id, project_id (FK)
├── name, version, category
├── geometry_type, geometry_source, primitive_spec
├── materials, is_smart, binding_contract
└── metadata, created_by

bludesign_facilities
├── id, project_id (FK)
├── name, description, version
├── asset_manifest, objects, settings
├── branding_config, linked_facility_id (FK → facilities)
└── created_by

bludesign_storage_configs
├── id, user_id (FK)
├── provider_type, credentials_encrypted
└── display_name, is_default

bludesign_asset_textures
├── id, asset_id (FK)
├── slot_name, filename, content_type
└── file_size, storage_path

bludesign_facility_snapshots
├── id, facility_id (FK)
├── version, label
└── snapshot_data, created_by
```

## Frontend Architecture

### Core Module (`/components/bludesign/core/`)

#### `types.ts`
Comprehensive type definitions for the entire system:
- Grid & positioning (GridSize, Orientation, GridPosition)
- Camera & view modes (CameraMode, IsometricAngle)
- Assets & objects (AssetCategory, StorageUnitSize, DeviceState)
- Editor state (EditorTool, EditorMode, EditorState)
- Event system types

#### `BluDesignEngine.ts`
Main engine class managing:
- Three.js WebGLRenderer and CSS2DRenderer
- Scene lifecycle and render loop
- Subsystem coordination
- Event system for React integration

#### `SceneManager.ts`
Handles scene-level operations:
- Lighting setup (ambient + directional sun)
- Object management (add/remove/update)
- Material and highlight management
- Scene traversal and querying

#### `CameraController.ts`
Manages camera modes:
- **Free Mode**: OrbitControls-based navigation
- **Isometric Mode**: Fixed-angle RTS-style view (like RollerCoaster Tycoon)
- Smooth animated transitions between views
- Keyboard shortcuts for rotation (Q/E)

#### `GridSystem.ts`
Infinite grid with custom shader:
- Distance-based fade effect
- Configurable primary/secondary lines
- Grid snapping for object placement
- Grid-to-world coordinate conversion

#### `SelectionManager.ts`
Selection via raycasting:
- Single and multi-select (Shift+click)
- Hover state tracking
- Keyboard shortcuts (Escape, Ctrl+A)
- Selection change events

### UI Module (`/components/bludesign/ui/panels/`)

#### `PanelContainer.tsx`
Reusable collapsible panel system:
- Position on any edge (left, right, top, bottom)
- Animated collapse/expand
- Dark theme matching editor aesthetic
- Sub-components: PanelSection, PanelButton, PanelGrid, PanelDivider

#### `ToolboxPanel.tsx`
Tool selection panel:
- Select, Place, Move, Rotate, Delete, Measure
- Keyboard shortcut hints

#### `ViewControlsPanel.tsx`
Camera and display controls:
- Free/Isometric mode toggle
- Isometric rotation controls
- Grid and callout visibility toggles

#### `PropertiesPanel.tsx`
Selection properties editor:
- Transform controls (position, orientation)
- Data binding info for smart assets
- Multi-selection support

#### `AssetBrowserPanel.tsx`
Asset catalog and selection:
- Search and category filtering
- Grid display with thumbnails
- Smart asset indicators

### Assets Module (`/components/bludesign/assets/`)

#### `AssetFactory.ts`
Creates 3D meshes for assets:
- Storage units with state-dependent materials
- Gates with animated bars
- Elevators with doors
- Structural elements (walls, floors, doors)
- Outdoor elements (fences)
- State indicator lights

#### `AssetRegistry.ts`
Central asset catalog:
- Built-in asset definitions
- State binding configurations
- State evaluation from data
- Custom asset registration

### Hooks Module (`/components/bludesign/hooks/`)

#### `useBluDesignEngine.ts`
React hook for engine lifecycle:
- Container ref management
- State synchronization
- Action callbacks

#### `useKeyboardShortcuts.ts`
Keyboard shortcut management:
- Tool shortcuts (V, P, M, R, X, U)
- Camera shortcuts (Q, E, F, G)
- Standard shortcuts (Ctrl+D, Ctrl+Z, Escape)

#### `useAssetLoader.ts`
Asset loading hook with progress:
- Single and batch asset loading
- Progress state management
- Error handling
- Asset caching

### Loading Module (`/components/bludesign/loading/`)

#### `LoadingManager.ts`
Central loading orchestrator:
- Three.js loader management (GLTF, FBX, textures)
- DRACO decoder for compressed models
- Progress tracking and callbacks
- Asset caching
- Batch loading with progress

#### `AssetLoader.ts`
High-level asset loading:
- BluDesign asset type handling
- Material processing and application
- Branding override support
- Shadow configuration
- Asset cloning for placement

### Loading UI (`/components/bludesign/ui/`)

#### `LoadingOverlay.tsx`
Full-screen loading display:
- Animated progress bar
- Phase indicators
- Item counts
- Error display
- Themed for BluDesign aesthetic

#### `AssetLoadingCard.tsx`
Per-asset loading indicators:
- Status icons
- Progress bars
- Error messages
- List view with summary

#### `LoadingProgress.tsx`
Progress indicator components:
- CircularProgress
- LinearProgress
- IndeterminateProgress
- ProgressCard
- StepProgress

### Main Component

#### `EditorCanvas.tsx`
React component integrating everything:
- Engine initialization
- Panel layout
- State synchronization
- Event handling

## Grid System

The editor uses a grid-based placement system:
- Minimum grid size = 1 unit (tiny locker ~3ft)
- Objects snap to grid intersections
- 4 fixed orientations (N/E/S/W - 0°/90°/180°/270°)
- Multi-floor support (Y position)

## Smart Assets

Smart assets can bind to real data:

```typescript
interface StateBindingConfig {
  dataShape: Record<string, 'string' | 'number' | 'boolean' | 'object'>;
  stateMappings: StateMapping[];
  defaultState: DeviceState;
}
```

State evaluation:
1. Data arrives via WebSocket subscription
2. AssetRegistry evaluates data against state mappings
3. Highest-priority matching condition determines state
4. AssetFactory updates visual appearance

## Camera Modes

### Free Mode
- Full orbit camera controls
- Pan, rotate, zoom
- Best for detailed editing

### Isometric Mode
- Fixed 45° angle from corners (NE, SE, SW, NW)
- Animated rotation between angles
- Restricted zoom/pan
- RTS-game style navigation

## Events

Engine emits events for React integration:
- `ready`: Engine initialized
- `resize`: Container resized
- `selection-changed`: Selection modified
- `camera-changed`: Camera state changed
- `tool-changed`: Active tool changed

## File Structure

### Backend
```
backend/src/bludesign/
├── types/
│   └── bludesign.types.ts    # All type definitions
├── models/
│   ├── bludesign-project.model.ts
│   ├── bludesign-asset.model.ts
│   ├── bludesign-facility.model.ts
│   └── index.ts
├── services/storage/
│   ├── storage-provider.interface.ts
│   ├── storage.factory.ts
│   ├── local.provider.ts
│   └── index.ts
├── routes/
│   ├── projects.routes.ts
│   ├── assets.routes.ts
│   ├── facilities.routes.ts
│   └── index.ts
└── index.ts                  # Module exports
```

### Frontend
```
frontend/src/components/bludesign/
├── core/
│   ├── types.ts              # Type definitions
│   ├── BluDesignEngine.ts    # Main engine
│   ├── SceneManager.ts       # Scene management
│   ├── CameraController.ts   # Camera system
│   ├── GridSystem.ts         # Grid rendering
│   ├── SelectionManager.ts   # Selection system
│   └── index.ts
├── ui/panels/
│   ├── PanelContainer.tsx    # Panel system
│   ├── ToolboxPanel.tsx      # Tools panel
│   ├── ViewControlsPanel.tsx # View controls
│   ├── PropertiesPanel.tsx   # Properties editor
│   ├── AssetBrowserPanel.tsx # Asset catalog
│   └── index.ts
├── ui/
│   ├── LoadingOverlay.tsx    # Full-screen loader
│   ├── AssetLoadingCard.tsx  # Per-asset loading
│   └── LoadingProgress.tsx   # Progress components
├── loading/
│   ├── LoadingManager.ts     # Central loader
│   ├── AssetLoader.ts        # Asset loading
│   └── index.ts
├── assets/
│   ├── AssetFactory.ts       # Mesh creation
│   ├── AssetRegistry.ts      # Asset catalog
│   └── index.ts
├── hooks/
│   ├── useBluDesignEngine.ts # Engine hook
│   ├── useKeyboardShortcuts.ts
│   ├── useAssetLoader.ts     # Asset loading hook
│   └── index.ts
├── EditorCanvas.tsx          # Main component
└── index.ts                  # Public exports
```

## Performance Considerations

- Shader-based infinite grid (no mesh generation)
- Material reuse via shared material instances
- Efficient raycasting with selectability filtering
- RequestAnimationFrame-based render loop
- Pixel ratio capping (max 2x)
- PCF soft shadows with configurable map size

## Theme System

The editor uses a comprehensive theme system for consistent material styling across all assets.

### Theme Palettes (`ThemeManager.ts`)

Themes define materials for all asset types in a coordinated palette:

```typescript
interface ThemePalette {
  id: string;
  name: string;
  description: string;
  
  // Core materials
  primary: PartMaterial;
  secondary: PartMaterial;
  accent: PartMaterial;
  
  // Structural materials
  wall: PartMaterial;
  floor: PartMaterial;
  roof: PartMaterial;
  
  // Smart asset materials
  unitLocked: PartMaterial;
  unitUnlocked: PartMaterial;
  unitError: PartMaterial;
  door: PartMaterial;
  doorFrame: PartMaterial;
  
  // Outdoor materials
  grass: PartMaterial;
  pavement: PartMaterial;
  gravel: PartMaterial;
  fence: PartMaterial;
}
```

### Built-in Themes
- **Default**: Clean professional storage facility look
- **Industrial**: Modern warehouse aesthetic with metal accents
- **Warm Earth**: Terracotta and earth tones
- **Modern White**: Clean white with blue accents
- **Dark Premium**: Sophisticated dark theme with gold accents

### Theme Hierarchy
1. **Scene Theme**: Global default for all assets
2. **Building Skin**: Override for specific buildings (brick, glass, etc.)
3. **Per-Object Override**: Individual object material overrides

### Theme Application Flow

When a theme is selected:
1. `ThemeManager.setActiveTheme()` is called
2. ThemeManager notifies all registered listeners via `onThemeChange` callbacks
3. `BluDesignEngine.applyThemeToScene()` updates all scene materials:
   - Building walls, floors, roofs via `BuildingManager.applyThemeMaterials()`
   - Placed objects (units, doors) via part-to-theme slot mapping
   - Ground/grass color update
4. Objects with per-object skin overrides are skipped

### Theme Editor (Assets Page)
- Located in BluDesign Assets page under "Themes" tab
- Full color picker for each material slot
- Metalness/roughness/opacity sliders
- Quick presets (Matte, Satin, Glossy, Metal, Chrome)
- Color swatch preview grid showing all theme materials
- **Batch Edit Mode**: Edit entire material groups at once
  - Core Colors (primary, secondary, accent)
  - Building Structure (wall, floor, roof)
  - Storage Units (locked, unlocked, error states)
  - Doors & Frames
  - Outdoor Surfaces (grass, pavement, gravel, fence)

### Theme Selector (Editor Panel)
- Simple theme selection in main editor
- Shows built-in and custom themes with color previews
- "Manage Themes" opens Assets page for full editing
- Duplicate themes directly for quick customization

### Default Material Storage
When skins are applied, the original default materials are stored in `userData.defaultMaterial` on each mesh, allowing proper reset to defaults when the skin is removed.

## Building Skins

Buildings also support their own skin types for quick style changes:

### Built-in Building Skins
- **Default**: Standard clean appearance
- **Brick**: Classic red brick exterior
- **Glass**: Transparent floor-to-ceiling glass facade
- **Concrete**: Industrial concrete finish
- **Metal**: Industrial metal cladding

## Asset Skins (Category-Based)

The `SkinManager` provides a category-based skinning system for placed assets. Unlike building skins, asset skins apply to **all assets of the same category** (e.g., all storage units regardless of size).

### Key Concepts

```typescript
interface AssetSkin {
  id: string;
  name: string;
  category: AssetCategory;   // e.g., STORAGE_UNIT, GATE, DOOR
  isGlobal: boolean;         // Shared across facilities or facility-specific
  partMaterials: Record<string, PartMaterial>; // Material per part name
}
```

### Skin Hierarchy

1. **Per-Object Override**: Individual object's `skinId` takes priority
2. **Category Active Skin**: Skin set for the entire category
3. **Theme Materials**: Default theme materials as fallback

### Usage Flow

1. Create a skin from the Asset Editor:
   - Customize part materials for any asset in a category
   - Save as "Global Skin" (shared) or "Facility Skin"
   
2. The skin automatically applies to ALL assets of that category:
   - A "Blue Units" skin for `STORAGE_UNIT` applies to small, medium, AND large units
   - Consistency across all asset sizes/variants

### SkinManager Methods

```typescript
// Get skins for a category
skinManager.getSkins(AssetCategory.STORAGE_UNIT)

// Apply skin to a mesh
skinManager.applyActiveSkin(mesh, AssetCategory.STORAGE_UNIT)

// Set category-wide active skin
skinManager.setActiveSkin(AssetCategory.GATE, "skin-123")

// Create new skin for a category
skinManager.createSkin({
  name: "Custom Blue",
  category: AssetCategory.STORAGE_UNIT,
  isGlobal: true,
  partMaterials: { body: {...}, door: {...} }
})
```

### Storage

- Global skins: `localStorage['bludesign-global-skins-v2']`
- Facility skins: Stored in facility save data
- Active skins per category: Stored in `FacilityData.activeSkins`

## Decorations

Cosmetic decoration assets for landscaping:

### Available Decorations
- **Trees**: Oak (full/small), Pine (regular/large), Palm
- **Shrubs**: Round shrub, Hedge sections
- **Planters**: Small and large terracotta planters with plants

### Decoration System
- Created via `AssetFactory.createDecoration()`
- Procedurally generated geometry (no external models required)
- Support for custom materials and colors
- Marked with `userData.isDecoration = true`

## Window System

Windows are transparent elements that:
- Use `MeshPhysicalMaterial` with transmission for true transparency
- Snap to walls with `userData.snapsToWalls = true`
- **Actually cut holes in walls** when placed (via `addWallOpening()`)
- Support multiple pane configurations (4-pane, floor-to-ceiling)

### Wall Opening Implementation
When a window/door is placed on a wall:
1. The original wall instance is hidden (scaled to 0.001)
2. Wall segments are created around the opening:
   - Left segment (from wall start to opening)
   - Right segment (from opening to wall end)
   - Top segment (above window, for windows only)
   - Bottom segment (below window, for windows only)
3. The window/door provides the visual fill in the opening
4. When deleted, the wall opening is removed and the original wall restored

### Wall Attachment
```typescript
interface WallOpening {
  id: string;
  type: 'door' | 'window';
  objectId: string;     // ID of the door/window object
  position: number;     // Position along wall (0-1)
  width: number;        // Width in grid units
}
```

## Facility Viewer (Read-only Mode)

The `FacilityViewer3D` component provides a read-only 3D visualization of linked facilities, used in both dashboard widgets and the BluFMS page.

### Location
```
frontend/src/components/bludesign/viewer/
├── FacilityViewer3D.tsx     # Main viewer component
├── ViewerLoadingOverlay.tsx # Loading animation
├── ViewerFloorsPanel.tsx    # Floor selector (bottom-right)
├── ViewerPropertiesPanel.tsx # Selected object properties
└── index.ts
```

### Features
- **Async Loading**: Loads facility data from API with elegant loading animation
- **Floor Navigation**: Collapsible floor selector (bottom-right, similar to editor)
- **Object Selection**: Click objects to view properties
- **Camera Rotation**: 90° rotate buttons at bottom center
- **Real-time Updates**: WebSocket subscription for live smart asset states
- **Theme Support**: Matches system light/dark theme

### Usage

```tsx
<FacilityViewer3D
  bluDesignFacilityId="uuid-of-bludesign-facility"
  bluLokFacilityId="uuid-of-blulok-facility"  // For WebSocket subscriptions
  onReady={() => console.log('Viewer ready')}
  onError={(error) => console.error(error)}
/>
```

### Integration Points

1. **Dashboard Widget** (`FacilityViewerWidget`):
   - Huge-size widget showing linked facility 3D view
   - Only available for facilities with linked BluDesign models
   - Widget type: `facility-viewer`

2. **BluFMS Facility Map Page**:
   - Shows 3D viewer when facility has `bluDesignFacilityId`
   - Falls back to placeholder when no 3D model is linked

### Facility Linking

Facilities are linked via the `bludesign_facilities.linked_facility_id` column:
- BluDesign facilities can be linked to BluLok facilities
- The API returns `bluDesignFacilityId` on BluLok facility objects
- Managed via BluDesign Config page

### WebSocket State Updates

The viewer subscribes to `facility_state_update` messages:

```typescript
interface SmartAssetState {
  entityId: string;
  entityType: 'unit' | 'gate' | 'elevator' | 'door';
  state: DeviceState;  // locked, unlocked, error, maintenance, offline
  lockStatus?: string;
  batteryLevel?: number;
  lastActivity?: string;
}
```

When state updates arrive, the viewer:
1. Finds objects bound to the entity
2. Updates their visual state via `engine.simulateObjectState()`
3. Reflects changes immediately in the 3D scene

## Future Enhancements

- [ ] Undo/redo system
- [x] Asset preview during placement
- [x] Copy/paste functionality
- [x] Multi-floor editing
- [x] Scene serialization/loading (backend complete)
- [x] WebSocket state binding (viewer mode)
- [x] Custom asset import (backend complete)
- [ ] Texture/material editor
- [ ] Google Cloud Storage provider
- [ ] Google Drive provider
- [x] Building skins (brick, glass, etc.)
- [x] Decoration assets (trees, shrubs, planters)
- [ ] GLB export for portable scenes
- [x] Read-only facility viewer component
- [x] Dashboard widget for 3D facility view

