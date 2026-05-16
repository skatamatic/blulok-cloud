# BluDesign Architecture

BluDesign is a high-performance 3D facility design and visualization system built on Three.js. It provides tools for creating interactive 3D renders of storage facilities with smart asset binding capabilities.

## Overview

The system consists of:
- **Editor Mode**: Full 3D editing environment for creating/editing facilities
- **View Mode**: Read-only catalog and viewer for inspecting facilities
- **Assets View**: Asset catalog and skinning/texture system

### Working grid alignment (build editor, session-only)

Users can align the **placement snap grid** and **floor grid** to a selected object’s facing so angled rows are extended with normal click/drag placement (no repeated Alt+drag). **Align grid to selection** (viewport toggle or **Ctrl+Alt+A**) sets a rotated working frame using the selection’s **grid anchor** (cell min corner), not the mesh pivot; **Reset** restores world axes (**Ctrl+Alt+R** or toggle off). The floor grid shader draws lines in that working frame so visuals match snapping; the grid plane mesh is not yaw-rotated (yaw lives only in shader uniforms and `gridToWorld` / `worldToGrid` math) so the drawn grid cannot drift from placement snapping. **Rotation convention**: `GridSystem`'s UV↔World transforms use Three.js's Y-rotation convention (`localUVToWorldDelta`: `x = u*cos + v*sin`, `z = -u*sin + v*cos`; shader inverse matches) so grid U/V axes are exactly the asset's local X/Z axes at the stored `alignmentYaw`. **`computeWorkingGridAlignmentFromPlacedMesh`** uses the **footprint center** in world space (mesh world position minus `internalXOffset` / `internalZOffset`), not the raw mesh pivot, when solving for the alignment origin so grid phase matches assets whose model pivot is offset from the footprint center. Its **yaw** is the **full** world Y rotation from `getEffectiveRotation(placedObject)` (same as placement), not “fine” rotation after subtracting cardinal orientation — otherwise pure N/E/S/W objects got yaw `0` while the mesh was at 90°, and the floor grid stayed world-axis. Footprint **centers** for ghosts and meshes use `gridToWorld(anchor + footprint/2)` so placement stays flush when yaw ≠ 0. This state is **not** saved in facility manifests. **Changing the active floor** clears working grid alignment so each floor starts from world axes until aligned again. **Building footprint** placement uses world-axis grid rectangles internally; with a rotated working grid active, finishing a building drag is blocked until the user resets alignment. **Alt+drag** remains the opt-in flow for angled multi-placement without changing the global working grid. **Alt+Q/E** fine-rotates the placement ghost when the working grid is world-aligned and a placement is active (not while a rotated working grid is enabled).

### Facility save format (frontend)

`FacilityData` v2 serialization (placed objects, buildings, skins, optional validation) is implemented as **pure functions** in `frontend/src/components/bludesign/core/serialization/facilitySerialization.ts`. `BluDesignEngine.exportSceneData()` delegates to this module so there is a single source of truth. **Import** uses `serialization/facilityImportHelpers.ts` for legacy-vs-v2 detection and unique serialized asset IDs (async preload). **Clipboard copy** selection resolution (building footprint + contained objects vs selected ids) lives in `core/clipboard/resolveClipboardCopyContents.ts`. **Paste preview** start (`tryStartClipboardPastePreview`) and **select-all id listing** (`selection/collectSelectableObjectIds`) keep clipboard/placement wiring testable. **Building materials** for `applyThemeToScene` (preset skins + registry `buildingSkinId`, glass detection) live in `core/theme/buildingMaterialsFromTheme.ts`. **Placed-object theme pass** (`applyThemeToPlacedSceneObjects`) and **environment / ground tiles** (`applySceneThemeEnvironment`) are separate modules under `core/theme/`. **`applyFullBluDesignSceneTheme`** composes those steps plus **`BuildingManager.applyBuildingMaterials`** and floor-mode ghosting — `BluDesignEngine.applyThemeToScene` delegates to it and emits **`scene-theme-applied`**. **Skin material application** (`applyCategorySkinToObjectGroup`, `applyActiveCategorySkinFromTheme`) and **texture validation** for map slots (`isValidTextureForSkinning`) live under `core/skins/`; **`createPlacedObjectSkinApplicator`** binds **`CachedTextureLoader`** to category skins and active theme resolution for placement/material ports and **`updatePlacedObjectSkin`**. **V2 load path** reconstructs `PlacedObject` via `serialization/reconstructPlacedObjectFromSerialized` before placement. Undo/redo history remains in `ActionHistory` (not a separate service type).

