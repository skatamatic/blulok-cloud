/**
 * BluDesign Engine
 * 
 * Core engine class that manages the Three.js scene, renderer, and all subsystems.
 * This is the main entry point for the 3D editing system.
 */

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  RendererConfig,
  DEFAULT_RENDERER_CONFIG,
  DEFAULT_GRID_CONFIG,
  DARK_THEME_GRID_CONFIG,
  EngineEventType,
  EngineEventHandler,
  EditorState,
  EditorTool,
  CameraMode,
  IsometricAngle,
  GridSize,
  GridPosition,
  Orientation,
  PlacedObject,
  AssetMetadata,
  FacilityData,
  LegacyFacilityData,
  SerializedCameraState,
  EntityBinding,
  SimulationState,
  Building,
  DataSourceConfig,
  GridAlignment,
  AssetCategory,
  DeviceState,
} from './types';
import {
  UnitStateVisualManager,
  THEMED_UNIT_SKIN_ID,
} from './state/UnitStateVisualManager';
import { SceneManager } from './SceneManager';
import { CameraController } from './CameraController';
import { SelectionManager } from './SelectionManager';
import { SelectionHighlightManager } from './SelectionHighlightManager';
import { GridSystem } from './GridSystem';
import { PlacementManager } from './PlacementManager';
import { BuildingManager } from './BuildingManager';
import { FloorManager } from './FloorManager';
import { SkinManager } from './SkinManager';
import { AssetFactory } from '../assets/AssetFactory';
import { ActionHistory, HistoryAction } from './ActionHistory';
import { ClipboardManager } from './ClipboardManager';
import { TranslateGizmo, GizmoAxis } from './TranslateGizmo';
import { RotateGizmo } from './RotateGizmo';
import { InputCoordinator } from './InputCoordinator';
import { getThemeManager, Theme } from './ThemeManager';
import { getSkinRegistry } from './SkinRegistry';
import { WindowManager } from './WindowManager';
import { GroundTileManager } from './GroundTileManager';
import { RenderingSettingsManager } from './RenderingSettingsManager';
import { OptimizationManager } from './OptimizationManager';
import { applyBluDesignRenderingSettings } from './rendering';
import {
  isLegacyFacilityFormat,
  collectUniqueSerializedAssetIds,
} from './serialization/facilityImportHelpers';
import { resolveClipboardCopyContents } from './clipboard/resolveClipboardCopyContents';
import { tryStartClipboardPastePreview } from './clipboard/startClipboardPastePreview';
import {
  collectSelectableObjectIds,
  PendingSelectionMoveCoordinator,
  runDeleteSelection,
} from './selection';
import { applyFullBluDesignSceneTheme } from './theme';
import {
  BluDesignEventBus,
  FacilityDraftStorage,
  DEFAULT_AUTOSAVE_STORAGE_KEY,
  createEditorInitialState,
  CachedTextureLoader,
} from './engine';
import type { DraftAutoSaveScheduler } from './engine/DraftAutoSaveScheduler';
import { disposeProceduralSurfaceTextures } from './skins/proceduralSurfaceTextures';
import { initializeBluDesignEditorSubsystems } from './engine/initializeBluDesignEditorSubsystems';
import {
  FloorObjectReplication,
  FloorViewCoordinator,
  FloorStructureOperations,
  FloorHistoryOperations,
} from './floors';
import { registerBluDesignInputHandlers } from './input/registerBluDesignInputHandlers';
import {
  PlacedObjectPlacementCoordinator,
  PlacementCompletionService,
  moveObjectInternal,
  applyRotationState,
  getPlacedObjectIdsAtGridCell,
  collectMeshesForSelectionRotation,
  applySelectionRotationByAngle,
} from './placement';
import {
  storeDefaultMaterials,
  resetToDefaultMaterials,
} from './skins';
import { createPlacedObjectSkinApplicator } from './skins/placedObjectSkinApplicator';
import { HistoryActionApplier } from './history';
import {
  clearFacilityEditorScene,
  exportFacilitySceneData,
  importFacilitySceneData,
  preloadFacilityCustomAssets,
  type FacilityImportHost,
} from './persistence/index.ts';
import {
  getLayoutImportFromFacility,
  type LayoutImportMetadata,
} from '../layout-import/layoutImportMetadata';
import {
  BuildingMovePreviewController,
  applyBuildingTranslation,
  keyboardDirectionToGridDelta,
  validatePlacedObjectMove,
} from './manipulation';
import {
  EditorGizmoController,
  EditorRotationCoordinator,
  computeSelectionGridCenter,
  computeSelectionCenterWorld,
} from './gizmos';
import { rotationForGizmoIndicator } from './gizmos/selectionGizmoPlacement';
import {
  computeBluDesignSceneBounds,
  computeFocusOrbitForPlacedObjectMesh,
  computeFocusOrbitForBuilding,
  computeSelectedObjectsScreenBounds,
  getHoveredPlacedObjectRotation,
} from './viewport/editorViewport';
import { captureSceneThumbnailJpeg } from './viewport/captureSceneThumbnail';
import { applyEditorToolChange } from './editor/applyEditorToolChange';
import {
  updatePlacedObjectBinding,
  updatePlacedObjectSkin,
  updatePlacedObjectSimulationState,
} from './placedObject/placedObjectPropertyUpdates';
import { applyEngineSelectionChangeFromManager } from './editor/engineSelectionSync';
import { createBuildingManagerLifecycleCallbacks } from './building/buildingManagerLifecycleCallbacks';
import {
  createTranslateGizmoCallbacks,
  createRotateGizmoCallbacks,
} from './gizmos/gizmoEngineCallbacks';
import { attachOptimizationProgressEmitter } from './editor/optimizationProgressBridge';
import {
  removePlacedObjectWithoutHistory,
  removeGroundTilesAtCells as removeGroundTilesAtCellsFromCells,
  deleteBuildingWithContentsFromScene,
} from './editor/editorObjectDeletion';
import { computeWorkingGridAlignmentFromPlacedMesh } from './placement/computeWorkingGridAlignment';
import { serializeCameraState } from './camera/cameraStateUtils';
import {
  GroundPlaneManager,
  GroundPresetId,
  SceneryManager,
  SkyManager,
  SkyPresetId,
  DEFAULT_SCENE_PRESETS,
  THEME_BACKGROUND_COLORS,
  resolveEnvironmentOptions,
  type EnvironmentOptions,
  type ScenePresetApplyOptions,
} from './environment';

export interface BluDesignEngineOptions {
  container: HTMLElement;
  rendererConfig?: Partial<RendererConfig>;
  readonly?: boolean;
}

const AUTOSAVE_DEBOUNCE_MS = 1000; // Wait 1 second after last change before saving

export { ORIGINAL_MATERIALS_SKIN_ID } from './placement';

export class BluDesignEngine {
  // Core Three.js objects
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private clock: THREE.Clock;
  
  // Subsystems
  private sceneManager: SceneManager;
  private cameraController: CameraController;
  private selectionManager: SelectionManager;
  private selectionHighlightManager: SelectionHighlightManager;
  private gridSystem: GridSystem;
  private placementManager: PlacementManager;
  private buildingManager: BuildingManager;
  private floorManager: FloorManager;
  private floorObjectReplication!: FloorObjectReplication;
  private floorViewCoordinator!: FloorViewCoordinator;
  private floorStructureOperations!: FloorStructureOperations;
  private skinManager: SkinManager;
  private readonly unitStateVisualManager = new UnitStateVisualManager();
  private bindingEffectsEnabled = true;
  private actionHistory: ActionHistory;
  private clipboardManager: ClipboardManager;
  private translateGizmo: TranslateGizmo;
  private rotateGizmo: RotateGizmo;
  private inputCoordinator: InputCoordinator;
  private windowManager: WindowManager;
  private groundTileManager: GroundTileManager;
  private placementCoordinator: PlacedObjectPlacementCoordinator;
  private placementCompletion!: PlacementCompletionService;
  private floorHistoryOperations!: FloorHistoryOperations;
  private historyActionApplier!: HistoryActionApplier;
  private gizmoController!: EditorGizmoController;
  private rotationCoordinator!: EditorRotationCoordinator;

  // Reusable raycaster for hover detection (avoids creating new instances)
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointerNdc: THREE.Vector2 = new THREE.Vector2();
  private readonly selectionOrbitPivot = new THREE.Vector3();

  private readonly cachedTextures = new CachedTextureLoader();
  private readonly placedObjectSkinApplicator = createPlacedObjectSkinApplicator({
    loadTexture: (url) => this.cachedTextures.load(url),
  });

  // State
  private container: HTMLElement;
  private isRunning: boolean = false;
  private readonly: boolean;
  private animationFrameId: number | null = null;
  
  // Placement state
  private currentPlacementAsset: AssetMetadata | null = null;
  
  private draftAutoSave!: DraftAutoSaveScheduler;

  // Theme subscription cleanup
  private themeUnsubscribe: (() => void) | null = null;
  
  // Rendering settings
  private renderingSettings: RenderingSettingsManager;
  private settingsUnsubscribe: (() => void) | null = null;
  
  // External data source config (set from EditorCanvas for facility linking)
  private dataSourceConfig: DataSourceConfig | null = null;
  /** Persisted import-plan metadata (geometry + scale; image stored separately). */
  private layoutImport: LayoutImportMetadata | null = null;
  /** Survives editor saves until the scene is cleared (new facility). */
  private persistedLayoutImport: LayoutImportMetadata | null = null;
  private defaultCamera: SerializedCameraState | null = null;

  private skyManager!: SkyManager;
  private groundPlaneManager!: GroundPlaneManager;
  private sceneryManager!: SceneryManager;
  private activeSkyPreset: SkyPresetId = DEFAULT_SCENE_PRESETS.skyPreset;
  private activeGroundPreset: GroundPresetId = DEFAULT_SCENE_PRESETS.groundPreset;
  private environmentSeed = 'blulok-default';
  private activeEnvironmentOptions: EnvironmentOptions = {};
  private activeTheme: 'light' | 'dark' = 'dark';
  private skyPresetGeneration = 0;
  private groundPresetGeneration = 0;
  
  private buildingMovePreviewController!: BuildingMovePreviewController;
  private pendingMoveCoordinator!: PendingSelectionMoveCoordinator;
  
  private readonly eventBus = new BluDesignEventBus();
  private readonly draftStorage: FacilityDraftStorage;
  
  // Editor state
  private state: EditorState;

