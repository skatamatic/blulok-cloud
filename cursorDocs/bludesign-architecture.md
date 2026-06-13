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

**Large-scene performance (ground + lockers):** **`GroundTileManager`** renders grass/pavement/gravel via merged **`InstancedMesh`** batches (`GeometryOptimizer` rectangle merge; edit mode allows large merges up to 4096 cells per instance). Logical tiles are tracked off-scene (`SceneManager.addObject` with `trackOnly: true`); hover/click uses grid picking in **`SelectionManager`** (`getTileIdAtCell`) instead of thousands of scene meshes. Ground instanced batches skip shadow cast/receive. Storage units share door materials and avoid `receiveShadow` on body/door meshes to cut shadow-pass cost (~400 meshes for 200 lockers remains the main draw-call budget; instancing would be a follow-up).

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
   - Driven by global facility selector: single-facility scope only; all-facilities mode shows an empty canvas
   - No in-widget model picker — model is always the one bound to the selected facility
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

## Layout Import (image/PDF → unit detection)

The **layout-import detection engine** turns a raster facility site plan into
pixel-space storage-unit candidates as the first step of importing a real plan
into the editor. It lives entirely in the backend at
`backend/src/bludesign/layout-import/` and emits a clean, world-agnostic contract
(`LayoutImportDetectionResult`) that a later wizard phase will convert into
`PlacedObject`s after a human verifies/edits the candidates.

**Granularity is the door cell, not the whole unit.** A multi-door unit is drawn
as one outlined unit subdivided into door cells; the detector recovers the **door
cells**. On the sample plan the legend totals **95 units / 145 doors**, so the
detection target is **145**. Grouping door cells back into multi-door units is a
later wizard step (human in the loop).

### Pipeline

`detectUnits(buffer | DecodedImage, options?, deps?)` orchestrates:

1. **Decode** (`image/decodeImage.ts`) — `sharp` decodes PNG/JPG/WEBP to raw RGBA
   (ships prebuilt binaries; no node-gyp on Windows dev or Linux prod).
2. **Internal upscale** (`image/preprocess.ts → upscaleToWidth`) — small plans are
   integer-upscaled (≤4×, to ≥`internalUpscaleTargetWidth`) so thin cell borders
   are not lost to sub-pixel rendering. All output geometry is mapped back to
   **source** pixel space.
3. **Segmentation** — default `'border'` strategy. A rectangle is defined by its
   **dark outline**, not its fill, so the engine isolates rectangles independent of
   fill shade: `adaptiveThreshold(BINARY_INV)` makes the strokes foreground, a
   morphological **close** (`borderCloseKernel`) seals 1–2px gaps (tolerating
   imperfect scans), and the grid lines form one connected mesh whose **holes are
   the cells**. This fixes the failure mode of the old `'cells'` brightness-sweep
   strategy, where light-grey fills merged into the page and only the text inside
   was detected. The legacy `'cells'` (multi-threshold brightness) and `'color'`
   (HSV mask) strategies remain selectable as fallbacks.
4. **Rectangle fit** (`detection/detectRectangles.ts`) — `findContours` (RETR_LIST,
   to capture nested cells/holes) → `minAreaRect`, normalized to a canonical
   longer-axis-as-width rotated rect with rotation in radians (any angle).
5. **Filtering** (`detection/filters.ts`) — legend/region exclusion (top-left band
   by default), area/aspect/fill-ratio gates (reject dots/poles/bollards, the site
   boundary, connector lines and ragged blobs), rotated-rect-IoU **NMS** (which
   also merges the concentric outer-ring/inner-hole pair a thick border produces),
   and **nesting resolution** (`suppressContainers`) for boxes that enclose
   smaller boxes' centers. This is the highest-leverage filter for this style of
   plan, because the border mesh yields, for every cell, the cell *plus* the
   contours of the printed number inside it (and, for clustered units, the cluster
   outline around many cells). For each enclosing box:
   - if an enclosed box is a **substantial fraction** (≥ `NESTED_RATIO`, 0.4) — a
     genuine nested cell or the inner ring of a thick border — drop the **outer**
     (innermost wins);
   - else if it encloses **≥ 2 medium boxes** (≥ `ROW_MEMBER_RATIO`, 0.18) or
     **≥ `GROUP_MIN_MEMBERS`** (4) smaller ones — a row blob or a cluster/group
     outline — drop the **outer** to keep the finer cells;
   - otherwise the enclosed boxes are the number's **glyphs/fragments** → drop
     *them* and keep the cell.

   The previous "drop any container of ≥1 box" rule silently erased every cell
   whose number was large enough to be detected (whole bright-filled rows) and
   collapsed clustered units into a single outline; this nuanced rule recovered
   them (sample plan: ~57 → ~118 correctly-read units of 145). The colorfulness
   gate (`minColorSaturation`) is **off by default** (0) since the border model is
   fill-independent; it is only relevant to the `'color'` fallback.