Editor infrastructure split from the main engine file (ongoing): **`core/engine/BluDesignEventBus`** handles typed subscriptions; **`core/engine/FacilityDraftStorage`** wraps local draft read/write (injectable storage for tests); **`core/engine/DraftAutoSaveScheduler`** debounces `exportSceneData` → draft saves and tracks last-save time (engine wires `readonly`, emit `autosave-complete`); **`core/engine/editorInitialState`** builds default `EditorState`; **`core/engine/CachedTextureLoader`** deduplicates skin texture loads by URL. **`core/engine/initializeBluDesignEditorSubsystems`** constructs theme subscription, **`FloorObjectReplication`**, **`FloorViewCoordinator`**, **`FloorStructureOperations`**, and **`DraftAutoSaveScheduler`** from explicit ports (constructor calls it after placement completion exists). **`core/editor/applyEditorToolChange`** normalizes readonly vs edit tool rules, cancels placement when leaving PLACE, and syncs **`SelectionManager`**, default orbit rotation (**`CameraController`**), and **`InputCoordinator`** handler flags — `BluDesignEngine.setTool` delegates here.

**Engine callback extractions (reduce `BluDesignEngine` surface):** **`core/editor/engineSelectionSync`** (`applyEngineSelectionChangeFromManager`) merges **`SelectionManager`** payloads with **`selectedBuildingId`** rules. **`core/building/buildingManagerLifecycleCallbacks`** implements **`BuildingManager`** create/merge/delete/modify hooks + theme refresh. **`core/gizmos/gizmoEngineCallbacks`** builds **`TranslateGizmo`** / **`RotateGizmo`** drag + hover handlers (tool-aware selection re-enable). **`core/editor/optimizationProgressBridge`** maps **`OptimizationManager`** progress to UI events. **`core/editor/editorObjectDeletion`** holds **`removePlacedObjectWithoutHistory`**, ground-cell cleanup, and **`deleteBuildingWithContentsFromScene`**. **`core/placement/computeWorkingGridAlignment`** derives session **`GridAlignment`** from a placed mesh for **align grid to selection**.

**Placed-object smart properties:** **`core/placedObject/placedObjectPropertyUpdates`** implements **`updatePlacedObjectBinding`** (entity-type mapping onto **`PlacedObject.binding`**), **`updatePlacedObjectSkin`** (original-materials restore, registry skins, theme re-apply when cleared), **`updatePlacedObjectSimulationState`** (preview state + **`AssetFactory.updateAssetState`**), and **`updatePlacedObjectAssetVisualState`**. **`BluDesignEngine`** wires scene manager, theme/skin callbacks, autosave, and emits.

**Floor content:** **`core/floors/FloorObjectReplication`** (with a small port interface) performs copying objects between floors and propagating vertical shafts when floors are added — `BluDesignEngine` wires scene/history/emit callbacks into it. **`FloorViewCoordinator`** owns active-floor navigation and full-building vs per-floor view (selection, placement height, ghosting hooks, grid-alignment reset on floor change). **`FloorStructureOperations`** owns add/delete/insert floor flows (building + floor manager shifts, object cleanup, replication seeding, history, theme refresh, navigation, autosave) behind an injectable API. **`core/floors/floorHistoryOperations`** (`FloorHistoryOperations`) centralizes undo/redo side effects for floor add/delete/insert history actions; `HistoryActionApplier` delegates to it.

**Placed-object placement:** **`core/placement/PlacedObjectPlacementCoordinator`** (injectable ports for grid, scene, building walls/openings, ground tiles, floor ghosting, and material/skin hooks) owns facility-load placement, undo/redo re-placement (`placeForHistory`), interactive single placement (`placeInteractiveSingle`), and non–ground-tile batch mesh placement (`placeBatchNonGroundMesh`). **`core/placement/PlacementCompletionService`** completes interactive placement (single asset, vertical shaft multi-floor, batch tiles, new building footprint) with smart naming via **`core/placement/smartAssetHelpers`**. **`core/placement/runBatchAssetPlacement`** handles large ground-tile + non-ground batches (progress overlay, optimization thresholds, single `pushBatchPlace`). **`core/placement/moveObjectInternal`** and **`core/placement/applyRotationState`** apply grid/exact moves and rotation snapshots for undo/redo and building translate (no UI). Pure helpers live in **`core/placement/effectiveRotation`**. **Interactive selection rotation:** **`collectMeshesForSelectionRotation`**, **`applySelectionRotationByAngle`** (pivot + grid occupancy for multi-select; in-place yaw for single), and **`syncPlacedObjectOrientationFromWorldYaw`** — `BluDesignEngine.rotateSelectionByAngle` delegates here and schedules autosave after. `ORIGINAL_MATERIALS_SKIN_ID` is defined in **`core/placement/placementConstants`** and re-exported from `BluDesignEngine` for UI.

