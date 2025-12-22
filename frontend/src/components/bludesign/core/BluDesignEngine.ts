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
  EngineEvent,
  EngineEventHandler,
  EditorState,
  EditorMode,
  EditorTool,
  CameraMode,
  IsometricAngle,
  GridSize,
  GridPosition,
  Orientation,
  PlacedObject,
  AssetMetadata,
  AssetCategory,
  FacilityData,
  SerializedPlacedObject,
  SerializedBuilding,
  FLOOR_HEIGHT,
  LegacyFacilityData,
  DeviceState,
  EntityBinding,
  SimulationState,
  Building,
  DataSourceConfig,
  BuildingSkinType,
  BuildingMaterials,
} from './types';
import { AssetRegistry } from '../assets/AssetRegistry';
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
import { 
  ActionHistory, 
  HistoryAction, 
  PlaceActionData, 
  DeleteActionData, 
  MoveActionData,
  BuildingCreateActionData,
  BuildingDeleteActionData,
  BuildingMoveActionData,
  FloorAddActionData,
  FloorDeleteActionData,
  FloorInsertActionData,
} from './ActionHistory';
import { ClipboardManager } from './ClipboardManager';
import { TranslateGizmo, GizmoAxis } from './TranslateGizmo';
import { InputCoordinator, InputPriority, InputEventType } from './InputCoordinator';
import { getThemeManager, Theme } from './ThemeManager';
import { getSkinRegistry, CategorySkin } from './SkinRegistry';
import { WindowManager } from './WindowManager';
import { GroundTileManager } from './GroundTileManager';
import { RenderingSettingsManager } from './RenderingSettingsManager';
import { EditorPreferences } from './Preferences';

export interface BluDesignEngineOptions {
  container: HTMLElement;
  rendererConfig?: Partial<RendererConfig>;
  readonly?: boolean;
}