6. **OCR as classification** (`ocr/readLabel.ts`, `ocr/ocrLabels.ts`,
   `ocr/cropLabel.ts`) — each rectangle is rotated upright (its angle folded
   into ±45° so text is horizontal), cropped to **almost the whole interior**
   (`INNER_FRACTION` 0.9, so a number at the *bottom* of a tall portrait cell is
   not clipped), then connected-components **ink localization** drops the cell's
   frame lines — including **wall hairlines mid-crop** (full-span thin lines and
   1px edge-hugging slivers from a slightly-off box, which otherwise read as
   phantom strokes: "|3"→2) — and **crops tight to the number's ink**. The tight
   crop is normalized to ~64px glyph height with a quiet white margin.
   `readUnitLabel` orchestrates per cell: the standard crop first; if it yields
   no/short labels, a **re-spaced glyph crop** (each glyph component re-typeset
   with breathing room) rescues tightly-kerned digits the LSTM merges into a
   letter ("71" → "n" → nothing). Stacked two-row labels ("26" over "A") are
   detected via y-band splitting and **re-typeset side-by-side** ("26A").
   A readable `<digits><optional letter>` label (numeric part ≥ 1 — "0"/"0A"
   reads are rejected as border-art misreads) promotes the rectangle to
   `kind: 'unit'`; rectangles with no readable label are kept as
   `kind: 'rectangle'` for the human to relabel or discard.
   - **Default provider** is `createDefaultOcrProvider()` → a `RobustOcrProvider`.
     It reads each crop in **block + line + word** page-seg modes at 1×, plus
     **block at 2× (lanczos)** — the LSTM resolves tightly-kerned small digits
     far better with fatter strokes ("31" misread as "K" at 1× reads cleanly at
     2×; `word` at 2× is skipped because it hallucinates duplicated strokes,
     "26A"→"226A"). `chooseBestLabel` elects by **support-weighted voting**
     (each reader contributes 1+confidence; agreement across independent modes
     beats any single read; a small digit-count weight settles near-ties toward
     the more complete number). **90°/270° rotations** run only when no upright
     reader produced a multi-digit read (NOT gated on confidence — Tesseract
     reports 0.00 on plenty of correct reads, and rotated junk would flood the
     vote). On the sample plan this reads **143/145 labels correctly (~0.986)**;
     the two misses are the italic trailing-1↔7 ambiguity (111→117, 101→107),
     fixed downstream by neighbor sequence repair.
     **Reported confidence carries an agreement-derived floor** (3+ agreeing
     readers → 0.85, 2 → 0.65, lone read → engine score): Tesseract routinely
     self-scores correct reads 0.00 (notably suffixed "26A"-style cells), and
     the frontend strips labels < 0.5 before neighbor resolution — without the
     floor, correct backend reads were discarded downstream and resolution
     invented wrong fills for the emptied cells.
     (`FallbackOcrProvider`, a first-valid-wins chain, is retained as a lighter
     alternative.)
   - **Detection vs OCR scale are decoupled.** `internalUpscaleTargetWidth`
     defaults to **4000** (≈2× the sample plan, integer, capped 4×): heavier
     upscaling injects cubic-interpolation noise that the adaptive border mask
     turns into speckle inside bright fills, fragmenting those cells — and it is
     ~8× slower (the sample plan dropped from ~150s at 4× to ~19s at 2× with no
     loss of detected cells). OCR legibility is instead handled per-crop by the
     tight-glyph normalization above, not by blowing up the whole working image.
     Still feed the **native-resolution** image — a 1024-wide downsample of this
     plan is unreadable.