**Selection / delete:** **`core/selection/parseFloorTileSelectionId`** parses `floor-tile-{buildingId}-{floor}-{x}-{z}` ids (UUID building ids use “last three numeric segments” rule). **`core/selection/runDeleteSelection`** coordinates whole-building shortcuts, wall→building, partial floor cells, and object deletes with injectable building/grid/history ports; **`BluDesignEngine.deleteSelected`** clears selection and UI after delegation. **`core/building/collectPlacedObjectsForBuildingDeletion`** is the pure predicate for which placed objects to remove when deleting a building by footprint cells + `buildingId`.

**Default materials (skins):** **`core/skins/storeDefaultMaterials`** / **`resetToDefaultMaterials`** preserve and restore mesh material clones before/after skin overrides; **`resetToDefaultMaterials`** takes **`getEnvironmentMap`** for PBR env reflections.

**Building move (preview + translate):** **`core/manipulation/buildingMovePreviewGeometry`** holds pure helpers: preview cell enumeration, merged translated bounds, and gizmo grid center. **`core/manipulation/BuildingMovePreviewController`** owns the instanced “ghost tiles” and rectangular outline during building drag (dispose on engine teardown). **`core/manipulation/applyBuildingTranslation`** mirrors `BluDesignEngine.translateBuilding`: collect objects in pre-move building cells or with matching `buildingId`, call `BuildingManager.translateBuilding`, then **`moveObjectInternal`** for each.

**Ground / grid queries:** **`core/manipulation/groundOverlap`** — **`collectGroundObjectIdsOverlappingCells`** (pavement / grass / gravel on floor 0 vs building footprint cells). **`core/placement/gridCellQuery`** — **`getPlacedObjectIdsAtGridCell`** (origin cell + floor match for delete coordination). **`core/assetDefinitionToMetadata`** maps **`AssetDefinition`** → **`AssetMetadata`** for custom-asset preload. **`core/gizmos/keyboardRotationDelta`** — **`keyboardHeldRotationDeltaRadians`** (Alt+Q/E held rotation acceleration).

**Selection move validation:** **`core/manipulation/selectionMoveValidation`** implements **`validatePlacedObjectMove`** (grid occupancy, ground-on-building, wall-segment crossing via **`wouldCrossBuildingWallForMove`**, upper-floor “inside building” rules) with injectable **`GridSystem`** / **`BuildingManager`** / scene root for wall mesh collection—`BluDesignEngine.validateMovePosition` delegates here.

**Interactive pending move (gizmo / keyboard):** Pure helpers live under **`core/manipulation/pendingMove`**: **`keyboardDirectionToGridDelta`**, **`committedGridPositionFromSnapshot`**, **`stepWindowMeshAlongWall`** (window wall-drag visuals), **`buildPendingMoveSnapshots`** (original grid snapshots + window wall runtime at drag start), **`windowRevertMeshXZ`** / **`regularObjectRevertMeshPosition`** (revert mesh placement on validation failure), **`tryCommitPendingObjectMoves`** (validate → mutate **`PlacedObject`** / wall attachment → grid **`clearOccupied`** / **`markOccupied`** → **`HistoryAction[]`** payloads; no mutations when validation fails). **`PendingSelectionMoveCoordinator.updateVisualPositions`** converts grid deltas to world deltas via **`GridSystem.gridDeltaToWorldDelta`** so mesh movement follows the aligned axes (not world X/Z) when a working grid is active.