// Local storage key for auto-save drafts
const AUTOSAVE_STORAGE_KEY = 'bludesign-autosave-draft';
const AUTOSAVE_DEBOUNCE_MS = 1000; // Wait 1 second after last change before saving

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
  private skinManager: SkinManager;
  private actionHistory: ActionHistory;
  private clipboardManager: ClipboardManager;
  private translateGizmo: TranslateGizmo;
  private inputCoordinator: InputCoordinator;
  private windowManager: WindowManager;
  private groundTileManager: GroundTileManager;
  
  // Texture loader for skins with textures
  private textureLoader: THREE.TextureLoader;
  private textureCache: Map<string, THREE.Texture> = new Map();
  
  // State
  private container: HTMLElement;
  private isRunning: boolean = false;
  private readonly: boolean;
  private animationFrameId: number | null = null;
  
  // Placement state
  private currentPlacementAsset: AssetMetadata | null = null;
  
  // Auto-naming counters for smart objects (assetId -> count)
  private objectNameCounters: Map<string, number> = new Map();
  
  // Auto-save state
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutoSaveTime: number = 0;
  
  // Theme subscription cleanup
  private themeUnsubscribe: (() => void) | null = null;
  
  // Rendering settings
  private renderingSettings: RenderingSettingsManager;
  private settingsUnsubscribe: (() => void) | null = null;
  
  // External data source config (set from EditorCanvas for facility linking)
  private dataSourceConfig: DataSourceConfig | null = null;
  
  // Pending move state for smooth visual feedback
  private pendingMove: {
    originalPositions: Map<string, { position: GridPosition; orientation: Orientation }>;
    accumulatedDelta: { x: number; z: number };
    commitTimer: ReturnType<typeof setTimeout> | null;
    isBuildingMove: boolean;
    buildingId: string | null;
    buildingOriginalFootprints?: { minX: number; maxX: number; minZ: number; maxZ: number }[];
    // Window-specific: track windows being dragged along walls
    windowDragData?: Map<string, {
      wallId: string;
      originalWallPosition: number;
      currentWallPosition: number;
      wallStart: THREE.Vector3;
      wallEnd: THREE.Vector3;
      wallDirection: THREE.Vector3;
      wallLength: number;
    }>;
  } | null = null;
  private readonly MOVE_COMMIT_DELAY = 150; // ms to wait before committing move
  
  // Building move preview mesh (low-cost visual indicator during drag)
  private buildingMovePreview: THREE.InstancedMesh | null = null;
  private buildingMovePreviewOutline: THREE.LineSegments | null = null;
  private readonly BUILDING_PREVIEW_COLOR = 0x147fd4; // Primary blue
  private readonly BUILDING_PREVIEW_OUTLINE_COLOR = 0x0e5ba3; // Darker blue
  
  // Event system
  private eventHandlers: Map<EngineEventType, Set<EngineEventHandler>> = new Map();
  
  // Editor state
  private state: EditorState;

  constructor(options: BluDesignEngineOptions) {
    this.container = options.container;
    this.readonly = options.readonly ?? false;
    
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
    this.state = this.createInitialState();
    
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
        // Update 3D highlight state on selection change
        this.updateSelectionHighlights(this.state.selection.selectedIds, selection.selectedIds);
        
        // Check if the actual selected IDs changed (not just hover)
        const oldIds = new Set(this.state.selection.selectedIds);
        const newIds = new Set(selection.selectedIds);
        const selectionChanged = oldIds.size !== newIds.size || 
          [...oldIds].some(id => !newIds.has(id));
        
        // Only clear building selection when actual selection changes
        // (not on hover changes). selectBuilding will re-set this after calling selectMultipleUnfiltered
        if (selectionChanged) {
          this.state.selection.selectedBuildingId = undefined;
        }
        
        // Preserve selectedBuildingId through the update
        const preservedBuildingId = this.state.selection.selectedBuildingId;
        this.state.selection = { ...selection, selectedBuildingId: preservedBuildingId };
        this.emit('selection-changed', this.state.selection);
        
        // Update gizmo visibility based on selection (only if selection changed)
        if (selectionChanged) {
          this.updateGizmoVisibility();
        }
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
        // Handle single asset placement
        this.handleAssetPlaced(placedObject);
      },
      (objectId) => {
        // Handle right-click delete during placement
        this.deleteObject(objectId);
      },
      (objects) => {
        // Handle batch asset placement (e.g., ground tiles)
        this.handleBatchAssetPlaced(objects);
      },
      (footprint) => {
        // Handle building placement
        this.handleBuildingPlaced(footprint);
      }
    );
    
    // Set up rotation control callback for Ctrl+drag in placement mode
    this.placementManager.setOnRotationControlChange((enableRotation) => {
      // Only toggle rotation when in PLACE tool
      if (this.state.activeTool === EditorTool.PLACE) {
        this.cameraController.setRotationEnabled(enableRotation);
      }
    });
    
    // Initialize action history
    this.actionHistory = new ActionHistory(100);
    this.actionHistory.on((event) => {
      this.emit('history-changed', event);
    });
    
    // Initialize clipboard manager
    this.clipboardManager = new ClipboardManager();
    
    // Initialize building manager
    this.buildingManager = new BuildingManager(
      this.scene,
      this.gridSystem,
      AssetFactory,
      {
        onBuildingCreated: (building) => {
          this.state.buildings.push(building);
          this.emit('state-updated', this.state);
          // Apply current theme to the new building's materials
          const activeTheme = getThemeManager().getActiveSkinTheme();
          this.applyThemeToScene(activeTheme);
        },
        onBuildingsMerged: (oldIds, newBuilding) => {
          this.state.buildings = this.state.buildings.filter(b => !oldIds.includes(b.id));
          this.state.buildings.push(newBuilding);
          this.emit('state-updated', this.state);
          // Apply current theme to the merged building's materials
          const activeTheme = getThemeManager().getActiveSkinTheme();
          this.applyThemeToScene(activeTheme);
        },
        onBuildingDeleted: (buildingId) => {
          this.state.buildings = this.state.buildings.filter(b => b.id !== buildingId);
          // Exit floor mode if no buildings left
          if (this.state.buildings.length === 0) {
            this.state.isFloorMode = false;
            this.state.activeFloor = 0;
            this.floorManager.clear();
            this.selectionManager.setFloorMode(false, 0);
            this.gridSystem.setGridY(0);
          }
          this.emit('state-updated', this.state);
        },
        onBuildingModified: (building) => {
          // Update building in state
          const idx = this.state.buildings.findIndex(b => b.id === building.id);
          if (idx >= 0) {
            this.state.buildings[idx] = building;
          }
          this.emit('state-updated', this.state);
        },
        onWallCreated: (_wall, _mesh) => {
          // Wall mesh is already added to scene by BuildingManager
        },
        onFloorTileCreated: (_floorTileId, _mesh) => {
          // Floor tile mesh is already added to scene by BuildingManager
        },
      }
    );
    
    // Connect building manager callbacks
    // Remove any ground tiles (grass, pavement, etc.) when building is placed
    this.buildingManager.setOnRemoveGroundTiles((cells) => {
      this.removeGroundTilesAtCells(cells);
    });
    
    // Connect building manager to placement manager for smart door/window placement
    this.placementManager.setBuildingManager(this.buildingManager);
    
    // Initialize floor manager
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
    
    // Initialize skin manager
    this.skinManager = new SkinManager();
    
    // Initialize texture loader for skin textures
    this.textureLoader = new THREE.TextureLoader();
    
    // Initialize window manager for instanced window rendering and wall-constrained dragging
    this.windowManager = new WindowManager(this.scene, this.gridSystem);
    
    // Initialize ground tile manager for instanced ground tile rendering
    this.groundTileManager = new GroundTileManager(this.scene, this.gridSystem);
    
    // Initialize rendering settings manager
    this.renderingSettings = RenderingSettingsManager.getInstance();
    
    // Apply initial rendering settings
    this.applyRenderingSettings();
    
    // Subscribe to settings changes
    this.settingsUnsubscribe = this.renderingSettings.onSettingsChange(() => {
      this.applyRenderingSettings();
    });
    
    // Initialize input coordinator for centralized event handling
    this.inputCoordinator = new InputCoordinator(this.container);
    
    // Initialize translate gizmo with input conflict prevention
    this.translateGizmo = new TranslateGizmo(
      this.scene,
      this.cameraController.getCamera(),
      this.container,
      this.gridSystem,
      {
        onDragStart: (axis) => {
          console.log('[TranslateGizmo] Drag started:', axis);
          // Disable camera controls during gizmo drag
          this.cameraController.setControlsEnabled(false);
          // Disable selection during gizmo drag
          this.selectionManager.setEnabled(false);
        },
        onDrag: (deltaX, deltaZ, axis) => {
          this.handleGizmoDrag(deltaX, deltaZ, axis);
        },
        onDragEnd: (axis) => {
          console.log('[TranslateGizmo] Drag ended:', axis);
          // Commit any pending move immediately
          this.commitPendingMoveNow();
          // Re-enable camera controls
          this.cameraController.setControlsEnabled(true);
          // Re-enable selection (if in select mode)
          const isSelectionTool = this.state.activeTool === EditorTool.SELECT || 
                                   this.state.activeTool === EditorTool.SELECT_BUILDING;
          const isViewTool = this.state.activeTool === EditorTool.VIEW;
          this.selectionManager.setEnabled(isSelectionTool || isViewTool);
          // Update drag selection enabled state
          // VIEW tool: no drag selection (clicks only)
          this.selectionManager.setDragSelectionEnabled(isSelectionTool);
          // Re-show gizmo at new position
          this.updateGizmoPosition();
        },
        onHoverChange: (isHovered) => {
          // When hovering over gizmo, temporarily disable camera to prevent conflicts
          if (isHovered) {
            this.cameraController.setControlsEnabled(false);
          } else if (!this.translateGizmo.isDraggingGizmo()) {
            // Only re-enable if not currently dragging
            this.cameraController.setControlsEnabled(true);
          }
        },
      }
    );
    
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
    this.gridSystem.create();
    
    // Register input handlers with priority system
    this.registerInputHandlers();
  }

  /**
   * Register input handlers with the InputCoordinator
   */
  private registerInputHandlers(): void {
    // Get handler methods from managers
    const selectionHandlers = this.selectionManager.getInputHandlers();
    const placementHandlers = this.placementManager.getInputHandlers();
    
    // Gizmo handler (highest priority) - blocks other handlers when active
    this.inputCoordinator.registerHandler({
      id: 'gizmo',
      priority: InputPriority.GIZMO,
      enabled: true,
      handle: (event: Event, eventType: InputEventType): boolean => {
        // Never block wheel events - camera zoom should always work
        if (eventType === 'wheel') return false;
        // Only block left-click events when gizmo is active
        if (event instanceof MouseEvent && event.button === 0) {
          return this.translateGizmo.isDraggingGizmo() || this.translateGizmo.isHovered();
        }
        return false;
      },
      wantsInput: () => this.translateGizmo.isHovered() || this.translateGizmo.isDraggingGizmo(),
      // Gizmo handles its own events via direct listeners on its meshes
    });

    // Placement handler - routes events to PlacementManager
    this.inputCoordinator.registerHandler({
      id: 'placement',
      priority: InputPriority.PLACEMENT,
      enabled: this.state.activeTool === EditorTool.PLACE,
      handle: (event: Event, eventType: InputEventType): boolean => {
        // When Ctrl is held, let camera handle rotation - don't block
        if (event instanceof MouseEvent && event.ctrlKey) {
          return false;
        }
        // Block lower priority handlers for left-click when placing
        if (this.placementManager.isActive() && event instanceof MouseEvent && event.button === 0) {
          if (eventType === 'mousedown' || eventType === 'mousemove') {
            return true;
          }
        }
        return false;
      },
      wantsInput: () => this.state.activeTool === EditorTool.PLACE,
      // Route events to PlacementManager
      onMouseDown: (e: MouseEvent) => {
        // Skip if Ctrl is held (camera rotation)
        if (e.ctrlKey) return;
        placementHandlers.onMouseDown?.(e);
      },
      onMouseUp: placementHandlers.onMouseUp,
      onMouseMove: (e: MouseEvent) => {
        // Always update ghost position, even during camera rotation
        placementHandlers.onMouseMove?.(e);
      },
      onContextMenu: placementHandlers.onContextMenu,
      onKeyDown: (e: KeyboardEvent) => {
        // Handle Ctrl for camera rotation
        if (e.key === 'Control' || e.key === 'Meta') {
          this.cameraController.setRotationEnabled(true);
        }
        placementHandlers.onKeyDown?.(e);
      },
      onKeyUp: (e: KeyboardEvent) => {
        // Handle Ctrl release
        if (e.key === 'Control' || e.key === 'Meta') {
          this.cameraController.setRotationEnabled(false);
        }
        placementHandlers.onKeyUp?.(e);
      },
    });

    // Selection handler - routes events to SelectionManager
    this.inputCoordinator.registerHandler({
      id: 'selection',
      priority: InputPriority.SELECTION,
      enabled: this.state.activeTool === EditorTool.SELECT || this.state.activeTool === EditorTool.SELECT_BUILDING || this.state.activeTool === EditorTool.VIEW,
      handle: (event: Event, eventType: InputEventType): boolean => {
        // When Ctrl is held, let camera handle rotation - don't block
        if (event instanceof MouseEvent && event.ctrlKey) {
          return false;
        }
        // For VIEW tool, don't block mousedown/mousemove (allow camera to handle drags for rotation)
        // VIEW tool only handles clicks (not drags) - clicks are handled via onClick
        if (this.state.activeTool === EditorTool.VIEW) {
          // Don't block mousedown or mousemove - let camera handler process drags for rotation
          // Selection will still get the click event for single-click selection
          if (eventType === 'mousedown' || eventType === 'mousemove') {
            return false;
          }
          // Only block click events if we want to handle them (but we'll let them through for single-click selection)
          return false;
        }
        // Block lower priority handlers for left-click when selecting (SELECT and SELECT_BUILDING tools)
        if (this.selectionManager.getEnabled() && event instanceof MouseEvent && event.button === 0) {
          if (eventType === 'mousedown' || eventType === 'mousemove') {
            return true;
          }
        }
        return false;
      },
      wantsInput: () => this.state.activeTool === EditorTool.SELECT || this.state.activeTool === EditorTool.SELECT_BUILDING || this.state.activeTool === EditorTool.VIEW,
      // Route events to SelectionManager
      onMouseDown: (e: MouseEvent) => {
        // Skip if Ctrl is held (camera rotation)
        if (e.ctrlKey) return;
        // For VIEW tool, still track mousedown so we can detect clicks vs drags
        // But we won't block camera - camera will handle the drag
        selectionHandlers.onMouseDown?.(e);
      },
      onMouseUp: selectionHandlers.onMouseUp,
      onMouseMove: (e: MouseEvent) => {
        // For VIEW tool, still track mousemove so SelectionManager can detect if it's a click or drag
        // But we won't block camera - camera will handle the drag rotation
        selectionHandlers.onMouseMove?.(e);
      },
      onClick: selectionHandlers.onClick,
      onDoubleClick: selectionHandlers.onDoubleClick,
      onKeyDown: (e: KeyboardEvent) => {
        // Handle Ctrl for camera rotation
        if (e.key === 'Control' || e.key === 'Meta') {
          this.cameraController.setRotationEnabled(true);
        }
        selectionHandlers.onKeyDown?.(e);
      },
      onKeyUp: (e: KeyboardEvent) => {
        // Handle Ctrl release
        if (e.key === 'Control' || e.key === 'Meta') {
          this.cameraController.setRotationEnabled(false);
        }
        selectionHandlers.onKeyUp?.(e);
      },
    });

    // Camera handler (lowest priority) - OrbitControls handles right-click pan and wheel zoom
    this.inputCoordinator.registerHandler({
      id: 'camera',
      priority: InputPriority.CAMERA,
      enabled: true,
      handle: (_event: Event, _eventType: InputEventType): boolean => {
        // Never block - camera is lowest priority
        return false;
      },
      wantsInput: () => false,
    });
    
    // Subscribe to theme changes
    const themeManager = getThemeManager();
    this.themeUnsubscribe = themeManager.onThemeChange((theme) => {
      this.applyThemeToScene(theme);
    });
    
    // Apply initial theme immediately
    const initialTheme = themeManager.getActiveSkinTheme();
    this.applyThemeToScene(initialTheme);
    
    // Configure the initial tool (this sets up SelectionManager properly)
    // This is critical for readonly mode to ensure VIEW tool is active and configured
    this.setTool(this.state.activeTool);
  }

  private createInitialState(): EditorState {
    return {
      mode: this.readonly ? EditorMode.VIEW : EditorMode.EDIT,
      activeTool: this.readonly ? EditorTool.VIEW : EditorTool.SELECT,
      camera: {
        mode: CameraMode.FREE,
        isometricAngle: IsometricAngle.SOUTH_WEST,
        position: new THREE.Vector3(30, 30, 30),
        target: new THREE.Vector3(0, 0, 0),
        zoom: 1,
      },
      selection: {
        selectedIds: [],
        hoveredId: null,
        isMultiSelect: false,
      },
      snap: {
        enabled: true,
        gridSize: GridSize.TINY,
      },
      activeAssetId: null,
      activeOrientation: Orientation.NORTH,
      placementPreview: null,
      activeFloor: 0,
      isFloorMode: false,
      buildings: [],
      ui: {
        showGrid: true,
        showCallouts: true,
        showBoundingBoxes: false,
        panelsCollapsed: {},
      },
    };
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
   * Main render loop
   */
  private render(): void {
    if (!this.isRunning) return;
    
    this.animationFrameId = requestAnimationFrame(this.render);
    
    const delta = this.clock.getDelta();
    
    // Update subsystems
    this.cameraController.update(delta);
    this.gridSystem.update(this.cameraController.getCamera());
    this.selectionManager.update();
    this.selectionHighlightManager.update();
    this.translateGizmo.update();
    
    // Render scene
    this.renderer.render(this.scene, this.cameraController.getCamera());
    this.labelRenderer.render(this.scene, this.cameraController.getCamera());
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  getState(): EditorState {
    return { ...this.state };
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
    
    // Calculate object center and size
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    // Get the maximum dimension of the object
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Calculate distance to make object ~25% of screen
    // For isometric camera, we need to adjust zoom/position
    // A multiplier of ~2.0 will make the object about 25% of the view
    const targetDistance = maxDim * 2.0;
    
    // Use current camera angle to calculate new position
    const camera = this.cameraController.getCamera();
    const currentDir = new THREE.Vector3();
    camera.getWorldDirection(currentDir);
    
    // Calculate the offset from center to new camera position
    // Keep the same angle but move further back
    const offset = currentDir.negate().multiplyScalar(Math.max(targetDistance, 12)); // Minimum distance of 12 units
    offset.y = Math.max(offset.y, targetDistance * 0.5); // Ensure some elevation
    
    const newCameraPos = center.clone().add(offset);
    
    // Animate camera to focus on object center with zoom
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
    
    // Select the building
    this.selectBuilding(buildingId);
    
    // Calculate building bounds
    const footprints = building.footprints;
    if (footprints.length === 0) return;
    
    // Find overall bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const fp of footprints) {
      minX = Math.min(minX, fp.minX);
      maxX = Math.max(maxX, fp.maxX);
      minZ = Math.min(minZ, fp.minZ);
      maxZ = Math.max(maxZ, fp.maxZ);
    }
    
    // Calculate center and size
    const gridSize = this.gridSystem.getGridSize();
    const centerX = ((minX + maxX) / 2) * gridSize;
    const centerZ = ((minZ + maxZ) / 2) * gridSize;
    const height = building.floors.length * FLOOR_HEIGHT * gridSize;
    const centerY = height / 2;
    
    const center = new THREE.Vector3(centerX, centerY, centerZ);
    
    // Calculate building dimensions
    const width = (maxX - minX + 1) * gridSize;
    const depth = (maxZ - minZ + 1) * gridSize;
    const maxDim = Math.max(width, depth, height);
    
    // Calculate distance to fit building in view (about 60% of screen)
    const targetDistance = maxDim * 1.8;
    
    // Use current camera angle to calculate new position
    const camera = this.cameraController.getCamera();
    const currentDir = new THREE.Vector3();
    camera.getWorldDirection(currentDir);
    
    // Calculate the offset from center to new camera position
    const offset = currentDir.negate().multiplyScalar(Math.max(targetDistance, 15));
    offset.y = Math.max(offset.y, targetDistance * 0.5);
    
    const newCameraPos = center.clone().add(offset);
    
    // Animate camera to focus on building
    this.cameraController.focusOnWithDistance(center, newCameraPos, true);
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

  // ==========================================================================
  // Object Property Management
  // ==========================================================================

  /**
   * Update an object's binding to real-world data
   */
  updateObjectBinding(id: string, binding: EntityBinding | undefined): void {
    const obj = this.sceneManager.getObject(id);
    if (obj) {
      const placedObj = this.sceneManager.getObjectData(id);
      if (placedObj) {
        if (binding) {
          // Map entity types to the binding's expected types
          let entityType: 'unit' | 'device' | 'facility' = 'unit';
          if (binding.entityType === 'gate' || binding.entityType === 'elevator' || binding.entityType === 'door' || binding.entityType === 'device') {
            entityType = 'device';
          } else if (binding.entityType === 'unit') {
            entityType = 'unit';
          }
          
          placedObj.binding = {
            entityType,
            entityId: binding.entityId,
            currentState: placedObj.binding?.currentState ?? DeviceState.UNKNOWN,
          };
        } else {
          placedObj.binding = undefined;
        }
        this.emit('state-updated', this.state);
      }
    }
  }

  /**
   * Update an object's skin override
   */
  updateObjectSkin(id: string, skinId: string | undefined): void {
    const obj = this.sceneManager.getObject(id);
    if (obj) {
      const placedObj = this.sceneManager.getObjectData(id);
      if (placedObj) {
        if (skinId) {
          // Store skinId at the top level of PlacedObject for consistent access
          placedObj.skinId = skinId;
          // Store default materials if not already stored
          this.storeDefaultMaterials(obj as THREE.Group);
          // Apply the skin from SkinRegistry (contains both built-in and custom skins)
          const skinRegistry = getSkinRegistry();
          const skin = skinRegistry.getSkin(skinId);
          if (skin) {
            console.log(`[updateObjectSkin] Applying skin "${skin.name}" to object ${id}`);
            this.applySkinToObject(obj as THREE.Group, skin);
          } else {
            console.warn(`[updateObjectSkin] Skin "${skinId}" not found in registry`);
          }
        } else {
          delete placedObj.skinId;
          // Reset to default materials, then apply current theme
          this.resetToDefaultMaterials(obj as THREE.Group);
          // Re-apply theme since skin override is removed
          this.applyActiveThemeSkin(obj as THREE.Group, placedObj);
        }
        this.emit('state-updated', this.state);
        this.scheduleAutoSave();
      }
    }
  }

  /**
   * Store default material properties before applying a skin
   */
  private storeDefaultMaterials(object: THREE.Object3D): void {
    const group = object as THREE.Group;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.partName) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat && !child.userData.defaultMaterial) {
          // Store a copy of the default material properties
          child.userData.defaultMaterial = {
            color: '#' + mat.color.getHexString(),
            metalness: mat.metalness,
            roughness: mat.roughness,
            emissive: mat.emissive ? '#' + mat.emissive.getHexString() : '#000000',
            emissiveIntensity: mat.emissiveIntensity,
            transparent: mat.transparent,
            opacity: mat.opacity,
          };
        }
      }
    });
  }

  /**
   * Reset mesh materials to their stored defaults
   */
  private resetToDefaultMaterials(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.partName) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const defaults = child.userData.defaultMaterial;
        if (mat && defaults) {
          mat.color.setStyle(defaults.color);
          mat.metalness = defaults.metalness;
          mat.roughness = defaults.roughness;
          if (defaults.emissive) mat.emissive.setStyle(defaults.emissive);
          mat.emissiveIntensity = defaults.emissiveIntensity || 0;
          mat.transparent = defaults.transparent || false;
          mat.opacity = defaults.opacity ?? 1;
          mat.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Simulate an object's state for preview purposes
   */
  simulateObjectState(id: string, simState: SimulationState): void {
    const obj = this.sceneManager.getObject(id);
    if (obj) {
      const placedObj = this.sceneManager.getObjectData(id);
      if (placedObj && placedObj.assetMetadata?.isSmart) {
        if (simState.isSimulating && simState.simulatedState) {
          // Store original state if starting simulation
          if (!placedObj.properties._originalState && placedObj.binding) {
            placedObj.properties._originalState = placedObj.binding.currentState;
          }
          // Update to simulated state
          if (placedObj.binding) {
            placedObj.binding.currentState = simState.simulatedState;
          } else {
            placedObj.binding = {
              entityType: 'unit',
              currentState: simState.simulatedState,
            };
          }
          // Update visual appearance based on state
          this.updateAssetVisualState(obj as THREE.Group, simState.simulatedState);
        } else {
          // Restore original state
          if (placedObj.properties._originalState && placedObj.binding) {
            placedObj.binding.currentState = placedObj.properties._originalState as DeviceState;
            delete placedObj.properties._originalState;
            this.updateAssetVisualState(obj as THREE.Group, placedObj.binding.currentState);
          }
        }
        this.emit('state-updated', this.state);
      }
    }
  }

  /**
   * Update visual appearance of a smart asset based on state
   * This updates both the state-dependent materials (body, door) AND indicator lights
   */
  private updateAssetVisualState(group: THREE.Group, state: DeviceState): void {
    // Use AssetFactory to properly update all state-dependent materials
    // This handles body colors, door colors, and indicator lights
    AssetFactory.updateAssetState(group, state);
  }

  // ==========================================================================
  // Floor Management
  // ==========================================================================

  /**
   * Set the active floor
   */
  setFloor(level: number): void {
    this.state.activeFloor = level;
    this.floorManager.setFloor(level);
    // Update selection manager with floor mode and level for proper floor filtering
    this.selectionManager.setFloorMode(this.state.isFloorMode, level);
    
    // Update placement manager floor Y and level for placement at correct height
    const floorY = this.floorManager.getCurrentFloorY();
    this.placementManager.setFloorY(floorY, level);
    
    this.sceneManager.applyFloorGhosting(level, !this.state.isFloorMode);
    this.emit('state-updated', this.state);
  }

  /**
   * Add a new floor to the first building
   * @param level The level to add
   * @param copyFromFloor If provided, copy all objects from this floor to the new floor
   */
  addFloor(level: number, copyFromFloor?: number): void {
    const buildings = this.buildingManager.getAllBuildings();
    if (buildings.length > 0) {
      const building = buildings[0];
      const newFloor = this.buildingManager.addFloor(building.id, level);
      this.floorManager.registerFloor(level);
      
      // Record in history
      this.actionHistory.pushFloorAdd(building.id, newFloor);
      
      // Update state
      this.state.buildings = this.buildingManager.getAllBuildings();
      
      // Add vertical shaft objects to the new floor (elevators, stairwells)
      this.addVerticalShaftObjectsToFloor(level, building);
      
      // Copy objects from source floor if specified
      if (copyFromFloor !== undefined) {
        this.copyFloorContents(copyFromFloor, level);
      }
      
      // Apply current theme to ensure new floor tiles have correct materials
      const activeTheme = getThemeManager().getActiveSkinTheme();
      this.applyThemeToScene(activeTheme);
      
      this.setFloor(level);
      
      // Auto-save draft
      this.scheduleAutoSave();
    }
  }
  
  /**
   * Copy all objects from one floor to another
   * Excludes vertical shaft objects (elevators/stairwells) as they're handled separately
   */
  private copyFloorContents(sourceFloor: number, targetFloor: number): void {
    const allObjects = this.sceneManager.getAllObjects();
    const objectsToCopy: PlacedObject[] = [];
    
    // Find all objects on the source floor
    for (const [id] of allObjects) {
      const objData = this.sceneManager.getObjectData(id);
      if (!objData) continue;
      
      // Skip objects on different floors
      if (objData.floor !== sourceFloor) continue;
      
      // Skip vertical shaft objects (they're already handled by addVerticalShaftObjectsToFloor)
      if (objData.verticalShaftId) continue;
      
      objectsToCopy.push(objData);
    }
    
    // Create copies on the target floor
    const placedCopies: PlacedObject[] = [];
    
    for (const sourceObj of objectsToCopy) {
      const asset = sourceObj.assetMetadata;
      if (!asset) continue;
      
      // Create new object for target floor
      const newObject: PlacedObject = {
        ...sourceObj,
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        floor: targetFloor,
        name: sourceObj.name 
          ? sourceObj.name.replace(/\(F\d+\)/, `(F${targetFloor})`)
          : sourceObj.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Place the new object
      this.placeSingleObject(newObject, asset);
      placedCopies.push(newObject);
      
      this.emit('object-placed', newObject);
    }
    
    // Record all copies as a batch action
    if (placedCopies.length > 0) {
      this.actionHistory.pushBatchPlace(placedCopies);
    }
  }
  
  /**
   * Add vertical shaft objects (elevators, stairwells) to a new floor
   * Copies objects from an existing floor that have spansAllFloors metadata
   */
  private addVerticalShaftObjectsToFloor(newLevel: number, _building: Building): void {
    // Get all placed objects
    const allObjects = this.sceneManager.getAllObjects();
    
    // Find objects that belong to vertical shafts
    const verticalShaftObjects = new Map<string, PlacedObject>();
    
    for (const [id] of allObjects) {
      const objData = this.sceneManager.getObjectData(id);
      if (!objData || !objData.verticalShaftId || objData.disableVerticalShaft) continue;
      
      // Check if this shaft already has an object on the new floor
      const shaftId = objData.verticalShaftId;
      if (!verticalShaftObjects.has(shaftId)) {
        verticalShaftObjects.set(shaftId, objData);
      }
    }
    
    // Create copies for the new floor
    for (const [shaftId, sourceObj] of verticalShaftObjects) {
      const asset = sourceObj.assetMetadata;
      if (!asset) continue;
      
      // Check if this floor already has this shaft
      let existingOnFloor = false;
      for (const [objId] of allObjects) {
        const data = this.sceneManager.getObjectData(objId);
        if (data?.verticalShaftId === shaftId && data?.floor === newLevel) {
          existingOnFloor = true;
          break;
        }
      }
      
      if (existingOnFloor) continue;
      
      // Create new object for this floor
      const newObject: PlacedObject = {
        ...sourceObj,
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        floor: newLevel,
        verticalShaftId: shaftId,
        name: sourceObj.name 
          ? sourceObj.name.replace(/\(F\d+\)/, `(F${newLevel})`)
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Place the new object
      this.placeSingleObject(newObject, asset);
      
      // Record in history (as part of floor add)
      this.actionHistory.pushPlace(newObject);
      
      this.emit('object-placed', newObject);
    }
  }

  /**
   * Toggle between floor mode and full building view
   */
  toggleFullBuildingView(): void {
    this.state.isFloorMode = !this.state.isFloorMode;
    
    // When entering full view mode, reset to ground floor
    if (!this.state.isFloorMode) {
      this.state.activeFloor = 0;
    }
    
    this.floorManager.setFullBuildingView(!this.state.isFloorMode);
    this.selectionManager.setFloorMode(this.state.isFloorMode, this.state.activeFloor);
    this.sceneManager.applyFloorGhosting(this.state.activeFloor, !this.state.isFloorMode);
    this.emit('state-updated', this.state);
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  setTool(tool: EditorTool): void {
    // In readonly mode, force VIEW tool and prevent any changes
    if (this.readonly) {
      tool = EditorTool.VIEW;
    }
    
    // In edit mode, don't allow VIEW tool (it's readonly-only)
    if (!this.readonly && tool === EditorTool.VIEW) {
      tool = EditorTool.SELECT;
    }
    
    // Cancel placement if switching away from PLACE tool
    if (this.state.activeTool === EditorTool.PLACE && tool !== EditorTool.PLACE) {
      this.placementManager.cancelPlacement();
      this.state.activeAssetId = null;
    }
    
    this.state.activeTool = tool;
    
    // Determine tool behavior
    const isSelectionTool = tool === EditorTool.SELECT || tool === EditorTool.SELECT_BUILDING;
    const isViewTool = tool === EditorTool.VIEW;
    const isMoveTool = tool === EditorTool.MOVE;
    
    // Enable SelectionManager for selection tools and VIEW tool (VIEW allows single-click selection)
    this.selectionManager.setEnabled(isSelectionTool || isViewTool);
    
    // Drag selection: enabled only for SELECT and SELECT_BUILDING tools
    // VIEW tool allows single-click selection but not drag selection
    // MOVE tool has no selection at all
    this.selectionManager.setDragSelectionEnabled(isSelectionTool);
    
    // VIEW tool: only smart objects, single click only (no multi-select)
    if (isViewTool) {
      this.selectionManager.setSmartOnlySelection(true);
      this.selectionManager.setSingleSelectOnly(true);
    } else {
      this.selectionManager.setSmartOnlySelection(false);
      this.selectionManager.setSingleSelectOnly(false);
    }
    
    // In normal SELECT mode, ignore buildings (can't select them)
    // In SELECT_BUILDING mode, allow building selection
    this.selectionManager.setIgnoreBuildings(tool !== EditorTool.SELECT_BUILDING);
    
    // MOVE and VIEW tools: rotation enabled by default for full camera control
    // SELECT, SELECT_BUILDING, PLACE: rotation disabled by default (requires Ctrl+drag)
    if (isMoveTool || isViewTool) {
      this.cameraController.setRotationEnabled(true);
    } else {
      this.cameraController.setRotationEnabled(false);
    }
    
    // Update InputCoordinator handler states
    this.inputCoordinator.setHandlerEnabled('placement', tool === EditorTool.PLACE);
    this.inputCoordinator.setHandlerEnabled('selection', isSelectionTool || isViewTool);
    
    this.emit('tool-changed', tool);
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
    const bounds = new THREE.Box3();
    
    // Include all placed objects
    for (const obj of this.sceneManager.getAllPlacedObjects()) {
      const mesh = this.sceneManager.getObject(obj.id);
      if (mesh) {
        const objBounds = new THREE.Box3().setFromObject(mesh);
        bounds.union(objBounds);
      }
    }
    
    // Include all buildings
    const buildings = this.buildingManager.getAllBuildings();
    for (const building of buildings) {
      const gridSize = this.gridSystem.getGridSize();
      for (const fp of building.footprints) {
        const minWorld = this.gridSystem.gridToWorld({ x: fp.minX, z: fp.minZ, y: 0 });
        const maxWorld = this.gridSystem.gridToWorld({ x: fp.maxX + 1, z: fp.maxZ + 1, y: 0 });
        const height = building.floors.length * FLOOR_HEIGHT * gridSize;
        
        bounds.expandByPoint(new THREE.Vector3(minWorld.x, 0, minWorld.z));
        bounds.expandByPoint(new THREE.Vector3(maxWorld.x, height, maxWorld.z));
      }
    }
    
    // If bounds are empty or invalid, use default bounds around origin
    if (bounds.isEmpty()) {
      bounds.expandByPoint(new THREE.Vector3(-10, 0, -10));
      bounds.expandByPoint(new THREE.Vector3(10, 10, 10));
    }
    
    return bounds;
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
    // User must hold Ctrl to rotate
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
   * Generate a default name for a smart object
   */
  private generateObjectName(asset: AssetMetadata): string {
    const count = (this.objectNameCounters.get(asset.id) ?? 0) + 1;
    this.objectNameCounters.set(asset.id, count);
    return `${asset.name} ${count}`;
  }
  
  /**
   * Check if an asset category is considered "smart" (bindable to data)
   */
  private isSmartAssetCategory(category: AssetCategory): boolean {
    const smartCategories = [
      AssetCategory.STORAGE_UNIT,
      AssetCategory.GATE,
      AssetCategory.DOOR,
      AssetCategory.ELEVATOR,
      AssetCategory.ACCESS_CONTROL,
    ];
    return smartCategories.includes(category);
  }
  
  /**
   * Handle asset placement completion
   */
  private handleAssetPlaced(placedObject: PlacedObject): void {
    // Block placement in full building view mode (safety net)
    if (!this.state.isFloorMode && this.state.buildings.length > 0) {
      console.warn('Cannot place assets in full building view. Switch to a specific floor first.');
      this.placementManager.cancelPlacement();
      return;
    }
    
    // Use the current placement asset metadata
    if (!this.currentPlacementAsset) {
      console.error('No active placement asset');
      return;
    }
    
    const asset = this.currentPlacementAsset;
    
    // Check if this asset should span all floors (elevators, stairwells)
    if (asset.spansAllFloors && this.state.buildings.length > 0) {
      this.handleVerticalShaftPlacement(placedObject, asset);
      return;
    }
    
    // Standard single-floor placement
    this.placeSingleObject(placedObject, asset);
    
    // Record in history
    this.actionHistory.pushPlace(placedObject);
    
    // Emit event
    this.emit('object-placed', placedObject);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }
  
  /**
   * Handle placement of vertical shaft objects (elevators, stairwells)
   * These are automatically placed on all floors of the building
   */
  private handleVerticalShaftPlacement(placedObject: PlacedObject, asset: AssetMetadata): void {
    const buildings = this.state.buildings;
    if (buildings.length === 0) return;
    
    const building = buildings[0]; // Currently supporting single building
    const floors = building.floors || [];
    
    if (floors.length === 0) {
      // No floors defined, just place on current floor
      this.placeSingleObject(placedObject, asset);
      this.actionHistory.pushPlace(placedObject);
      this.emit('object-placed', placedObject);
      this.scheduleAutoSave();
      return;
    }
    
    // Generate a shared vertical shaft ID
    const verticalShaftId = `shaft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine which floors to place on
    // Place on all floors
    const floorsToPlace = floors;
    
    const placedObjects: PlacedObject[] = [];
    
    // Place on each floor
    for (const floor of floorsToPlace) {
      const floorObject: PlacedObject = {
        ...placedObject,
        id: floor.level === placedObject.floor 
          ? placedObject.id 
          : `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        floor: floor.level,
        verticalShaftId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Auto-generate name for smart objects with floor suffix
      if (this.isSmartAssetCategory(asset.category)) {
        const baseName = this.generateObjectName(asset);
        floorObject.name = floors.length > 1 
          ? `${baseName} (F${floor.level})` 
          : baseName;
      }
      
      this.placeSingleObject(floorObject, asset);
      placedObjects.push(floorObject);
    }
    
    // Record all placements as a single undo action
    if (placedObjects.length > 0) {
      this.actionHistory.pushBatchPlace(placedObjects);
      
      // Emit events
      for (const obj of placedObjects) {
        this.emit('object-placed', obj);
      }
      
      this.scheduleAutoSave();
    }
  }
  
  /**
   * Place a single object on a specific floor
   */
  private placeSingleObject(placedObject: PlacedObject, asset: AssetMetadata): void {
    // Auto-generate name for smart objects if not already set
    if (!placedObject.name && this.isSmartAssetCategory(asset.category)) {
      placedObject.name = this.generateObjectName(asset);
    }
    
    // Check if this is a ground tile category - use instanced rendering
    if (this.groundTileManager.isGroundTileCategory(asset.category)) {
      // Use instanced ground tile manager for performance
      const marker = this.groundTileManager.addTile(
        placedObject.id,
        asset.category,
        placedObject.position
      );
      
      // Add marker to scene for selection/raycasting
      this.scene.add(marker);
      this.sceneManager.addObject(placedObject.id, marker, placedObject);
      
      // Mark grid as occupied
      const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
      const replacedGroundId = this.gridSystem.markOccupied(
        placedObject.id, 
        placedObject.position, 
        size, 
        asset.canStack,
        asset.category,
        placedObject.floor ?? 0
      );
      
      // If ground was replaced, remove it properly
      if (replacedGroundId) {
        this.groundTileManager.removeTile(replacedGroundId);
        this.sceneManager.removeObject(replacedGroundId);
      }
      
      // Optimization is handled automatically by GroundTileManager
      return;
    }
    
    // Standard placement for non-ground tiles
    const mesh = AssetFactory.createAssetMesh(asset);
    
    // Position the mesh (centered on grid cells, accounting for rotation)
    const worldPos = this.gridSystem.gridToWorld(placedObject.position);
    const gridSize = this.gridSystem.getGridSize();
    
    // Swap grid units for 90° and 270° rotations
    const isRotated90 = placedObject.orientation === Orientation.EAST || 
                        placedObject.orientation === Orientation.WEST;
    const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
    const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
    
    const centerOffsetX = (effectiveGridX * gridSize) / 2;
    const centerOffsetZ = (effectiveGridZ * gridSize) / 2;
    
    // Calculate Y position based on floor
    const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;
    
    mesh.position.set(
      worldPos.x + centerOffsetX,
      floorY, // Flush with the floor level
      worldPos.z + centerOffsetZ
    );
    
    // Store floor info and asset metadata in mesh userData
    mesh.userData.floor = placedObject.floor ?? 0;
    mesh.userData.selectable = true;
    mesh.userData.verticalShaftId = placedObject.verticalShaftId;
    mesh.userData.assetId = asset.id;
    mesh.userData.category = asset.category;
    mesh.userData.isSmart = asset.isSmart;
    mesh.userData.id = placedObject.id;
    mesh.userData.gridPosition = placedObject.position;

    // If attached to a wall, snap to the wall center and offset flush to the wall plane
    if (placedObject.wallAttachment?.wallId) {
      const wall = this.buildingManager.getWall(placedObject.wallAttachment.wallId);
      if (wall) {
        const startWorld = this.gridSystem.gridToWorld(wall.startPos);
        const endWorld = this.gridSystem.gridToWorld(wall.endPos);
        const cx = (startWorld.x + endWorld.x) / 2;
        const cz = (startWorld.z + endWorld.z) / 2;
        mesh.position.x = cx;
        mesh.position.z = cz;

        const dx = endWorld.x - startWorld.x;
        const dz = endWorld.z - startWorld.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.0001) {
          // Normal pointing outward from wall (perpendicular)
          const nx = -dz / len;
          const nz = dx / len;
          const wallThickness = 0.2;
          const offset = wallThickness * 0.5 - 0.01; // nudge slightly into the wall for flush fit
          mesh.position.x += nx * offset;
          mesh.position.z += nz * offset;
        }
      }
    }
    
    // Apply rotation
    const rotation = this.getRotationFromOrientation(placedObject.orientation);
    mesh.rotation.y = rotation;
    
    // Add to scene
    this.sceneManager.addObject(placedObject.id, mesh, placedObject);
    
    // Apply skin or theme
    if (placedObject.skinId) {
      const skinRegistry = getSkinRegistry();
      const skin = skinRegistry.getSkin(placedObject.skinId);
      if (skin) {
        this.storeDefaultMaterials(mesh);
        this.applySkinToObject(mesh as THREE.Group, skin);
      } else {
        this.applyActiveThemeSkin(mesh, placedObject);
      }
    } else {
      this.applyActiveThemeSkin(mesh, placedObject);
    }
    
    // Apply correct floor-based opacity to newly placed object
    this.floorManager.applyGhostingToObject(mesh);
    
    // Mark grid as occupied (handles ground layer replacement) - floor-aware
    const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
    const replacedGroundId = this.gridSystem.markOccupied(
      placedObject.id, 
      placedObject.position, 
      size, 
      asset.canStack,
      asset.category,
      placedObject.floor ?? 0
    );
    
    // If ground was replaced, remove the old ground mesh
    if (replacedGroundId) {
      // Also remove from ground tile manager if it was a ground tile
      this.groundTileManager.removeTile(replacedGroundId);
      this.sceneManager.removeObject(replacedGroundId);
    }
  }

  /**
   * Handle batch asset placement (e.g., ground tiles)
   * All objects are placed as a single undo action
   */
  private handleBatchAssetPlaced(objects: PlacedObject[]): void {
    if (objects.length === 0) return;
    
    // Use the current placement asset metadata
    if (!this.currentPlacementAsset) {
      console.error('No active placement asset');
      return;
    }
    
    const asset = this.currentPlacementAsset;
    const gridSize = this.gridSystem.getGridSize();
    
    // Place all objects
    for (const placedObject of objects) {
      // Ground tiles: use instanced manager for performance
      if (this.groundTileManager.isGroundTileCategory(asset.category)) {
        const marker = this.groundTileManager.addTile(
          placedObject.id,
          asset.category,
          placedObject.position
        );
        this.scene.add(marker);
        this.sceneManager.addObject(placedObject.id, marker, placedObject);

        const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
        const replacedGroundId = this.gridSystem.markOccupied(
          placedObject.id, 
          placedObject.position, 
          size, 
          asset.canStack,
          asset.category,
          placedObject.floor ?? 0
        );

        if (replacedGroundId) {
          this.groundTileManager.removeTile(replacedGroundId);
          this.sceneManager.removeObject(replacedGroundId);
        }

        // Ground tiles use shared material; no per-object theme application needed
        // Optimization is handled automatically by GroundTileManager
        continue;
      }

      // Non-ground: create mesh using asset
      const mesh = AssetFactory.createAssetMesh(asset);
      const worldPos = this.gridSystem.gridToWorld(placedObject.position);

      const isRotated90 = placedObject.orientation === Orientation.EAST || 
                          placedObject.orientation === Orientation.WEST;
      const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
      const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;

      const centerOffsetX = (effectiveGridX * gridSize) / 2;
      const centerOffsetZ = (effectiveGridZ * gridSize) / 2;
      const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;

      mesh.position.set(
        worldPos.x + centerOffsetX,
        floorY,
        worldPos.z + centerOffsetZ
      );

      mesh.userData.floor = placedObject.floor ?? 0;
      mesh.userData.selectable = true;

      const rotation = this.getRotationFromOrientation(placedObject.orientation);
      mesh.rotation.y = rotation;

      this.sceneManager.addObject(placedObject.id, mesh, placedObject);

      // Apply skin/theme
      if (placedObject.skinId) {
        const skinRegistry = getSkinRegistry();
        const skin = skinRegistry.getSkin(placedObject.skinId);
        if (skin) {
          this.storeDefaultMaterials(mesh);
          this.applySkinToObject(mesh as THREE.Group, skin);
        } else {
          this.applyActiveThemeSkin(mesh, placedObject);
        }
      } else {
        this.applyActiveThemeSkin(mesh, placedObject);
      }

      this.floorManager.applyGhostingToObject(mesh);

      const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
      const replacedGroundId = this.gridSystem.markOccupied(
        placedObject.id, 
        placedObject.position, 
        size, 
        asset.canStack,
        asset.category,
        placedObject.floor ?? 0
      );

      if (replacedGroundId) {
        this.sceneManager.removeObject(replacedGroundId);
      }
    }
    
    // Note: Ground tile optimization is handled automatically by GroundTileManager
    // after tiles are added (with debouncing)
    
    // Record ALL objects as a single undo action
    this.actionHistory.pushBatchPlace(objects);
    
    // Emit event for each object (or a batch event)
    this.emit('objects-placed', objects);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Get rotation from orientation
   */
  private getRotationFromOrientation(orientation: Orientation): number {
    switch (orientation) {
      case Orientation.NORTH:
        return 0;
      case Orientation.EAST:
        return Math.PI / 2;
      case Orientation.SOUTH:
        return Math.PI;
      case Orientation.WEST:
        return -Math.PI / 2;
      default:
        return 0;
    }
  }

  /**
   * Handle building placement
   */
  private handleBuildingPlaced(footprint: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    // Check for overlapping buildings
    const overlapping = this.buildingManager.findOverlappingBuildings(footprint);
    
    let building;
    if (overlapping.length > 0) {
      // Merge with existing buildings
      building = this.buildingManager.createBuilding(footprint);
      this.buildingManager.mergeBuildings([...overlapping, building.id]);
      // Note: Building ID may change after merge, get the updated building
      const buildings = this.buildingManager.getAllBuildings();
      if (buildings.length > 0) {
        building = buildings[buildings.length - 1];
      }
    } else {
      // Create new building
      building = this.buildingManager.createBuilding(footprint);
    }
    
    // Record in history
    if (building) {
      this.actionHistory.pushBuildingCreate(building);
      
      // Update state
      this.state.buildings = this.buildingManager.getAllBuildings();
    }
    
    // Enter floor mode
    this.state.isFloorMode = true;
    this.state.activeFloor = 0;
    this.floorManager.registerFloor(0);
    this.floorManager.setFloor(0); // Apply ghosting for floor mode
    this.selectionManager.setFloorMode(true, 0);
    this.emit('state-updated', this.state);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Delete a floor from a building
   * Removes all objects on that floor and shifts higher floors down
   */
  deleteFloor(level: number): void {
    const buildings = this.buildingManager.getAllBuildings();
    if (buildings.length === 0) return;
    
    const building = buildings[0]; // Currently supporting single building
    const floor = this.buildingManager.getFloor(building.id, level);
    if (!floor) return;
    
    // Get all objects on this floor before deletion
    const objectsOnFloor: PlacedObject[] = [];
    for (const objData of this.sceneManager.getAllPlacedObjects()) {
      if (objData.floor === level) {
        objectsOnFloor.push(objData);
      }
    }
    
    // Delete all objects on this floor
    objectsOnFloor.forEach(obj => {
      this.deleteObjectInternal(obj.id);
    });
    
    // Remove the floor from the building
    const removedFloor = this.buildingManager.removeFloor(building.id, level);
    if (!removedFloor) return;
    
    // Shift floors above down by 1
    this.buildingManager.shiftFloorLevels(building.id, level + 1, -1);
    
    // Shift objects on higher floors down
    const shiftedObjects = this.floorManager.shiftObjectFloors(level + 1, -1);
    
    // Also update the PlacedObject data for shifted objects
    shiftedObjects.forEach(shifted => {
      const objData = this.sceneManager.getObjectData(shifted.id);
      if (objData) {
        objData.floor = shifted.newFloor;
      }
    });
    
    // Update floor manager
    this.floorManager.unregisterFloor(level);
    this.floorManager.shiftFloors(level + 1, -1);
    
    // Record in history
    this.actionHistory.pushFloorDelete(building.id, removedFloor, objectsOnFloor);
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    this.emit('state-updated', this.state);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Insert a floor at a specific level
   * Shifts all floors at or above that level up by 1
   */
  insertFloor(atLevel: number): void {
    const buildings = this.buildingManager.getAllBuildings();
    if (buildings.length === 0) return;
    
    const building = buildings[0]; // Currently supporting single building
    
    // Shift floors at or above atLevel up by 1
    this.buildingManager.shiftFloorLevels(building.id, atLevel, 1);
    
    // Shift objects on floors at or above atLevel up
    const shiftedObjects = this.floorManager.shiftObjectFloors(atLevel, 1);
    
    // Also update the PlacedObject data for shifted objects
    shiftedObjects.forEach(shifted => {
      const objData = this.sceneManager.getObjectData(shifted.id);
      if (objData) {
        objData.floor = shifted.newFloor;
      }
    });
    
    // Update floor manager
    this.floorManager.shiftFloors(atLevel, 1);
    
    // Add the new floor
    const newFloor = this.buildingManager.addFloor(building.id, atLevel);
    this.floorManager.registerFloor(atLevel);
    
    // Add vertical shaft objects (elevators, stairwells) to the new floor
    this.addVerticalShaftObjectsToFloor(atLevel, building);
    
    // Record in history
    this.actionHistory.pushFloorInsert(building.id, newFloor, atLevel, shiftedObjects);
    
    // Apply current theme to ensure new floor tiles have correct materials
    const activeTheme = getThemeManager().getActiveSkinTheme();
    this.applyThemeToScene(activeTheme);
    
    // Navigate to the new floor
    this.setFloor(atLevel);
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    this.emit('state-updated', this.state);
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Update theme (light/dark mode)
   */
  setTheme(theme: 'light' | 'dark'): void {
    if (theme === 'dark') {
      // Dark theme - darker background, brighter grid for visibility
      this.scene.background = new THREE.Color('#1a1a2e');
      this.gridSystem.applyConfig(DARK_THEME_GRID_CONFIG);
    } else {
      // Light theme - light background, standard grid
      this.scene.background = new THREE.Color('#e8eef5');
      this.gridSystem.applyConfig(DEFAULT_GRID_CONFIG);
    }
    this.emit('theme-changed', theme);
  }

  /**
   * Apply a scene theme to all objects
   * Updates materials based on theme palette
   */
  applyThemeToScene(theme: Theme): void {
    const skinRegistry = getSkinRegistry();
    
    // Update building materials through BuildingManager
    const buildingMaterials = this.getBuildingMaterials(theme);
    const isGlassTheme =
      theme.buildingSkin === BuildingSkinType.GLASS ||
      (theme.buildingSkinId ? this.isGlassBuildingSkin(theme.buildingSkinId) : false);
    this.buildingManager.applyBuildingMaterials(buildingMaterials, isGlassTheme);
    
    // Update all placed objects using SceneManager's data
    const allObjects = this.sceneManager.getAllObjects();
    
    for (const [id, object] of allObjects) {
      // Skip system objects
      if (object.userData.isGrid || object.userData.isGround) {
        continue;
      }
      
      // Get the object data to check for skin override
      const objectData = this.sceneManager.getObjectData(id);
      
      // Determine the category - can come from objectData or userData
      const category = objectData?.assetMetadata?.category || object.userData.category;
      
      // Apply theme to placed assets - check for either userData.assetId OR objectData
      if ((object.userData.assetId || objectData) && category) {
        // Check for per-object skin override first
        if (objectData?.skinId) {
          // Apply the specific skin override
          const skin = skinRegistry.getSkin(objectData.skinId);
          if (skin) {
            this.applySkinToObject(object as THREE.Group, skin);
          } else {
            // Fall back to theme skin
            const skinId = theme.categorySkins[category as AssetCategory];
            if (skinId) {
              const fallbackSkin = skinRegistry.getSkin(skinId);
              if (fallbackSkin) {
                this.applySkinToObject(object as THREE.Group, fallbackSkin);
              }
            }
          }
        } else {
          // No override - use theme's skin for this category
          const skinId = theme.categorySkins[category as AssetCategory];
          if (skinId) {
            const skin = skinRegistry.getSkin(skinId);
            if (skin) {
              this.applySkinToObject(object as THREE.Group, skin);
            }
          } else {
            // No skin assigned for this category in theme - try default skin
            const normalizedCategory = String(category).replace(/_/g, '-');
            const defaultSkinId = `skin-${normalizedCategory}-default`;
            const defaultSkin = skinRegistry.getSkin(defaultSkinId);
            if (defaultSkin) {
              this.applySkinToObject(object as THREE.Group, defaultSkin);
            }
          }
        }
      }
    }
    
    // Update ground/grass color from theme environment
    const ground = this.scene.children.find(c => c.userData.isGround);
    if (ground && ground instanceof THREE.Mesh) {
      const mat = ground.material as THREE.MeshStandardMaterial;
      if (mat && theme.environment?.grass) {
        mat.color.setStyle(theme.environment.grass.color);
        mat.metalness = theme.environment.grass.metalness;
        mat.roughness = theme.environment.grass.roughness;
        mat.needsUpdate = true;
      }
    }
    
    // Update instanced ground tile materials
    if (theme.environment) {
      if (theme.environment.pavement) {
        this.groundTileManager.updateMaterial(AssetCategory.PAVEMENT, theme.environment.pavement);
      }
      if (theme.environment.grass) {
        this.groundTileManager.updateMaterial(AssetCategory.GRASS, theme.environment.grass);
      }
      if (theme.environment.gravel) {
        this.groundTileManager.updateMaterial(AssetCategory.GRAVEL, theme.environment.gravel);
      }
    }
    
    // IMPORTANT: Refresh floor ghosting/opacities after material changes
    // This ensures transparent materials get correct ghosting treatment
    if (this.state.isFloorMode) {
      this.floorManager.applyGhosting();
    }
    
    this.emit('scene-theme-applied', theme);
  }
  
  /**
   * Get building materials based on the theme's buildingSkin type
   */
  private getBuildingMaterials(theme: Theme): BuildingMaterials {
    // If a custom building skin is specified, use it first
    if (theme.buildingSkinId) {
      const skin = getSkinRegistry().getSkin(theme.buildingSkinId);
      if (skin && skin.category === AssetCategory.BUILDING) {
        const wallMat = skin.partMaterials['wall'];
        const floorMat = skin.partMaterials['floor'];
        const roofMat = skin.partMaterials['roof'];
        return {
          wall: wallMat,
          floor: floorMat,
          roof: roofMat,
        } as BuildingMaterials;
      }
    }

    // Define materials based on buildingSkin type
    switch (theme.buildingSkin) {
      case BuildingSkinType.GLASS:
        return {
          wall: {
            color: '#b4d4e8',
            metalness: 0.1,
            roughness: 0.05,
            transparent: true,
            opacity: 0.35,
          },
          roof: {
            color: '#c4e4f8',
            metalness: 0.1,
            roughness: 0.1,
            transparent: true,
            opacity: 0.4,
          },
          floor: {
            color: '#c8c8c8',
            metalness: 0.1,
            roughness: 0.6,
          },
        };
        
      case BuildingSkinType.BRICK:
        return {
          wall: {
            color: '#a85e4d',
            metalness: 0.0,
            roughness: 0.9,
          },
          roof: {
            color: '#5a4a3a',
            metalness: 0.05,
            roughness: 0.85,
          },
          floor: {
            color: '#808080',
            metalness: 0.05,
            roughness: 0.8,
          },
        };
        
      case BuildingSkinType.CONCRETE:
        return {
          wall: {
            color: '#9a9a9a',
            metalness: 0.05,
            roughness: 0.85,
          },
          roof: {
            color: '#7a7a7a',
            metalness: 0.1,
            roughness: 0.8,
          },
          floor: {
            color: '#888888',
            metalness: 0.1,
            roughness: 0.75,
          },
        };
        
      case BuildingSkinType.METAL:
        return {
          wall: {
            color: '#6a7a8a',
            metalness: 0.7,
            roughness: 0.4,
          },
          roof: {
            color: '#5a6a7a',
            metalness: 0.75,
            roughness: 0.35,
          },
          floor: {
            color: '#707070',
            metalness: 0.3,
            roughness: 0.6,
          },
        };
        
      case BuildingSkinType.DEFAULT:
      default:
        // Clean white/gray default building
        return {
          wall: {
            color: '#e8e4dc',
            metalness: 0.0,
            roughness: 0.7,
          },
          roof: {
            color: '#5a5552',
            metalness: 0.1,
            roughness: 0.8,
          },
          floor: {
            color: '#909090',
            metalness: 0.05,
            roughness: 0.85,
          },
        };
    }
  }

  private isGlassBuildingSkin(skinId: string): boolean {
    const skin = getSkinRegistry().getSkin(skinId);
    if (!skin || skin.category !== AssetCategory.BUILDING) return false;
    const wall = skin.partMaterials['wall'];
    return !!(wall?.transparent || wall?.shader === 'paned-glass' || wall?.shader === 'glass-floor' || wall?.shader === 'glass-roof');
  }
  
  /**
   * Apply the active theme's skin to an object based on its category
   */
  private applyActiveThemeSkin(object: THREE.Object3D, objectData?: PlacedObject): void {
    const group = object as THREE.Group;
    const themeManager = getThemeManager();
    const theme = themeManager.getActiveSkinTheme();
    const skinRegistry = getSkinRegistry();
    
    const category = objectData?.assetMetadata?.category || object.userData.category;
    if (!category) {
      return;
    }
    
    // Try to get skin from theme first
    const skinId = theme.categorySkins[category as AssetCategory];
    
    if (skinId) {
      const skin = skinRegistry.getSkin(skinId);
      if (skin) {
        this.applySkinToObject(group, skin);
        return;
      }
    }
    
    // Try default skin for this category
    // Handle categories with underscores (e.g., storage_unit -> skin-storage-unit-default)
    const normalizedCategory = String(category).replace(/_/g, '-');
    const defaultSkinId = `skin-${normalizedCategory}-default`;
    const defaultSkin = skinRegistry.getSkin(defaultSkinId);
    if (defaultSkin) {
      this.applySkinToObject(group, defaultSkin);
    }
  }
  
  /**
   * Apply a skin's materials to an object
   * This method is robust - it will attempt multiple fallback strategies for matching materials
   */
  private applySkinToObject(object: THREE.Object3D, skin: CategorySkin): void {
    const group = object as THREE.Group;
    
    // Get all available part material keys from the skin for fallback
    const skinPartKeys = Object.keys(skin.partMaterials);
    const defaultMaterial = skin.partMaterials['body'] || 
                            skin.partMaterials['surface'] || 
                            Object.values(skin.partMaterials)[0];
    
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const partName = child.userData.partName as string;
        
        // Get material - handle both single and array materials
        let mat = child.material as THREE.MeshStandardMaterial;
        
        // If material is an array, use first one
        if (Array.isArray(child.material)) {
          mat = child.material[0] as THREE.MeshStandardMaterial;
        }
        
        // Skip if no material or no color property
        if (!mat) {
          return;
        }
        
        // Skip emissive materials (indicator lights) - these should keep their color
        // Check if the emissive color is actually set (not black) AND intensity is high
        const isEmissive = mat.emissive && 
                           mat.emissiveIntensity > 0.3 && 
                           (mat.emissive.r > 0.1 || mat.emissive.g > 0.1 || mat.emissive.b > 0.1);
        if (isEmissive) {
          return;
        }
        
        // Find matching material in skin with multiple fallback strategies:
        // 1. Exact partName match
        // 2. Partial partName match (e.g., 'body' matches 'body-main')
        // 3. Default 'body' or 'surface' material
        // 4. First available material in skin
        let skinMaterial = partName ? skin.partMaterials[partName] : null;
        
        // Try partial match if exact match fails
        if (!skinMaterial && partName) {
          // Check if any skin key starts with or contains the partName
          for (const key of skinPartKeys) {
            if (key.includes(partName) || partName.includes(key)) {
              skinMaterial = skin.partMaterials[key];
              break;
            }
          }
        }
        
        // Fallback to default material
        if (!skinMaterial) {
          skinMaterial = defaultMaterial;
        }
        
        if (skinMaterial) {
          // CLONE the material to ensure this mesh has its own instance
          // This is critical for skinning to work independently per object
          if (!mat.userData.isClonedForSkin) {
            const clonedMat = mat.clone();
            clonedMat.userData.isClonedForSkin = true;
            child.material = clonedMat;
            mat = clonedMat;
          }
          
          // Now apply the skin color
          mat.color.setStyle(skinMaterial.color);
          if (skinMaterial.metalness !== undefined) mat.metalness = skinMaterial.metalness;
          if (skinMaterial.roughness !== undefined) mat.roughness = skinMaterial.roughness;
          
          // Handle texture (diffuse/color map)
          if (skinMaterial.textureUrl) {
            const texture = this.loadTexture(skinMaterial.textureUrl);
            mat.map = texture;
          } else {
            mat.map = null;
          }
          
          // Handle normal map
          if (skinMaterial.normalMapUrl) {
            const normalMap = this.loadTexture(skinMaterial.normalMapUrl);
            mat.normalMap = normalMap;
          } else {
            mat.normalMap = null;
          }
          
          // Handle roughness map
          if (skinMaterial.roughnessMapUrl) {
            const roughnessMap = this.loadTexture(skinMaterial.roughnessMapUrl);
            mat.roughnessMap = roughnessMap;
          } else {
            mat.roughnessMap = null;
          }
          
          // Handle shader hints
          if (skinMaterial.shader === 'wireframe') {
            mat.wireframe = true;
          } else {
            mat.wireframe = false;
          }
          
          // Handle transparency
          if (skinMaterial.transparent) {
            const baseOpacity = skinMaterial.opacity ?? 0.5;
            mat.transparent = true;
            mat.opacity = baseOpacity;
            mat.depthWrite = false;
            mat.side = THREE.DoubleSide;
            // Store base opacity for ghosting calculations
            mat.userData.baseOpacity = baseOpacity;
            mat.userData.isNaturallyTransparent = true;
          } else {
            mat.transparent = false;
            mat.opacity = 1;
            mat.depthWrite = true;
            mat.userData.baseOpacity = 1.0;
            mat.userData.isNaturallyTransparent = false;
          }
          
          mat.needsUpdate = true;
        }
      }
    });
    
  }
  
  /**
   * Load a texture from URL with caching
   */
  private loadTexture(url: string): THREE.Texture {
    // Check cache first
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url)!;
    }
    
    // Load texture
    const texture = this.textureLoader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    
    // Cache it
    this.textureCache.set(url, texture);
    
    return texture;
  }

  // ==========================================================================
  // Event System
  // ==========================================================================

  on<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler as EngineEventHandler);
    
    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler as EngineEventHandler);
    };
  }

  off<T = unknown>(eventType: EngineEventType, handler: EngineEventHandler<T>): void {
    this.eventHandlers.get(eventType)?.delete(handler as EngineEventHandler);
  }

  private emit<T = unknown>(eventType: EngineEventType, data: T): void {
    const event: EngineEvent<T> = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };
    
    this.eventHandlers.get(eventType)?.forEach((handler) => {
      try {
        handler(event as EngineEvent);
      } catch (error) {
        console.error(`Error in event handler for ${eventType}:`, error);
      }
    });
  }

  // ==========================================================================
  // Save/Load
  // ==========================================================================

  /**
   * Export current scene data for saving (optimized - minimal data)
   */
  /**
   * Export current scene data for saving (optimized - minimal data)
   * Only stores essential data; runtime data is reconstructed on load.
   */
  exportSceneData(): FacilityData {
    // Get all placed objects from scene manager
    const fullPlacedObjects = this.sceneManager.getAllPlacedObjects();
    
    // Convert to optimized serialized format (strip out assetMetadata, etc.)
    // Only include non-default values to minimize size
    const serializedObjects: SerializedPlacedObject[] = fullPlacedObjects.map(obj => {
      const serialized: SerializedPlacedObject = {
        id: obj.id,
        assetId: obj.assetId,
        position: {
          x: Math.round(obj.position.x),
          z: Math.round(obj.position.z),
        },
        orientation: obj.orientation,
      };
      
      // Only include optional fields if they have non-default values
      if (obj.floor && obj.floor !== 0) {
        serialized.floor = obj.floor;
      }
      if (obj.buildingId) {
        serialized.buildingId = obj.buildingId;
      }
      if (obj.name) {
        serialized.name = obj.name;
      }
      if (obj.wallAttachment) {
        serialized.wallAttachment = obj.wallAttachment;
      }
      if (obj.binding?.entityId) {
        serialized.binding = {
          entityType: obj.binding.entityType,
          entityId: obj.binding.entityId,
        };
      }
      if (obj.properties && Object.keys(obj.properties).length > 0) {
        serialized.properties = obj.properties;
      }
      if (obj.skinId) {
        serialized.skinId = obj.skinId;
      }
      
      return serialized;
    });
    
    // Serialize camera state with plain objects (not THREE.Vector3 instances)
    // Round to 2 decimal places to reduce size
    const camera = {
      mode: this.state.camera.mode,
      isometricAngle: this.state.camera.isometricAngle,
      position: {
        x: Math.round(this.state.camera.position.x * 100) / 100,
        y: Math.round(this.state.camera.position.y * 100) / 100,
        z: Math.round(this.state.camera.position.z * 100) / 100,
      },
      target: {
        x: Math.round(this.state.camera.target.x * 100) / 100,
        y: Math.round(this.state.camera.target.y * 100) / 100,
        z: Math.round(this.state.camera.target.z * 100) / 100,
      },
      zoom: Math.round(this.state.camera.zoom * 100) / 100,
    };

    // Get buildings from building manager and serialize (strip runtime data)
    const buildings = this.buildingManager.getAllBuildings();
    const serializedBuildings: SerializedBuilding[] = buildings.map(b => ({
      id: b.id,
      name: b.name,
      footprints: b.footprints.map(fp => ({
        minX: fp.minX,
        maxX: fp.maxX,
        minZ: fp.minZ,
        maxZ: fp.maxZ,
      })),
      floors: b.floors.map(f => ({ level: f.level, height: f.height })),
    }));
    
    // Get active skin mappings ONLY for objects that have skin overrides
    // Don't iterate all assets - only include skins that are actually in use
    const activeSkins: Record<string, string> = {};
    fullPlacedObjects.forEach(obj => {
      if (obj.skinId) {
        activeSkins[obj.assetId] = obj.skinId;
      }
    });

    // Get the active theme ID from ThemeManager
    const themeManager = getThemeManager();
    const activeThemeId = themeManager.getActiveThemeId();

    return {
      name: '', // Will be set when saving
      version: '2.0.0', // New optimized format
      camera: camera as FacilityData['camera'],
      placedObjects: serializedObjects,
      buildings: serializedBuildings,
      activeFloor: this.state.activeFloor,
      activeSkins,
      activeThemeId,
      gridSize: this.state.snap.gridSize,
      showGrid: this.state.ui.showGrid,
      // Include data source config for facility linking persistence
      dataSource: this.dataSourceConfig || undefined,
    };
  }

  /**
   * Import scene data from a saved facility (handles both new and legacy formats)
   */
  importSceneData(data: FacilityData | LegacyFacilityData): void {
    // Clear current scene
    this.sceneManager.clearObjects();
    this.buildingManager.clear();
    
    // Detect format version
    const isLegacyFormat = data.version === '1.0.0' || 
      (data.placedObjects.length > 0 && 'assetMetadata' in data.placedObjects[0]);
    
    
    // Restore camera state
    if (data.camera) {
      this.state.camera = {
        ...this.state.camera,
        mode: data.camera.mode,
        isometricAngle: data.camera.isometricAngle,
        position: new THREE.Vector3(
          data.camera.position.x,
          data.camera.position.y,
          data.camera.position.z
        ),
        target: new THREE.Vector3(
          data.camera.target.x,
          data.camera.target.y,
          data.camera.target.z
        ),
        zoom: data.camera.zoom,
      };
      // Restore camera mode and angle
      this.cameraController.setMode(data.camera.mode);
      if (data.camera.mode === CameraMode.ISOMETRIC) {
        this.cameraController.setIsometricAngle(data.camera.isometricAngle);
      }
    }
    
    // Restore buildings - use restoreBuilding to properly handle merged buildings
    if (data.buildings && data.buildings.length > 0) {
      data.buildings.forEach(building => {
        // Restore building with all its footprints at once (preserves merged state)
        this.buildingManager.restoreBuilding(
          building.id,
          building.footprints,
          building.floors,
          building.name
        );
        
        // Register all floors with the floor manager
        building.floors.forEach(floor => {
          this.floorManager.registerFloor(floor.level);
        });
      });
      
      // Enter floor mode since we have buildings
      this.state.isFloorMode = true;
    }
    
    // Restore placed objects
    if (data.placedObjects) {
      if (isLegacyFormat) {
        // Legacy format: objects have full assetMetadata
        (data.placedObjects as PlacedObject[]).forEach(obj => {
          this.placeObjectFromSavedData(obj);
        });
      } else {
        // New optimized format: reconstruct from AssetRegistry
        (data.placedObjects as SerializedPlacedObject[]).forEach(serialized => {
          this.placeObjectFromSerializedData(serialized);
        });
      }
    }
    
    // Restore floor state
    if (data.activeFloor !== undefined) {
      this.state.activeFloor = data.activeFloor;
      this.floorManager.setFloor(data.activeFloor);
    }
    
    // Restore skins (legacy format has skins array, new format has activeSkins map)
    if ('skins' in data && data.skins) {
      this.skinManager.loadFacilitySkins(data.skins);
    }
    if ('activeSkins' in data && data.activeSkins) {
      // Restore active skin selections from map (category -> skinId)
      Object.entries(data.activeSkins).forEach(([category, skinId]) => {
        this.skinManager.setActiveSkin(category as AssetCategory, skinId);
      });
    }
    
    // Restore grid settings
    if (data.gridSize) {
      this.state.snap.gridSize = data.gridSize;
    }
    
    // Optimize all ground tile categories after loading
    // This ensures tiles loaded from saved data are optimized
    this.groundTileManager.optimizeAllCategories();
    if (data.showGrid !== undefined) {
      this.state.ui.showGrid = data.showGrid;
      this.gridSystem.setVisible(data.showGrid);
    }
    
    // Restore theme - check if it exists
    if ('activeThemeId' in data && data.activeThemeId) {
      const themeManager = getThemeManager();
      const theme = themeManager.getTheme(data.activeThemeId);
      
      if (theme) {
        // Theme exists, apply it
        themeManager.setActiveTheme(data.activeThemeId);
      } else {
        // Theme doesn't exist - emit event for UI to handle
        console.warn(`[BluDesignEngine] Theme not found: ${data.activeThemeId}, falling back to default`);
        themeManager.setActiveTheme('theme-default');
        this.emit('theme-missing', { 
          missingThemeId: data.activeThemeId,
        });
      }
    }
    
    // Restore data source configuration (for facility linking)
    if ('dataSource' in data && data.dataSource) {
      this.dataSourceConfig = data.dataSource;
    } else {
      this.dataSourceConfig = null;
    }
    
    this.emit('state-updated', this.state);
  }

  /**
   * Place an object from optimized serialized data (reconstructs metadata from registry)
   */
  private placeObjectFromSerializedData(serialized: SerializedPlacedObject): void {
    try {
      // Look up asset metadata from registry
      const assetMetadata = AssetRegistry.getInstance().getAsset(serialized.assetId);
      if (!assetMetadata) {
        console.warn(`Asset not found in registry: ${serialized.assetId}`);
        return;
      }
      
      // Reconstruct full PlacedObject
      const placedObject: PlacedObject = {
        id: serialized.id,
        assetId: serialized.assetId,
        assetMetadata,
        position: serialized.position,
        orientation: serialized.orientation,
        canStack: assetMetadata.canStack,
        floor: serialized.floor ?? 0,
        buildingId: serialized.buildingId,
        name: serialized.name, // Restore user-defined name
        wallAttachment: serialized.wallAttachment,
        binding: serialized.binding ? {
          entityType: serialized.binding.entityType,
          entityId: serialized.binding.entityId,
          currentState: DeviceState.UNKNOWN,
        } : undefined,
        skinId: serialized.skinId, // Restore skin override
        properties: serialized.properties || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      this.placeObjectFromSavedData(placedObject);
    } catch (error) {
      console.error('Failed to place object from serialized data:', serialized.id, error);
    }
  }

  /**
   * Place an object from saved data
   * Handles rotation, floor positioning, wall-attached assets (doors/windows), and skins
   */
  private placeObjectFromSavedData(obj: PlacedObject): void {
    try {
      const mesh = AssetFactory.createAssetMesh(obj.assetMetadata);
      
      const gridSize = this.gridSystem.getGridSize();
      const worldPos = this.gridSystem.gridToWorld(obj.position);
      const floorY = (obj.floor ?? 0) * FLOOR_HEIGHT * gridSize;
      
      // Calculate effective dimensions accounting for rotation
      const isRotated90 = obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
      const effectiveWidth = isRotated90 ? obj.assetMetadata.gridUnits.z : obj.assetMetadata.gridUnits.x;
      const effectiveDepth = isRotated90 ? obj.assetMetadata.gridUnits.x : obj.assetMetadata.gridUnits.z;
      
      // Check if this is a wall-attached asset (door/window)
      const isWallAttached = (obj.assetMetadata.category === 'door' || obj.assetMetadata.category === 'window') 
                             && obj.wallAttachment;
      
      if (isWallAttached && obj.wallAttachment) {
        // Position flush with the wall
        const wallMesh = this.buildingManager.getWallMesh(obj.wallAttachment.wallId);
        if (wallMesh) {
          // Position asset at wall center, flush with wall surface
          const wallPos = wallMesh.position.clone();
          mesh.position.copy(wallPos);
          mesh.position.y = floorY;
          
          // Apply rotation from saved orientation (was determined during placement)
          mesh.rotation.y = this.getRotationFromOrientation(obj.orientation);
          
          // Create wall opening for this door/window (restore from saved data)
          const opening = {
            id: `opening-${obj.id}`,
            type: obj.assetMetadata.category as 'door' | 'window',
            objectId: obj.id,
            position: obj.wallAttachment.position ?? 0.5,
            width: Math.max(obj.assetMetadata.gridUnits.x, obj.assetMetadata.gridUnits.z),
          };
          this.buildingManager.addWallOpening(obj.wallAttachment.wallId, opening);
        } else {
          // Fallback: place at grid position if wall not found
          mesh.position.set(
            worldPos.x + (effectiveWidth * gridSize) / 2,
            floorY,
            worldPos.z + (effectiveDepth * gridSize) / 2
          );
          mesh.rotation.y = this.getRotationFromOrientation(obj.orientation);
        }
      } else {
        // Standard positioning for non-wall-attached assets
        mesh.position.set(
          worldPos.x + (effectiveWidth * gridSize) / 2,
          floorY,
          worldPos.z + (effectiveDepth * gridSize) / 2
        );
        mesh.rotation.y = this.getRotationFromOrientation(obj.orientation);
      }
      
      // Set user data
      mesh.userData.id = obj.id;
      mesh.userData.assetId = obj.assetId;
      mesh.userData.gridPosition = obj.position;
      mesh.userData.isSmart = obj.assetMetadata.isSmart;
      mesh.userData.category = obj.assetMetadata.category;
      mesh.userData.floor = obj.floor ?? 0;
      mesh.userData.selectable = true;
      
      this.sceneManager.addObject(obj.id, mesh, obj);
      
      // Apply skin or theme based on object's saved state
      if (obj.skinId) {
        // Object has a specific skin override - apply that skin from SkinRegistry
        const skinRegistry = getSkinRegistry();
        const skin = skinRegistry.getSkin(obj.skinId);
        if (skin) {
          this.storeDefaultMaterials(mesh);
          this.applySkinToObject(mesh as THREE.Group, skin);
        } else {
          console.warn(`[placeObjectFromSavedData] Skin "${obj.skinId}" not found, falling back to theme`);
          this.applyActiveThemeSkin(mesh as THREE.Group, obj);
        }
      } else {
        // No skin override - apply theme's skin for this category
        this.applyActiveThemeSkin(mesh as THREE.Group, obj);
      }
      
      // Apply correct floor-based opacity
      this.floorManager.applyGhostingToObject(mesh);
    } catch (error) {
      console.error(`Failed to place object ${obj.id}:`, error);
    }
  }


  /**
   * Clear all placed objects and buildings from the scene
   */
  clearScene(): void {
    // Clear all placed objects
    const placedObjects = this.sceneManager.getAllPlacedObjects();
    for (const obj of placedObjects) {
      this.sceneManager.removeObject(obj.id);
      this.gridSystem.clearOccupied(obj.id);
    }

    // Clear all buildings
    this.buildingManager.clear();
    this.state.buildings = [];
    
    // Exit floor mode
    this.state.isFloorMode = false;
    this.state.activeFloor = 0;
    this.floorManager.clear();
    this.selectionManager.setFloorMode(false, 0);
    
    // Reset grid to ground level
    this.gridSystem.setGridY(0);

    // Clear selection
    this.selectionManager.clearSelection();
    this.state.selection = {
      selectedIds: [],
      hoveredId: null,
      isMultiSelect: false,
    };
    
    // Clear action history for fresh start
    this.actionHistory.clear();

    this.emit('state-updated', this.state);
    
    // Clear the auto-save draft since we're starting fresh
    this.clearDraft();
  }

  // ==========================================================================
  // Auto-Save to Local Storage
  // ==========================================================================

  /**
   * Schedule an auto-save to local storage (debounced)
   * Call this after any major state change
   */
  scheduleAutoSave(): void {
    if (this.readonly) return;
    
    // Clear any pending auto-save
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    
    // Schedule new auto-save
    this.autoSaveTimer = setTimeout(() => {
      this.saveToLocalStorage();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /**
   * Immediately save current state to local storage
   */
  saveToLocalStorage(): void {
    if (this.readonly) return;
    
    try {
      const data = this.exportSceneData();
      const draft = {
        timestamp: Date.now(),
        data,
      };
      
      localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(draft));
      this.lastAutoSaveTime = Date.now();
      
      console.log('[AutoSave] Draft saved to local storage');
      this.emit('autosave-complete', { timestamp: this.lastAutoSaveTime });
    } catch (error) {
      console.error('[AutoSave] Failed to save draft:', error);
    }
  }

  /**
   * Load draft from local storage if available
   * Returns true if a draft was loaded
   */
  loadFromLocalStorage(): boolean {
    try {
      const stored = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (!stored) return false;
      
      const draft = JSON.parse(stored);
      if (!draft.data) return false;
      
      console.log(`[AutoSave] Found draft from ${new Date(draft.timestamp).toLocaleString()}`);
      
      this.importSceneData(draft.data);
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
      const stored = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (!stored) return { exists: false };
      
      const draft = JSON.parse(stored);
      return { 
        exists: !!draft.data, 
        timestamp: draft.timestamp 
      };
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
      localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
      console.log('[AutoSave] Draft cleared');
    } catch (error) {
      console.error('[AutoSave] Failed to clear draft:', error);
    }
  }

  /**
   * Get the last auto-save timestamp
   */
  getLastAutoSaveTime(): number {
    return this.lastAutoSaveTime;
  }

  /**
   * Capture a screenshot of the current scene (optimized for thumbnails)
   * Returns a small, compressed JPEG for efficient storage
   * Grid is automatically hidden for cleaner thumbnails
   */
  async captureScreenshot(maxSize: number = 256): Promise<string> {
    // Remember current grid state and hide it for clean thumbnail
    const wasGridVisible = this.state.ui.showGrid;
    if (wasGridVisible) {
      this.gridSystem.setVisible(false);
    }
    
    // Render current frame (without grid)
    this.render();

    // Create an offscreen canvas for resizing
    const originalCanvas = this.renderer.domElement;
    const offscreen = document.createElement('canvas');
    
    // Calculate scaled dimensions maintaining aspect ratio
    const aspect = originalCanvas.width / originalCanvas.height;
    let width: number, height: number;
    
    if (aspect > 1) {
      width = maxSize;
      height = Math.round(maxSize / aspect);
    } else {
      height = maxSize;
      width = Math.round(maxSize * aspect);
    }
    
    offscreen.width = width;
    offscreen.height = height;
    
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      // Restore grid before returning
      if (wasGridVisible) {
        this.gridSystem.setVisible(true);
        this.render();
      }
      // Fallback to smaller PNG if canvas context fails
      return originalCanvas.toDataURL('image/jpeg', 0.7);
    }
    
    // Draw scaled image
    ctx.drawImage(originalCanvas, 0, 0, width, height);
    
    // Restore grid visibility
    if (wasGridVisible) {
      this.gridSystem.setVisible(true);
      this.render();
    }
    
    // Return compressed JPEG (much smaller than PNG)
    return offscreen.toDataURL('image/jpeg', 0.7);
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
    switch (action.type) {
      case 'place': {
        // Undo place = delete the object
        const data = action.data as PlaceActionData;
        this.deleteObjectInternal(data.object.id);
        break;
      }
      case 'delete': {
        // Undo delete = place the object back
        const data = action.data as DeleteActionData;
        this.placeObjectInternal(data.object);
        break;
      }
      case 'move': {
        // Undo move = move back to original position
        const data = action.data as MoveActionData;
        this.moveObjectInternal(data.objectId, data.fromPosition, data.fromOrientation);
        break;
      }
      case 'batch': {
        // Undo batch = undo each action in reverse order
        const batchData = action.data as { actions: HistoryAction[] };
        for (let i = batchData.actions.length - 1; i >= 0; i--) {
          this.applyUndoAction(batchData.actions[i]);
        }
        break;
      }
      case 'building-create': {
        // Undo building create = remove the building
        const data = action.data as BuildingCreateActionData;
        this.removeBuildingInternal(data.building.id);
        break;
      }
      case 'building-delete': {
        // Undo building delete = recreate the building
        const data = action.data as BuildingDeleteActionData;
        this.recreateBuildingInternal(data.building);
        break;
      }
      case 'building-move': {
        // Undo building move = translate in the opposite direction
        const data = action.data as BuildingMoveActionData;
        this.translateBuilding(data.buildingId, -data.deltaX, -data.deltaZ);
        // Update selection highlights if this building is selected
        if (this.state.selection.selectedBuildingId === data.buildingId) {
          this.updateSelectionHighlightsForBuilding();
        }
        break;
      }
      case 'floor-add': {
        // Undo floor add = remove the floor
        const data = action.data as FloorAddActionData;
        this.buildingManager.removeFloor(data.buildingId, data.floor.level);
        this.floorManager.unregisterFloor(data.floor.level);
        this.state.buildings = this.buildingManager.getAllBuildings();
        break;
      }
      case 'floor-delete': {
        // Undo floor delete = recreate the floor and restore objects
        const data = action.data as FloorDeleteActionData;
        this.undoFloorDelete(data);
        break;
      }
      case 'floor-insert': {
        // Undo floor insert = remove inserted floor and shift back down
        const data = action.data as FloorInsertActionData;
        this.undoFloorInsert(data);
        break;
      }
    }
    this.emit('state-updated', this.state);
  }

  /**
   * Apply a redo action (re-apply the action)
   */
  private applyRedoAction(action: HistoryAction): void {
    switch (action.type) {
      case 'place': {
        // Redo place = place the object
        const data = action.data as PlaceActionData;
        this.placeObjectInternal(data.object);
        break;
      }
      case 'delete': {
        // Redo delete = delete the object
        const data = action.data as DeleteActionData;
        this.deleteObjectInternal(data.object.id);
        break;
      }
      case 'move': {
        // Redo move = move to new position
        const data = action.data as MoveActionData;
        this.moveObjectInternal(data.objectId, data.toPosition, data.toOrientation);
        break;
      }
      case 'batch': {
        // Redo batch = redo each action in order
        const batchData = action.data as { actions: HistoryAction[] };
        for (const batchAction of batchData.actions) {
          this.applyRedoAction(batchAction);
        }
        break;
      }
      case 'building-create': {
        // Redo building create = recreate the building
        const data = action.data as BuildingCreateActionData;
        this.recreateBuildingInternal(data.building);
        break;
      }
      case 'building-delete': {
        // Redo building delete = remove the building
        const data = action.data as BuildingDeleteActionData;
        this.removeBuildingInternal(data.building.id);
        break;
      }
      case 'building-move': {
        // Redo building move = translate in the same direction
        const data = action.data as BuildingMoveActionData;
        this.translateBuilding(data.buildingId, data.deltaX, data.deltaZ);
        // Update selection highlights if this building is selected
        if (this.state.selection.selectedBuildingId === data.buildingId) {
          this.updateSelectionHighlightsForBuilding();
        }
        break;
      }
      case 'floor-add': {
        // Redo floor add = add the floor back
        const data = action.data as FloorAddActionData;
        this.buildingManager.addFloor(data.buildingId, data.floor.level);
        this.floorManager.registerFloor(data.floor.level);
        this.state.buildings = this.buildingManager.getAllBuildings();
        // Add vertical shaft objects to the new floor
        const building = this.state.buildings.find(b => b.id === data.buildingId);
        if (building) {
          this.addVerticalShaftObjectsToFloor(data.floor.level, building);
        }
        // Apply current theme to new floor
        const activeTheme = getThemeManager().getActiveSkinTheme();
        this.applyThemeToScene(activeTheme);
        break;
      }
      case 'floor-delete': {
        // Redo floor delete = delete the floor again
        const data = action.data as FloorDeleteActionData;
        this.redoFloorDelete(data);
        break;
      }
      case 'floor-insert': {
        // Redo floor insert = insert the floor again
        const data = action.data as FloorInsertActionData;
        this.redoFloorInsert(data);
        break;
      }
    }
    this.emit('state-updated', this.state);
  }

  /**
   * Place an object without recording in history (for undo/redo)
   */
  private placeObjectInternal(placedObject: PlacedObject): void {
    const asset = placedObject.assetMetadata;
    if (!asset) {
      console.error('Asset metadata not found for:', placedObject.assetId);
      return;
    }
    
    // Check if this is a ground tile category - use instanced rendering
    if (this.groundTileManager.isGroundTileCategory(asset.category)) {
      const marker = this.groundTileManager.addTile(
        placedObject.id,
        asset.category,
        placedObject.position
      );
      
      this.scene.add(marker);
      this.sceneManager.addObject(placedObject.id, marker, placedObject);
      
      this.gridSystem.markOccupied(
        placedObject.id,
        placedObject.position,
        { x: asset.gridUnits.x, z: asset.gridUnits.z },
        asset.canStack,
        asset.category,
        placedObject.floor ?? 0
      );
      return;
    }
    
    // Standard placement for non-ground tiles
    const mesh = AssetFactory.createAssetMesh(asset);
    const worldPos = this.gridSystem.gridToWorld(placedObject.position);
    const gridSize = this.gridSystem.getGridSize();
    
    // Swap grid units for 90° and 270° rotations
    const isRotated90 = placedObject.orientation === Orientation.EAST || 
                        placedObject.orientation === Orientation.WEST;
    const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
    const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
    
    const centerOffsetX = (effectiveGridX * gridSize) / 2;
    const centerOffsetZ = (effectiveGridZ * gridSize) / 2;
    
    mesh.position.set(
      worldPos.x + centerOffsetX,
      (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize, // Floor height offset
      worldPos.z + centerOffsetZ
    );
    mesh.rotation.y = this.getRotationFromOrientation(placedObject.orientation);
    
    // Store floor info in mesh userData
    mesh.userData.floor = placedObject.floor ?? 0;
    mesh.userData.selectable = true;
    
    this.sceneManager.addObject(placedObject.id, mesh, placedObject);
    
    // Apply current theme (unless object has a skin override)
    if (!placedObject.skinId) {
      this.applyActiveThemeSkin(mesh, placedObject);
    }
    
    // Apply correct floor-based opacity
    this.floorManager.applyGhostingToObject(mesh);
    
    this.gridSystem.markOccupied(
      placedObject.id,
      placedObject.position,
      { x: asset.gridUnits.x, z: asset.gridUnits.z },
      asset.canStack,
      asset.category,
      placedObject.floor ?? 0
    );
  }

  /**
   * Delete an object without recording in history (for undo/redo)
   */
  private deleteObjectInternal(objectId: string): void {
    // Check if this object has a wall attachment (door/window)
    // If so, we need to remove the wall opening to restore the wall
    const objectData = this.sceneManager.getObjectData(objectId);
    if (objectData?.wallAttachment) {
      const openingId = `opening-${objectId}`;
      this.buildingManager.removeWallOpening(objectData.wallAttachment.wallId, openingId);
    }
    
    // Remove from ground tile manager if it's a ground tile
    this.groundTileManager.removeTile(objectId);
    
    this.sceneManager.removeObject(objectId);
    this.gridSystem.clearOccupied(objectId);
    
    // Remove from selection if selected
    const selectionIndex = this.state.selection.selectedIds.indexOf(objectId);
    if (selectionIndex >= 0) {
      this.state.selection.selectedIds.splice(selectionIndex, 1);
      this.emit('selection-changed', this.state.selection);
    }
  }
  
  /**
   * Remove ground tiles (grass, pavement, gravel) at specified cells
   * Called when buildings are placed to override any existing ground materials
   */
  private removeGroundTilesAtCells(cells: Array<{x: number, z: number}>): void {
    const groundCategories = [
      AssetCategory.PAVEMENT,
      AssetCategory.GRASS,
      AssetCategory.GRAVEL,
    ];
    
    // Get all placed objects
    const allObjects = this.sceneManager.getAllPlacedObjects();
    const objectsToRemove: string[] = [];
    
    for (const obj of allObjects) {
      // Check if it's a ground-type object
      if (!groundCategories.includes(obj.assetMetadata.category)) continue;
      
      // Only remove ground floor items
      if ((obj.floor ?? 0) !== 0) continue;
      
      // Check if the object overlaps any of the cells
      const objPos = obj.position;
      const objWidth = obj.assetMetadata.gridUnits.x;
      const objDepth = obj.assetMetadata.gridUnits.z;
      
      for (const cell of cells) {
        // Check if this cell is within the object's footprint
        if (cell.x >= objPos.x && cell.x < objPos.x + objWidth &&
            cell.z >= objPos.z && cell.z < objPos.z + objDepth) {
          objectsToRemove.push(obj.id);
          break; // No need to check other cells for this object
        }
      }
    }
    
    // Remove the ground tiles
    for (const objectId of objectsToRemove) {
      this.deleteObjectInternal(objectId);
    }
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
   * Move an object without recording in history (for undo/redo)
   */
  private moveObjectInternal(objectId: string, newPosition: GridPosition, newOrientation: Orientation): void {
    const placedObject = this.sceneManager.getObjectData(objectId);
    const mesh = this.sceneManager.getObject(objectId);
    
    if (!placedObject || !mesh) {
      console.error('Object not found:', objectId);
      return;
    }
    
    const asset = placedObject.assetMetadata;
    if (!asset) return;
    
    // Clear old occupancy
    this.gridSystem.clearOccupied(objectId);
    
    // Update position (accounting for rotation)
    const worldPos = this.gridSystem.gridToWorld(newPosition);
    const gridSize = this.gridSystem.getGridSize();
    
    // Swap grid units for 90° and 270° rotations
    const isRotated90 = newOrientation === Orientation.EAST || 
                        newOrientation === Orientation.WEST;
    const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
    const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
    
    const centerOffsetX = (effectiveGridX * gridSize) / 2;
    const centerOffsetZ = (effectiveGridZ * gridSize) / 2;
    
    mesh.position.set(
      worldPos.x + centerOffsetX,
      (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize, // Floor height offset
      worldPos.z + centerOffsetZ
    );
    mesh.rotation.y = this.getRotationFromOrientation(newOrientation);
    
    // Update data
    placedObject.position = newPosition;
    placedObject.orientation = newOrientation;
    
    // Mark new occupancy on the object's floor
    this.gridSystem.markOccupied(
      objectId,
      newPosition,
      { x: asset.gridUnits.x, z: asset.gridUnits.z },
      asset.canStack,
      asset.category,
      placedObject.floor ?? 0
    );
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
   * Undo a floor delete operation
   */
  private undoFloorDelete(data: FloorDeleteActionData): void {
    // Shift floors back up
    this.buildingManager.shiftFloorLevels(data.buildingId, data.floor.level, 1);
    this.floorManager.shiftFloors(data.floor.level, 1);
    
    // Shift objects back up
    this.floorManager.shiftObjectFloors(data.floor.level, 1);
    
    // Update PlacedObject data for shifted objects
    for (const objData of this.sceneManager.getAllPlacedObjects()) {
      if (objData.floor !== undefined && objData.floor >= data.floor.level) {
        objData.floor += 1;
      }
    }
    
    // Recreate the floor
    this.buildingManager.addFloor(data.buildingId, data.floor.level);
    this.floorManager.registerFloor(data.floor.level);
    
    // Restore deleted objects
    for (const obj of data.deletedObjects) {
      this.placeObjectInternal(obj);
    }
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    
    // Apply current theme to restored floor
    const activeTheme = getThemeManager().getActiveSkinTheme();
    this.applyThemeToScene(activeTheme);
  }

  /**
   * Redo a floor delete operation
   */
  private redoFloorDelete(data: FloorDeleteActionData): void {
    // Delete objects on the floor first
    for (const obj of data.deletedObjects) {
      this.deleteObjectInternal(obj.id);
    }
    
    // Remove the floor
    this.buildingManager.removeFloor(data.buildingId, data.floor.level);
    this.floorManager.unregisterFloor(data.floor.level);
    
    // Shift floors down
    this.buildingManager.shiftFloorLevels(data.buildingId, data.floor.level + 1, -1);
    this.floorManager.shiftFloors(data.floor.level + 1, -1);
    
    // Shift objects down
    this.floorManager.shiftObjectFloors(data.floor.level + 1, -1);
    
    // Update PlacedObject data for shifted objects
    for (const objData of this.sceneManager.getAllPlacedObjects()) {
      if (objData.floor !== undefined && objData.floor > data.floor.level) {
        objData.floor -= 1;
      }
    }
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
  }

  /**
   * Undo a floor insert operation
   */
  private undoFloorInsert(data: FloorInsertActionData): void {
    // Remove the inserted floor
    this.buildingManager.removeFloor(data.buildingId, data.insertLevel);
    this.floorManager.unregisterFloor(data.insertLevel);
    
    // Shift floors back down
    this.buildingManager.shiftFloorLevels(data.buildingId, data.insertLevel + 1, -1);
    this.floorManager.shiftFloors(data.insertLevel + 1, -1);
    
    // Shift objects back to original floors
    for (const shifted of data.shiftedObjects) {
      const mesh = this.sceneManager.getObject(shifted.id);
      const objData = this.sceneManager.getObjectData(shifted.id);
      
      if (mesh && objData) {
        const gridSize = this.gridSystem.getGridSize();
        objData.floor = shifted.oldFloor;
        mesh.userData.floor = shifted.oldFloor;
        mesh.position.y = shifted.oldFloor * FLOOR_HEIGHT * gridSize;
      }
    }
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
  }

  /**
   * Redo a floor insert operation
   */
  private redoFloorInsert(data: FloorInsertActionData): void {
    // Shift floors up
    this.buildingManager.shiftFloorLevels(data.buildingId, data.insertLevel, 1);
    this.floorManager.shiftFloors(data.insertLevel, 1);
    
    // Shift objects to new floors
    for (const shifted of data.shiftedObjects) {
      const mesh = this.sceneManager.getObject(shifted.id);
      const objData = this.sceneManager.getObjectData(shifted.id);
      
      if (mesh && objData) {
        const gridSize = this.gridSystem.getGridSize();
        objData.floor = shifted.newFloor;
        mesh.userData.floor = shifted.newFloor;
        mesh.position.y = shifted.newFloor * FLOOR_HEIGHT * gridSize;
      }
    }
    
    // Add the new floor
    this.buildingManager.addFloor(data.buildingId, data.insertLevel);
    this.floorManager.registerFloor(data.insertLevel);
    
    // Update state
    this.state.buildings = this.buildingManager.getAllBuildings();
    
    // Add vertical shaft objects to the new floor
    const building = this.state.buildings.find(b => b.id === data.buildingId);
    if (building) {
      this.addVerticalShaftObjectsToFloor(data.insertLevel, building);
    }
    
    // Apply current theme to new floor
    const activeTheme = getThemeManager().getActiveSkinTheme();
    this.applyThemeToScene(activeTheme);
    
    // Navigate to the new floor
    this.setFloor(data.insertLevel);
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
    
    // Check if a whole building was selected (via double-click)
    if (this.state.selection.selectedBuildingId) {
      this.deleteBuildingWithContents(this.state.selection.selectedBuildingId);
      
      // Clear selection
      this.updateSelectionHighlights(selectedIds, []);
      this.state.selection.selectedIds = [];
      this.state.selection.selectedBuildingId = undefined;
      this.emit('selection-changed', this.state.selection);
      this.emit('state-updated', this.state);
      
      // Hide gizmo since nothing is selected
      this.updateGizmoVisibility();
      
      // Auto-save draft
      this.scheduleAutoSave();
      return;
    }
    
    // Separate building elements from regular placed objects
    const buildingCellsToRemove: Map<string, Array<{ x: number; z: number }>> = new Map();
    const buildingsToDeleteViaWalls: Set<string> = new Set();
    const regularObjectIds: string[] = [];
    
    for (const id of selectedIds) {
      // Check if it's a wall (from visual selection)
      if (id.startsWith('wall-')) {
        // Wall selected means whole building deletion
        const mesh = this.buildingManager.getWallMesh(id);
        if (mesh?.userData.buildingId) {
          buildingsToDeleteViaWalls.add(mesh.userData.buildingId);
        }
      }
      // Check if it's a building floor tile
      else if (id.startsWith('floor-tile-')) {
        // Parse the tile ID: floor-tile-{buildingId}-{floorLevel}-{x}-{z}
        const parts = id.split('-');
        if (parts.length >= 6) {
          const buildingId = parts.slice(2, -3).join('-'); // Handle UUIDs with dashes
          const x = parseInt(parts[parts.length - 2], 10);
          const z = parseInt(parts[parts.length - 1], 10);
          
          if (!buildingCellsToRemove.has(buildingId)) {
            buildingCellsToRemove.set(buildingId, []);
          }
          buildingCellsToRemove.get(buildingId)!.push({ x, z });
        }
      }
      // Regular placed object
      else {
        const obj = this.sceneManager.getObjectData(id);
        if (obj) {
          regularObjectIds.push(id);
        }
      }
    }
    
    // Delete buildings where walls were selected
    for (const buildingId of buildingsToDeleteViaWalls) {
      this.deleteBuildingWithContents(buildingId);
    }
    
    // Handle partial building deletions (floor tiles selected)
    for (const [buildingId, cells] of buildingCellsToRemove) {
      // Skip if building was already marked for deletion via walls
      if (buildingsToDeleteViaWalls.has(buildingId)) continue;
      
      const building = this.buildingManager.getAllBuildings().find(b => b.id === buildingId);
      if (building) {
        const allCells = this.buildingManager.getBuildingCells(buildingId);
        const selectedCellCount = cells.length;
        
        // If all cells are selected, delete the whole building
        if (selectedCellCount >= allCells.size) {
          this.deleteBuildingWithContents(buildingId);
        } else {
          // Remove only selected cells
          this.buildingManager.removeCellsFromBuilding(buildingId, cells);
          
          // Also delete any placed objects on those cells
          cells.forEach(cell => {
            const objectsAtCell = this.getObjectsAtCell(cell.x, cell.z, this.state.activeFloor);
            objectsAtCell.forEach(objId => {
              if (!regularObjectIds.includes(objId)) {
                regularObjectIds.push(objId);
              }
            });
          });
        }
      }
    }
    
    // Handle regular placed objects
    if (regularObjectIds.length > 0) {
      const deleteActions: HistoryAction[] = [];
      for (const id of regularObjectIds) {
        const obj = this.sceneManager.getObjectData(id);
        if (obj) {
          deleteActions.push({
            type: 'delete',
            data: { object: obj } as DeleteActionData,
            timestamp: Date.now(),
          });
        }
      }
      
      // Record batch in history
      if (deleteActions.length > 1) {
        this.actionHistory.pushBatch(deleteActions);
      } else if (deleteActions.length === 1) {
        this.actionHistory.push(deleteActions[0]);
      }
      
      // Delete all regular objects
      for (const id of regularObjectIds) {
        this.deleteObjectInternal(id);
      }
    }
    
    // Clear selection (unhighlight first)
    this.updateSelectionHighlights(selectedIds, []);
    this.state.selection.selectedIds = [];
    this.emit('selection-changed', this.state.selection);
    this.emit('state-updated', this.state);
    
    // Hide gizmo since nothing is selected
    this.updateGizmoVisibility();
    
    // Auto-save draft
    this.scheduleAutoSave();
  }

  /**
   * Delete a building and all objects placed within it
   */
  deleteBuildingWithContents(buildingId: string): void {
    const building = this.buildingManager.getAllBuildings().find(b => b.id === buildingId);
    if (!building) return;
    
    // Get all cells in the building
    const buildingCells = this.buildingManager.getBuildingCells(buildingId);
    
    // Find and delete all placed objects within the building's cells
    const placedObjects = this.sceneManager.getAllPlacedObjects();
    const objectsToDelete: PlacedObject[] = [];
    
    for (const obj of placedObjects) {
      const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
      if (buildingCells.has(objCellKey) || obj.buildingId === buildingId) {
        objectsToDelete.push(obj);
      }
    }
    
    // Delete placed objects
    for (const obj of objectsToDelete) {
      this.deleteObjectInternal(obj.id);
    }
    
    // Delete the building itself
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
    
    this.emit('state-updated', this.state);
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
    const result: string[] = [];
    const placedObjects = this.sceneManager.getAllPlacedObjects();
    
    for (const obj of placedObjects) {
      if (obj.floor === floor) {
        const objX = Math.floor(obj.position.x);
        const objZ = Math.floor(obj.position.z);
        if (objX === x && objZ === z) {
          result.push(obj.id);
        }
      }
    }
    
    return result;
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
    
    const objects: PlacedObject[] = [];
    const buildings: Building[] = [];
    
    // Check if a building is selected
    if (this.state.selection.selectedBuildingId) {
      const building = this.buildingManager.getBuilding(this.state.selection.selectedBuildingId);
      if (building) {
        buildings.push(building);
        
        // Also copy objects inside the building
        const buildingCells = this.buildingManager.getBuildingCells(building.id);
        const placedObjects = this.sceneManager.getAllPlacedObjects();
        
        for (const obj of placedObjects) {
          const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
          if (buildingCells.has(objCellKey) || obj.buildingId === building.id) {
            objects.push(obj);
          }
        }
      }
    } else {
      // Copy regular selected objects
      for (const id of selectedIds) {
        const obj = this.sceneManager.getObjectData(id);
        if (obj) {
          objects.push(obj);
        }
      }
    }
    
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
  paste(_targetPosition?: GridPosition): void {
    if (!this.clipboardManager.hasContent()) return;
    
    // Get objects from clipboard
    const objects = this.clipboardManager.getObjects();
    if (objects.length === 0) return;
    
    // Start paste preview mode
    this.placementManager.startPastePreview(objects);
    this.setTool(EditorTool.PLACE);
    
    // TODO: Handle building paste
    // const buildings = this.clipboardManager.getBuildings();
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
    const allIds: string[] = [];
    // Get all selectable objects including building walls and floor tiles
    this.sceneManager.getAllSelectableObjectsMap().forEach((_mesh: THREE.Object3D, id: string) => {
      allIds.push(id);
    });
    
    const oldSelection = [...this.state.selection.selectedIds];
    this.updateSelectionHighlights(oldSelection, allIds);
    this.state.selection.selectedIds = allIds;
    this.emit('selection-changed', this.state.selection);
    this.emit('state-updated', this.state);
  }

  // ==========================================================================
  // Translate Gizmo
  // ==========================================================================

  /**
   * Update gizmo visibility based on current selection
   * In readonly mode, gizmo is never shown
   */
  private updateGizmoVisibility(): void {
    // Never show gizmo in readonly mode
    if (this.readonly) {
      this.translateGizmo.hide();
      return;
    }
    
    const selectedIds = this.state.selection.selectedIds;
    
    if (selectedIds.length === 0) {
      this.translateGizmo.hide();
      return;
    }
    
    // Calculate selection center
    const center = this.getSelectionCenter();
    if (center) {
      const floorY = this.floorManager.getCurrentFloorY();
      this.translateGizmo.show(center, floorY);
    } else {
      this.translateGizmo.hide();
    }
  }

  /**
   * Update gizmo position to match selection
   */
  private updateGizmoPosition(): void {
    if (this.state.selection.selectedIds.length === 0) {
      this.translateGizmo.hide();
      return;
    }
    
    const center = this.getSelectionCenter();
    if (center) {
      const floorY = this.floorManager.getCurrentFloorY();
      this.translateGizmo.setPosition(center, floorY);
    }
  }

  /**
   * Get the center position of the current selection (in grid coordinates)
   */
  private getSelectionCenter(): { x: number; z: number } | null {
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return null;
    
    // If building is selected, use building center
    if (this.state.selection.selectedBuildingId) {
      const building = this.buildingManager.getAllBuildings().find(b => b.id === this.state.selection.selectedBuildingId);
      if (building) {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        building.footprints.forEach(fp => {
          minX = Math.min(minX, fp.minX);
          maxX = Math.max(maxX, fp.maxX);
          minZ = Math.min(minZ, fp.minZ);
          maxZ = Math.max(maxZ, fp.maxZ);
        });
        
        return {
          x: Math.floor((minX + maxX) / 2),
          z: Math.floor((minZ + maxZ) / 2),
        };
      }
    }
    
    // Calculate center from selected objects
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const id of selectedIds) {
      // Check if it's a floor tile
      if (id.startsWith('floor-tile-')) {
        const mesh = this.scene.getObjectByProperty('userData', { id }) as THREE.Mesh;
        if (mesh?.userData.gridX !== undefined && mesh?.userData.gridZ !== undefined) {
          const x = mesh.userData.gridX;
          const z = mesh.userData.gridZ;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
      } else {
        // Regular placed object
        const obj = this.sceneManager.getObjectData(id);
        if (obj) {
          const asset = obj.assetMetadata;
          const width = asset?.gridUnits?.x ?? 1;
          const depth = asset?.gridUnits?.z ?? 1;
          
          minX = Math.min(minX, obj.position.x);
          maxX = Math.max(maxX, obj.position.x + width);
          minZ = Math.min(minZ, obj.position.z);
          maxZ = Math.max(maxZ, obj.position.z + depth);
        }
      }
    }
    
    if (minX === Infinity) return null;
    
    return {
      x: Math.floor((minX + maxX) / 2),
      z: Math.floor((minZ + maxZ) / 2),
    };
  }

  /**
   * Handle gizmo drag to move selection
   * Uses smooth visual feedback - moves meshes immediately, commits on drag end
   */
  private handleGizmoDrag(deltaX: number, deltaZ: number, _axis: GizmoAxis): void {
    if (deltaX === 0 && deltaZ === 0) return;
    
    // Accumulate and update visual positions
    this.updatePendingMove(deltaX, deltaZ);
  }

  /**
   * Initialize or update pending move state
   * For regular objects: updates visual positions immediately
   * For buildings: shows a low-cost preview instead of actually moving
   * For windows: constrains movement along their attached wall
   */
  private updatePendingMove(deltaX: number, deltaZ: number): void {
    const selectedIds = this.state.selection.selectedIds;
    const buildingId = this.state.selection.selectedBuildingId;
    
    // Initialize pending move if not started
    if (!this.pendingMove) {
      this.pendingMove = {
        originalPositions: new Map(),
        accumulatedDelta: { x: 0, z: 0 },
        commitTimer: null,
        isBuildingMove: !!buildingId,
        buildingId: buildingId ?? null,
        windowDragData: new Map(),
      };
      
      // Store original positions
      if (buildingId) {
        // For building, store the original footprints for preview
        const building = this.buildingManager.getAllBuildings().find(b => b.id === buildingId);
        if (building) {
          this.pendingMove.buildingOriginalFootprints = building.footprints.map(fp => ({
            minX: fp.minX,
            maxX: fp.maxX,
            minZ: fp.minZ,
            maxZ: fp.maxZ,
          }));
        }
      } else {
        for (const id of selectedIds) {
          if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;
          const obj = this.sceneManager.getObjectData(id);
          if (obj) {
            this.pendingMove.originalPositions.set(id, {
              position: { ...obj.position },
              orientation: obj.orientation,
            });
            
            // Check if this is a window with wall attachment - set up wall-constrained dragging
            if (obj.assetMetadata.category === AssetCategory.WINDOW && obj.wallAttachment) {
              const wallId = obj.wallAttachment.wallId;
              const wall = this.buildingManager.getWall(wallId);
              if (wall && wall.startPos && wall.endPos) {
                const startWorld = this.gridSystem.gridToWorld({ x: wall.startPos.x, z: wall.startPos.z, y: 0 });
                const endWorld = this.gridSystem.gridToWorld({ x: wall.endPos.x, z: wall.endPos.z, y: 0 });
                const direction = new THREE.Vector3().subVectors(endWorld, startWorld).normalize();
                const length = startWorld.distanceTo(endWorld);
                
                this.pendingMove.windowDragData?.set(id, {
                  wallId: wallId,
                  originalWallPosition: obj.wallAttachment.position ?? 0.5,
                  currentWallPosition: obj.wallAttachment.position ?? 0.5,
                  wallStart: startWorld,
                  wallEnd: endWorld,
                  wallDirection: direction,
                  wallLength: length,
                });
              }
            }
          }
        }
      }
    }
    
    // Accumulate delta
    this.pendingMove.accumulatedDelta.x += deltaX;
    this.pendingMove.accumulatedDelta.z += deltaZ;
    
    // Update visual feedback
    if (this.pendingMove.isBuildingMove && this.pendingMove.buildingId) {
      // For buildings, show a low-cost preview instead of actual movement
      // This avoids expensive wall/floor/roof regeneration during drag
      this.showBuildingMovePreview(
        this.pendingMove.buildingOriginalFootprints ?? [],
        this.pendingMove.accumulatedDelta.x,
        this.pendingMove.accumulatedDelta.z
      );
      // Update gizmo position to follow the preview
      this.updateGizmoPositionForPreview(
        this.pendingMove.accumulatedDelta.x,
        this.pendingMove.accumulatedDelta.z
      );
    } else {
      // For regular objects, move meshes visually (low cost)
      // Windows are special-cased inside updateVisualPositions for wall-constrained movement
      this.updateVisualPositions(deltaX, deltaZ);
      this.updateGizmoPosition();
    }
    
    // Reset commit timer (for non-building moves)
    if (this.pendingMove.commitTimer) {
      clearTimeout(this.pendingMove.commitTimer);
    }
    
    // Don't use auto-commit for building moves - wait for explicit drag end
    if (!this.pendingMove.isBuildingMove) {
      this.pendingMove.commitTimer = setTimeout(() => {
        this.commitPendingMove();
      }, this.MOVE_COMMIT_DELAY);
    }
  }

  /**
   * Show building move preview - a low-cost grid of colored cells showing destination
   * Includes filled tiles and an outline for better visibility
   */
  private showBuildingMovePreview(
    originalFootprints: { minX: number; maxX: number; minZ: number; maxZ: number }[],
    deltaX: number,
    deltaZ: number
  ): void {
    // Calculate all cells that will be occupied
    const cells: { x: number; z: number }[] = [];
    for (const fp of originalFootprints) {
      for (let x = fp.minX + deltaX; x <= fp.maxX + deltaX; x++) {
        for (let z = fp.minZ + deltaZ; z <= fp.maxZ + deltaZ; z++) {
          cells.push({ x, z });
        }
      }
    }
    
    if (cells.length === 0) {
      this.hideBuildingMovePreview();
      return;
    }
    
    // Create or update instanced mesh
    const gridSize = this.gridSystem.getGridSize();
    const tileHeight = 0.08;
    
    // Dispose old preview if exists and wrong size
    if (this.buildingMovePreview && this.buildingMovePreview.count !== cells.length) {
      this.scene.remove(this.buildingMovePreview);
      this.buildingMovePreview.geometry.dispose();
      (this.buildingMovePreview.material as THREE.Material).dispose();
      this.buildingMovePreview = null;
    }
    
    // Create new preview mesh if needed
    if (!this.buildingMovePreview) {
      const geometry = new THREE.BoxGeometry(gridSize * 0.95, tileHeight, gridSize * 0.95);
      const material = new THREE.MeshStandardMaterial({
        color: this.BUILDING_PREVIEW_COLOR,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        emissive: this.BUILDING_PREVIEW_COLOR,
        emissiveIntensity: 0.3,
      });
      this.buildingMovePreview = new THREE.InstancedMesh(geometry, material, cells.length);
      this.buildingMovePreview.userData.isPreview = true;
      this.buildingMovePreview.userData.selectable = false;
      this.buildingMovePreview.renderOrder = 100;
      this.scene.add(this.buildingMovePreview);
    }
    
    // Update instance positions
    const matrix = new THREE.Matrix4();
    const floorY = this.floorManager.getFloorY(this.state.activeFloor);
    
    for (let i = 0; i < cells.length; i++) {
      const worldPos = this.gridSystem.gridToWorld({ x: cells[i].x, z: cells[i].z, y: 0 });
      matrix.setPosition(
        worldPos.x + gridSize / 2,
        floorY + tileHeight / 2 + 0.01,
        worldPos.z + gridSize / 2
      );
      this.buildingMovePreview.setMatrixAt(i, matrix);
    }
    this.buildingMovePreview.instanceMatrix.needsUpdate = true;
    this.buildingMovePreview.visible = true;
    
    // Create or update outline showing building bounds
    this.updateBuildingMovePreviewOutline(originalFootprints, deltaX, deltaZ, floorY);
  }
  
  /**
   * Update the outline around the building move preview
   */
  private updateBuildingMovePreviewOutline(
    originalFootprints: { minX: number; maxX: number; minZ: number; maxZ: number }[],
    deltaX: number,
    deltaZ: number,
    floorY: number
  ): void {
    // Dispose old outline
    if (this.buildingMovePreviewOutline) {
      this.scene.remove(this.buildingMovePreviewOutline);
      this.buildingMovePreviewOutline.geometry.dispose();
      (this.buildingMovePreviewOutline.material as THREE.Material).dispose();
      this.buildingMovePreviewOutline = null;
    }
    
    const outlineHeight = 0.15;
    
    // Calculate overall bounding box of all footprints with delta applied
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const fp of originalFootprints) {
      minX = Math.min(minX, fp.minX + deltaX);
      maxX = Math.max(maxX, fp.maxX + deltaX);
      minZ = Math.min(minZ, fp.minZ + deltaZ);
      maxZ = Math.max(maxZ, fp.maxZ + deltaZ);
    }
    
    // Convert to world coordinates
    const worldMin = this.gridSystem.gridToWorld({ x: minX, z: minZ, y: 0 });
    const worldMax = this.gridSystem.gridToWorld({ x: maxX + 1, z: maxZ + 1, y: 0 });
    
    // Create outline vertices (rectangular perimeter)
    const y = floorY + outlineHeight;
    const vertices = new Float32Array([
      // Bottom rectangle
      worldMin.x, y, worldMin.z,
      worldMax.x, y, worldMin.z,
      
      worldMax.x, y, worldMin.z,
      worldMax.x, y, worldMax.z,
      
      worldMax.x, y, worldMax.z,
      worldMin.x, y, worldMax.z,
      
      worldMin.x, y, worldMax.z,
      worldMin.x, y, worldMin.z,
    ]);
    
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: this.BUILDING_PREVIEW_OUTLINE_COLOR,
      linewidth: 2, // Note: linewidth > 1 only works with certain renderers
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });
    
    this.buildingMovePreviewOutline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    this.buildingMovePreviewOutline.userData.isPreview = true;
    this.buildingMovePreviewOutline.userData.selectable = false;
    this.buildingMovePreviewOutline.renderOrder = 101;
    this.scene.add(this.buildingMovePreviewOutline);
  }

  /**
   * Hide the building move preview (tiles and outline)
   */
  private hideBuildingMovePreview(): void {
    if (this.buildingMovePreview) {
      this.buildingMovePreview.visible = false;
    }
    if (this.buildingMovePreviewOutline) {
      this.buildingMovePreviewOutline.visible = false;
    }
  }

  /**
   * Dispose the building move preview mesh and outline
   */
  private disposeBuildingMovePreview(): void {
    if (this.buildingMovePreview) {
      this.scene.remove(this.buildingMovePreview);
      this.buildingMovePreview.geometry.dispose();
      (this.buildingMovePreview.material as THREE.Material).dispose();
      this.buildingMovePreview = null;
    }
    if (this.buildingMovePreviewOutline) {
      this.scene.remove(this.buildingMovePreviewOutline);
      this.buildingMovePreviewOutline.geometry.dispose();
      (this.buildingMovePreviewOutline.material as THREE.Material).dispose();
      this.buildingMovePreviewOutline = null;
    }
  }

  /**
   * Update gizmo position for building preview (based on accumulated delta)
   */
  private updateGizmoPositionForPreview(deltaX: number, deltaZ: number): void {
    const buildingId = this.state.selection.selectedBuildingId;
    if (!buildingId) return;
    
    const building = this.buildingManager.getAllBuildings().find(b => b.id === buildingId);
    if (!building || building.footprints.length === 0) return;
    
    // Get original center from stored footprints
    const originalFootprints = this.pendingMove?.buildingOriginalFootprints;
    if (!originalFootprints || originalFootprints.length === 0) return;
    
    // Calculate center of original footprints + delta
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const fp of originalFootprints) {
      minX = Math.min(minX, fp.minX);
      maxX = Math.max(maxX, fp.maxX);
      minZ = Math.min(minZ, fp.minZ);
      maxZ = Math.max(maxZ, fp.maxZ);
    }
    
    const centerX = Math.floor((minX + maxX) / 2) + deltaX;
    const centerZ = Math.floor((minZ + maxZ) / 2) + deltaZ;
    const floorY = this.floorManager.getFloorY(this.state.activeFloor);
    
    this.translateGizmo.setPosition({ x: centerX, z: centerZ }, floorY);
  }

  /**
   * Update visual positions of selected objects without committing
   * Windows are constrained to their attached wall
   */
  private updateVisualPositions(deltaX: number, deltaZ: number): void {
    const selectedIds = this.state.selection.selectedIds;
    const gridSize = this.gridSystem.getGridSize();
    
    for (const id of selectedIds) {
      if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;
      
      const mesh = this.sceneManager.getObject(id);
      if (!mesh) continue;
      
      // Check if this is a window with wall-constrained dragging
      const windowDragData = this.pendingMove?.windowDragData?.get(id);
      if (windowDragData) {
        // Window: constrain movement along the wall
        const worldDeltaX = deltaX * gridSize;
        const worldDeltaZ = deltaZ * gridSize;
        
        // Project the world delta onto the wall direction
        const projectedDelta = windowDragData.wallDirection.x * worldDeltaX + 
                               windowDragData.wallDirection.z * worldDeltaZ;
        
        // Calculate new position along wall (0-1)
        const currentWorldPos = mesh.position.clone();
        const distFromStart = currentWorldPos.clone().sub(windowDragData.wallStart).dot(windowDragData.wallDirection);
        const newDist = distFromStart + projectedDelta;
        
        // Clamp to wall bounds with margin
        const margin = gridSize * 0.5; // Half grid cell margin
        const clampedDist = Math.max(margin, Math.min(windowDragData.wallLength - margin, newDist));
        const newWallPosition = clampedDist / windowDragData.wallLength;
        
        // Update tracked position
        windowDragData.currentWallPosition = newWallPosition;
        
        // Calculate new world position
        const newX = windowDragData.wallStart.x + windowDragData.wallDirection.x * clampedDist;
        const newZ = windowDragData.wallStart.z + windowDragData.wallDirection.z * clampedDist;
        
        mesh.position.x = newX;
        mesh.position.z = newZ;
        // Y position stays the same (floor height)
      } else {
        // Regular object: free movement
        mesh.position.x += deltaX * gridSize;
        mesh.position.z += deltaZ * gridSize;
      }
    }
    
    // Update selection highlights to follow objects
    this.selectionHighlightManager.updatePositions(selectedIds, (id) => {
      const mesh = this.sceneManager.getObject(id);
      return mesh ?? null;
    });
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
   * Commit the pending move - validate and finalize positions
   */
  private commitPendingMove(): void {
    if (!this.pendingMove) return;
    
    const { originalPositions, accumulatedDelta, isBuildingMove, buildingId } = this.pendingMove;
    
    // Clear timer
    if (this.pendingMove.commitTimer) {
      clearTimeout(this.pendingMove.commitTimer);
    }
    
    // Hide building preview (always)
    this.hideBuildingMovePreview();
    
    if (isBuildingMove && buildingId) {
      // Now actually translate the building (was only preview during drag)
      if (accumulatedDelta.x !== 0 || accumulatedDelta.z !== 0) {
        // Record to history for undo/redo
        this.actionHistory.pushBuildingMove(buildingId, accumulatedDelta.x, accumulatedDelta.z);
        
        this.translateBuilding(buildingId, accumulatedDelta.x, accumulatedDelta.z);
        this.updateSelectionHighlightsForBuilding();
      }
      this.pendingMove = null;
      this.scheduleAutoSave();
      return;
    }
    
    // For regular objects, validate the final position
    const objectsToMove: PlacedObject[] = [];
    for (const [id] of originalPositions) {
      const obj = this.sceneManager.getObjectData(id);
      if (obj) {
        objectsToMove.push(obj);
      }
    }
    
    if (objectsToMove.length === 0) {
      this.pendingMove = null;
      return;
    }
    
    // Calculate final positions from original + accumulated delta
    const newPositions = objectsToMove.map(obj => {
      const original = originalPositions.get(obj.id);
      return {
        id: obj.id,
        obj,
        newPosition: {
          x: (original?.position.x ?? obj.position.x) + accumulatedDelta.x,
          z: (original?.position.z ?? obj.position.z) + accumulatedDelta.z,
          y: original?.position.y ?? obj.position.y,
        } as GridPosition,
      };
    });
    
    // Validate all new positions
    const movingIds = new Set(objectsToMove.map(o => o.id));
    const allValid = newPositions.every(({ obj, newPosition }) => 
      this.validateMovePosition(obj, newPosition, movingIds)
    );
    
    if (allValid) {
      // Record moves to history for undo/redo support
      const moveActions: HistoryAction[] = [];
      
      // Commit the move - update internal positions
      for (const { id, newPosition } of newPositions) {
        const obj = this.sceneManager.getObjectData(id);
        if (obj) {
          // Update grid occupancy and internal state
          const asset = obj.assetMetadata;
          if (!asset) continue;
          
          // Check if this is a window with wall-constrained position
          const windowDragData = this.pendingMove?.windowDragData?.get(id);
          if (windowDragData && obj.wallAttachment) {
            // For windows: update wall attachment position instead of grid position
            obj.wallAttachment.position = windowDragData.currentWallPosition;
            // Don't update grid position for wall-attached windows
            continue;
          }
          
          // Get original position for history
          const original = originalPositions.get(id);
          const fromPosition = original?.position ?? obj.position;
          const fromOrientation = original?.orientation ?? obj.orientation;
          
          // Record this move action
          moveActions.push({
            type: 'move',
            data: {
              objectId: id,
              fromPosition: { ...fromPosition },
              toPosition: { ...newPosition },
              fromOrientation,
              toOrientation: obj.orientation, // Orientation doesn't change during translation
            } as MoveActionData,
            timestamp: Date.now(),
          });
          
          // Clear old occupancy
          this.gridSystem.clearOccupied(id);
          
          // Update data
          obj.position = newPosition;
          
          // Mark new occupancy
          const isRotated90 = obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
          const size = {
            x: isRotated90 ? asset.gridUnits.z : asset.gridUnits.x,
            z: isRotated90 ? asset.gridUnits.x : asset.gridUnits.z,
          };
          this.gridSystem.markOccupied(id, newPosition, size, asset.canStack ?? false, asset.category, obj.floor ?? 0);
        }
      }
      
      // Push to history - batch if multiple objects, single if one
      if (moveActions.length === 1) {
        const data = moveActions[0].data as MoveActionData;
        this.actionHistory.pushMove(
          data.objectId,
          data.fromPosition,
          data.toPosition,
          data.fromOrientation,
          data.toOrientation
        );
      } else if (moveActions.length > 1) {
        this.actionHistory.pushBatch(moveActions);
      }
      
      this.scheduleAutoSave();
    } else {
      // Invalid move - revert to original positions
      this.revertPendingMove();
    }
    
    this.pendingMove = null;
  }

  /**
   * Revert a pending move to original positions
   */
  private revertPendingMove(): void {
    if (!this.pendingMove) return;
    
    const { originalPositions, windowDragData } = this.pendingMove;
    const gridSize = this.gridSystem.getGridSize();
    
    for (const [id, original] of originalPositions) {
      const obj = this.sceneManager.getObjectData(id);
      const mesh = this.sceneManager.getObject(id);
      
      if (obj && mesh && obj.assetMetadata) {
        const asset = obj.assetMetadata;
        
        // Check if this is a window - revert to original wall position
        const windowData = windowDragData?.get(id);
        if (windowData && obj.wallAttachment) {
          // Revert wall position
          const originalWallPos = windowData.originalWallPosition;
          const x = windowData.wallStart.x + windowData.wallDirection.x * (originalWallPos * windowData.wallLength);
          const z = windowData.wallStart.z + windowData.wallDirection.z * (originalWallPos * windowData.wallLength);
          mesh.position.x = x;
          mesh.position.z = z;
          continue;
        }
        
        // Revert mesh position for regular objects
        const worldPos = this.gridSystem.gridToWorld(original.position);
        const isRotated90 = original.orientation === Orientation.EAST || original.orientation === Orientation.WEST;
        const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
        const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
        
        const centerOffsetX = (effectiveGridX * gridSize) / 2;
        const centerOffsetZ = (effectiveGridZ * gridSize) / 2;
        
        mesh.position.set(
          worldPos.x + centerOffsetX,
          (obj.floor ?? 0) * FLOOR_HEIGHT * gridSize,
          worldPos.z + centerOffsetZ
        );
      }
    }
    
    // Update gizmo and selection highlights
    this.updateGizmoPosition();
    const selectedIds = Array.from(originalPositions.keys());
    this.selectionHighlightManager.updatePositions(selectedIds, (id) => {
      return this.sceneManager.getObject(id) ?? null;
    });
  }

  /**
   * Force commit any pending move (e.g., on gizmo drag end)
   */
  commitPendingMoveNow(): void {
    if (this.pendingMove) {
      if (this.pendingMove.commitTimer) {
        clearTimeout(this.pendingMove.commitTimer);
      }
      this.commitPendingMove();
    }
  }

  /**
   * Validate if an object can be moved to a new position
   * Checks: grid occupancy, wall crossing, floor rules (must be in building if not on ground floor)
   * @param obj - The object being moved
   * @param newPosition - The target position
   * @param excludeIds - IDs to exclude from collision checks (the objects being moved)
   */
  private validateMovePosition(obj: PlacedObject, newPosition: GridPosition, excludeIds: Set<string>): boolean {
    if (!obj.assetMetadata) return false;
    
    const category = obj.assetMetadata.category;
    const floor = obj.floor ?? 0;
    
    // Account for rotation when calculating size
    const isRotated90 = obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
    const size = {
      x: isRotated90 ? obj.assetMetadata.gridUnits.z : obj.assetMetadata.gridUnits.x,
      z: isRotated90 ? obj.assetMetadata.gridUnits.x : obj.assetMetadata.gridUnits.z,
    };
    
    // Check if object can stack (walls, fences)
    const canStack = category === AssetCategory.WALL || category === AssetCategory.FENCE;
    
    // Check grid occupancy (excluding the objects being moved)
    if (this.gridSystem.isOccupiedExcluding(newPosition, size, canStack, category, floor, excludeIds)) {
      return false;
    }
    
    // Ground materials cannot be placed on building floors
    const isGroundMaterial = 
      category === AssetCategory.PAVEMENT ||
      category === AssetCategory.GRASS ||
      category === AssetCategory.GRAVEL;
    
    if (isGroundMaterial) {
      for (let dx = 0; dx < size.x; dx++) {
        for (let dz = 0; dz < size.z; dz++) {
          if (this.buildingManager.getBuildingAtCell(newPosition.x + dx, newPosition.z + dz)) {
            return false;
          }
        }
      }
    }
    
    // Skip wall crossing check for ground tiles and walls/fences
    const skipWallCrossing = 
      category === AssetCategory.FLOOR ||
      category === AssetCategory.PAVEMENT ||
      category === AssetCategory.GRASS ||
      category === AssetCategory.GRAVEL ||
      category === AssetCategory.WALL ||
      category === AssetCategory.FENCE;
    
    // Check wall crossing
    if (!skipWallCrossing && this.checkWallCrossingForMove(newPosition, size, floor)) {
      return false;
    }
    
    // NEW RULE: Non-ground floor objects must be inside a building
    // Exceptions: windows, building, stairwell
    if (floor !== 0) {
      const isException = 
        category === AssetCategory.WINDOW ||
        category === AssetCategory.BUILDING ||
        category === AssetCategory.STAIRWELL;
      
      if (!isException) {
        // Check if ALL cells of this object are inside a building
        for (let dx = 0; dx < size.x; dx++) {
          for (let dz = 0; dz < size.z; dz++) {
            const cellX = newPosition.x + dx;
            const cellZ = newPosition.z + dz;
            if (!this.buildingManager.getBuildingAtCell(cellX, cellZ)) {
              return false; // At least one cell is outside a building
            }
          }
        }
      }
    }
    
    return true;
  }

  /**
   * Check if a move would cross a building wall
   */
  private checkWallCrossingForMove(gridPos: GridPosition, size: { x: number; z: number }, floor: number): boolean {
    // Get all wall meshes on this floor
    const wallMeshes: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.userData.isBuildingWall && 
          (child.userData.floor === floor || child.userData.floor === undefined)) {
        wallMeshes.push(child);
      }
    });
    
    if (wallMeshes.length === 0) return false;
    
    const gridSize = this.gridSystem.getGridSize();
    
    // Check each edge of the object's bounding box for wall intersections
    const objectMinX = gridPos.x * gridSize;
    const objectMaxX = (gridPos.x + size.x) * gridSize;
    const objectMinZ = gridPos.z * gridSize;
    const objectMaxZ = (gridPos.z + size.z) * gridSize;
    
    for (const wall of wallMeshes) {
      if (!(wall instanceof THREE.Mesh)) continue;
      
      const wallPos = wall.position;
      const wallOrientation = wall.userData.wallOrientation;
      
      // Wall thickness
      const wallThickness = 0.15 * gridSize;
      
      if (wallOrientation === 'north-south') {
        // Wall runs along Z axis
        const wallX = wallPos.x;
        const wallMinZ = wallPos.z - gridSize / 2;
        const wallMaxZ = wallPos.z + gridSize / 2;
        
        // Check if object crosses this wall
        if (objectMinX < wallX + wallThickness / 2 && 
            objectMaxX > wallX - wallThickness / 2) {
          // X range overlaps with wall - check Z
          if (objectMinZ < wallMaxZ && objectMaxZ > wallMinZ) {
            // Object would cross this wall
            // But only if the wall is actually in the middle of the object (not at edge)
            const wallRelativeX = wallX - objectMinX;
            if (wallRelativeX > wallThickness && wallRelativeX < (objectMaxX - objectMinX) - wallThickness) {
              return true;
            }
          }
        }
      } else if (wallOrientation === 'east-west') {
        // Wall runs along X axis
        const wallZ = wallPos.z;
        const wallMinX = wallPos.x - gridSize / 2;
        const wallMaxX = wallPos.x + gridSize / 2;
        
        // Check if object crosses this wall
        if (objectMinZ < wallZ + wallThickness / 2 && 
            objectMaxZ > wallZ - wallThickness / 2) {
          // Z range overlaps with wall - check X
          if (objectMinX < wallMaxX && objectMaxX > wallMinX) {
            // Object would cross this wall
            const wallRelativeZ = wallZ - objectMinZ;
            if (wallRelativeZ > wallThickness && wallRelativeZ < (objectMaxZ - objectMinZ) - wallThickness) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Translate a building and all its contents
   */
  private translateBuilding(buildingId: string, deltaX: number, deltaZ: number): void {
    // Get all cells currently in the building
    const oldCells = this.buildingManager.getBuildingCells(buildingId);
    
    // Find all placed objects inside the building
    const objectsToMove: PlacedObject[] = [];
    const placedObjects = this.sceneManager.getAllPlacedObjects();
    
    for (const obj of placedObjects) {
      const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
      if (oldCells.has(objCellKey) || obj.buildingId === buildingId) {
        objectsToMove.push(obj);
      }
    }
    
    // Translate the building
    this.buildingManager.translateBuilding(buildingId, deltaX, deltaZ);
    
    // Move all objects that were inside
    for (const obj of objectsToMove) {
      const newPosition: GridPosition = {
        x: obj.position.x + deltaX,
        z: obj.position.z + deltaZ,
        y: obj.position.y,
      };
      
      this.moveObjectInternal(obj.id, newPosition, obj.orientation);
    }
    
    // Update state
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
    
    // Calculate delta based on direction (in grid units)
    let deltaX = 0;
    let deltaZ = 0;
    switch (direction) {
      case 'up': deltaZ = -1; break;    // -Z is forward/up in isometric view
      case 'down': deltaZ = 1; break;   // +Z is back/down
      case 'left': deltaX = -1; break;  // -X is left
      case 'right': deltaX = 1; break;  // +X is right
    }
    
    // Use smooth movement with debounced commit
    this.updatePendingMove(deltaX, deltaZ);
  }
  
  /**
   * Rotate selected objects by 90 degrees
   * @param direction - 'cw' (clockwise) or 'ccw' (counter-clockwise)
   */
  rotateSelection(direction: 'cw' | 'ccw'): void {
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return;
    
    const rotationOrder: Orientation[] = [
      Orientation.NORTH,
      Orientation.EAST,
      Orientation.SOUTH,
      Orientation.WEST,
    ];
    
    for (const id of selectedIds) {
      // Skip building elements
      if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;
      
      const obj = this.sceneManager.getObjectData(id);
      if (obj) {
        const currentIndex = rotationOrder.indexOf(obj.orientation);
        let newIndex: number;
        
        if (direction === 'cw') {
          newIndex = (currentIndex + 1) % 4;
        } else {
          newIndex = (currentIndex - 1 + 4) % 4;
        }
        
        const newOrientation = rotationOrder[newIndex];
        this.moveObjectInternal(id, obj.position, newOrientation);
      }
    }
    
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
    const selectedIds = this.state.selection.selectedIds;
    if (selectedIds.length === 0) return [];
    
    const camera = this.cameraController.getCamera();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    const results: Array<{ id: string; bounds: { left: number; top: number; width: number; height: number } }> = [];
    
    for (const id of selectedIds) {
      const object = this.sceneManager.getObject(id);
      if (!object) continue;
      
      // Calculate bounding box in world space
      const box = new THREE.Box3().setFromObject(object);
      
      // Get the 8 corners of the bounding box
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];
      
      // Project each corner to screen space and find min/max
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      
      for (const corner of corners) {
        const projected = corner.clone().project(camera);
        // Convert from normalized device coordinates (-1 to 1) to screen coordinates
        const screenX = (projected.x + 1) / 2 * width;
        const screenY = (-projected.y + 1) / 2 * height;
        
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }
      
      // Add padding for visibility
      const padding = 4;
      
      results.push({
        id,
        bounds: {
          left: minX - padding,
          top: minY - padding,
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2,
        },
      });
    }
    
    return results;
  }

  // ==========================================================================
  // Rendering Settings
  // ==========================================================================

  /**
   * Apply all rendering settings
   * Called on init and when settings change
   */
  private applyRenderingSettings(): void {
    const settings = this.renderingSettings.getSettings();
    
    // Apply in order of dependency
    this.applyAntialiasingSettings(settings);
    this.applyShadowSettings(settings);
    this.applyInstancingSettings(settings);
    this.applyOptimizerSettings(settings);
    this.applyFrustumCullingSettings(settings);
  }
  
  private applyAntialiasingSettings(settings: EditorPreferences['rendering']): void {
    if (settings.antialiasingEnabled) {
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, settings.antialiasingLevel || 2)
      );
    } else {
      this.renderer.setPixelRatio(1);
    }
  }
  
  private applyShadowSettings(settings: EditorPreferences['rendering']): void {
    // Renderer
    this.renderer.shadowMap.enabled = settings.shadowsEnabled;
    
    // Directional light
    const dirLight = this.sceneManager.getDirectionalLight();
    if (dirLight) {
      dirLight.castShadow = settings.shadowsEnabled;
      if (settings.shadowsEnabled) {
        dirLight.shadow.mapSize.width = settings.shadowMapSize;
        dirLight.shadow.mapSize.height = settings.shadowMapSize;
        dirLight.shadow.camera.far = settings.shadowDistance || 500;
        dirLight.shadow.needsUpdate = true;
      }
    }
    
    // Update all meshes (one-time traversal)
    this.updateMeshShadows(settings.shadowsEnabled);
  }
  
  private updateMeshShadows(enabled: boolean): void {
    // Traverse scene once, update all meshes
    // Skip markers, ghosts, selectors
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.userData.selectable !== false && 
            !object.userData.isGhost &&
            !object.userData.isSelector &&
            !object.userData.isInstanceMarker) {
          object.castShadow = enabled;
          object.receiveShadow = enabled;
        }
      } else if (object instanceof THREE.InstancedMesh) {
        object.castShadow = enabled;
        object.receiveShadow = enabled;
      }
    });
  }
  
  private applyInstancingSettings(settings: EditorPreferences['rendering']): void {
    this.buildingManager?.setInstancingEnabled(settings.instancingEnabled);
    this.groundTileManager?.setInstancingEnabled(settings.instancingEnabled);
  }
  
  private applyOptimizerSettings(settings: EditorPreferences['rendering']): void {
    this.buildingManager?.setOptimizerEnabled(settings.optimizerEnabled);
    this.groundTileManager?.setOptimizerEnabled(settings.optimizerEnabled);
    // Always sync readonly mode (may change if engine mode changes)
    this.buildingManager?.setReadonlyMode(this.readonly);
    this.groundTileManager?.setReadonlyMode(this.readonly);
  }
  
  private applyFrustumCullingSettings(settings: EditorPreferences['rendering']): void {
    this.updateFrustumCulling(settings.frustumCullingEnabled);
  }
  
  private updateFrustumCulling(enabled: boolean): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        // Only update batched meshes (not individual objects)
        if (object.userData.isBatchedWalls ||
            object.userData.isBatchedRoofTiles ||
            object.userData.isGroundTileBatch ||
            object.userData.isBatchedFloorTiles) {
          object.frustumCulled = enabled;
        }
      }
    });
    
    // Store flag for future meshes
    this.buildingManager?.setFrustumCullingEnabled(enabled);
    this.groundTileManager?.setFrustumCullingEnabled(enabled);
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
    
    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    // Dispose subsystems
    this.sceneManager.dispose();
    this.cameraController.dispose();
    this.selectionManager.dispose();
    this.selectionHighlightManager.dispose();
    this.gridSystem.dispose();
    this.placementManager.dispose();
    this.translateGizmo.dispose();
    this.inputCoordinator.dispose();
    this.windowManager.dispose();
    this.groundTileManager.dispose();
    
    // Dispose building move preview
    this.disposeBuildingMovePreview();
    
    // Dispose Three.js objects
    this.renderer.dispose();
    
    // Remove from DOM
    this.container.removeChild(this.renderer.domElement);
    this.container.removeChild(this.labelRenderer.domElement);
    
    // Clear event handlers
    this.eventHandlers.clear();
  }
}