  constructor(options: BluDesignEngineOptions) {
    this.container = options.container;
    this.readonly = options.readonly ?? false;
    this.draftStorage = new FacilityDraftStorage(DEFAULT_AUTOSAVE_STORAGE_KEY, localStorage);
    
    const config = { ...DEFAULT_RENDERER_CONFIG, ...options.rendererConfig };
    
    // Initialize Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: config.antialias,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(config.pixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = config.shadowMap;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = config.toneMapping;
    this.renderer.toneMappingExposure = config.toneMappingExposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Initialize CSS2D renderer for HTML overlays
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1a2e');
    
    // Initialize clock for animations
    this.clock = new THREE.Clock();
    
    // Initialize state
    this.state = createEditorInitialState(this.readonly);
    
    // Initialize subsystems
    this.sceneManager = new SceneManager(this.scene);
    this.cameraController = new CameraController(
      this.container,
      this.state.camera,
      (cameraState) => {
        this.state.camera = cameraState;
        this.emit('camera-changed', cameraState);
      }
    );
    // Disable camera rotation by default since default tool is SELECT
    this.cameraController.setRotationEnabled(false);
    
    this.gridSystem = new GridSystem(this.scene);
    this.selectionHighlightManager = new SelectionHighlightManager(this.scene);
    this.selectionManager = new SelectionManager(
      this.scene,
      this.cameraController.getCamera(),
      this.container,
      (selection) => {
        applyEngineSelectionChangeFromManager(selection, {
          state: this.state,
          updateSelectionHighlights: (prev, next) =>
            this.updateSelectionHighlights(prev, next),
          emitSelectionChanged: (sel) => this.emit('selection-changed', sel),
          updateGizmoVisibility: () => this.updateGizmoVisibility(),
        });
      }
    );
    
    // Set up building double-click callback to select entire building
    this.selectionManager.setOnBuildingDoubleClick((buildingId) => {
      this.selectBuilding(buildingId);
    });
    
    this.placementManager = new PlacementManager(
      this.scene,
      this.cameraController.getCamera(),
      this.container,
      this.gridSystem,
      AssetFactory,
      (gridPos, isValid) => {
        // Update placement preview state
        if (gridPos && this.state.activeAssetId) {
          this.state.placementPreview = {
            assetId: this.state.activeAssetId,
            gridPosition: gridPos,
            isValid,
          };
        } else {
          this.state.placementPreview = null;
        }
        this.emit('state-updated', this.state);
      },
      (placedObject) => {
        this.placementCompletion.handleAssetPlaced(placedObject);
      },
      (objectId) => {
        // Handle right-click delete during placement
        this.deleteObject(objectId);
      },
      (objects) => {
        void this.placementCompletion.handleBatchAssetPlaced(objects);
      },
      (footprint) => {
        void this.placementCompletion.handleBuildingPlaced(footprint);
      }
    );
    
    // Set up rotation control callback for Alt+drag in placement mode
    this.placementManager.setOnRotationControlChange((enableRotation) => {
      // Only toggle rotation when in PLACE tool
      if (this.state.activeTool === EditorTool.PLACE) {
        this.cameraController.setRotationEnabled(enableRotation);
      }
    });
    
    // Set up hover rotation matching callback
    this.placementManager.setHoveredAssetRotationCallback((worldPos, event) => {
      return this.getHoveredAssetRotation(worldPos, event);
    });

    this.placementManager.setOnBuildingPlacementBlocked(() => {
      this.emit('placement-blocked', { reason: 'aligned-grid' });
    });
    
    // Initialize action history
    this.actionHistory = new ActionHistory(100);
    this.actionHistory.on((event) => {
      this.emit('history-changed', event);
    });
    
    // Initialize clipboard manager
    this.clipboardManager = new ClipboardManager();

    this.floorManager = new FloorManager(
      this.scene,
      this.gridSystem,
      {
        onFloorChanged: (floor) => {
          this.state.activeFloor = floor;
          this.emit('state-updated', this.state);
        },
        onFloorModeChanged: (isFloorMode) => {
          this.state.isFloorMode = isFloorMode;
          this.emit('state-updated', this.state);
        },
      }
    );

    // Initialize building manager
    this.buildingManager = new BuildingManager(
      this.scene,
      this.gridSystem,
      AssetFactory,
      createBuildingManagerLifecycleCallbacks({
        state: this.state,
        applyThemeToScene: (theme) => this.applyThemeToScene(theme),
        getActiveSkinTheme: () => getThemeManager().getActiveSkinTheme(),
        floorManager: this.floorManager,
        selectionManager: this.selectionManager,
        gridSystem: this.gridSystem,
        emitStateUpdated: () => this.emit('state-updated', this.state),
      })
    );
    
    // Connect building manager callbacks
    // Remove any ground tiles (grass, pavement, etc.) when building is placed
    this.buildingManager.setOnRemoveGroundTiles((cells) => {
      this.removeGroundTilesAtCells(cells);
    });
    
    // Connect building manager to placement manager for smart door/window placement
    this.placementManager.setBuildingManager(this.buildingManager);

    this.buildingMovePreviewController = new BuildingMovePreviewController({
      scene: this.scene,
      gridSystem: this.gridSystem,
      getFloorY: (floor) => this.floorManager.getFloorY(floor),
    });
    
    // Initialize skin manager
    this.skinManager = new SkinManager();
    
    // Initialize window manager for instanced window rendering and wall-constrained dragging
    this.windowManager = new WindowManager(this.scene, this.gridSystem);
    
    // Initialize ground tile manager for instanced ground tile rendering
    this.groundTileManager = new GroundTileManager(this.scene, this.gridSystem);

    this.placementCoordinator = new PlacedObjectPlacementCoordinator({
      gridSystem: this.gridSystem,
      scene: this.scene,
      sceneManager: this.sceneManager,
      buildingManager: this.buildingManager,
      groundTileManager: this.groundTileManager,
      floorManager: this.floorManager,
      materials: {
        storeDefaultMaterials: (m) => storeDefaultMaterials(m),
        resetToDefaultMaterials: (g) =>
          resetToDefaultMaterials(g, {
            getEnvironmentMap: () => this.sceneManager.getEnvironmentMap(),
          }),
        applySkinToObject: (o, s) =>
          this.placedObjectSkinApplicator.applySkinToObject(o, s),
        applyActiveThemeSkin: (o, d) =>
          this.placedObjectSkinApplicator.applyActiveThemeSkin(o, d),
      },
      getSkinById: (id) => getSkinRegistry().getSkin(id) ?? undefined,
    });

    this.placementCompletion = new PlacementCompletionService({
      getStateSlice: () => ({
        isFloorMode: this.state.isFloorMode,
        buildings: this.state.buildings,
      }),
      getCurrentPlacementAsset: () => this.currentPlacementAsset,
      setStateBuildings: (buildings) => {
        this.state.buildings = buildings;
      },
      afterNewBuildingCreated: () => {
        this.state.isFloorMode = true;
        this.state.activeFloor = 0;
        this.floorManager.registerFloor(0);
        this.floorManager.setFloor(0);
        this.selectionManager.setFloorMode(true, 0);
      },
      cancelPlacement: () => this.placementManager.cancelPlacement(),
      placementCoordinator: this.placementCoordinator,
      scene: this.scene,
      sceneManager: this.sceneManager,
      gridSystem: this.gridSystem,
      groundTileManager: this.groundTileManager,
      buildingManager: this.buildingManager,
      floorManager: this.floorManager,
      actionHistory: this.actionHistory,
      emitObjectPlaced: (o) => this.emit('object-placed', o),
      emitProgressUpdated: (payload) => this.emit('progress-updated', payload),
      emitProgressComplete: (payload) => this.emit('progress-complete', payload),
      emitObjectsPlaced: (placed) => this.emit('objects-placed', placed),
      emitStateUpdated: () => this.emit('state-updated', this.state),
      scheduleAutoSave: () => this.scheduleAutoSave(),
    });
    
    // Set optimization references for ground tile selection performance
    this.selectionManager.setOptimizationReferences(this.gridSystem, this.groundTileManager);
    this.selectionManager.setSceneManager(this.sceneManager);
    
    // Set up optimization progress callback
    // Optimization progress is mapped from 30-100% (batch placement uses 0-30%)
    const optimizationManager = OptimizationManager.getInstance();
    attachOptimizationProgressEmitter(
      optimizationManager,
      (payload) => this.emit('progress-updated', payload),
      (payload) => this.emit('progress-complete', payload)
    );
    
    // Initialize rendering settings manager
    this.renderingSettings = RenderingSettingsManager.getInstance();
    
    // Apply initial rendering settings
    this.applyRenderingSettings().catch(error => {
      console.error('[BluDesignEngine] Error applying initial rendering settings:', error);
    });
    
    // Subscribe to settings changes
    this.settingsUnsubscribe = this.renderingSettings.onSettingsChange(() => {
      this.applyRenderingSettings().catch(error => {
        console.error('[BluDesignEngine] Error applying rendering settings:', error);
      });
    });
    
    // Initialize input coordinator for centralized event handling
    this.inputCoordinator = new InputCoordinator(this.container);
    
    // Initialize translate gizmo with input conflict prevention
    this.translateGizmo = new TranslateGizmo(
      this.scene,
      this.cameraController.getCamera(),
      this.container,
      this.gridSystem,
      createTranslateGizmoCallbacks({
        cameraController: this.cameraController,
        selectionManager: this.selectionManager,
        getActiveTool: () => this.state.activeTool,
        onGridDelta: (dx, dz, axis) => this.handleGizmoDrag(dx, dz, axis),
        commitPendingMoveNow: () => this.commitPendingMoveNow(),
        updateGizmoPosition: () => this.updateGizmoPosition(),
        getTranslateGizmo: () => this.translateGizmo,
      })
    );
    
    // Initialize rotate gizmo for Y-axis rotation
    this.rotateGizmo = new RotateGizmo(
      this.scene,
      this.cameraController.getCamera(),
      this.container,
      this.gridSystem,
      createRotateGizmoCallbacks({
        cameraController: this.cameraController,
        selectionManager: this.selectionManager,
        getActiveTool: () => this.state.activeTool,
        onRotateDelta: (deltaAngle) => this.handleRotateGizmoDrag(deltaAngle),
        captureRotationUndoStart: () => this.rotationCoordinator.captureStartState(),
        recordRotationUndoEnd: () => this.rotationCoordinator.recordToHistory(),
        updateGizmoVisibility: () => this.updateGizmoVisibility(),
        getRotateGizmo: () => this.rotateGizmo,
      })
    );

    this.gizmoController = new EditorGizmoController(this.translateGizmo, this.rotateGizmo, {
      isReadonly: () => this.readonly,
      getSelectedIds: () => this.state.selection.selectedIds,
      getFloorY: () => this.floorManager.getCurrentFloorY(),
      getSelectionGridCenter: () => this.getSelectionCenter(),
      getSelectionGizmoPivotXZ: () => this.getSelectionGizmoPivotXZ(),
      getFirstSelectedPlacedObject: () => {
        const id = this.state.selection.selectedIds[0];
        return id ? this.sceneManager.getObjectData(id) : undefined;
      },
    });

    this.rotationCoordinator = new EditorRotationCoordinator({
      getSelectedIds: () => this.state.selection.selectedIds,
      getActiveTool: () => this.state.activeTool,
      isPlacementActive: () => this.placementManager.isActive(),
      hasGridAlignment: () => !!this.gridSystem.getGridAlignment(),
      applyFinePlacementRotationDelta: (delta) =>
        this.placementManager.applyFineRotationDelta(delta),
      rotateSelectionByAngle: (delta) => this.rotateSelectionByAngle(delta),
      getObjectData: (id) => this.sceneManager.getObjectData(id) ?? undefined,
      pushRotateHistory: (before, after) => this.actionHistory.pushRotate(before, after),
    });

    this.pendingMoveCoordinator = new PendingSelectionMoveCoordinator({
      getSelectedIds: () => this.state.selection.selectedIds,
      getSelectedBuildingId: () => this.state.selection.selectedBuildingId,
      getActiveFloor: () => this.state.activeFloor,
      gridSystem: this.gridSystem,
      sceneManager: this.sceneManager,
      buildingManager: this.buildingManager,
      buildingMovePreviewController: this.buildingMovePreviewController,
      selectionHighlightManager: this.selectionHighlightManager,
      gizmoController: this.gizmoController,
      actionHistory: this.actionHistory,
      validateMove: (obj, newPos, exclude) => this.validateMovePosition(obj, newPos, exclude),
      translateBuilding: (id, dx, dz) => this.translateBuilding(id, dx, dz),
      refreshWallSelectionAfterBuildingMove: () => this.updateSelectionHighlightsForBuilding(),
      scheduleAutoSave: () => this.scheduleAutoSave(),
    });

    // Set up Alt key callbacks for gizmo switching
    this.inputCoordinator.setAltKeyCallbacks({
      onAltDown: () => this.onAltKeyDown(),
      onAltUp: () => this.onAltKeyUp(),
      onAltQ: (holdStartTime) => this.rotationCoordinator.handleAltQHold(holdStartTime),
      onAltE: (holdStartTime) => this.rotationCoordinator.handleAltEHold(holdStartTime),
      onQUp: () => this.rotationCoordinator.onRotationKeyUp(),
      onEUp: () => this.rotationCoordinator.onRotationKeyUp(),
    });
    
    // Attach to DOM
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.labelRenderer.domElement);
    