Geometry is computed on the upscaled working image and **mapped back to source
pixels** before filtering/output, so the public contract is always in source
pixel space.

### Determinism / offline

- `@techstark/opencv-js` exports an Emscripten module that is a *perpetual
  thenable*; `getCv()` (`opencv.ts`) uses its `then` only as a one-shot init hook,
  strips `then`, and then resolves — otherwise `await`-ing it (or returning it from
  any `async` function) deadlocks.
- Tesseract reads a **vendored** `eng.traineddata.gz`
  (`ocr/tessdata/`) via a local `langPath` with `cacheMethod: 'none'` — no network
  fetch in CI. The `tesseract.js-core` WASM resolves from `node_modules`.
  `npm run build` copies the gzip into `dist/src/bludesign/layout-import/ocr/tessdata/`
  (`scripts/copy-build-assets.js`); `Dockerfile.prod` fails the image build if it is missing.
- Dependency versions are pinned; results are deterministic for fixed inputs.

### API + tooling

- **Routes** (`routes/layout-import.routes.ts`, mounted in `routes/index.ts`).
  `multer.memoryStorage()`, 25MB limit, PNG/JPG/WEBP filter, `authenticateToken`,
  multipart `file` (+ optional JSON `options`). No persistence yet.
  - `POST .../detect` — synchronous; returns `LayoutImportDetectionResult`.
  - `POST .../detect/stream` — **NDJSON streaming**. `detectUnits` accepts a
    `deps.onEvent` sink and emits `DetectionEvent`s (`stage` → `rectangles` →
    per-`unit` + `progress` → terminal `done`/`error`), which the route writes as
    newline-delimited JSON and flushes per event. Lets the client show granular
    stage progress and draw candidate boxes as they are discovered.
- **Visual CLI**: `npm run bludesign:detect -- <image> [outDir]`
  (`scripts/bludesign-detect.ts`) writes `annotated.png` (rotated rects colored by
  confidence + index/label) and `result.json`. Doubles as the iteration tool and
  the ground-truth bootstrapper.

### Test harness

- **Pure unit tests** (default Jest suite, fast): `geometry`/`metrics`
  (`__tests__/metrics.test.ts`), filters + rect normalization + option resolution
  (`__tests__/detection.test.ts`), label normalization
  (`__tests__/normalizeLabel.test.ts`).
- **Metrics regression** (`__tests__/detectUnits.regression.test.ts`): runs the
  real pipeline on `__tests__/fixtures/test_site_layout.png` (full-res 2133×532),
  scores it against `fixtures/ground-truth.json` (rotated-rect IoU ≥ 0.5 greedy
  match → precision/recall/F1 + matched-label accuracy), and asserts
  **ratchetable** thresholds. It is heavy (WASM + OCR, ~22s at the 2× detection
  scale), so it is **excluded** from the default run via `testPathIgnorePatterns`
  and invoked with `npm run bludesign:detect:test`. `ground-truth.json` is
  currently a **bootstrapped snapshot** of the border detector's output (~171
  boxes, ~118 of the 145 unit numbers read correctly, the rest kept flagged for
  the human), so recall/precision/labelAccuracy act as high self-consistency
  floors (catching drift) while the **door count (145)** is the real-world anchor
  (current delta ~26, `doorCountTolerance` 30). Re-bootstrap the snapshot when the
  model improves, but never hand-edit truth to make a regression pass (see
  `fixtures/README.md`).
- Coverage: the pure logic under `src/bludesign/layout-import/**` is held to the
  coverage gate; the WASM/IO-bound files (decode, preprocess, detectRectangles,
  cropLabel, ocrLabels, detectUnits, opencv) are excluded since they are exercised
  only by the heavy regression.

### Deliberately out of scope (future phases)

Job persistence / async queue. The backend engine produces only the pixel-space
candidates the frontend consumes. (PDF rasterization, the review UI, and the
build-in-3D conversion — scale calibration, asset-size mapping, `PlacedObject`
batch placement into the editor — are now handled on the frontend; see the
**Build-in-3D wizard** below.)