**Editor gizmos:** **`TranslateGizmo`** aligns its arrow group (`gizmoGroup.rotation.y`) to the active **`GridAlignment.yaw`** in `show()` and `setPosition()`, so arrows point along the grid's U/V axes; single-axis drag constrains to the aligned axis direction (projection onto world U or V vector), not world X/Z. **`core/gizmos/selectionGizmoPlacement`** computes selection **grid** center (building footprint union, placed-object AABBs, floor-tile meshes found by traversing the scene for `userData.id`) and **world** center for gizmo anchoring (logical mesh centers with internal offsets). **`core/gizmos/EditorGizmoController`** owns translate vs rotate **mode** (Alt), visibility, and position sync on top of existing **`TranslateGizmo`** / **`RotateGizmo`** (raycast + mesh geometry unchanged). **`core/gizmos/EditorRotationCoordinator`** owns Alt+Q/E held rotation (placement ghost fine-rotate vs selection incremental rotate), rotate **undo snapshots** (`captureStartState` / `recordToHistory`) shared with the rotate gizmo and discrete 90° **`rotateSelection`**, delegating **`keyboardHeldRotationDeltaRadians`** and **`pushRotate`** via ports wired from **`BluDesignEngine`**.

**History apply:** **`core/history/HistoryActionApplier`** maps `HistoryAction` types to undo/redo side effects via a **`HistoryActionApplierDelegate`** (engine wires `deleteObjectInternal`, `placeObjectInternal`, moves, rotation snapshots, buildings, floors, and `emitStateUpdated`). Recursive batch actions preserve per-child `state-updated` emissions.

**Facility import:** **`core/import/runFacilitySceneImport`** orchestrates load order (clear, camera, buildings/floors, placed objects legacy vs serialized, skins, grid, optimization, theme, data source) with a **`FacilitySceneImportServices`** port; `BluDesignEngine.importSceneData` delegates to it.

**Constructor lifecycle:** After `gridSystem.create()`, **`initializeEditorSubsystems()`** subscribes to theme changes, constructs **`FloorObjectReplication`**, **`FloorViewCoordinator`**, **`FloorStructureOperations`**, and **`DraftAutoSaveScheduler`**. **`registerInputHandlers()`** delegates to **`core/input/registerBluDesignInputHandlers`** (gizmo, placement, selection, camera on **`InputCoordinator`**). Initial tool is set via **`setTool`** before **`HistoryActionApplier`** construction so floor replication exists for redo paths.

**Rendering preferences:** **`core/rendering/applyBluDesignRenderingSettings`** applies AA pixel ratio, shadow map + directional light + mesh shadow flags, instancing toggles on building/ground managers, **`OptimizationManager`** enable/readonly, and batched frustum culling — `BluDesignEngine.applyRenderingSettings` delegates to it on init and on **`RenderingSettingsManager`** changes.

**Viewport / camera helpers:** **`core/viewport/editorViewport`** holds **`computeBluDesignSceneBounds`** (placed meshes + building footprint AABBs, default bounds when empty), **`computeFocusOrbitForPlacedObjectMesh`** / **`computeFocusOrbitForBuilding`** (camera orbit targets for focus APIs), **`computeSelectedObjectsScreenBounds`** (projection for selection overlays), and **`getHoveredPlacedObjectRotation`** (raycast against selectable meshes for placement hover yaw). **`core/viewport/captureSceneThumbnail`** implements **`captureSceneThumbnailJpeg`** (hide grid, render, scale, JPEG) and **`computeScaledThumbnailDimensions`** — **`BluDesignEngine.captureScreenshot`** delegates here. **`BluDesignEngine`** keeps floor/selection side effects and delegates pure math and raycast orchestration for the viewport helpers.

**Selection move (gizmo / keyboard):** **`core/selection/PendingSelectionMoveCoordinator`** owns pending drag state, debounced commit, building move preview vs live mesh moves, validation/history/revert — wired from **`BluDesignEngine`** with translate-building and wall-selection refresh callbacks.

**Facility persistence:** **`core/persistence/exportFacilitySceneData`**, **`clearFacilityEditorScene`**, **`preloadFacilityCustomAssets`**, **`placeLoadedPlacedObjects`**, and **`buildFacilityImportServices` / `importFacilitySceneData`** centralize export, clear, custom-asset preload, and import port wiring so **`BluDesignEngine`** delegates save/load/clear/import orchestration.

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

### Shared Base Storage Layer (`services/storage/`)

BluDesign and Firmware storage share a common base layer (`backend/src/services/storage/`) that provides low-level file operations via a `BaseStorageProvider` interface. This avoids duplicating I/O logic across storage backends.