    // Setup resize observer
    this.setupResizeObserver();
    
    // Bind methods
    this.render = this.render.bind(this);
    this.handleResize = this.handleResize.bind(this);
    
    // Setup scene
    this.sceneManager.setupLighting();
    this.sceneManager.setupEnvironmentMap(this.renderer);
    this.skyManager = new SkyManager({
      scene: this.scene,
      getRenderer: () => this.renderer,
    });
    this.groundPlaneManager = new GroundPlaneManager({
      scene: this.scene,
      getMaxAnisotropy: () => this.renderer.capabilities.getMaxAnisotropy(),
    });
    this.sceneryManager = new SceneryManager({ scene: this.scene });
    this.gridSystem.create();
    if (this.readonly) {
      this.gridSystem.setVisible(false);
      this.state.ui.showGrid = false;
    }

    this.initializeEditorSubsystems();

    this.registerInputHandlers();

    this.setTool(this.state.activeTool);

    this.floorHistoryOperations = new FloorHistoryOperations({
      buildingManager: this.buildingManager,
      floorManager: this.floorManager,
      sceneManager: this.sceneManager,
      gridSystem: this.gridSystem,
      placeObjectInternal: (o) => this.placeObjectInternal(o),
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
      syncBuildingsState: () => {
        this.state.buildings = this.buildingManager.getAllBuildings();
      },
      applyThemeToScene: (theme) => this.applyThemeToScene(theme),
      getActiveSkinTheme: () => getThemeManager().getActiveSkinTheme(),
      floorObjectReplication: this.floorObjectReplication,
      setFloorLevel: (level) => this.setFloor(level),
    });