### Frontend review UI (`/bludesign/import`)

The human-in-the-loop review experience lives at
`frontend/src/pages/bludesign/BluDesignImportPage.tsx`, composed from focused,
presentational pieces under `frontend/src/components/bludesign/layout-import/`:

- **`useLayoutImport.ts`** — the single state controller. Owns source loading,
  **streaming** detection (`api/bludesign.ts → detectLayoutStream`, consumed via a
  `fetch` body reader with the bearer token), live `progress` + incremental unit
  updates (boxes appear as `kind: 'rectangle'` then flip to `kind: 'unit'` as OCR
  resolves), the editable unit list, **multi-selection** (`selectedIds: Set`),
  hover/tool state, display prefs (show-image / show-unlabeled-rectangles /
  show-doors), detection options, derived stats (unit / labeled / unlabeled
  counts), problem detection (missing + duplicate labels), save/load of a
  `.bludesign.json` project (image embedded as a data URL), and an undo/redo
  history. There is **no confirm/reject workflow** — a box either has a unit
  number or it doesn't. Label edits apply **live** (one undo snapshot per edit
  session). An `AbortController` cancels a superseded/stale stream.
- **Doors** — every unit carries an optional `door: UnitDoor`
  (`side` ∈ top/bottom/left/right in the rect's local frame, `widthFraction`
  default 0.8, `offsetFraction`, and an `auto` flag). After detection completes,
  **`doorAssignment.ts`** auto-assigns doors using a **free-interval** model.
  After detection, **`postProcessImportedUnits`** (`postProcess.ts`) runs **two
  snap-align passes** then door assignment automatically (no manual sidebar step).
  Crucially it reasons in **each unit's own local (un-rotated) frame** — every
  other unit is projected into that frame so the four door sides line up with
  real walls and adjacency is exact even for **tilted rows** (a global
  axis-aligned model fails here: rotated row-mates' bounding boxes overlap, so
  their shared walls wrongly look open). For each edge it subtracts the runs
  covered by an immediately-adjacent unit (units beyond a drive aisle don't
  count). It then prefers an **interior** edge (one with units beyond it, not
  open exterior space — detected via `hasUnitsBeyond`, ranked by how strongly the
  side faces the layout centroid so end-of-row units pick the aisle-facing
  frontage rather than the long wall pointing off-plan) that has a free run,
  aligns with neighbors, harmonizes **aisle-facing sides** along each spatial
  row/column chain (edges not shared with chain neighbors — topology-aware, not
  raw width/height), and places the door **centered at 80% of the short edge**
  (capped to ~80% of min(width,height) so long row walls never render as full-width bars). This yields: doors never sit on a shared wall / point into an
  adjacent unit; bottom/edge rows face inward (offset+smaller) rather than out;
  opposing rows face into their shared aisle. Doors are **roll-up** (drawn as a
  bold amber bar with jamb ticks — no hinge/swing) and render in a **layer above
  all units** so they're never occluded. Users override side/width/offset in the
  editor (which clears `auto`); "Re-run door placement" recomputes auto doors
  while preserving overrides. Door geometry (world-space opening segment + facing
  normal, offset clamping) lives in `geometry.ts`.
- **`loadSource.ts`** — normalizes an upload into a raster the backend can decode.
  Raster images pass through; **PDFs are rasterized client-side** (first page,
  capped at 4000px) via `pdfjs-dist` so no backend PDF support is required. The
  pdf.js worker is wired through Vite's `?url` import.
- **`LayoutCanvas.tsx`** — the interactive SVG overlay. Everything is rendered in
  source-image pixel space inside a pan/zoom `<g>`; screen↔image conversion uses the
  live SVG CTM (`getScreenCTM().inverse()`). Supports wheel-zoom-to-cursor, pan,
  hover detail cards, **marquee multi-select** (Shift adds), multi-move, animated
  `focusUnit` zoom, direct manipulation (move / rotate / corner-resize via
  `geometry.ts`), and draw-to-add. Each unit draws its **door marker** (amber
  opening + inward swing arc), toggleable via the sidebar. Keyboard: V/A/H tools,
  arrows to nudge the selection, Del to remove all selected, Ctrl+Z/Y undo-redo.
  Normal boxes use a dark-blue border + light-blue fill; **problem boxes are red**;
  unlabeled rectangles render dashed + neutral-grey.