#### `base-storage.interface.ts`
Generic file-operation interface implemented by all backends:
- `uploadFile(filePath, data, contentType?)` – write / overwrite
- `downloadFile(filePath)` – read file
- `deleteFile(filePath)` – delete single file (idempotent)
- `fileExists(filePath)` – existence check
- `listFiles(prefix)` – list file names under a directory
- `deleteDirectory(dirPath)` – recursive delete
- `getDirectorySize(dirPath)` – sum of file bytes
- `initialize()` / `healthCheck()` – lifecycle

#### Base Providers
- **`local-base.provider.ts`** – Local filesystem with path-traversal protection (`resolveSafe()` rejects `../`)
- **`gcs-base.provider.ts`** – Google Cloud Storage (bucket-based objects)
- **`gdrive-base.provider.ts`** – Google Drive (folder chains mapped from logical paths) with all critical bug fixes baked in:
  1. Query injection escaping (single-quotes in Drive API `q`)
  2. Upsert semantics on upload (no duplicate files)
  3. Bounded 429 retries with exponential backoff (max 5)
  4. Single 401 token-refresh attempt (no infinite recursion)
  5. Folder-level delete (Drive cascades to children)
  6. Empty parent folder cleanup on file delete
  7. `listFiles` returns names not Drive IDs
  8. `setCredentials` always called with refreshToken in constructor

#### `base-storage.factory.ts`
- Creates and caches base providers from `{ type, config }` objects
- Stable cache keys: no secrets (tokens/keys) in cache key
- `validateBaseStorageConfig()` for config validation

### BluDesign Storage Domain Layer (`bludesign/services/storage/`)

BluDesign providers are thin adapters that delegate file I/O to the shared base, adding domain-specific path conventions, file validation, and zip operations.

#### `storage-provider.interface.ts`
High-level domain interface (unchanged for callers):
- Asset / global asset / texture upload/download
- Facility manifest save/load
- Project initialization/cleanup
- Zip export/import
- Signed URL / public URL generation
- Storage usage calculation
- Extension and size validation on uploads

#### `local.provider.ts`
Delegates to `LocalBaseStorage`, adds:
- BluDesign path conventions (`projects/{projectId}/assets/{assetId}/`)
- Allowed extension / max size validation
- Zip export/import with `archiver` / `unzipper`

#### `gcs.provider.ts`
Delegates to `GCSBaseStorage`, adds:
- Path conventions, signed URL generation, public URL support
- Extension/size validation on uploads

#### `gdrive.provider.ts`
Delegates to `GDriveBaseStorage`, adds:
- Path conventions, extension/size validation
- Sequential zip import (prevents folder-creation races)
- Recursive folder archive for zip export

#### `storage.factory.ts`
Domain factory:
- Creates domain adapters wrapping base providers
- Stable cache keys (no secrets)
- `validateStorageConfig()` delegates to base validation

#### `storage.routes.ts` (RBAC: ADMIN or DEV_ADMIN required)
- `GET .../gdrive/auth-url` – Get OAuth2 authorization URL
- `GET .../gdrive/callback` – Exchange OAuth code for tokens
- `POST .../gdrive/refresh-tokens` – Manually refresh tokens
- `POST .../:provider/test` – Test storage connection

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

### Storage Locker Wizard (`/components/bludesign/ui/dialogs/`)

A wizard system for creating custom storage locker assets with procedural geometry or model upload.

#### Grid Standard
**1 grid tile = 2 feet = 0.6096 meters**

All asset dimensions and grid calculations are based on this standard. The constants are defined in `types.ts`:
- `GRID_UNIT_FEET = 2`
- `GRID_UNIT_METERS = 0.6096`

Helper functions for unit conversion:
- `feetToMeters(ft)`, `metersToFeet(m)`
- `feetToGridUnits(ft)`, `metersToGridUnits(m)`

#### `StorageLockerWizard.tsx`
Main wizard dialog with two modes:

**Geometry Wizard Mode** (procedural locker creation):
- Step 1: Dimensions - Set name, unit system (ft/m), width/height/depth
- Step 2: Door Configuration - Select side, size, and position
- Step 3: Review - Confirm settings and create asset

**Model Upload Mode** (GLB/FBX import):
- Drag-and-drop file upload
- Automatic mesh/group detection
- Part assignment (body, door, frame, other)
- Smart asset functionality binding