    this.historyActionApplier = new HistoryActionApplier({
      emitStateUpdated: () => this.emit('state-updated', this.state),
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
      placeObjectInternal: (o) => this.placeObjectInternal(o),
      moveObjectInternal: (objectId, position, orientation, rotation, exactMeshPos) =>
        moveObjectInternal(objectId, position, orientation, rotation, exactMeshPos, {
          sceneManager: this.sceneManager,
          gridSystem: this.gridSystem,
        }),
      applyRotationState: (states) =>
        applyRotationState(states, {
          sceneManager: this.sceneManager,
          gridSystem: this.gridSystem,
          floorManager: this.floorManager,
          onComplete: () => this.updateGizmoVisibility(),
        }),
      removeBuildingInternal: (id) => this.removeBuildingInternal(id),
      recreateBuildingInternal: (b) => this.recreateBuildingInternal(b),
      translateBuilding: (buildingId, deltaX, deltaZ) => this.translateBuilding(buildingId, deltaX, deltaZ),
      onBuildingMoveSelectionSync: (buildingId) => {
        if (this.state.selection.selectedBuildingId === buildingId) {
          this.updateSelectionHighlightsForBuilding();
        }
      },
      undoFloorAdd: (data) => this.floorHistoryOperations.undoFloorAdd(data),
      redoFloorAdd: (data) => this.floorHistoryOperations.redoFloorAdd(data),
      undoFloorDelete: (data) => this.floorHistoryOperations.undoFloorDelete(data),
      redoFloorDelete: (data) => this.floorHistoryOperations.redoFloorDelete(data),
      undoFloorInsert: (data) => this.floorHistoryOperations.undoFloorInsert(data),
      redoFloorInsert: (data) => this.floorHistoryOperations.redoFloorInsert(data),
    });
  }

  /**
   * Register input handlers with the InputCoordinator
   */
  private registerInputHandlers(): void {
    this.cameraController.setOrbitPivotResolver(() => this.resolveSelectionOrbitPivot());

    registerBluDesignInputHandlers({
      inputCoordinator: this.inputCoordinator,
      getActiveTool: () => this.state.activeTool,
      placementManager: this.placementManager,
      selectionManager: this.selectionManager,
      cameraController: this.cameraController,
      translateGizmo: this.translateGizmo,
      rotateGizmo: this.rotateGizmo,
    });
  }

  /**
   * Theme subscription, floor coordinators, draft autosave — runs before input registration and initial tool.
   */
  private initializeEditorSubsystems(): void {
    const sub = initializeBluDesignEditorSubsystems({
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      readonly: this.readonly,
      state: this.state,
      draftStorage: this.draftStorage,
      sceneManager: this.sceneManager,
      buildingManager: this.buildingManager,
      floorManager: this.floorManager,
      selectionManager: this.selectionManager,
      placementManager: this.placementManager,
      placementCompletion: this.placementCompletion,
      actionHistory: this.actionHistory,
      applyThemeToScene: (theme) => this.applyThemeToScene(theme),
      exportSceneData: () => this.exportSceneData(),
      emitObjectPlaced: (o) => this.emit('object-placed', o),
      emitStateUpdated: () => this.emit('state-updated', this.state),
      emitAutosaveComplete: (payload) => this.emit('autosave-complete', payload),
      setWorkingGridAlignment: (a) => this.setWorkingGridAlignment(a),
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
      scheduleAutoSave: () => this.scheduleAutoSave(),
    });
    this.themeUnsubscribe = sub.themeUnsubscribe;
    this.floorObjectReplication = sub.floorObjectReplication;
    this.floorViewCoordinator = sub.floorViewCoordinator;
    this.floorStructureOperations = sub.floorStructureOperations;
    this.draftAutoSave = sub.draftAutoSave;
  }

  private setupResizeObserver(): void {
    const resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    resizeObserver.observe(this.container);
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.cameraController.handleResize(width, height);
    
    this.emit('resize', { width, height });
  }

  /**
   * Start the render loop
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.clock.start();
    this.render();
    
    this.emit('ready', null);
  }

  /**
   * Stop the render loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Resume the render loop after {@link stop} without re-emitting `ready`.
   */
  resumeRenderLoop(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.clock.start();
    this.render();
  }

  /** Whether the animation loop is active. */
  isRenderLoopRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Render a single frame (used for snapshots and manual refresh).
   */
  renderFrameOnce(): void {
    this.renderFrame();
  }

  /**
   * Capture the current view as a JPEG data URL (renders one frame first).
   */
  captureFrameSnapshot(): string | null {
    try {
      this.renderFrameOnce();
      return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  /**
   * Main render loop
   */
  private render(): void {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.render);
    this.renderFrame();
  }

  private renderFrame(): void {
    const delta = this.clock.getDelta();

    this.updateCameraGroundClamp();
    this.cameraController.update(delta);
    if (this.gridSystem.isGridVisible()) {
      this.gridSystem.updateContentBounds(this.calculateSceneBounds());
      this.gridSystem.setWorldPerPixel(this.cameraController.getWorldPerPixel());
    }
    if (this.groundPlaneManager.getActivePreset() !== 'blank' &&
        this.groundPlaneManager.getActivePreset() !== 'grid') {
      this.groundPlaneManager.update(
        this.cameraController.getCamera(),
        delta,
        this.cameraController.getWorldPerPixel()
      );
    }
    if (this.sceneryManager.isActive()) {
      this.sceneryManager.update(delta);
    }
    this.unitStateVisualManager.update(delta);
    this.selectionManager.update();
    const hasSelection = this.selectionManager.getSelectedIds().length > 0;
    if (hasSelection || !this.readonly) {
      this.selectionHighlightManager.update();
    }
    if (!this.readonly) {
      this.translateGizmo.update();
    }

    this.renderer.render(this.scene, this.cameraController.getCamera());
    this.labelRenderer.render(this.scene, this.cameraController.getCamera());
  }

  /**
   * Block camera from dipping below the ground plane when the facility has no basement.
   */
  private updateCameraGroundClamp(): void {
    const minFloor = this.floorManager.getMinFloor();
    if (minFloor < 0) {
      this.cameraController.setGroundClamp({ enabled: false });
      return;
    }

    const referenceFloor =
      this.state.isFloorMode && !this.floorManager.isInFullBuildingView()
        ? this.state.activeFloor
        : Math.max(0, minFloor);
    const minGroundY = this.floorManager.getFloorY(referenceFloor);

    this.cameraController.setGroundClamp({
      enabled: true,
      minGroundY,
      clearance: 1.5,
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  getState(): EditorState {
    // Single source of truth for working grid: GridSystem (avoid ui vs engine drift)
    return {
      ...this.state,
      ui: {
        ...this.state.ui,
        gridAlignment: this.gridSystem.getGridAlignment(),
      },
    };
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.Camera {
    return this.cameraController.getCamera();
  }

  getCameraController(): CameraController {
    return this.cameraController;
  }
  
  /**
   * Focus camera on a specific object with smooth animation
   * Zooms in so the object occupies approximately 25% of the screen
   * @param objectId - ID of the object to focus on
   * @param floor - Floor level the object is on
   */
  focusOnObject(objectId: string, floor: number): void {
    const obj = this.sceneManager.getObjectData(objectId);
    if (!obj) return;
    
    const mesh = this.sceneManager.getObject(objectId);
    if (!mesh) return;
    
    // First, switch to the correct floor (exit full view if needed)
    if (!this.state.isFloorMode) {
      this.toggleFullBuildingView();
    }
    if (this.state.activeFloor !== floor) {
      this.setFloor(floor);
    }
    
    // Select the object
    this.selectionManager.clearSelection();
    this.selectionManager.select(objectId);
    this.state.selection.selectedIds = [objectId];
    this.emit('selection-changed', this.state.selection);
    
    const { center, newCameraPos } = computeFocusOrbitForPlacedObjectMesh(
      mesh,
      this.cameraController.getCamera()
    );
    this.cameraController.focusOnWithDistance(center, newCameraPos, true);
  }

  /**
   * Focus camera on a building with smooth animation
   * Zooms out to show the entire building
   * @param buildingId - ID of the building to focus on
   */
  focusOnBuilding(buildingId: string): void {
    const building = this.buildingManager.getBuilding(buildingId);
    if (!building) return;
    
    // Switch to full view mode to see the whole building
    if (this.state.isFloorMode) {
      this.toggleFullBuildingView();
    }
    
    this.selectBuilding(buildingId);

    const orbit = computeFocusOrbitForBuilding(
      building,
      this.gridSystem.getGridSize(),
      this.cameraController.getCamera()
    );
    if (!orbit) return;

    this.cameraController.focusOnWithDistance(orbit.center, orbit.newCameraPos, true);
  }

  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }

  getGridSystem(): GridSystem {
    return this.gridSystem;
  }

  getSceneManager(): SceneManager {
    return this.sceneManager;
  }

  getPlacementManager(): PlacementManager {
    return this.placementManager;
  }

  getBuildingManager(): BuildingManager {
    return this.buildingManager;
  }

  getFloorManager(): FloorManager {
    return this.floorManager;
  }

  getSkinManager(): SkinManager {
    return this.skinManager;
  }
  
  /**
   * Set the external data source configuration (for facility linking)
   * This is stored and included in exports/drafts
   */
  setDataSourceConfig(config: DataSourceConfig | null): void {
    this.dataSourceConfig = config;
    this.scheduleAutoSave(); // Auto-save when data source changes
  }
  
  /**
   * Get the current data source configuration
   */
  getDataSourceConfig(): DataSourceConfig | null {
    return this.dataSourceConfig;
  }

  /** Import-plan metadata for 2D overlay and editor plan panel. */
  getLayoutImport(): LayoutImportMetadata | null {
    return this.layoutImport;
  }

  setLayoutImport(metadata: LayoutImportMetadata | null): void {
    this.layoutImport = metadata;
    this.persistedLayoutImport = metadata;
    this.scheduleAutoSave();
  }
  // ==========================================================================
  // Object Property Management
  // ==========================================================================

  /**
   * Update an object's binding to real-world data
   */
  updateObjectBinding(id: string, binding: EntityBinding | undefined): void {
    updatePlacedObjectBinding(id, binding, {
      getObject: (oid) => this.sceneManager.getObject(oid),
      getObjectData: (oid) => this.sceneManager.getObjectData(oid),
      applyVisualState: (group, placedObj) => this.applyUnitVisualState(group, placedObj),
      emitStateUpdated: () => this.emit('state-updated', this.state),
    });
  }

  /**
   * Update an object's skin override
   */
  updateObjectSkin(id: string, skinId: string | undefined): void {
    updatePlacedObjectSkin(id, skinId, {
      getObject: (oid) => this.sceneManager.getObject(oid),
      getObjectData: (oid) => this.sceneManager.getObjectData(oid),
      getEnvironmentMap: () => this.sceneManager.getEnvironmentMap(),
      applySkinToObject: (o, s) =>
        this.placedObjectSkinApplicator.applySkinToObject(o, s),
      applyActiveThemeSkin: (o, d) =>
        this.placedObjectSkinApplicator.applyActiveThemeSkin(o, d),
      scheduleAutoSave: () => this.scheduleAutoSave(),
      emitStateUpdated: () => this.emit('state-updated', this.state),
    });
  }

  /**
   * Simulate an object's state for preview purposes
   */
  simulateObjectState(id: string, simState: SimulationState): void {
    updatePlacedObjectSimulationState(id, simState, {
      getObject: (oid) => this.sceneManager.getObject(oid),
      getObjectData: (oid) => this.sceneManager.getObjectData(oid),
      applyVisualState: (group, placedObj) => this.applyUnitVisualState(group, placedObj),
      emitStateUpdated: () => this.emit('state-updated', this.state),
    });
  }

  /**
   * Resolve runtime state visuals for a single placed object. Storage units
   * wearing the built-in "White & Blue Steel" theme get the rich bound-state
   * visuals (dim/transparent, door-open, flashing); everything else falls back
   * to the legacy flat-colour swap inside {@link UnitStateVisualManager}.
   */
  private applyUnitVisualState(group: THREE.Group, placedObj: PlacedObject): void {
    const themed = this.isThemedStorageUnit(placedObj);
    // When binding effects are disabled, everything renders in its default
    // locked look (no dim/transparent, door-open or flashing).
    if (!this.bindingEffectsEnabled) {
      this.unitStateVisualManager.applyState(group, {
        themed,
        bound: true,
        state: DeviceState.LOCKED,
      });
      return;
    }
    this.unitStateVisualManager.applyState(group, {
      themed,
      bound: !!placedObj.binding?.entityId,
      state: placedObj.binding?.currentState ?? DeviceState.UNKNOWN,
    });
  }

  /**
   * Toggle live binding visuals. When disabled, every bound/unbound unit renders
   * in its default locked appearance; live telemetry still updates the
   * underlying `binding.currentState` so re-enabling reflects the latest state.
   */
  setBindingEffectsEnabled(enabled: boolean): void {
    if (this.bindingEffectsEnabled === enabled) return;
    this.bindingEffectsEnabled = enabled;
    this.refreshUnitStateVisuals();
  }

  private isThemedStorageUnit(placedObj: PlacedObject): boolean {
    if (placedObj.assetMetadata?.category !== AssetCategory.STORAGE_UNIT) return false;
    const effectiveSkinId =
      placedObj.skinId ??
      getThemeManager().getActiveSkinForCategory(AssetCategory.STORAGE_UNIT) ??
      undefined;
    return effectiveSkinId === THEMED_UNIT_SKIN_ID;
  }

  /**
   * Re-evaluate state visuals for every storage unit. Cheap (handful of units)
   * and used after a theme switch / scene load so unbound + themed units pick up
   * their look without waiting for a live telemetry tick.
   */
  refreshUnitStateVisuals(): void {
    for (const placedObj of this.sceneManager.getAllPlacedObjects()) {
      if (!placedObj.assetMetadata?.isSmart) continue;
      const mesh = this.sceneManager.getObject(placedObj.id);
      if (mesh) this.applyUnitVisualState(mesh as THREE.Group, placedObj);
    }
  }

  // ==========================================================================
  // Floor Management
  // ==========================================================================

  /**
   * Set the active floor
   */
  setFloor(level: number): void {
    this.floorViewCoordinator.setActiveFloor(level);
  }

  /**
   * Add a new floor to the first building
   * @param level The level to add
   * @param copyFromFloor If provided, copy all objects from this floor to the new floor
   */
  addFloor(level: number, copyFromFloor?: number): void {
    this.floorStructureOperations.addFloor(level, copyFromFloor);
  }
  
  /**
   * Toggle between floor mode and full building view
   */
  toggleFullBuildingView(): void {
    this.floorViewCoordinator.toggleFullBuildingView();
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  setTool(tool: EditorTool): void {
    applyEditorToolChange(
      {
        readonly: this.readonly,
        placementManager: this.placementManager,
        selectionManager: this.selectionManager,
        cameraController: this.cameraController,
        inputCoordinator: this.inputCoordinator,
        emitToolChanged: (t) => this.emit('tool-changed', t),
        state: this.state,
      },
      tool
    );
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraController.setMode(mode);
    // Update camera reference in subsystems that need it for raycasting
    const activeCamera = this.cameraController.getCamera();
    this.placementManager.setCamera(activeCamera);
    this.selectionManager.setCamera(activeCamera);
    
    // When switching to isometric, frame all content
    if (mode === CameraMode.ISOMETRIC) {
      const bounds = this.calculateSceneBounds();
      this.cameraController.frameAllContent(bounds, true);
    }
  }
  
  /**
   * Calculate the bounding box containing all scene content
   * Public so viewers can use it for framing operations
   */
  calculateSceneBounds(): THREE.Box3 {
    return computeBluDesignSceneBounds({
      getAllPlacedObjects: () => this.sceneManager.getAllPlacedObjects(),
      getObjectMesh: (id) => this.sceneManager.getObject(id),
      getAllBuildings: () => this.buildingManager.getAllBuildings(),
      gridToWorld: (p) => this.gridSystem.gridToWorld(p),
      getGridSize: () => this.gridSystem.getGridSize(),
    });
  }

  setRotationEnabled(enabled: boolean): void {
    this.cameraController.setRotationEnabled(enabled);
  }

  setIsometricAngle(angle: IsometricAngle, animate: boolean = true): void {
    this.cameraController.setIsometricAngle(angle, animate);
  }

  rotateIsometric(direction: 'cw' | 'ccw'): void {
    this.cameraController.rotateIsometric(direction);
  }

  setGridSize(size: GridSize): void {
    this.state.snap.gridSize = size;
    this.gridSystem.setGridSize(size);
  }

  toggleGrid(visible?: boolean): void {
    this.state.ui.showGrid = visible ?? !this.state.ui.showGrid;
    this.gridSystem.setVisible(this.state.ui.showGrid);
  }

  setActiveAsset(assetId: string | null): void {
    this.state.activeAssetId = assetId;
    if (assetId) {
      // Block placement in full building view mode
      if (!this.state.isFloorMode && this.state.buildings.length > 0) {
        console.warn('Cannot place assets in full building view. Switch to a specific floor first.');
        this.emit('placement-blocked', { reason: 'full-view-mode' });
        return;
      }
      this.setTool(EditorTool.PLACE);
      // Actual placement is started by the hook with full AssetMetadata
    } else {
      // Cancel placement and return to select
      this.placementManager.cancelPlacement();
      // Re-enable camera rotation when leaving placement mode
      this.cameraController.setRotationEnabled(true);
      this.setTool(EditorTool.SELECT);
    }
  }

  /**
   * Start placing an asset
   */
  startAssetPlacement(assetMetadata: AssetMetadata): void {
    this.currentPlacementAsset = assetMetadata;
    // Disable camera rotation by default during placement
    // User must hold Alt to rotate
    this.cameraController.setRotationEnabled(false);
    this.emit('placement-started', assetMetadata.id);
  }

  setOrientation(orientation: Orientation): void {
    this.state.activeOrientation = orientation;
  }

  rotateOrientation(direction: 'cw' | 'ccw'): void {
    const angles = [Orientation.NORTH, Orientation.EAST, Orientation.SOUTH, Orientation.WEST];
    const currentIndex = angles.indexOf(this.state.activeOrientation);
    const newIndex = direction === 'cw' 
      ? (currentIndex + 1) % 4 
      : (currentIndex - 1 + 4) % 4;
    this.state.activeOrientation = angles[newIndex];
    
    // Update placement manager orientation if placing
    if (this.placementManager.isActive()) {
      this.placementManager.setOrientation(this.state.activeOrientation);
    }
  }

  /**
   * Delete a floor from a building
   * Removes all objects on that floor and shifts higher floors down
   */
  deleteFloor(level: number): void {
    this.floorStructureOperations.deleteFloor(level);
  }

  /**
   * Insert a floor at a specific level
   * Shifts all floors at or above that level up by 1
   */
  insertFloor(atLevel: number): void {
    this.floorStructureOperations.insertFloor(atLevel);
  }

  /**
   * Update theme (light/dark mode)
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.activeTheme = theme;
    this.skyManager.setTheme(theme);
    this.groundPlaneManager.setTheme(theme);
    if (this.activeSkyPreset === 'blank') {
      // SkyManager handles blank background via setTheme
    }
    if (theme === 'dark') {
      this.gridSystem.applyConfig(DARK_THEME_GRID_CONFIG);
    } else {
      this.gridSystem.applyConfig(DEFAULT_GRID_CONFIG);
    }
    this.gridSystem.setHorizonColor(THEME_BACKGROUND_COLORS[theme]);
    this.emit('theme-changed', theme);
  }

  getSkyPreset(): SkyPresetId {
    return this.activeSkyPreset;
  }

  getGroundPreset(): GroundPresetId {
    return this.activeGroundPreset;
  }

  async applySkyPreset(preset: SkyPresetId, options?: ScenePresetApplyOptions): Promise<void> {
    const generation = ++this.skyPresetGeneration;
    const previous = this.activeSkyPreset;
    this.activeSkyPreset = preset;
    if (options?.environmentOptions) {
      this.activeEnvironmentOptions = {
        ...this.activeEnvironmentOptions,
        ...options.environmentOptions,
        sky: { ...this.activeEnvironmentOptions.sky, ...options.environmentOptions.sky },
        techno: { ...this.activeEnvironmentOptions.techno, ...options.environmentOptions.techno },
      };
    }
    const presetOptions: ScenePresetApplyOptions = {
      ...options,
      environmentOptions: this.activeEnvironmentOptions,
    };
    await this.skyManager.applyPreset(preset, presetOptions);
    if (generation !== this.skyPresetGeneration) return;

    this.activeSkyPreset = this.skyManager.getActivePreset();
    const wasHdrSky = previous === 'natural' || previous === 'space';
    const isHdrSky =
      this.activeSkyPreset === 'natural' || this.activeSkyPreset === 'space';
    if (wasHdrSky && !isHdrSky) {
      this.sceneManager.setupEnvironmentMap(this.renderer);
    }
    this.skyManager.setTheme(this.activeTheme);
    this.syncOutdoorEnvironment();
  }

  /** Techno ground: optional space HDR backdrop + grid visibility toggles. */
  private async syncTechnoGroundEnvironment(options?: ScenePresetApplyOptions): Promise<void> {
    const presetOptions: ScenePresetApplyOptions = {
      ...options,
      environmentOptions: this.activeEnvironmentOptions,
      environmentSeed: options?.environmentSeed ?? this.environmentSeed,
    };

    if (this.activeGroundPreset !== 'techno') {
      await this.skyManager.setSpaceBackdropOverlay(false, presetOptions);
      return;
    }

    const { techno } = resolveEnvironmentOptions(this.activeEnvironmentOptions);
    this.groundPlaneManager.applyTechnoOptions(techno, presetOptions);
    await this.skyManager.setSpaceBackdropOverlay(techno.showSpaceBackdrop ?? false, presetOptions);
    this.syncOutdoorEnvironment();
  }

  async applyGroundPreset(
    preset: GroundPresetId,
    options?: ScenePresetApplyOptions
  ): Promise<void> {
    const generation = ++this.groundPresetGeneration;
    this.activeGroundPreset = preset;
    if (options?.environmentOptions) {
      this.activeEnvironmentOptions = {
        ...this.activeEnvironmentOptions,
        ...options.environmentOptions,
        ground: { ...this.activeEnvironmentOptions.ground, ...options.environmentOptions.ground },
        woodland: { ...this.activeEnvironmentOptions.woodland, ...options.environmentOptions.woodland },
        urban: { ...this.activeEnvironmentOptions.urban, ...options.environmentOptions.urban },
        techno: { ...this.activeEnvironmentOptions.techno, ...options.environmentOptions.techno },
      };
    }
    const bounds = this.calculateSceneBounds();
    const presetOptions: ScenePresetApplyOptions = {
      ...options,
      environmentSeed: options?.environmentSeed ?? this.environmentSeed,
      environmentOptions: this.activeEnvironmentOptions,
    };

    if (preset === 'grid') {
      this.sceneryManager.hide();
      this.gridSystem.setVisible(true);
      this.state.ui.showGrid = true;
      await this.groundPlaneManager.applyPreset('grid', bounds, presetOptions);
      if (generation !== this.groundPresetGeneration) return;
      await this.syncTechnoGroundEnvironment(presetOptions);
      return;
    }

    if (preset === 'techno') {
      this.sceneryManager.hide();
      this.gridSystem.setVisible(false);
      this.state.ui.showGrid = false;
      await this.groundPlaneManager.applyPreset('techno', bounds, presetOptions);
      if (generation !== this.groundPresetGeneration) return;
      await this.syncTechnoGroundEnvironment(presetOptions);
      return;
    }

    // Natural / woodland keep the grid hidden — semi-transparent grass over the editor grid
    // caused moiré / horizontal line artifacts in the facility viewer widget.
    const gridVisible = false;
    this.gridSystem.setVisible(gridVisible);
    this.state.ui.showGrid = gridVisible;

    await this.groundPlaneManager.applyPreset(preset, bounds, presetOptions);
    if (generation !== this.groundPresetGeneration) return;

    if (preset === 'woodland' || preset === 'urban') {
      const layout = this.groundPlaneManager.getSceneryLayoutMetrics();
      if (layout) {
        const resolved = resolveEnvironmentOptions(this.activeEnvironmentOptions);
        const sceneryInput = {
          centerX: layout.centerX,
          centerZ: layout.centerZ,
          padHalfX: layout.padHalfX,
          padHalfZ: layout.padHalfZ,
          fadeStart: layout.fadeStart,
          outerFade: layout.outerFade,
          facilityHalfX: layout.facilityHalfX,
          facilityHalfZ: layout.facilityHalfZ,
          environmentSeed: presetOptions.environmentSeed ?? this.environmentSeed,
          ...(preset === 'woodland' ? resolved.woodland : resolved.urban),
        };
        if (preset === 'woodland') {
          this.sceneryManager.applyWoodland(sceneryInput);
        } else {
          this.sceneryManager.applyUrban(sceneryInput);
        }
      }
    } else {
      this.sceneryManager.hide();
    }

    await this.syncTechnoGroundEnvironment(presetOptions);
    if (generation !== this.groundPresetGeneration) return;
    this.syncOutdoorEnvironment();
  }

  /**
   * Stable seed for woodland terrain and procedural trees (typically the facility id).
   */
  setEnvironmentSeed(seed: string): void {
    if (seed && seed.trim().length > 0) {
      this.environmentSeed = seed.trim();
    }
  }

  getEnvironmentSeed(): string {
    return this.environmentSeed;
  }

  /** Match sun/sky/exposure to outdoor viewer presets. */
  private syncOutdoorEnvironment(): void {
    const splitSpaceLighting = this.skyManager.usesSplitSpaceLighting();
    const outdoor =
      this.activeSkyPreset === 'natural' ||
      splitSpaceLighting ||
      this.activeGroundPreset === 'grass' ||
      this.activeGroundPreset === 'natural' ||
      this.activeGroundPreset === 'woodland' ||
      this.activeGroundPreset === 'urban';

    if (outdoor) {
      // Subtle hemisphere boost only — avoid washing out the scene.
      this.sceneManager.applyOutdoorLighting(true);
    } else {
      this.sceneManager.applyOutdoorLighting(false);
    }

    const skyOptions = resolveEnvironmentOptions(this.activeEnvironmentOptions).sky;

    if (splitSpaceLighting) {
      this.scene.backgroundIntensity =
        skyOptions.backgroundIntensity ?? 0.95;
      this.scene.environmentIntensity = skyOptions.exposure ?? 1;
      this.renderer.toneMappingExposure = DEFAULT_RENDERER_CONFIG.toneMappingExposure;
    } else if (this.activeSkyPreset === 'natural') {
      this.scene.backgroundIntensity = 1;
      this.scene.environmentIntensity = 1;
      this.renderer.toneMappingExposure =
        (skyOptions.exposure ?? 1) * (skyOptions.backgroundIntensity ?? 1);
    } else {
      this.scene.backgroundIntensity = 1;
      this.scene.environmentIntensity = 1;
      this.renderer.toneMappingExposure = DEFAULT_RENDERER_CONFIG.toneMappingExposure;
    }
  }

  refreshGroundPlaneBounds(): void {
    const bounds = this.calculateSceneBounds();
    if (this.gridSystem.isGridVisible()) {
      this.gridSystem.updateContentBounds(bounds);
    }
    if (
      this.activeGroundPreset === 'grass' ||
      this.activeGroundPreset === 'concrete' ||
      this.activeGroundPreset === 'natural' ||
      this.activeGroundPreset === 'woodland' ||
      this.activeGroundPreset === 'urban' ||
      this.activeGroundPreset === 'techno'
    ) {
      this.groundPlaneManager.updateBounds(bounds, {
        environmentOptions: this.activeEnvironmentOptions,
      });
      if (this.activeGroundPreset === 'woodland' || this.activeGroundPreset === 'urban') {
        const layout = this.groundPlaneManager.getSceneryLayoutMetrics();
        if (layout) {
          const resolved = resolveEnvironmentOptions(this.activeEnvironmentOptions);
          const sceneryInput = {
            centerX: layout.centerX,
            centerZ: layout.centerZ,
            padHalfX: layout.padHalfX,
            padHalfZ: layout.padHalfZ,
            fadeStart: layout.fadeStart,
            outerFade: layout.outerFade,
            facilityHalfX: layout.facilityHalfX,
            facilityHalfZ: layout.facilityHalfZ,
            environmentSeed: this.environmentSeed,
            ...(this.activeGroundPreset === 'woodland' ? resolved.woodland : resolved.urban),
          };
          if (this.activeGroundPreset === 'woodland') {
            this.sceneryManager.applyWoodland(sceneryInput);
          } else {
            this.sceneryManager.applyUrban(sceneryInput);
          }
        }
      }
    }
  }

  /**
   * Apply a scene theme to all objects
   * Updates materials based on theme palette
   */
  applyThemeToScene(theme: Theme): void {
    const skinRegistry = getSkinRegistry();
    const getSkin = (id: string) => skinRegistry.getSkin(id) ?? undefined;

    applyFullBluDesignSceneTheme(theme, {
      getSkin,
      buildingManager: this.buildingManager,
      sceneManager: this.sceneManager,
      groundTileManager: this.groundTileManager,
      scene: this.scene,
      isFloorMode: this.state.isFloorMode,
      floorManager: this.floorManager,
      applySkinToObject: (obj, skin) =>
        this.placedObjectSkinApplicator.applySkinToObject(obj, skin),
    });

    // Themed units derive their bound-state look from the active skin, so a
    // theme switch needs a visual refresh (incl. unbound dim/transparent units).
    this.refreshUnitStateVisuals();

    this.emit('scene-theme-applied', theme);
  }

  // ==========================================================================
  // Event System (delegates to BluDesignEventBus)
  // ==========================================================================

  on<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): () => void {
    return this.eventBus.on(eventType, handler);
  }

  off<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): void {
    this.eventBus.off(eventType, handler);
  }

  private emit<T = unknown>(eventType: EngineEventType, data: T): void {
    this.eventBus.emit(eventType, data);
  }

  // ==========================================================================
  // Save/Load
  // ==========================================================================

  /**
   * Export current scene data for saving (optimized - minimal data).
   * Only stores essential data; runtime data is reconstructed on load.
   * Serialization shape is defined in `serialization/facilitySerialization.ts`.
   */
  exportSceneData(): FacilityData {
    return exportFacilitySceneData({
      placedObjects: this.sceneManager.getAllPlacedObjects(),
      state: this.state,
      buildings: this.buildingManager.getAllBuildings(),
      dataSourceConfig: this.dataSourceConfig,
      layoutImport: this.persistedLayoutImport ?? this.layoutImport,
      defaultCamera: this.defaultCamera,
    });
  }

  /**
   * Import scene data from a saved facility (handles both new and legacy formats)
   * This is the async version that pre-fetches custom assets
   */
  async importSceneDataAsync(data: FacilityData | LegacyFacilityData): Promise<void> {
    if (data.placedObjects && data.placedObjects.length > 0) {
      if (!isLegacyFacilityFormat(data)) {
        const uniqueIds = collectUniqueSerializedAssetIds(data);
        await preloadFacilityCustomAssets(uniqueIds);
      }
    }
    this.importSceneData(data);
  }

  /**
   * Import scene data from a saved facility (handles both new and legacy formats)
   * Use importSceneDataAsync for projects with custom assets
   */
  importSceneData(data: FacilityData | LegacyFacilityData): void {
    this.defaultCamera =
      'defaultCamera' in data && data.defaultCamera ? data.defaultCamera : null;
    const layoutImport = getLayoutImportFromFacility(data as FacilityData);
    this.layoutImport = layoutImport;
    this.persistedLayoutImport = layoutImport;
    importFacilitySceneData(data, this.getFacilityImportHost());
    // Apply themed bound-state visuals to freshly loaded units.
    this.refreshUnitStateVisuals();
  }

  getDefaultCamera(): SerializedCameraState | null {
    return this.defaultCamera;
  }

  hasDefaultCamera(): boolean {
    return this.defaultCamera !== null;
  }

  setDefaultCameraFromCurrentView(): void {
    this.defaultCamera = serializeCameraState(this.cameraController.getCurrentCameraState());
    this.emit('state-updated', this.state);
    this.scheduleAutoSave();
  }

  clearDefaultCamera(): void {
    this.defaultCamera = null;
    this.emit('state-updated', this.state);
    this.scheduleAutoSave();
  }

  /**
   * Animate back to the saved default view. Returns false when no default is set.
   */
  restoreDefaultCamera(animate: boolean = true): boolean {
    if (!this.defaultCamera) {
      return false;
    }
    this.cameraController.applySavedState(this.defaultCamera, animate);
    return true;
  }

  private getFacilityImportHost(): FacilityImportHost {
    return {
      getState: () => this.state,
      sceneManager: this.sceneManager,
      buildingManager: this.buildingManager,
      floorManager: this.floorManager,
      cameraController: this.cameraController,
      placementCoordinator: this.placementCoordinator,
      skinManager: this.skinManager,
      gridSystem: this.gridSystem,
      resetWorkingGridAlignment: () => this.setWorkingGridAlignment(null),
      setDataSourceConfig: (config: DataSourceConfig | null) => {
        this.dataSourceConfig = config;
      },
      calculateSceneBounds: () => this.calculateSceneBounds(),
      emitStateUpdated: () => this.emit('state-updated', this.state),
      emitThemeMissing: (payload: { missingThemeId: string }) =>
        this.emit('theme-missing', payload),
    };
  }

  /**
   * Clear all placed objects and buildings from the scene
   */
  clearScene(): void {
    this.defaultCamera = null;
    this.layoutImport = null;
    this.persistedLayoutImport = null;
    clearFacilityEditorScene({
      getState: () => this.state,
      setWorkingGridAlignment: () => this.setWorkingGridAlignment(null),
      sceneManager: this.sceneManager,
      gridSystem: this.gridSystem,
      buildingManager: this.buildingManager,
      floorManager: this.floorManager,
      selectionManager: this.selectionManager,
      actionHistory: this.actionHistory,
      emitStateUpdated: () => this.emit('state-updated', this.state),
      clearDraft: () => this.clearDraft(),
    });
  }

  // ==========================================================================
  // Auto-Save to Local Storage
  // ==========================================================================

  /**
   * Schedule an auto-save to local storage (debounced)
   * Call this after any major state change
   */
  scheduleAutoSave(): void {
    this.draftAutoSave.schedule();
  }

  /**
   * Immediately save current state to local storage
   */
  saveToLocalStorage(): void {
    this.draftAutoSave.saveNow();
  }

  /**
   * Load draft from local storage if available (async version)
   * Returns true if a draft was loaded
   */
  async loadFromLocalStorageAsync(): Promise<boolean> {
    try {
      const data = this.draftStorage.loadFacilityData();
      if (!data) return false;

      const info = this.draftStorage.peekDraftInfo();
      if (info.timestamp) {
        console.log(`[AutoSave] Found draft from ${new Date(info.timestamp).toLocaleString()}`);
      }

      await this.importSceneDataAsync(data);
      return true;
    } catch (error) {
      console.error('[AutoSave] Failed to load draft:', error);
      return false;
    }
  }

  /**
   * Load draft from local storage if available (sync version - deprecated, use async)
   * Returns true if a draft was loaded
   */
  loadFromLocalStorage(): boolean {
    try {
      const data = this.draftStorage.loadFacilityData();
      if (!data) return false;

      const info = this.draftStorage.peekDraftInfo();
      if (info.timestamp) {
        console.log(`[AutoSave] Found draft from ${new Date(info.timestamp).toLocaleString()}`);
      }

      this.importSceneData(data);
      return true;
    } catch (error) {
      console.error('[AutoSave] Failed to load draft:', error);
      return false;
    }
  }

  /**
   * Check if there's a draft available in local storage
   */
  hasDraft(): { exists: boolean; timestamp?: number } {
    try {
      return this.draftStorage.peekDraftInfo();
    } catch {
      return { exists: false };
    }
  }

  /**
   * Clear the auto-save draft from local storage
   * Call this after successfully saving to backend
   */
  clearDraft(): void {
    try {
      this.draftStorage.clear();
      console.log('[AutoSave] Draft cleared');
    } catch (error) {
      console.error('[AutoSave] Failed to clear draft:', error);
    }
  }

  /**
   * Get the last auto-save timestamp
   */
  getLastAutoSaveTime(): number {
    return this.draftAutoSave.getLastSaveTime();
  }

  /**
   * Capture a screenshot of the current scene (optimized for thumbnails)
   * Returns a small, compressed JPEG for efficient storage
   * Grid is automatically hidden for cleaner thumbnails
   */
  async captureScreenshot(maxSize: number = 256): Promise<string> {
    return captureSceneThumbnailJpeg(maxSize, {
      wasGridVisible: this.state.ui.showGrid,
      setGridVisible: (visible) => this.gridSystem.setVisible(visible),
      render: () => this.render(),
      getSourceCanvas: () => this.renderer.domElement,
    });
  }

  // ==========================================================================
  // Undo/Redo
  // ==========================================================================

  /**
   * Undo the last action
   */
  undo(): boolean {
    const action = this.actionHistory.undo();
    if (!action) return false;
    
    this.applyUndoAction(action);
    
    // Auto-save after undo
    this.scheduleAutoSave();
    return true;
  }

  /**
   * Redo the last undone action
   */
  redo(): boolean {
    const action = this.actionHistory.redo();
    if (!action) return false;
    
    this.applyRedoAction(action);
    
    // Auto-save after redo
    this.scheduleAutoSave();
    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.actionHistory.canUndo();
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.actionHistory.canRedo();
  }

  /**
   * Apply an undo action (reverse the action)
   */
  private applyUndoAction(action: HistoryAction): void {
    this.historyActionApplier.applyUndo(action);
  }

  /**
   * Apply a redo action (re-apply the action)
   */
  private applyRedoAction(action: HistoryAction): void {
    this.historyActionApplier.applyRedo(action);
  }

  /**
   * Place an object without recording in history (for undo/redo)
   */
  private placeObjectInternal(placedObject: PlacedObject): void {
    this.placementCoordinator.placeForHistory(placedObject);
  }

  /**
   * Delete an object without recording in history (for undo/redo)
   */
  private deleteObjectInternal(objectId: string): void {
    removePlacedObjectWithoutHistory({
      objectId,
      sceneManager: this.sceneManager,
      buildingManager: this.buildingManager,
      groundTileManager: this.groundTileManager,
      gridSystem: this.gridSystem,
      state: this.state,
      emitSelectionChanged: (sel) => this.emit('selection-changed', sel),
    });
  }
  
  /**
   * Remove ground tiles (grass, pavement, gravel) at specified cells
   * Called when buildings are placed to override any existing ground materials
   */
  private removeGroundTilesAtCells(cells: Array<{ x: number; z: number }>): void {
    removeGroundTilesAtCellsFromCells({
      cells,
      sceneManager: this.sceneManager,
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
    });
  }

  /**
   * Rename an object
   */
  renameObject(objectId: string, newName: string): void {
    const placedObject = this.sceneManager.getObjectData(objectId);
    if (!placedObject) {
      console.error('Object not found:', objectId);
      return;
    }
    
    placedObject.name = newName;
    
    // Update mesh userData
    const mesh = this.sceneManager.getObject(objectId);
    if (mesh) {
      mesh.userData.name = newName;
    }
    
    this.emit('state-updated', this.state);
    this.scheduleAutoSave();
  }

  /**
   * Rename a building
   */
  renameBuilding(buildingId: string, newName: string): void {
    const success = this.buildingManager.renameBuilding(buildingId, newName);
    if (success) {
      // Update state with the renamed building
      this.state.buildings = this.buildingManager.getAllBuildings();
      this.emit('state-updated', this.state);
      this.scheduleAutoSave();
    }
  }
  
  /**
   * Remove a building without recording in history (for undo/redo)
   */
  private removeBuildingInternal(buildingId: string): void {
    // Get building before removal to find all associated objects
    const building = this.buildingManager.getAllBuildings().find(b => b.id === buildingId);
    if (!building) return;
    
    // Delete ONLY this specific building (not all buildings!)
    this.buildingManager.deleteBuilding(buildingId);
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    
    // Exit floor mode if no buildings left
    if (this.state.buildings.length === 0) {
      this.state.isFloorMode = false;
      this.state.activeFloor = 0;
      this.floorManager.clear();
      this.floorManager.clearGhosting(); // Reset all objects to full opacity
      this.selectionManager.setFloorMode(false, 0);
    } else {
      // Re-apply ghosting for remaining buildings
      this.floorManager.applyGhosting();
    }
  }

  /**
   * Recreate a building without recording in history (for undo/redo)
   */
  private recreateBuildingInternal(building: Building): void {
    // Recreate building from saved data
    building.footprints.forEach(footprint => {
      this.buildingManager.createBuilding(footprint, building.name);
    });
    
    // Recreate additional floors
    const buildings = this.buildingManager.getAllBuildings();
    if (buildings.length > 0) {
      const newBuilding = buildings[buildings.length - 1];
      building.floors.forEach(floor => {
        if (floor.level !== 0) { // Floor 0 is created automatically
          this.buildingManager.addFloor(newBuilding.id, floor.level);
          this.floorManager.registerFloor(floor.level);
        }
      });
    }
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    this.state.isFloorMode = true;
    this.state.activeFloor = 0;
    this.floorManager.registerFloor(0);
    this.floorManager.setFloor(0); // Apply ghosting for floor mode
    this.selectionManager.setFloorMode(true, 0);
  }

  /**
   * Delete an object (with history recording)
   */
  deleteObject(objectId: string): void {
    const placedObject = this.sceneManager.getObjectData(objectId);
    if (!placedObject) return;
    
    // Record in history before deleting
    this.actionHistory.pushDelete(placedObject);
    
    // Delete the object
    this.deleteObjectInternal(objectId);
    
    this.emit('object-deleted', objectId);
    this.emit('state-updated', this.state);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Update highlight state when selection changes
   * Uses 3D wireframe highlights that conform to object geometry (Unity-style)
   */
  private updateSelectionHighlights(_oldSelection: string[], newSelection: string[]): void {
    // Get ALL selectable objects (including building walls and floor tiles)
    const objectMap = this.sceneManager.getAllSelectableObjectsMap();
    
    // Update the 3D selection highlights
    this.selectionHighlightManager.updateSelection(newSelection, objectMap);
  }

  /**
   * Delete all selected objects (handles both placed objects and building elements)
   */
  deleteSelected(): void {
    const selectedIds = [...this.state.selection.selectedIds];
    if (selectedIds.length === 0) return;

    const hadSelectedBuilding = !!this.state.selection.selectedBuildingId;

    runDeleteSelection(selectedIds, this.state.selection.selectedBuildingId, this.state.activeFloor, {
      deleteBuildingWithContents: (buildingId) => this.deleteBuildingWithContents(buildingId),
      getWallMesh: (id) => this.buildingManager.getWallMesh(id),
      getObjectData: (id) => this.sceneManager.getObjectData(id) ?? undefined,
      getAllBuildings: () => this.buildingManager.getAllBuildings(),
      getBuildingCells: (id) => this.buildingManager.getBuildingCells(id),
      removeCellsFromBuilding: (buildingId, cells) =>
        this.buildingManager.removeCellsFromBuilding(buildingId, cells),
      getObjectsAtCell: (x, z, floor) => this.getObjectsAtCell(x, z, floor),
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
      pushDeleteHistoryBatch: (actions) => this.actionHistory.pushBatch(actions),
      pushDeleteHistorySingle: (action) => this.actionHistory.push(action),
    });

    this.updateSelectionHighlights(selectedIds, []);
    this.state.selection.selectedIds = [];
    if (hadSelectedBuilding) {
      this.state.selection.selectedBuildingId = undefined;
    }
    this.emit('selection-changed', this.state.selection);
    this.emit('state-updated', this.state);
    this.updateGizmoVisibility();
    this.scheduleAutoSave();
  }

  /**
   * Delete a building and all objects placed within it
   */
  deleteBuildingWithContents(buildingId: string): void {
    deleteBuildingWithContentsFromScene({
      buildingId,
      buildingManager: this.buildingManager,
      sceneManager: this.sceneManager,
      floorManager: this.floorManager,
      selectionManager: this.selectionManager,
      state: this.state,
      emitStateUpdated: () => this.emit('state-updated', this.state),
      deleteObjectInternal: (id) => this.deleteObjectInternal(id),
    });
  }

  /**
   * Select an entire building by its ID
   * Selects walls for visual highlighting (walls show selection but aren't individually selectable)
   * Also shows the translation gizmo for moving the entire building
   */
  selectBuilding(buildingId: string): void {
    // Get wall IDs for visual selection
    const wallIds = this.buildingManager.getBuildingWallIds(buildingId);
    if (wallIds.length === 0) return;
    
    // Select walls (they'll show highlights but can't be individually selected)
    // Note: This triggers selectionManager callback which clears selectedBuildingId
    this.selectionManager.selectMultipleUnfiltered(wallIds);
    
    // Store the building ID in selection state AFTER selectMultipleUnfiltered
    // (the callback clears it, so we set it after)
    this.state.selection.selectedBuildingId = buildingId;
    
    // Update the gizmo to show at building center (allows moving the building)
    this.updateGizmoVisibility();
    
    // Emit state change with the building ID
    this.emit('selection-changed', this.state.selection);
  }

  /**
   * Get placed objects at a specific cell
   */
  private getObjectsAtCell(x: number, z: number, floor: number): string[] {
    return getPlacedObjectIdsAtGridCell(x, z, floor, this.sceneManager.getAllPlacedObjects());
  }

  // ==========================================================================
  // Clipboard Operations
  // ==========================================================================

  /**
   * Copy selected objects to clipboard (including buildings)
   */
  copy(): void {
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return;

    const { objects, buildings } = resolveClipboardCopyContents({
      selectedIds,
      selectedBuildingId: this.state.selection.selectedBuildingId,
      getBuilding: (id) => this.buildingManager.getBuilding(id),
      getBuildingCells: (id) => this.buildingManager.getBuildingCells(id),
      getAllPlacedObjects: () => this.sceneManager.getAllPlacedObjects(),
      getObjectData: (id) => this.sceneManager.getObjectData(id) ?? undefined,
    });

    this.clipboardManager.copy(objects, buildings);
    this.emit('state-updated', this.state);
  }

  /**
   * Cut selected objects to clipboard
   */
  cut(): void {
    const selectedIds = [...this.state.selection.selectedIds];
    if (selectedIds.length === 0) return;
    
    // Copy first
    this.copy();
    
    // Then delete
    this.deleteSelected();
  }

  /**
   * Paste clipboard objects with preview mode
   */
  paste(targetPosition?: GridPosition): void {
    void targetPosition;
    tryStartClipboardPastePreview({
      hasClipboardContent: () => this.clipboardManager.hasContent(),
      getClipboardObjects: () => this.clipboardManager.getObjects(),
      startPastePreview: (objects) => this.placementManager.startPastePreview(objects),
      activatePlaceTool: () => this.setTool(EditorTool.PLACE),
    });
  }

  /**
   * Check if clipboard has content
   */
  hasClipboardContent(): boolean {
    return this.clipboardManager.hasContent();
  }

  /**
   * Select all objects in scene (including building elements)
   */
  selectAll(): void {
    const allIds = collectSelectableObjectIds(this.sceneManager.getAllSelectableObjectsMap());

    const oldSelection = [...this.state.selection.selectedIds];
    this.updateSelectionHighlights(oldSelection, allIds);
    this.state.selection.selectedIds = allIds;
    this.emit('selection-changed', this.state.selection);
    this.emit('state-updated', this.state);
  }

  // ==========================================================================
  // Gizmos (orchestrated by EditorGizmoController; meshes in TranslateGizmo / RotateGizmo)
  // ==========================================================================

  /**
   * Update gizmo visibility based on current selection
   * In readonly mode, gizmo is never shown
   */
  private updateGizmoVisibility(): void {
    this.gizmoController.updateVisibility();
  }

  /**
   * Shared world XZ for translate/rotate gizmos.
   * Uses actual mesh-derived centers so pivots stay correct when the working grid is aligned
   * to a selection (stored {@link PlacedObject.position} indices may not match that frame).
   * Falls back to grid-index center → gridToWorld when no mesh center is available.
   */
  private getSelectionGizmoPivotXZ(): { x: number; z: number } | null {
    const world = computeSelectionCenterWorld({
      selectedIds: this.state.selection.selectedIds,
      sceneManager: this.sceneManager,
    });
    if (world) {
      return { x: world.x, z: world.z };
    }
    const gc = this.getSelectionCenter();
    if (!gc) return null;
    const w = this.gridSystem.gridToWorld({ x: gc.x, z: gc.z, y: 0 });
    return { x: w.x, z: w.z };
  }

  /** World pivot for Alt+A/D camera orbit when objects are selected. */
  private resolveSelectionOrbitPivot(): THREE.Vector3 | null {
    if (
      this.state.selection.selectedIds.length === 0 &&
      !this.state.selection.selectedBuildingId
    ) {
      return null;
    }

    const world = computeSelectionCenterWorld({
      selectedIds: this.state.selection.selectedIds,
      sceneManager: this.sceneManager,
    });
    if (world) {
      this.selectionOrbitPivot.copy(world);
      return this.selectionOrbitPivot;
    }

    const gc = this.getSelectionCenter();
    if (!gc) return null;

    const w = this.gridSystem.gridToWorld({ x: gc.x, z: gc.z, y: 0 });
    this.selectionOrbitPivot.set(w.x, this.gridSystem.getGridY(), w.z);
    return this.selectionOrbitPivot;
  }

  /**
   * Get the rotation of an asset at the given world position
   * Used for hover-based rotation matching during placement
   * 
   * Performance: Uses cached objects map instead of scene traversal
   */
  private getHoveredAssetRotation(worldPos: THREE.Vector3, mouseEvent?: MouseEvent): number | null {
    const objects = this.sceneManager.getAllObjects();
    const selectableMeshes: THREE.Object3D[] = [];
    for (const [, obj] of objects) {
      if (obj.userData.selectable) {
        selectableMeshes.push(obj);
      }
    }
    return getHoveredPlacedObjectRotation({
      gridAlignment: this.gridSystem.getGridAlignment(),
      raycaster: this.raycaster,
      pointerNdc: this.pointerNdc,
      camera: this.cameraController.getCamera(),
      containerRect: this.container.getBoundingClientRect(),
      worldPos,
      mouseEvent,
      selectableMeshes,
      getPlacedObject: (id) => this.sceneManager.getObjectData(id),
    });
  }

  /**
   * GridSystem holds the working grid; this keeps placement ghost in sync when it changes.
   */
  private setWorkingGridAlignment(alignment: GridAlignment | null): void {
    this.gridSystem.setGridAlignment(alignment);
    if (this.placementManager.isActive()) {
      this.placementManager.setOrientation(this.state.activeOrientation);
    }
    this.updateGizmoPosition();
    this.updateGizmoVisibility();
  }

  /**
   * Align the working placement grid to the selected object's facing (session-only).
   */
  alignGridToSelection(): boolean {
    if (this.readonly) return false;
    const ids = this.state.selection.selectedIds;
    if (ids.length !== 1) return false;
    const id = ids[0];
    if (id.startsWith('floor-tile-') || id.startsWith('wall-')) return false;

    const mesh = this.sceneManager.getObject(id);
    const po = this.sceneManager.getObjectData(id);
    if (!mesh || !po) return false;
    if ((po.floor ?? 0) !== this.state.activeFloor) return false;

    const alignment = computeWorkingGridAlignmentFromPlacedMesh(
      mesh,
      po,
      this.gridSystem.getGridSize()
    );
    this.setWorkingGridAlignment(alignment);
    this.emit('state-updated', this.state);
    return true;
  }

  /**
   * Restore world-axis grid snapping and visuals.
   */
  resetGridAlignment(): void {
    this.setWorkingGridAlignment(null);
    this.emit('state-updated', this.state);
  }

  /**
   * Update gizmo position to match selection
   * Skips update if gizmo is being dragged (to allow smooth mouse following)
   */
  private updateGizmoPosition(): void {
    this.gizmoController.updatePosition();
  }
  
  /**
   * Handle Alt key press - switch to rotate gizmo
   */
  private onAltKeyDown(): void {
    // Notify PlacementManager for Alt+drag angled placement
    this.placementManager.setAltKeyPressed(true);
    this.gizmoController.onAltPressed();
  }
  
  /**
   * Handle Alt key release - switch back to translate gizmo
   */
  private onAltKeyUp(): void {
    // Notify PlacementManager
    this.placementManager.setAltKeyPressed(false);
    this.gizmoController.onAltReleased();
  }
  
  /**
   * Handle rotate gizmo drag - rotate selection by angle
   */
  private handleRotateGizmoDrag(deltaAngle: number): void {
    this.rotateSelectionByAngle(deltaAngle);
  }

  /**
   * Get the center position of the current selection (in grid coordinates)
   */
  private getSelectionCenter(): { x: number; z: number } | null {
    return computeSelectionGridCenter({
      selectedIds: this.state.selection.selectedIds,
      selectedBuildingId: this.state.selection.selectedBuildingId,
      getAllBuildings: () => this.buildingManager.getAllBuildings(),
      getObjectData: (id) => this.sceneManager.getObjectData(id),
      scene: this.scene,
    });
  }

  /**
   * Handle gizmo drag to move selection
   * Uses smooth visual feedback - moves meshes immediately, commits on drag end
   */
  private handleGizmoDrag(deltaX: number, deltaZ: number, axis: GizmoAxis): void {
    void axis;
    if (deltaX === 0 && deltaZ === 0) return;
    this.pendingMoveCoordinator.applyGridDelta(deltaX, deltaZ);
  }

  /**
   * Update selection highlights for a building after it moves
   * Walls are regenerated with new IDs, so we need to update the selection entirely
   */
  private updateSelectionHighlightsForBuilding(): void {
    const buildingId = this.state.selection.selectedBuildingId;
    if (!buildingId) return;
    
    // Get new wall IDs (walls were regenerated during move)
    const wallIds = this.buildingManager.getBuildingWallIds(buildingId);
    
    // Build object map for new walls
    const objectMap = new Map<string, THREE.Object3D>();
    for (const wallId of wallIds) {
      const mesh = this.buildingManager.getWallMesh(wallId);
      if (mesh) {
        objectMap.set(wallId, mesh);
      }
    }
    
    // Update selection state to use new wall IDs
    this.state.selection.selectedIds = wallIds;
    
    // Fully update selection (removes old highlights, creates new ones)
    this.selectionHighlightManager.updateSelection(wallIds, objectMap);
  }

  /**
   * Force commit any pending move (e.g., on gizmo drag end)
   */
  commitPendingMoveNow(): void {
    this.pendingMoveCoordinator.commitNow();
  }

  /**
   * Validate if an object can be moved to a new position
   * Checks: grid occupancy, wall crossing, floor rules (must be in building if not on ground floor)
   * @param obj - The object being moved
   * @param newPosition - The target position
   * @param excludeIds - IDs to exclude from collision checks (the objects being moved)
   */
  private validateMovePosition(obj: PlacedObject, newPosition: GridPosition, excludeIds: Set<string>): boolean {
    return validatePlacedObjectMove(obj, newPosition, excludeIds, {
      gridSystem: this.gridSystem,
      buildingManager: this.buildingManager,
      sceneRoot: this.scene,
    });
  }

  /**
   * Translate a building and all its contents
   */
  private translateBuilding(buildingId: string, deltaX: number, deltaZ: number): void {
    applyBuildingTranslation(buildingId, deltaX, deltaZ, {
      buildingManager: this.buildingManager,
      sceneManager: this.sceneManager,
      movePlacedObjectForTranslate: (objectId, newPosition, orientation) =>
        moveObjectInternal(objectId, newPosition, orientation, undefined, undefined, {
          sceneManager: this.sceneManager,
          gridSystem: this.gridSystem,
        }),
    });
    this.state.buildings = this.buildingManager.getAllBuildings();
    this.emit('state-updated', this.state);
  }

  /**
   * Move selected objects by one grid unit in a direction
   * Uses smooth visual feedback with debounced commit
   * @param direction - 'up', 'down', 'left', 'right'
   */
  moveSelectionByDirection(direction: 'up' | 'down' | 'left' | 'right'): void {
    const selectedIds = this.state.selection.selectedIds;
    const hasBuildingSelection = !!this.state.selection.selectedBuildingId;
    
    // Need either regular selection or building selection
    if (selectedIds.length === 0 && !hasBuildingSelection) return;
    
    const { deltaX, deltaZ } = keyboardDirectionToGridDelta(direction);
    this.pendingMoveCoordinator.applyGridDelta(deltaX, deltaZ);
  }
  
  /**
   * Rotate selected objects by 90 degrees
   * @param direction - 'cw' (clockwise) or 'ccw' (counter-clockwise)
   */
  rotateSelection(direction: 'cw' | 'ccw'): void {
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return;

    this.rotationCoordinator.captureStartState();

    const deltaAngle = direction === 'cw' ? Math.PI / 2 : -Math.PI / 2;
    this.rotateSelectionByAngle(deltaAngle);

    this.rotationCoordinator.recordToHistory();
  }
  
  /**
   * Rotate selected objects by an arbitrary angle around the selection centroid
   * 
   * Uses THREE.js parenting for guaranteed correct group rotation:
   * 1. Create temporary pivot at centroid
   * 2. Parent all meshes to pivot (preserves world transforms)
   * 3. Rotate pivot
   * 4. Unparent meshes (preserves world transforms)
   * 5. Update PlacedObject data to match
   * 
   * @param deltaAngle - Angle to rotate in radians (positive = clockwise)
   */
  rotateSelectionByAngle(deltaAngle: number): void {
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return;

    const meshesToRotate = collectMeshesForSelectionRotation(
      selectedIds,
      (id) => this.sceneManager.getObjectData(id),
      (id) => this.sceneManager.getObject(id)
    );

    applySelectionRotationByAngle(deltaAngle, selectedIds, meshesToRotate, {
      scene: this.scene,
      grid: this.gridSystem,
      syncRotateGizmoFromSelectionCenter: () => {
        const p = this.getSelectionGizmoPivotXZ();
        if (p) {
          const floorY = this.floorManager.getCurrentFloorY();
          const id = this.state.selection.selectedIds[0];
          const po = id ? this.sceneManager.getObjectData(id) : undefined;
          const rot = rotationForGizmoIndicator(po);
          this.rotateGizmo.setPosition({ x: p.x, z: p.z }, floorY, rot);
        }
      },
    });

    this.scheduleAutoSave();
  }

  /**
   * Rotate the camera view by 90 degrees around the current focal point
   * Works in any camera mode with smooth animation
   * @param direction - 'cw' (clockwise) or 'ccw' (counter-clockwise)
   */
  rotateCameraView(direction: 'cw' | 'ccw'): void {
    // Use the orbit method which works in any mode
    this.cameraController.orbit90Degrees(direction);
    
    // Update isometric angle state for UI consistency
    const delta = direction === 'cw' ? 90 : -90;
    let newAngle = (this.state.camera.isometricAngle + delta) % 360;
    if (newAngle < 0) newAngle += 360;
    this.state.camera.isometricAngle = newAngle;
    
    this.emit('state-updated', this.state);
  }

  /**
   * Get 2D screen bounds for selected objects (for selection overlay rendering)
   * Returns an array of bounding rectangles in screen coordinates
   */
  getSelectedObjectsScreenBounds(): Array<{ id: string; bounds: { left: number; top: number; width: number; height: number } }> {
    return computeSelectedObjectsScreenBounds(
      this.state.selection.selectedIds,
      (id) => this.sceneManager.getObject(id),
      this.cameraController.getCamera(),
      this.container.clientWidth,
      this.container.clientHeight
    );
  }

  // ==========================================================================
  // Rendering Settings
  // ==========================================================================

  /**
   * Apply all rendering settings (delegates to `applyBluDesignRenderingSettings`).
   * Called on init and when settings change.
   */
  private async applyRenderingSettings(): Promise<void> {
    const settings = this.renderingSettings.getSettings();
    await applyBluDesignRenderingSettings(
      {
        renderer: this.renderer,
        scene: this.scene,
        getDirectionalLight: () => this.sceneManager.getDirectionalLight(),
        buildingManager: this.buildingManager,
        groundTileManager: this.groundTileManager,
        optimizationManager: OptimizationManager.getInstance(),
        readonly: this.readonly,
      },
      settings
    );
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  dispose(): void {
    this.stop();
    
    // Unsubscribe from theme changes
    if (this.themeUnsubscribe) {
      this.themeUnsubscribe();
      this.themeUnsubscribe = null;
    }
    
    // Unsubscribe from rendering settings changes
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    
    this.draftAutoSave.dispose();

    this.pendingMoveCoordinator.dispose();
    
    // Dispose subsystems
    this.sceneManager.dispose();
    this.cameraController.dispose();
    this.selectionManager.dispose();
    this.selectionHighlightManager.dispose();
    this.gridSystem.dispose();
    this.placementManager.dispose();
    this.translateGizmo.dispose();
    this.rotateGizmo.dispose();
    this.inputCoordinator.dispose();
    this.windowManager.dispose();
    this.groundTileManager.dispose();
    this.skyManager.dispose();
    this.groundPlaneManager.dispose();
    this.sceneryManager.dispose();
    this.unitStateVisualManager.dispose();
    
    this.buildingMovePreviewController.dispose();

    this.cachedTextures.dispose();
    disposeProceduralSurfaceTextures();
    
    // Dispose Three.js objects
    this.renderer.dispose();
    
    // Remove from DOM
    this.container.removeChild(this.renderer.domElement);
    this.container.removeChild(this.labelRenderer.domElement);
    
    this.eventBus.clear();
  }
}