- **`ProblemsOverlay.tsx`** — floating, expandable panel over the canvas listing
  validation problems (missing / duplicate unit numbers); click to locate, or
  delete the offending box. Hidden when there are no problems.
- **`DetectionProgressBar.tsx`** — compact, non-blocking overlay shown while a
  stream runs: current stage label, an indeterminate shimmer for setup stages and a
  determinate bar during the OCR pass (`done/total`), leaving the live canvas
  visible underneath.
- **`UnitHoverCard.tsx`** — portal card showing a unit's coordinates, size,
  rotation, and detection/OCR confidence (labels unlabeled rectangles distinctly).
- **`DetectionSidebar.tsx`** (+ `SelectedUnitEditor`, `UnitList`,
  `DetectionOptionsPanel`) — source summary, save/load, live stats, a filterable
  bounded unit list with an **inline** per-unit editor (unit number, door
  side/width/offset, rotation, delete), display toggles (show image / unlabeled /
  doors + re-run door placement + snap align neighbors), and an advanced "Detection settings" panel that
  re-runs the engine with tuned options.
- **Ingest heuristics** — after detection, shapes are pruned before review:
  unlabeled boxes, non-rectangular contours (circle-like low fill ratio), and
  outliers much smaller than the median unit footprint are dropped (`postProcess.ts`
  on the backend; mirrored in frontend `labelResolution.filterUnitsForIngest`).
- **Label auto-resolution** — up to 3 passes of neighbor inference fill numeric
  gaps (e.g. 71, ?, 73 → 72), correct sandwiched OCR misreads (70, "2", 72 → 71),
  fix transposed digits (30, "13", 38 → 31), and corner cells in a grid
  (48 left + 50 above → 49). Uses **spatially adjacent row/column chains**
  (not global cy/cx clustering) so tower blocks and base rows stay separate.
  Duplicate labels are cleared globally by neighbor-fit score, then refilled on
  later passes. **Single-side fill only anchors on original OCR/user labels**
  (inferred labels are tracked and excluded as anchors) — otherwise one bad seed
  renumbers a whole physical row in a single pass; two-sided gap fill stays
  unrestricted since both anchors must agree. **Suffixed labels ("34A") are
  never rewritten by sequence repair** — they mark auxiliary door cells that
  legitimately repeat their base number between plain-numbered cells, so the
  consecutive-integer model doesn't apply. **Endpoint adjacent-swaps never flip
  a pair whose labels are both confident (≥0.8) original reads** — a "reversed"
  pair at a chain end is almost always the plan's real numbering (tower top
  rows, snake numbering), not a double misread; only the sandwiched swap case
  (bracketed by both neighbors) may override confident reads. The end-to-end
  seam (backend reads → strip → resolution) is guarded by
  `labelPipeline.regression.test.ts`, which runs the full frontend pipeline on
  the committed `detection-result.json` fixture and asserts ≥0.99 label
  accuracy vs `ground-truth.json` (plus every suffixed cell explicitly).
  Ingest filtering keeps borderline
  fill/aspect boxes when they carry a confident (≥0.8) OCR label, and
  **rescues** low-fill boxes (≥0.7) that abut a kept unit at similar size
  (0.5–2× area, edge gap ≤2px) — real cells share walls; bollards/symbols float
  in the aisle and are far smaller. Runs on ingest; sidebar **Fix unit numbers
  from neighbors** re-runs when problems remain
  (`labelResolution.resolveLabelsFromNeighbors`).