**Wizard State Structure:**
```typescript
interface LockerWizardState {
  mode: 'wizard' | 'upload';
  name: string;
  unitSystem: 'metric' | 'imperial';
  width: number;   // meters
  height: number;  // meters
  depth: number;   // meters
  doorSide: 'front' | 'back' | 'left' | 'right';
  doorWidth: number;
  doorHeight: number;
  doorPositionX: number;  // offset from center
  doorPositionY: number;  // offset from bottom
  doorCentered: boolean;
  gridUnits: { x: number; z: number };  // computed
}
```

**Dimension Constraints:**
- Min locker size: 1ft × 2ft × 1ft
- Max locker size: 20ft × 12ft × 30ft
- Door cannot exceed the side dimensions
- Door position auto-constrains when dimensions change

#### `LockerPreview3D.tsx`
Interactive 3D preview component:
- Real-time geometry updates as sliders change
- OrbitControls for rotation and zoom
- Grid overlay showing footprint
- Uses default skin from ThemeManager
- Door highlighted with accent color

#### `LockerModelUpload.tsx`
GLB/FBX model upload with parts picker:
- Drag-and-drop file upload
- Model parsing to extract named meshes/groups
- Auto-assignment based on part names
- Part type selection (body, door, frame, other)
- Validation for required parts

#### `AssetFactory.createCustomStorageUnit()`
Procedural locker mesh generation:
```typescript
static createCustomStorageUnit(
  dimensions: AssetDimensions,
  lockerSpec: LockerSpec,
  state: DeviceState = DeviceState.LOCKED
): THREE.Object3D
```
- Creates box body with state-dependent material
- Positions door on specified side
- Supports all four door sides with proper rotation
- userData.partNames = ['body', 'door'] for skinning

#### Backend Support

**Database** (`039_bludesign_locker_spec.ts`):
- Adds `locker_spec` JSON column to `bludesign_asset_definitions`

**LockerSpec Schema:**
```typescript
interface LockerSpec {
  doorSide: 'front' | 'back' | 'left' | 'right';
  doorWidth: number;   // meters
  doorHeight: number;  // meters
  doorPositionX: number;  // horizontal offset
  doorPositionY: number;  // vertical offset
}
```

**API Validation** (`assets.routes.ts`):
```javascript
lockerSpec: Joi.object({
  doorSide: Joi.string().valid('front', 'back', 'left', 'right'),
  doorWidth: Joi.number().positive(),
  doorHeight: Joi.number().positive(),
  doorPositionX: Joi.number(),
  doorPositionY: Joi.number().min(0),
})
```

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
backend/src/services/storage/       # Shared base layer
├── base-storage.interface.ts       # BaseStorageProvider + config types + errors
├── local-base.provider.ts          # Local FS base (path traversal protection)
├── gcs-base.provider.ts            # GCS base
├── gdrive-base.provider.ts         # GDrive base (all bug fixes)
├── base-storage.factory.ts         # Factory + validation + caching
└── index.ts                        # Barrel exports

backend/src/bludesign/              # BluDesign domain layer
├── types/
│   └── bludesign.types.ts          # Re-exports StorageProviderType from base
├── models/
│   ├── bludesign-project.model.ts
│   ├── bludesign-asset.model.ts
│   ├── bludesign-facility.model.ts
│   └── index.ts
├── services/storage/
│   ├── storage-provider.interface.ts  # Domain interface + re-exports
│   ├── storage.factory.ts             # Domain factory
│   ├── local.provider.ts              # Delegates to LocalBaseStorage
│   ├── gcs.provider.ts               # Delegates to GCSBaseStorage
│   ├── gdrive.provider.ts            # Delegates to GDriveBaseStorage
│   └── index.ts
├── routes/
│   ├── projects.routes.ts
│   ├── assets.routes.ts
│   ├── facilities.routes.ts
│   ├── storage.routes.ts             # RBAC: ADMIN / DEV_ADMIN
│   └── index.ts
└── index.ts
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
- [x] Google Cloud Storage provider (via shared base layer)
- [x] Google Drive provider (via shared base layer, all critical bugs fixed)
- [x] Building skins (brick, glass, etc.)
- [x] Decoration assets (trees, shrubs, planters)
- [ ] GLB export for portable scenes
- [x] Read-only facility viewer component
- [x] Dashboard widget for 3D facility view