- **Snap align** — `snapAlign.ts` uses **rotation-histogram + edge-line
  clustering** (no chain discovery): (1) cluster unit angles in circular mod-90
  space (area-weighted, split at >2.5° adjacent gaps) and snap each unit's
  rotation to its cluster's weighted median (capped at `maxRotDeg`, default 5°);
  (2) per cluster, rotate centers into the cluster frame — all members become
  axis-aligned — then 1-D cluster every wall coordinate (left/right edges on x,
  top/bottom on y, wall-length weighted, tolerance ≈ 24% of the median short
  side) and snap each edge to its cluster's weighted mean line. Colinear
  frontages collapse onto one line and abutting walls become exactly shared;
  every move is bounded by the cluster tolerance so the layout can't be
  re-posed (a >20% size change falls back to translation). Units with no
  agreeing partner don't move. Runs twice after detection via `postProcess.ts`.
  Visual iteration: `npm test -- pipeline.visual` →
  `backend/_pipeline-visual-out/*.png` (full pipeline over a faint plan image).
- **`colors.ts` / `geometry.ts`** — shared color tokens (unit/error/door) and pure
  rotated-rect + door math (corners, hit-test, corner-resize, angle normalization,
  door segment/normal/offset clamping).

### Build-in-3D wizard (`layout-import/build-wizard/`)

The reviewed 2D layout is turned into a saved, navigable 3D BluDesign facility by
a full-screen multi-step wizard launched from the dormant **"Build in 3D"** action
in `DetectionSidebar` (`onImport`, wired from `BluDesignImportPage`). The shell
(`BuildWizard.tsx`) drives four stages via `useBuildWizard.ts`; all non-trivial
logic lives in **pure, unit-tested helpers** so the UI stays thin (SOLID):

1. **Scale (`ScaleStep` + `scale.ts`)** — produces `metersPerPixel`, the single
   source of truth for pixel→world conversion. Two modes: a **direct ratio**
   (a measured pixel span equals N ft/m) or **pick-a-unit** (select one unit,
   enter its real width×depth; the ratio is averaged over both axes against that
   unit's local pixel bounds). A sanity readout reports the resulting median unit
   footprint in feet.
2. **Assets (`AssetsStep` + `assetSpec.ts`)** — computes each unit's real
   dimensions (`width = bounds.width·mpp`, `depth = bounds.height·mpp`,
   `height` default 8 ft) and a `LockerSpec` door, then **de-duplicates** units
   into a small set of reusable primitive `bludesign_asset_definitions`. The door
   mapping from the 2D local frame is: side `top→back`, `bottom→front`,
   `left→left`, `right→right`; `doorWidth = widthFraction·edgeLen·mpp`,
   `doorPositionX = offsetFraction·edgeLen·mpp` (this is the Z axis for left/right
   faces), `doorHeight = clamp(2 ft, height−1 ft, 7 ft)`, where
   `edgeLen = doorEdgeLength(bounds, side)`. **Reuse bucketing** snaps every
   linear dimension (width/depth/height/doorWidth/offset) to a tolerance grid
   (default 0.5 ft, adjustable) and keys a bucket by those snapped values + door
   side; units sharing a bucket share one asset. Assets are created via
   `AssetService.createAssetDefinition` (`category: storage_unit`,
   `modelType: 'primitive'`, `isSmart: true`, computed `gridUnits`, `lockerSpec`)
   and **auto-named** (e.g. `Auto 10×20 ft`, with ` · Left`/` · offset`
   qualifiers). A signature (`[autolayout:…]`) is embedded in each asset's
   description so re-runs are **idempotent** — existing matching assets are reused
   instead of duplicated. Resolution order in `resolveAssetIdForBucket`: exact
   `[autolayout:…]` signature → fuzzy signature (component tolerance) → dimension
   + `lockerSpec` match → rounded-footprint + door-side match. Locker data can be
   recovered from the stored signature when `lockerSpec` is absent on the definition.
   Reuse also matches **any existing primitive storage unit** with the same snapped
   dimensions and door layout (not only autolayout signatures), so manually created
   assets with matching footprints are picked up too. The Assets step shows **Reused**
   vs **New** badges per bucket.
   Each asset definition tracks a **`facility_usage_count`**: incremented when a
   facility is saved that references the asset, decremented on facility delete, and
   synced on facility update. The Assets catalog shows the count; the asset detail
   **Facilities** tab lists saved facilities that reference the asset (via
   `GET /bludesign/assets/definitions/:id/facilities`). Delete warns when in use
   (facility names in the confirm modal) but proceeds after confirmation; scenes
   that still reference the asset may break until re-saved.
3. **Units (`MatchStep` + `nameMatch.ts`)** — pick a BluLok facility
   (`getBluLokFacilities`), load its units (`getBluLokUnits`), and **name-match**
   diagram labels to real `unit_number`s (no coordinates). Each side is normalized
   to `{ num, suffix }` via `/(\d+)\s*([A-Za-z]?)/`; candidates rank exact key >
   same number (0.85) > Levenshtein similarity. Assignment is **greedy one-to-one**
   above a threshold; a confirm/correct table lets the user override. Per the
   product decision, diagram units with **no real match are left unbound** (their
   geometry is still placed); the wizard never creates BluLok units.
4. **Build (`BuildStep` + `sceneBuild.ts`)** — assembles a v2 `FacilityData` and
   saves it as a **new** BluDesign user facility (`saveFacility`), then navigates
   directly to `/bludesign/build?facilityId=…` (`BluDesignBuildPage` reads the
   query param into `EditorCanvas.initialFacilityId`). The wizard also persists
   **`layoutImport`** metadata on `FacilityData` (pixel-space unit geometry +
   scale) and uploads the raster plan to facility storage as
   `layout-source.png` (`PUT …/facilities/:id/layout-source`).

**Coordinate mapping** (validated in the live preview): world is Y-up meters,
pixel x → world X, pixel y → world Z, 2D width → 3D width, 2D height → 3D depth.
Each unit becomes a `SerializedPlacedObject` with `exactMeshPos` at the unit
center in world meters (after subtracting the layout's world AABB center so the
imported site is centered on the origin), `position` = nearest grid index,
`rotation = -rotationRad` (the y-down→Z handedness flip), and
`binding: { entityType: 'unit', entityId }` when matched. Initial camera
`target` is `(0, 0, 0)`. The scene's
`dataSource` is set to `{ type: 'blulok', facilityId, facilityName, autoConnect }`.

**Mesh fix (required for correct doors):** `AssetFactory.createAssetMesh` now
routes `STORAGE_UNIT` assets that carry a `metadata.lockerSpec` to
`createCustomStorageUnit(dimensions, lockerSpec, state)` instead of the generic
centered-door `createStorageUnit`. `assetDefinitionToMetadata` already forwards
`lockerSpec` into the registry, so auto-generated and hand-built primitive lockers
render their real door side/width/offset in both the editor and the viewer.

### Import plan 2D views (editor + dashboard)

Facilities saved through the import wizard carry optional `layoutImport` on
`FacilityData`. The source PNG lives beside `data.json` in user-facility storage.

- **Editor** — View panel → **Show Import Plan** opens a resizable floating panel
  (`ImportPlanPanel`) with pan/zoom, unit labels, and a toggle for the original
  plan image vs vector overlay only (`ImportedLayoutViewer`).
- **Dashboard widget** — When `layoutImport` is present, the facility viewer widget
  exposes a **3D / 2D** toggle. **2D mode** mounts `FacilityViewer2D` instead of
  WebGL (`FacilityViewer3D` is not mounted — no GPU cost). The 2D view uses live
  WebSocket colors (green locked/occupied, yellow unlocked, red error), unit
  labels, smart-object search with animated focus, click-to-select, and fit-to-facility.
  The original import image is **not** shown in the widget (vector overlay only).

**Persistence:** `layoutImport` is written into `data.json` at wizard save time and
re-attached on every editor update/auto-save via `attachLayoutImportToFacilityData`
(Save As creates a new facility without copying import metadata). The PNG is stored
at `layout-source.png` via `PUT /api/v1/bludesign/facilities/:id/layout-source`.

**Geometry note:** 2D overlays use the import-time pixel bounds snapshot in
`layoutImport.units`. Moving or resizing units in the 3D editor does not update
those bounds; the 2D plan reflects the original detected layout, not live scene edits.
The editor Import Plan panel displays a banner explaining this.

**Import review UX:** Multi-page PDFs prompt for page selection before detection.
Detection can be cancelled mid-stream. Saved `.json` project files are schema-validated on load. Import gating only blocks
on problems among labeled/import-eligible units (unlabeled rectangles do not block).

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

