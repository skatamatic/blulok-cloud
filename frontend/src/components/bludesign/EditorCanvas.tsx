/**
 * Editor Canvas
 *
 * Main React component for the BluDesign 3D editor.
 * Integrates the Three.js engine with floating UI panels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBluDesignEngine } from './hooks/useBluDesignEngine';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import {
  ToolboxPanel,
  ViewControlsPanel,
  DefaultCameraPanel,
  PropertiesPanel,
  AssetBrowserPanel,
  FloorsPanel,
  ThemeSelectorPanel,
  BuildingSkinPanel,
  DataSourcePanel,
  SmartObjectsPanel,
  ASSET_CARD_SIZE,
  ASSET_GRID_GAP,
} from './ui/panels';
import { BuildingSkinType } from './core/types';
import { getThemeManager } from './core/ThemeManager';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ProgressOverlay, ProgressState } from './ui/ProgressOverlay';
import { FloatingPanel } from './ui/FloatingPanel';
import { DockRegion, type DockTabItem } from './ui/DockRegion';
import {
  ALL_PANEL_IDS,
  type PanelId,
  type PanelLayoutStateV9,
  type ExtendedPanelStateV9,
  mergeLayoutWithDefaultsV9,
  defaultDockSideState,
  dockPanel,
  floatPanel,
  setDockActive,
  setDockExpanded,
  setDockWidth,
  DOCK_EDGE_ZONE_PX,
  DOCK_STACK_WIDTH_PX,
  reorderDockPanelIds,
} from './ui/panelLayoutV9';
import { MenuBar } from './ui/MenuBar';
import { ImportPlanPanelContent } from './editor/ImportPlanPanel';
import {
  editorImportPlanUnitColor,
  hasLayoutImport,
} from './layout-import/layoutImportMetadata';
import { EditorHelpModal } from './ui/dialogs/EditorHelpModal';
import { SelectionOverlay } from './ui/SelectionOverlay';
import { SaveDialog } from './ui/dialogs/SaveDialog';
import { LoadDialog } from './ui/dialogs/LoadDialog';
import { PreferencesDialog } from './ui/dialogs/PreferencesDialog';
import { ThemeMissingDialog } from './ui/dialogs/ThemeMissingDialog';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { PerformanceMonitor } from './ui/PerformanceMonitor';
import { RenderingSettingsManager } from './core/RenderingSettingsManager';
import { EditorPreferences, loadPreferences } from './core/Preferences';
import {
  EditorTool,
  EditorMode,
  CameraMode,
  PlacedObject,
  Orientation,
  DataSourceConfig,
  EntityBinding,
  SimulationState,
  Building,
  FacilityData,
} from './core/types';
import { AssetRegistry } from './assets/AssetRegistry';
import { AssetService } from './services/AssetService';
import { AssetCategory, AssetMetadata } from './core/types';
import { formatDefaultCameraSummary } from './core/camera/cameraStateUtils';
import * as bludesignApi from '@/api/bludesign';
import type { ImportEditorHandoff } from './layout-import/importEditorHandoff';
import {
  CursorArrowRaysIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  CubeIcon,
  CpuChipIcon,
  Squares2X2Icon,
  RectangleStackIcon,
  SwatchIcon,
  ServerIcon,
  BuildingOffice2Icon,
  VideoCameraIcon,
  PhotoIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';

interface EditorCanvasProps {
  readonly?: boolean;
  className?: string;
  onReady?: () => void;
  initialFacilityId?: string; // If provided, load this facility on mount
  /** Unsaved import wizard handoff — opens in editor without a server save. */
  initialImportHandoff?: ImportEditorHandoff;
}

type ExtendedPanelState = ExtendedPanelStateV9;

type PanelLayoutState = PanelLayoutStateV9;

// v9: adds dock-left / dock-right placement + docks
const LAYOUT_STORAGE_KEY = 'bludesign-panel-layout-v9';
const LAYOUT_STORAGE_KEY_LEGACY_V8 = 'bludesign-panel-layout-v8';
// Key for user's custom default layout
const CUSTOM_DEFAULT_LAYOUT_KEY = 'bludesign-custom-default-layout';
// Key for panel z-order (most recently used at end of array)
const PANEL_ZORDER_KEY = 'bludesign-panel-zorder';

// Base z-index for floating panels
const PANEL_BASE_ZINDEX = 30;

// Size of one asset column including gap (for snap calculation)
const ASSET_COLUMN_WIDTH = ASSET_CARD_SIZE + ASSET_GRID_GAP;
// Panel padding (left + right = 12 + 12 = 24)
const PANEL_PADDING = 24;

// Standard panel width for right-side panels
const PANEL_WIDTH_WIDE = 260;

// Calculate panel width for N columns
const getAssetsPanelWidth = (columns: number) => 
  PANEL_PADDING + (columns * ASSET_CARD_SIZE) + ((columns - 1) * ASSET_GRID_GAP);

// Gap between panels
const PANEL_GAP = 12;

/**
 * Get default panel layout for a given container width
 * 
 * Layout organization:
 * - LEFT COLUMN: Tools (top), Assets (below)
 * - RIGHT COLUMN: Smart Objects, View, Properties, Floors (stacked)
 * - FLOATING: Scene Theme (center-ish, can be moved)
 * - HIDDEN: Data Source (show via View menu)
 */
const getDefaultLayout = (containerWidth: number): PanelLayoutState => {
  // Calculate right-side X position (with consistent margin)
  const rightMargin = 16;
  const rightPanelX = Math.max(containerWidth - PANEL_WIDTH_WIDE - rightMargin, 300);
  
  // Left side margin
  const leftMargin = 16;
  
  // Y positions for right-side panels (stacked with gaps)
  const rightPanelY1 = 16;
  const rightPanelY2 = 180;  // After Smart Objects (~164px tall)
  const rightPanelY3 = 340;  // Default camera slot (hidden until enabled)
  const rightPanelY4 = 520;  // After View (~160px tall)
  const rightPanelY5 = 720;  // After Properties (~200px tall)
  
  // Y positions for left-side panels
  const leftPanelY1 = 16;
  const leftPanelY2 = 260;   // After Tools (~244px with content)
  
  return {
    // ============ LEFT COLUMN ============
    // Tools panel - top left
    tools: { 
      x: leftMargin, 
      y: leftPanelY1, 
      collapsed: false, 
      visible: true, 
      relX: 0, 
      relY: 0,
      placement: 'float',
    },
    
    // Assets panel - below tools
    assets: { 
      x: leftMargin, 
      y: leftPanelY2, 
      width: getAssetsPanelWidth(4), 
      collapsed: false, 
      visible: true, 
      relX: 0, 
      relY: 0,
      placement: 'float',
    },
    
    // ============ RIGHT COLUMN ============
    // Smart Objects panel - top right
    smartobjects: { 
      x: rightPanelX, 
      y: rightPanelY1, 
      collapsed: false, 
      visible: true, 
      relX: 1, 
      relY: 0,
      placement: 'float',
    },
    
    // View panel - below smart objects
    view: { 
      x: rightPanelX, 
      y: rightPanelY2, 
      collapsed: false, 
      visible: true, 
      relX: 1, 
      relY: 0,
      placement: 'float',
    },

    // Default camera panel - hidden until enabled from View menu
    defaultCamera: {
      x: rightPanelX,
      y: rightPanelY3,
      collapsed: false,
      visible: false,
      relX: 1,
      relY: 0,
      placement: 'float',
    },

    // Import plan panel - hidden until enabled from View menu (imported facilities only)
    importPlan: {
      x: leftMargin,
      y: 520,
      width: 360,
      height: 320,
      collapsed: false,
      visible: false,
      relX: 0,
      relY: 1,
      placement: 'float',
    },
    
    // Properties panel - below view / default camera slot
    properties: { 
      x: rightPanelX, 
      y: rightPanelY4, 
      collapsed: false, 
      visible: true, 
      relX: 1, 
      relY: 0,
      placement: 'float',
    },
    
    // Floors panel - below properties
    floors: { 
      x: rightPanelX, 
      y: rightPanelY5, 
      collapsed: false, 
      visible: true, 
      relX: 1, 
      relY: 0,
      placement: 'float',
    },
    
    // ============ FLOATING PANELS ============
    // Scene Theme panel - positioned near bottom-center, moveable
    skins: { 
      x: Math.max(containerWidth / 2 - 140, leftMargin + getAssetsPanelWidth(4) + 20), 
      y: Math.max(400, 16), 
      collapsed: false, 
      visible: true, 
      relX: 0.5, 
      relY: 0,
      placement: 'float',
    },
    
    // Data Source panel - hidden by default, shows on right when enabled
    datasource: { 
      x: rightPanelX - PANEL_WIDTH_WIDE - PANEL_GAP, 
      y: rightPanelY1, 
      collapsed: false, 
      visible: false, 
      relX: 1, 
      relY: 0,
      placement: 'float',
    },
    
    // Building Style panel - appears when building is selected, positioned near properties
    buildingSkin: { 
      x: rightPanelX - PANEL_WIDTH_WIDE - PANEL_GAP, 
      y: rightPanelY4, // Same row as properties
      collapsed: false, 
      visible: true, // Visibility controlled by building selection, not this flag
      relX: 1, 
      relY: 0,
      placement: 'float',
    },

    docks: {
      left: defaultDockSideState(),
      right: defaultDockSideState(),
    },
  };
};

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  readonly = false,
  className = '',
  onReady,
  initialFacilityId,
  initialImportHandoff,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const { addToast } = useToast();
  
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  
  const {
    containerRef,
    engine,
    state,
    isReady,
    isLoading,
    loadingProgress,
    setTool,
    setCameraMode,
    rotateIsometric,
    toggleGrid,
    setActiveAsset,
    resetCamera,
    clearSelection,
  } = useBluDesignEngine({
    readonly,
    theme: effectiveTheme,
    onReady,
  });

  const [selectedObjects, setSelectedObjects] = useState<PlacedObject[]>([]);
  const [showCallouts, setShowCallouts] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState<string>('theme-default');
  const [availableAssets, setAvailableAssets] = useState(AssetRegistry.getInstance().getAllAssets());
  
  // Selection overlay state (for drag box only - 3D highlights are in the engine)
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  
  // Track real-time width during resize (for dynamic column calculation)
  const [assetsResizeWidth, setAssetsResizeWidth] = useState<number | null>(null);
  
  // Facility save/load state
  const [currentFacilityId, setCurrentFacilityId] = useState<string | null>(null);
  const [currentFacilityName, setCurrentFacilityName] = useState<string | null>(null);
  const [pendingLayoutSourceFile, setPendingLayoutSourceFile] = useState<File | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [autoSaveToast, setAutoSaveToast] = useState(false);
  const [showDraftRecoveryDialog, setShowDraftRecoveryDialog] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showThemeMissingDialog, setShowThemeMissingDialog] = useState(false);
  const [missingThemeId, setMissingThemeId] = useState<string | null>(null);
  const [showNewFacilityConfirm, setShowNewFacilityConfirm] = useState(false);
  
  const layoutImport = engine?.getLayoutImport() ?? null;
  
  // Progress overlay state for time-consuming operations
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  
  // Loading state tracking for better UI feedback
  // Progress never goes backwards - we use a "high water mark" pattern
  const [loadingState, setLoadingStateRaw] = useState<{
    type: 'engine' | 'draft' | 'facility' | 'none';
    subtitle?: string;
    progress: number;
  }>({ type: 'engine', progress: 0 });
  
  // Track the highest progress we've reached (prevents backwards progress)
  const progressHighWaterMark = useRef<number>(0);
  
  // Wrapper that ensures progress never goes backwards
  const setLoadingState = useCallback((newState: {
    type: 'engine' | 'draft' | 'facility' | 'none';
    subtitle?: string;
    progress: number;
  }) => {
    // If this is a reset (type 'none' with 100%), allow it
    if (newState.type === 'none' && newState.progress === 100) {
      progressHighWaterMark.current = 100;
      setLoadingStateRaw(newState);
      return;
    }
    
    // Otherwise, only allow progress to increase
    const effectiveProgress = Math.max(progressHighWaterMark.current, newState.progress);
    progressHighWaterMark.current = effectiveProgress;
    
    setLoadingStateRaw({
      ...newState,
      progress: effectiveProgress,
    });
  }, []);
  
  // History state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasClipboard, setHasClipboard] = useState(false);
  
  // Selection filter state
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'smart' | 'visual'>('all');
  
  // Full view opacity state (local state for UI responsiveness)
  const [fullViewOpacity, setFullViewOpacity] = useState(1.0);
  
  // Data source state
  const [dataSourceConfig, setDataSourceConfig] = useState<DataSourceConfig>({ type: 'none' });
  const [simulationMode, setSimulationMode] = useState(false);

  // Panel layout state — v9 (docks); falls back to legacy v8 JSON
  const [panelLayout, setPanelLayout] = useState<PanelLayoutState>(() => {
    const containerWidth = window.innerWidth - 300;
    const defaultLayout = getDefaultLayout(containerWidth);

    try {
      const v9 = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (v9) {
        return mergeLayoutWithDefaultsV9(JSON.parse(v9), defaultLayout);
      }
      const v8 = localStorage.getItem(LAYOUT_STORAGE_KEY_LEGACY_V8);
      if (v8) {
        return mergeLayoutWithDefaultsV9(JSON.parse(v8), defaultLayout);
      }
    } catch (e) {
      console.warn('Failed to load panel layout, using defaults', e);
    }

    return defaultLayout;
  });

  /** Edge drop hint while dragging a floating panel header */
  const [dockDropTarget, setDockDropTarget] = useState<'left' | 'right' | null>(null);

  // Auto-save layout when it changes (debounced to avoid excessive writes)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout));
      } catch (e) {
        console.warn('Failed to auto-save panel layout', e);
      }
    }, 500); // Debounce 500ms
    
    return () => clearTimeout(timeoutId);
  }, [panelLayout]);

  // Panel z-order state - array of panel IDs, most recently used at the END (highest z-index)
  const [panelZOrder, setPanelZOrder] = useState<PanelId[]>(() => {
    try {
      const saved = localStorage.getItem(PANEL_ZORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PanelId[];
        // Ensure all panels are in the array
        const validPanels = parsed.filter(id => ALL_PANEL_IDS.includes(id));
        const missingPanels = ALL_PANEL_IDS.filter(id => !validPanels.includes(id));
        return [...validPanels, ...missingPanels];
      }
    } catch (e) {
      console.warn('Failed to load panel z-order, using defaults', e);
    }
    return [...ALL_PANEL_IDS];
  });

  // Auto-save z-order when it changes
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_ZORDER_KEY, JSON.stringify(panelZOrder));
    } catch (e) {
      console.warn('Failed to save panel z-order', e);
    }
  }, [panelZOrder]);

  // Bring a panel to front (move to end of z-order array)
  const bringPanelToFront = useCallback((panelId: PanelId) => {
    setPanelZOrder(current => {
      const filtered = current.filter(id => id !== panelId);
      return [...filtered, panelId];
    });
  }, []);

  // Get z-index for a panel based on its position in the z-order array
  const getPanelZIndex = useCallback((panelId: PanelId): number => {
    const index = panelZOrder.indexOf(panelId);
    return PANEL_BASE_ZINDEX + (index >= 0 ? index : 0);
  }, [panelZOrder]);

  // Save current layout as the user's custom default
  const saveLayoutAsDefault = useCallback(() => {
    try {
      localStorage.setItem(CUSTOM_DEFAULT_LAYOUT_KEY, JSON.stringify(panelLayout));
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout));
      console.log('[Layout] Saved as default successfully');
    } catch (e) {
      console.warn('[Layout] Failed to save as default', e);
    }
  }, [panelLayout]);

  // Reset layout to defaults (user's custom default if exists, otherwise built-in default)
  const resetLayout = useCallback(() => {
    const containerWidth = canvasAreaRef.current?.offsetWidth ?? window.innerWidth - 300;
    const builtInDefault = getDefaultLayout(containerWidth);
    
    let layoutToApply = builtInDefault;
    
    try {
      // Check for user's custom default first
      const customDefault = localStorage.getItem(CUSTOM_DEFAULT_LAYOUT_KEY);
      if (customDefault) {
        const parsed = JSON.parse(customDefault);
        // Merge with built-in defaults for robustness (in case new panels were added)
        layoutToApply = mergeLayoutWithDefaultsV9(parsed, builtInDefault);
        console.log('[Layout] Reset to custom default');
      } else {
        console.log('[Layout] Reset to built-in default');
      }
    } catch (e) {
      console.warn('[Layout] Failed to load custom default, using built-in', e);
    }
    
    // Apply the layout
    setPanelLayout(layoutToApply);
    
    // Save to current layout storage
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutToApply));
    } catch (e) {
      console.warn('[Layout] Failed to save reset layout', e);
    }
  }, []);

  // Update individual panel state (not `docks`)
  const updatePanelState = useCallback(
    (panelId: keyof Omit<PanelLayoutState, 'docks'>, updates: Partial<ExtendedPanelState>) => {
      setPanelLayout((prev) => ({
        ...prev,
        [panelId]: { ...prev[panelId], ...updates },
      }));

      if (panelId === 'assets' && updates.width !== undefined) {
        setAssetsResizeWidth(null);
      }
    },
    []
  );

  // Toggle panel visibility
  const togglePanelVisibility = useCallback(
    (panelId: keyof Omit<PanelLayoutState, 'docks'>, visible?: boolean) => {
      setPanelLayout((prev) => ({
        ...prev,
        [panelId]: { ...prev[panelId], visible: visible ?? !prev[panelId].visible },
      }));
    },
    []
  );

  const toggleImportPlanPanel = useCallback(() => {
    setPanelLayout((prev) => {
      const nextVisible = !prev.importPlan.visible;
      if (nextVisible) {
        bringPanelToFront('importPlan');
      }
      return {
        ...prev,
        importPlan: { ...prev.importPlan, visible: nextVisible },
      };
    });
  }, [bringPanelToFront]);

  useEffect(() => {
    if (!layoutImport && panelLayout.importPlan.visible) {
      togglePanelVisibility('importPlan', false);
    }
  }, [layoutImport, panelLayout.importPlan.visible, togglePanelVisibility]);

  // Show all panels (for reset) — import plan stays opt-in from View menu
  const showAllPanels = useCallback(() => {
    setPanelLayout((prev) => {
      const updated = { ...prev };
      for (const id of ALL_PANEL_IDS) {
        if (id === 'importPlan') continue;
        updated[id] = { ...updated[id], visible: true };
      }
      return updated;
    });
  }, []);

  // Sync selection state
  useEffect(() => {
    if (!state?.selection || !engine) return;
    
    // Get actual placed object data from the engine
    const sceneManager = engine.getSceneManager();
    const objects: PlacedObject[] = state.selection.selectedIds
      .map((id) => sceneManager.getObjectData(id))
      .filter((obj): obj is PlacedObject => obj !== null && obj !== undefined);
    
    setSelectedObjects(objects);
  }, [state?.selection?.selectedIds, engine]);

  // Save/Load handlers (defined before keyboard shortcuts)
  const executeNewFacility = useCallback(() => {
    if (engine) {
      engine.clearScene();
    }
    setCurrentFacilityName(null);
    setCurrentFacilityId(null);
    setPendingLayoutSourceFile(null);
    togglePanelVisibility('importPlan', false);
    setHasUnsavedChanges(false);
    addToast({ type: 'info', title: 'New Facility', message: 'Started a new facility.' });
  }, [engine, addToast, togglePanelVisibility]);

  const handleNew = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowNewFacilityConfirm(true);
      return;
    }
    executeNewFacility();
  }, [hasUnsavedChanges, executeNewFacility]);

  const handleSaveAs = useCallback(() => {
    setShowSaveDialog(true);
  }, []);

  const handleLoad = useCallback(() => {
    setShowLoadDialog(true);
  }, []);

  const buildSavePayload = useCallback((): FacilityData | null => {
    if (!engine) return null;
    const data = engine.exportSceneData();
    data.name = currentFacilityName || 'Untitled';
    data.dataSource = dataSourceConfig;
    return data;
  }, [engine, currentFacilityName, dataSourceConfig]);

  const handleSave = useCallback(async () => {
    if (!engine) return;
    
    if (currentFacilityId && currentFacilityName) {
      // Update existing facility
      try {
        const data = buildSavePayload();
        if (!data) return;
        const thumbnail = await engine.captureScreenshot();
        await bludesignApi.updateFacility(currentFacilityId, data, thumbnail);
        setHasUnsavedChanges(false);
        // Clear auto-save draft on successful save
        engine.clearDraft();
        addToast({ type: 'success', title: 'Success', message: 'Facility saved.' });
      } catch (error) {
        console.error('Failed to save facility:', error);
        addToast({ type: 'error', title: 'Error', message: 'Failed to save facility.' });
      }
    } else {
      // Show save dialog for new facility
      setShowSaveDialog(true);
    }
  }, [engine, currentFacilityId, currentFacilityName, buildSavePayload, addToast]);

  // Clipboard handlers (must be before useKeyboardShortcuts)
  const handleCopy = useCallback(() => {
    if (engine) {
      engine.copy();
      setHasClipboard(engine.hasClipboardContent());
    }
  }, [engine]);
  
  const handleCut = useCallback(() => {
    if (engine) {
      engine.cut();
      setHasClipboard(engine.hasClipboardContent());
    }
  }, [engine]);
  
  const handlePaste = useCallback(() => {
    if (engine) {
      // Paste at center of view (or could be mouse position)
      engine.paste({ x: 0, z: 0, y: 0 });
    }
  }, [engine]);
  
  const handleSelectAll = useCallback(() => {
    if (engine) {
      engine.selectAll();
    }
  }, [engine]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: isReady && !readonly,
    activeTool: state?.activeTool,
    hasSelection: (state?.selection?.selectedIds?.length ?? 0) > 0 || !!state?.selection?.selectedBuildingId,
    onToolChange: setTool,
    onRotateIsometric: rotateIsometric,
    onRotateOrientation: (direction) => {
      if (engine) {
        engine.rotateOrientation(direction);
      }
    },
    onRotateSelection: useCallback((direction: 'cw' | 'ccw') => {
      if (engine) {
        engine.rotateSelection(direction);
      }
    }, [engine]),
    onMoveSelection: useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
      if (engine) {
        engine.moveSelectionByDirection(direction);
      }
    }, [engine]),
    onRotateCamera90: useCallback((direction: 'cw' | 'ccw') => {
      if (engine) {
        engine.rotateCameraView(direction);
      }
    }, [engine]),
    onToggleCameraMode: useCallback(() => {
      if (state?.camera.mode === CameraMode.FREE) {
        setCameraMode(CameraMode.ISOMETRIC);
      } else {
        setCameraMode(CameraMode.FREE);
      }
    }, [state?.camera.mode, setCameraMode]),
    onDelete: useCallback(() => {
      if (engine) {
        engine.deleteSelected();
      }
    }, [engine]),
    onDuplicate: useCallback(() => {
      console.log('Duplicate selection');
    }, []),
    onUndo: useCallback(() => {
      if (engine) {
        engine.undo();
      }
    }, [engine]),
    onRedo: useCallback(() => {
      if (engine) {
        engine.redo();
      }
    }, [engine]),
    onToggleGrid: () => toggleGrid(),
    onEscape: () => {
      clearSelection();
      setActiveAsset(null);
      setTool(EditorTool.SELECT);
    },
    onPlaceAsset: () => {
      // Placement confirmation is handled automatically by the engine
      // No explicit confirmPlacement method needed
    },
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handlePaste,
    onSelectAll: handleSelectAll,
    onNew: handleNew,
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onLoad: handleLoad,
    onCtrlChange: useCallback((isHeld: boolean) => {
      // In placement or selection mode, rotation is only allowed when Ctrl is held
      if (engine) {
        const inPlacement = state?.activeTool === EditorTool.PLACE && state?.activeAssetId;
        const inSelection = state?.activeTool === EditorTool.SELECT;

        if (inPlacement || inSelection) {
          engine.setRotationEnabled(isHeld);
        }
      }
    }, [engine, state?.activeTool, state?.activeAssetId]),
    onAlignGridToSelection: useCallback(() => {
      if (!engine) return;
      const ok = engine.alignGridToSelection();
      if (!ok) {
        addToast({
          type: 'info',
          title: 'Align grid',
          message: 'Select a single object on this floor, then try again.',
        });
      }
    }, [engine, addToast]),
    onResetGridAlignment: useCallback(() => {
      engine?.resetGridAlignment();
    }, [engine]),
  });

  // Safe state for rendering (fallback when engine not ready)
  const safeState = useMemo(() => {
    if (state) return state;
    return {
      mode: EditorMode.EDIT,
      activeTool: EditorTool.SELECT,
      activeAssetId: null as string | null,
      activeOrientation: Orientation.NORTH,
      placementPreview: null,
      camera: {
        mode: CameraMode.FREE,
        isometricAngle: 225 as const,
        zoom: 1,
      },
      snap: { gridSize: 1, enabled: true },
      selection: { selectedIds: [] as string[], hoveredId: null as string | null, isMultiSelect: false, selectedBuildingId: null as string | null },
      ui: {
        showGrid: true,
        showCallouts: true,
        showBoundingBoxes: false,
        panelsCollapsed: {} as Record<string, boolean>,
        gridAlignment: null,
      },
      buildings: [] as Building[],
      activeFloor: 0,
      isFloorMode: false,
    };
  }, [state]);

  const importPlanSelectedIds = useMemo(
    () => new Set(safeState.selection?.selectedIds ?? []),
    [safeState.selection?.selectedIds]
  );

  const getImportPlanUnitColor = useCallback(
    (unitId: string) => {
      const obj = engine?.getSceneManager()?.getObjectData(unitId);
      const isDataBound = !!obj?.binding?.entityId;
      return editorImportPlanUnitColor(isDataBound);
    },
    [engine, state]
  );

  const isImportPlanUnitDimmed = useCallback(
    (unitId: string) => {
      const obj = engine?.getSceneManager()?.getObjectData(unitId);
      return !obj?.binding?.entityId;
    },
    [engine, state]
  );

  const handleImportPlanUnitSelect = useCallback(
    (unitId: string | null) => {
      if (!engine) return;
      const selectionManager = engine.getSelectionManager();
      if (!unitId) {
        selectionManager?.clearSelection();
        return;
      }
      selectionManager?.clearSelection();
      selectionManager?.select(unitId);
    },
    [engine]
  );

  // Handlers
  const handleToolChange = useCallback((tool: EditorTool) => setTool(tool), [setTool]);
  const handleCameraModeChange = useCallback((mode: CameraMode) => setCameraMode(mode), [setCameraMode]);
  const handleRotateIsometric = useCallback((direction: 'cw' | 'ccw') => rotateIsometric(direction), [rotateIsometric]);
  const handleToggleGrid = useCallback(() => toggleGrid(), [toggleGrid]);
  const handleToggleCallouts = useCallback(() => setShowCallouts((prev) => !prev), []);
  const handleResetCamera = useCallback(() => {
    if (engine?.restoreDefaultCamera(true)) {
      return;
    }
    const cameraController = engine?.getCameraController();
    const bounds = engine?.calculateSceneBounds();
    if (cameraController && bounds) {
      cameraController.frameAllContent(bounds, true);
      return;
    }
    resetCamera();
  }, [engine, resetCamera]);

  const [defaultCameraRevision, setDefaultCameraRevision] = useState(0);

  const handleSetDefaultCamera = useCallback(() => {
    if (!engine) return;
    engine.setDefaultCameraFromCurrentView();
    setDefaultCameraRevision((n) => n + 1);
    setHasUnsavedChanges(true);
    addToast({
      type: 'success',
      title: 'Default view saved',
      message: 'This camera will restore whenever the facility is opened.',
    });
  }, [engine, addToast]);

  const handleClearDefaultCamera = useCallback(() => {
    if (!engine) return;
    engine.clearDefaultCamera();
    setDefaultCameraRevision((n) => n + 1);
    setHasUnsavedChanges(true);
  }, [engine]);

  const defaultCameraSummary = useMemo(() => {
    const saved = engine?.getDefaultCamera();
    return saved ? formatDefaultCameraSummary(saved) : undefined;
  }, [engine, defaultCameraRevision, state?.camera]);
  
  // Handle selection filter change
  const handleSelectionFilterChange = useCallback((filter: 'all' | 'smart' | 'visual') => {
    setSelectionFilter(filter);
    engine?.getSelectionManager()?.setFilter(filter, true); // true = clear non-matching selections
  }, [engine]);

  const handleSelectAsset = useCallback((assetId: string | null) => {
    if (assetId) {
      // First check available assets (includes custom assets), then fall back to registry
      const asset = availableAssets.find(a => a.id === assetId)
        || AssetRegistry.getInstance().getAsset(assetId);
      if (asset) {
        setActiveAsset(assetId, asset);
      }
    } else {
      setActiveAsset(null);
    }
  }, [setActiveAsset, availableAssets]);
  const handleDeleteSelection = useCallback(() => {
    if (engine) {
      engine.deleteSelected();
    }
  }, [engine]);
  
  const handleDuplicateSelection = useCallback(() => {
    if (engine) {
      engine.copy();
      engine.paste({ x: 1, z: 1, y: 0 }); // Paste with offset
    }
  }, [engine]);
  
  const handleRotateSelection = useCallback((orientation: Orientation) => console.log('Rotate to:', orientation), []);
  const handleUpdateProperty = useCallback((id: string, property: string, value: unknown) => {
    console.log('Update property:', id, property, value);
  }, []);
  
  // Data binding handlers
  const handleUpdateBinding = useCallback((id: string, binding: EntityBinding | undefined) => {
    if (engine) {
      engine.updateObjectBinding?.(id, binding);
      setHasUnsavedChanges(true);
    }
  }, [engine]);
  
  const handleUpdateSkin = useCallback((id: string, skinId: string | undefined) => {
    if (engine) {
      engine.updateObjectSkin?.(id, skinId);
      setHasUnsavedChanges(true);
    }
  }, [engine]);
  
  const handleSimulateState = useCallback((id: string, simState: SimulationState) => {
    if (engine) {
      engine.simulateObjectState?.(id, simState);
    }
  }, [engine]);

  const handleBuildingSkinChange = useCallback((buildingId: string, skinType: BuildingSkinType | string) => {
    if (engine) {
      engine.getBuildingManager()?.setBuildingSkin(buildingId, skinType);
      setHasUnsavedChanges(true);
    }
  }, [engine]);

  const handleThemeChange = useCallback((themeId: string) => {
    const themeManager = getThemeManager();
    themeManager.setActiveTheme(themeId);
    setActiveThemeId(themeId);
    setHasUnsavedChanges(true);
    // Theme change is automatically applied via ThemeManager.onThemeChange callback in engine
  }, []);
  
  const handleDataSourceChange = useCallback(async (config: DataSourceConfig) => {
    setDataSourceConfig(config);
    // Sync with engine so it's included in auto-saves and drafts
    engine?.setDataSourceConfig(config);
    
    // If we have an existing saved facility, immediately persist the data source change
    if (currentFacilityId && engine) {
      try {
        const data = buildSavePayload();
        if (!data) return;
        data.dataSource = config;
        await bludesignApi.updateFacility(currentFacilityId, data);
        // Mark as saved (not unsaved)
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Failed to save facility data source:', error);
        // Still mark as unsaved so user knows to save manually
        setHasUnsavedChanges(true);
        return;
      }
    } else {
      // No saved facility yet, just mark as unsaved
      setHasUnsavedChanges(true);
    }
  }, [engine, currentFacilityId, buildSavePayload]);

  const handleSimulationModeChange = useCallback((enabled: boolean) => {
    setSimulationMode(enabled);
  }, []);

  const handleSaveDialogSave = useCallback(async (name: string) => {
    if (!engine) return;
    
    try {
      const exported = engine.exportSceneData();
      const data = exported;
      data.name = name;
      data.dataSource = dataSourceConfig;
      const thumbnail = await engine.captureScreenshot();
      const copyLayoutSourceFrom =
        currentFacilityId && hasLayoutImport(data) ? currentFacilityId : undefined;
      const layoutFileToUpload = pendingLayoutSourceFile;
      
      if (currentFacilityId) {
        // Save as new (not update existing)
        const response = await bludesignApi.saveFacility(
          name,
          data,
          thumbnail,
          copyLayoutSourceFrom,
        );
        setCurrentFacilityId(response.id);
        setCurrentFacilityName(response.name);
        if (layoutFileToUpload) {
          await bludesignApi.uploadLayoutSource(response.id, layoutFileToUpload);
          setPendingLayoutSourceFile(null);
        }
      } else {
        // Save new
        const response = await bludesignApi.saveFacility(name, data, thumbnail);
        setCurrentFacilityId(response.id);
        setCurrentFacilityName(response.name);
        if (layoutFileToUpload) {
          await bludesignApi.uploadLayoutSource(response.id, layoutFileToUpload);
          setPendingLayoutSourceFile(null);
        }
      }
      
      setHasUnsavedChanges(false);
      setShowSaveDialog(false);
      // Clear auto-save draft on successful save
      engine.clearDraft();
    } catch (error) {
      console.error('Failed to save facility:', error);
      throw error;
    }
  }, [engine, currentFacilityId, dataSourceConfig, pendingLayoutSourceFile]);

  const handleLoadDialogLoad = useCallback(async (id: string) => {
    if (!engine) return;
    
    try {
      const facility = await bludesignApi.getFacility(id);
      
      // Use async import to pre-load any custom assets
      await engine.importSceneDataAsync(facility.data);
      setCurrentFacilityId(facility.id);
      setCurrentFacilityName(facility.name);
      setPendingLayoutSourceFile(null);
      togglePanelVisibility('importPlan', false);
      setHasUnsavedChanges(false);
      setShowLoadDialog(false);
      
      // Restore data source configuration from engine (set during importSceneData)
      const restoredDataSource = engine.getDataSourceConfig();
      setDataSourceConfig(restoredDataSource || { type: 'none' });
      
      // Sync activeThemeId with what was actually applied
      // (the theme-missing event handler will update to default if theme was missing)
      const themeManager = getThemeManager();
      setActiveThemeId(themeManager.getActiveThemeId());
    } catch (error) {
      console.error('Failed to load facility:', error);
      throw error;
    }
  }, [engine]);

  // Track changes
  useEffect(() => {
    if (!engine) return;
    
    const handleChange = () => {
      if (currentFacilityId) {
        setHasUnsavedChanges(true);
      }
    };
    
    engine.on('object-placed', handleChange);
    engine.on('object-moved', handleChange);
    engine.on('object-deleted', handleChange);
    
    return () => {
      engine.off('object-placed', handleChange);
      engine.off('object-moved', handleChange);
      engine.off('object-deleted', handleChange);
    };
  }, [engine, currentFacilityId]);
  
  // Track history state for undo/redo buttons
  useEffect(() => {
    if (!engine) return;
    
    const handleHistoryChange = (event: any) => {
      if (event && typeof event === 'object' && 'canUndo' in event && 'canRedo' in event) {
        setCanUndo(event.canUndo);
        setCanRedo(event.canRedo);
      }
    };
    
    engine.on('history-changed', handleHistoryChange);
    
    return () => {
      engine.off('history-changed', handleHistoryChange);
    };
  }, [engine]);
  
  // Listen for theme-missing event (when loading a facility with a deleted theme)
  useEffect(() => {
    if (!engine) return;
    
    const handleThemeMissing = (event: { data: { missingThemeId: string } }) => {
      setMissingThemeId(event.data.missingThemeId);
      setShowThemeMissingDialog(true);
      // Update activeThemeId to reflect the fallback to default
      setActiveThemeId('theme-default');
    };
    
    engine.on('theme-missing', handleThemeMissing);
    
    return () => {
      engine.off('theme-missing', handleThemeMissing);
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;

    const handlePlacementBlocked = (event: { data: { reason?: string } }) => {
      const reason = event.data?.reason;
      if (reason === 'full-view-mode') {
        addToast({
          type: 'info',
          title: 'Placement',
          message: 'Open a floor in the floor panel to place assets in this building.',
        });
        return;
      }
      if (reason === 'aligned-grid') {
        addToast({
          type: 'info',
          title: 'Building footprint',
          message: 'Reset the grid to world axes (Ctrl+Alt+R) before drawing a building outline.',
        });
      }
    };

    engine.on('placement-blocked', handlePlacementBlocked);

    return () => {
      engine.off('placement-blocked', handlePlacementBlocked);
    };
  }, [engine, addToast]);
  
  // Sync fullViewOpacity from engine when ready
  useEffect(() => {
    if (!engine || !isReady) return;
    const config = engine.getFloorManager()?.getGhostingConfig();
    if (config) {
      setFullViewOpacity(config.fullBuildingViewOpacity);
    }
  }, [engine, isReady]);
  
  // Listen for progress events from engine (batch placement, optimization)
  useEffect(() => {
    if (!engine) return;
    
    const handleProgressUpdate = (event: { data: { percentage: number; message: string; operation: string } }) => {
      setProgressState({
        percentage: event.data.percentage,
        message: event.data.message,
        isVisible: true,
      });
    };
    
    const handleProgressComplete = () => {
      setProgressState(prev => prev ? { ...prev, isVisible: false } : null);
    };
    
    engine.on('progress-updated', handleProgressUpdate);
    engine.on('progress-complete', handleProgressComplete);
    
    return () => {
      engine.off('progress-updated', handleProgressUpdate);
      engine.off('progress-complete', handleProgressComplete);
    };
  }, [engine]);
  
  // Check for auto-saved draft on startup
  useEffect(() => {
    if (!engine || !isReady || draftChecked) return;
    
    // Update loading state to show we're checking for drafts
    // Start at 82% since the engine hook goes to ~80% during its loading
    setLoadingState({ type: 'engine', subtitle: 'Checking for unsaved work...', progress: 82 });
    
    // Small delay to make the state transition smooth
    const timer = setTimeout(() => {
      // Layout-import handoff: open directly — never prompt for draft.
      if (initialFacilityId || initialImportHandoff) {
        engine.clearDraft();
        setDraftChecked(true);
        return;
      }

      const draft = engine.hasDraft();
      if (draft.exists && draft.timestamp) {
        setDraftTimestamp(draft.timestamp);
        setLoadingState({ type: 'draft', subtitle: 'Found unsaved work', progress: 85 });
        setShowDraftRecoveryDialog(true);
        // Don't mark initial load complete yet - wait for user decision
      } else {
        // No draft - proceed with normal flow, initial load will be handled by auto-resume effect
        setDraftChecked(true);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [engine, isReady, draftChecked, initialFacilityId, initialImportHandoff]);
  
  // Load custom assets from backend and merge with built-in assets
  useEffect(() => {
    const loadCustomAssets = async () => {
      try {
        setLoadingState({ type: 'engine', subtitle: 'Loading custom assets...', progress: 75 });
        
        const definitions = await AssetService.getAssetDefinitions({ isBuiltin: false });
        
        // Pre-load all custom model meshes
        const { CustomAssetLoader } = await import('./assets/CustomAssetLoader');
        const loader = CustomAssetLoader.getInstance();
        await loader.preloadGlobalAssets(definitions);
        
        // Convert custom definitions to AssetMetadata format
        // IMPORTANT: Include all fields needed for custom model loading
        const customAssetMetadata: AssetMetadata[] = definitions.map(def => ({
          id: def.id,
          name: def.name,
          category: def.category as AssetCategory,
          description: def.description,
          dimensions: def.dimensions,
          gridUnits: def.gridUnits,
          isSmart: def.isSmart,
          canRotate: def.canRotate,
          canStack: def.canStack,
          // Custom model fields - stored in metadata for now
          metadata: {
            globalModelId: def.globalModelId,
            positionOffset: def.positionOffset,
            modelType: def.modelType,
          },
        }));
        
        // Merge with built-in assets
        const builtInAssets = AssetRegistry.getInstance().getAllAssets();
        setAvailableAssets([...builtInAssets, ...customAssetMetadata]);
      } catch (error) {
        console.error('Failed to load custom assets:', error);
      }
    };
    
    loadCustomAssets();
  }, []);
  
  // Handle draft recovery
  const handleRecoverDraft = useCallback(async () => {
    if (!engine) return;
    
    // Hide dialog first, then animate to recovery phase
    setShowDraftRecoveryDialog(false);
    
    // Give the dialog a moment to fade out
    await new Promise(resolve => setTimeout(resolve, 150));
    
    setLoadingState({ type: 'draft', subtitle: 'Restoring draft...', progress: 87 });
    
    // Small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 200));
    
    setLoadingState({ type: 'draft', subtitle: 'Rebuilding scene...', progress: 92 });
    
    // Use async version to pre-load any custom assets
    const loaded = await engine.loadFromLocalStorageAsync();
    
    setLoadingState({ type: 'draft', subtitle: 'Finalizing...', progress: 95 });
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (loaded) {
      setHasUnsavedChanges(true);
      const restoredDataSource = engine.getDataSourceConfig();
      if (restoredDataSource) {
        setDataSourceConfig(restoredDataSource);
      }
      togglePanelVisibility('importPlan', false);
    }
    
    setLoadingState({ type: 'none', progress: 100 });
    setDraftChecked(true);
    setInitialLoadComplete(true);
  }, [engine]);
  
  const handleDiscardDraft = useCallback(async () => {
    if (!engine) return;
    
    // Hide dialog first
    setShowDraftRecoveryDialog(false);
    
    // Give the dialog a moment to fade out
    await new Promise(resolve => setTimeout(resolve, 150));
    
    setLoadingState({ type: 'engine', subtitle: 'Starting fresh...', progress: 92 });
    
    // Clear the draft and start with a completely blank scene
    engine.clearDraft();
    engine.clearScene();
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    setLoadingState({ type: 'none', progress: 100 });
    setDraftChecked(true);
    setInitialLoadComplete(true);
  }, [engine]);
  
  // Handle preferences changes
  const handlePreferencesChange = useCallback((prefs: EditorPreferences) => {
    // Update rendering settings manager
    const settingsManager = RenderingSettingsManager.getInstance();
    if (prefs.rendering) {
      settingsManager.updateSettings(prefs.rendering);
    }
    if (!engine) return;
    
    // Apply ghosting config to floor manager
    const floorManager = engine.getFloorManager();
    floorManager.setGhostingConfig(prefs.floorGhosting);
    
    addToast({ type: 'success', title: 'Success', message: 'Preferences saved.' });
  }, [engine, addToast]);
  
  // Load preferences on mount
  useEffect(() => {
    if (!engine) return;
    
    const prefs = loadPreferences();
    const floorManager = engine.getFloorManager();
    floorManager.setGhostingConfig(prefs.floorGhosting);
  }, [engine]);
  
  // Load initial facility if provided (layout-import handoff or view mode)
  useEffect(() => {
    if (!engine || !initialFacilityId || !draftChecked) return;

    let cancelled = false;

    const loadInitialFacility = async () => {
      try {
        setLoadingState({
          type: 'facility',
          subtitle: 'Opening imported facility…',
          progress: 88,
        });
        const facility = await bludesignApi.getFacility(initialFacilityId);
        if (cancelled) return;
        if (facility?.data) {
          engine.clearDraft();
          await engine.importSceneDataAsync(facility.data);
          setCurrentFacilityId(facility.id);
          setCurrentFacilityName(facility.name);
          togglePanelVisibility('importPlan', false);
          setHasUnsavedChanges(false);
          const restoredDataSource = engine.getDataSourceConfig();
          if (restoredDataSource) {
            setDataSourceConfig(restoredDataSource);
          }
        }
      } catch (error) {
        console.error('Failed to load facility:', error);
        addToast({ type: 'error', title: 'Error', message: 'Failed to load facility' });
      } finally {
        if (!cancelled) {
          setLoadingState({ type: 'none', progress: 100 });
          setInitialLoadComplete(true);
        }
      }
    };

    void loadInitialFacility();

    return () => {
      cancelled = true;
    };
  }, [engine, initialFacilityId, draftChecked, addToast]);
  
  // Load unsaved import wizard handoff (no server save until user chooses Save)
  useEffect(() => {
    if (!engine || !initialImportHandoff || !draftChecked || initialFacilityId) return;

    let cancelled = false;

    const loadImportedScene = async () => {
      try {
        setLoadingState({
          type: 'facility',
          subtitle: 'Opening imported layout…',
          progress: 88,
        });
        engine.clearDraft();
        await engine.importSceneDataAsync(initialImportHandoff.data);
        if (cancelled) return;
        setCurrentFacilityId(null);
        setCurrentFacilityName(initialImportHandoff.sceneName);
        setPendingLayoutSourceFile(initialImportHandoff.layoutSourceFile ?? null);
        setHasUnsavedChanges(true);
        togglePanelVisibility('importPlan', false);
        const restoredDataSource = engine.getDataSourceConfig();
        if (restoredDataSource) {
          setDataSourceConfig(restoredDataSource);
        }
      } catch (error) {
        console.error('Failed to open imported layout:', error);
        addToast({ type: 'error', title: 'Error', message: 'Failed to open imported layout' });
      } finally {
        if (!cancelled) {
          setLoadingState({ type: 'none', progress: 100 });
          setInitialLoadComplete(true);
        }
      }
    };

    void loadImportedScene();

    return () => {
      cancelled = true;
    };
  }, [engine, initialImportHandoff, initialFacilityId, draftChecked, addToast]);
  
  // Set up selection overlay callbacks - drag selection box
  useEffect(() => {
    if (!engine) return;
    
    const selectionManager = engine.getSelectionManager();
    
    // Wire up drag selection callback using the proper setter
    selectionManager.setOnDragSelectionChange((dragState) => {
      if (dragState.isDragging && dragState.startPoint && dragState.currentPoint) {
        setSelectionBox({
          start: dragState.startPoint,
          end: dragState.currentPoint
        });
      } else {
        setSelectionBox(null);
      }
    });
    
    return () => {
      selectionManager.setOnDragSelectionChange(() => {});
    };
  }, [engine]);
  
  // Note: 3D selection highlights are now handled by SelectionHighlightManager in the engine
  // The 2D SelectionOverlay is only used for the drag selection box

  // Auto-save every 5 minutes
  useEffect(() => {
    if (!engine || !currentFacilityId || readonly) return;
    
    const interval = setInterval(async () => {
      if (hasUnsavedChanges && currentFacilityName) {
        try {
          const data = buildSavePayload();
          if (!data) return;
          const thumbnail = await engine.captureScreenshot();
          await bludesignApi.updateFacility(currentFacilityId, data, thumbnail);
          setHasUnsavedChanges(false);
          setAutoSaveToast(true);
          setTimeout(() => setAutoSaveToast(false), 3000);
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(interval);
  }, [engine, currentFacilityId, currentFacilityName, hasUnsavedChanges, readonly, buildSavePayload]);

  // Auto-resume last facility on mount (only after draft check is complete)
  useEffect(() => {
    if (!engine || !isReady || readonly || !draftChecked || initialLoadComplete) return;

    // Layout-import handoff loads its own facility — do not restore last session.
    if (initialFacilityId) return;
    
    // If we already recovered a draft, don't auto-resume
    if (showDraftRecoveryDialog) return;
    
    let cancelled = false;
    
    const loadLast = async () => {
      try {
        setLoadingState({ type: 'facility', subtitle: 'Looking for recent work...', progress: 84 });
        
        const lastFacility = await bludesignApi.getLastOpened();
        
        if (lastFacility && !cancelled) {
          setLoadingState({ 
            type: 'facility', 
            subtitle: `Restoring "${lastFacility.name}"...`, 
            progress: 86 
          });
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Use async import to pre-load any custom assets
          await engine.importSceneDataAsync(lastFacility.data);
          
          setLoadingState({ type: 'facility', subtitle: 'Building scene...', progress: 90 });
          
          await new Promise(resolve => setTimeout(resolve, 150));
          
          setCurrentFacilityId(lastFacility.id);
          setCurrentFacilityName(lastFacility.name);
          togglePanelVisibility('importPlan', false);
          setHasUnsavedChanges(false);
          // Restore data source configuration from engine (set during importSceneData)
          const restoredDataSource = engine.getDataSourceConfig();
          if (restoredDataSource) {
            setDataSourceConfig(restoredDataSource);
          }
          
          setLoadingState({ type: 'facility', subtitle: 'Ready!', progress: 100 });
        } else if (!cancelled) {
          // No previous facility - starting with empty canvas
          setLoadingState({ type: 'engine', subtitle: 'Ready to create!', progress: 100 });
        }
      } catch (error) {
        // No last facility or error loading - start with empty scene
        if (!cancelled) {
          setLoadingState({ type: 'engine', subtitle: 'Ready to create!', progress: 100 });
        }
      } finally {
        if (!cancelled) {
          // Small delay to show the final state before hiding overlay
          await new Promise(resolve => setTimeout(resolve, 200));
          setLoadingState({ type: 'none', progress: 100 });
          setInitialLoadComplete(true);
        }
      }
    };
    
    loadLast();
    
    return () => {
      cancelled = true;
    };
  }, [engine, isReady, readonly, draftChecked, initialLoadComplete, showDraftRecoveryDialog, initialFacilityId]);

  const aboutInfo = useMemo(
    () => [
      { label: 'Version', value: 'BluDesign v0.1 (preview)' },
      { label: 'Three.js', value: '0.170.0' },
      { label: 'API', value: 'BluDesign endpoints enabled' },
    ],
    []
  );

  // Theme-aware background styles
  const canvasBackground = useMemo(() => {
    if (isDark) {
      return 'radial-gradient(circle at 20% 20%, rgba(40,80,140,0.15), transparent 40%), radial-gradient(circle at 80% 10%, rgba(80,120,200,0.12), transparent 35%), linear-gradient(135deg, #1e293b, #0f172a)';
    }
    return 'radial-gradient(circle at 20% 20%, rgba(100,150,220,0.15), transparent 40%), radial-gradient(circle at 80% 10%, rgba(120,160,230,0.12), transparent 35%), linear-gradient(135deg, #f1f5f9, #e2e8f0)';
  }, [isDark]);

  /** Hit-test all dock roots for this side (empty-strip placeholders + real {@link DockRegion}). */
  const pointerInDockShell = useCallback(
    (root: HTMLElement, side: 'left' | 'right', clientX: number, clientY: number) => {
      const nodes = root.querySelectorAll(`[data-bludesign-dock-side="${side}"]`);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as HTMLElement;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return true;
        }
      }
      return false;
    },
    []
  );

  const updateDockDropTargetFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasAreaRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      if (pointerInDockShell(el, 'left', clientX, clientY)) {
        setDockDropTarget('left');
        return;
      }
      if (pointerInDockShell(el, 'right', clientX, clientY)) {
        setDockDropTarget('right');
        return;
      }
      if (clientX - bounds.left <= DOCK_EDGE_ZONE_PX) setDockDropTarget('left');
      else if (bounds.right - clientX <= DOCK_EDGE_ZONE_PX) setDockDropTarget('right');
      else setDockDropTarget(null);
    },
    [pointerInDockShell]
  );

  const handleFloatingPanelDragMove = useCallback(
    (clientX: number, clientY: number) => {
      updateDockDropTargetFromPointer(clientX, clientY);
    },
    [updateDockDropTargetFromPointer]
  );

  /** Float header drag-end and dock-tab undock release: dock if pointer is over a dock shell or edge band. */
  const commitFloatPanelAtDockZones = useCallback(
    (panelId: PanelId, clientX: number, clientY: number) => {
      setDockDropTarget(null);
      const el = canvasAreaRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();

      if (pointerInDockShell(el, 'left', clientX, clientY)) {
        setPanelLayout((prev) => dockPanel(prev, panelId, 'left'));
        return;
      }
      if (pointerInDockShell(el, 'right', clientX, clientY)) {
        setPanelLayout((prev) => dockPanel(prev, panelId, 'right'));
        return;
      }

      if (clientX - bounds.left <= DOCK_EDGE_ZONE_PX) {
        setPanelLayout((prev) => dockPanel(prev, panelId, 'left'));
        return;
      }
      if (bounds.right - clientX <= DOCK_EDGE_ZONE_PX) {
        setPanelLayout((prev) => dockPanel(prev, panelId, 'right'));
      }
    },
    [pointerInDockShell]
  );

  const makeFloatDragEnd = useCallback(
    (panelId: PanelId) =>
      (payload: {
        clientX: number;
        clientY: number;
        panelX: number;
        panelY: number;
      }) => {
        commitFloatPanelAtDockZones(panelId, payload.clientX, payload.clientY);
      },
    [commitFloatPanelAtDockZones]
  );

  const handleUndockAt = useCallback(
    (panelId: PanelId, clientX: number, clientY: number) => {
      const el = canvasAreaRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      setPanelLayout((prev) => {
        const w =
          prev[panelId].width ??
          (panelId === 'assets' ? getAssetsPanelWidth(4) : PANEL_WIDTH_WIDE);
        const header = 44;
        let x = clientX - bounds.left - w / 2;
        let y = clientY - bounds.top - header / 2;
        x = Math.max(0, Math.min(x, bounds.width - w));
        y = Math.max(0, Math.min(y, bounds.height - 100));
        return floatPanel(prev, panelId, {
          x,
          y,
          width: prev[panelId].width,
          height: prev[panelId].height,
        });
      });
      bringPanelToFront(panelId);
    },
    [bringPanelToFront]
  );

  /** While pointer is still down after dock undock — keep float panel under cursor. */
  const handleUndockDrag = useCallback(
    (panelId: PanelId, clientX: number, clientY: number) => {
      updateDockDropTargetFromPointer(clientX, clientY);
      const el = canvasAreaRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      setPanelLayout((prev) => {
        const p = prev[panelId];
        const w =
          p.width ??
          (panelId === 'assets' ? getAssetsPanelWidth(4) : PANEL_WIDTH_WIDE);
        const header = 44;
        let x = clientX - bounds.left - w / 2;
        let y = clientY - bounds.top - header / 2;
        x = Math.max(0, Math.min(x, bounds.width - w));
        y = Math.max(0, Math.min(y, bounds.height - 100));
        return { ...prev, [panelId]: { ...p, x, y } };
      });
    },
    [updateDockDropTargetFromPointer]
  );

  useEffect(() => {
    if (safeState.selection?.selectedBuildingId) return;
    setPanelLayout((prev) => {
      if (prev.buildingSkin.placement === 'float') return prev;
      return floatPanel(prev, 'buildingSkin', {
        x: prev.buildingSkin.x,
        y: prev.buildingSkin.y,
        width: prev.buildingSkin.width,
        height: prev.buildingSkin.height,
      });
    });
  }, [safeState.selection?.selectedBuildingId]);

  const filterDockIds = useCallback(
    (ids: PanelId[]) =>
      ids.filter((id) => {
        if (!panelLayout[id].visible) return false;
        if (id === 'buildingSkin' && !safeState.selection?.selectedBuildingId) return false;
        if (id === 'importPlan' && !layoutImport) return false;
        return true;
      }),
    [panelLayout, safeState.selection?.selectedBuildingId, layoutImport]
  );

  const leftDockIds = useMemo(
    () => filterDockIds(panelLayout.docks.left.panelIds),
    [panelLayout.docks.left.panelIds, filterDockIds]
  );
  const rightDockIds = useMemo(
    () => filterDockIds(panelLayout.docks.right.panelIds),
    [panelLayout.docks.right.panelIds, filterDockIds]
  );

  const leftDockActive: PanelId | null = useMemo(() => {
    const a = panelLayout.docks.left.activeId;
    if (a && leftDockIds.includes(a)) return a;
    return leftDockIds[0] ?? null;
  }, [panelLayout.docks.left.activeId, leftDockIds]);

  const rightDockActive: PanelId | null = useMemo(() => {
    const a = panelLayout.docks.right.activeId;
    if (a && rightDockIds.includes(a)) return a;
    return rightDockIds[0] ?? null;
  }, [panelLayout.docks.right.activeId, rightDockIds]);

  const dockAssetsInnerWidth = (side: 'left' | 'right') => {
    const d = panelLayout.docks[side];
    if (!d.expanded) return getAssetsPanelWidth(4);
    return Math.max(200, d.widthPx - DOCK_STACK_WIDTH_PX - 24);
  };

  const renderPanelBody = (id: PanelId, assetsInnerWidth?: number): React.ReactNode => {
    const assetsW =
      assetsInnerWidth ??
      assetsResizeWidth ??
      panelLayout.assets.width ??
      getAssetsPanelWidth(4);
    const assetColumns = Math.max(
      2,
      Math.round((assetsW - PANEL_PADDING + ASSET_GRID_GAP) / ASSET_COLUMN_WIDTH)
    );

    switch (id) {
      case 'tools':
        return (
          <ToolboxPanel
            activeTool={safeState.activeTool}
            onToolChange={handleToolChange}
            selectionFilter={selectionFilter}
            onFilterChange={handleSelectionFilterChange}
          />
        );
      case 'assets':
        return (
          <AssetBrowserPanel
            assets={availableAssets}
            activeAssetId={safeState.activeAssetId}
            onSelectAsset={handleSelectAsset}
            columns={assetColumns}
          />
        );
      case 'view':
        return (
          <ViewControlsPanel
            cameraMode={safeState.camera.mode}
            isometricAngle={safeState.camera.isometricAngle}
            showGrid={safeState.ui.showGrid}
            showCallouts={showCallouts}
            onCameraModeChange={handleCameraModeChange}
            onRotateIsometric={handleRotateIsometric}
            onToggleGrid={handleToggleGrid}
            onToggleCallouts={handleToggleCallouts}
            onResetCamera={handleResetCamera}
            hasImportPlan={!!layoutImport}
            showImportPlan={panelLayout.importPlan.visible}
            onToggleImportPlan={toggleImportPlanPanel}
          />
        );
      case 'importPlan':
        if (!layoutImport || !currentFacilityId) return null;
        return (
          <ImportPlanPanelContent
            facilityId={currentFacilityId}
            layoutImport={layoutImport}
            width={assetsInnerWidth ?? panelLayout.importPlan.width ?? 360}
            height={panelLayout.importPlan.height ?? 320}
            selectedIds={importPlanSelectedIds}
            getUnitColor={getImportPlanUnitColor}
            isUnitDimmed={isImportPlanUnitDimmed}
            onSelectUnit={handleImportPlanUnitSelect}
          />
        );
      case 'defaultCamera':
        return (
          <DefaultCameraPanel
            hasDefault={engine?.hasDefaultCamera() ?? false}
            summary={defaultCameraSummary}
            onSetFromCurrentView={handleSetDefaultCamera}
            onGoToDefault={() => engine?.restoreDefaultCamera(true)}
            onClearDefault={handleClearDefaultCamera}
          />
        );
      case 'properties':
        return (
          <PropertiesPanel
            selectedObjects={selectedObjects}
            onDelete={handleDeleteSelection}
            onDuplicate={handleDuplicateSelection}
            onRotate={handleRotateSelection}
            onUpdateProperty={handleUpdateProperty}
            onRename={(rid, newName) => engine?.renameObject(rid, newName)}
            onUpdateBinding={handleUpdateBinding}
            onUpdateSkin={handleUpdateSkin}
            onSimulateState={handleSimulateState}
            dataSourceFacilityId={dataSourceConfig.facilityId}
            availableSkins={
              selectedObjects.length > 0 && selectedObjects[0]?.assetId
                ? engine
                    ?.getSkinManager()
                    ?.getSkins(selectedObjects[0].assetMetadata.category)
                    .map((skin) => ({
                      id: skin.id,
                      name: skin.name,
                      assetId: selectedObjects[0].assetId,
                    })) ?? []
                : []
            }
          />
        );
      case 'buildingSkin':
        return (
          <BuildingSkinPanel
            building={
              safeState.buildings?.find((b) => b.id === safeState.selection?.selectedBuildingId) ?? null
            }
            onSkinChange={handleBuildingSkinChange}
            onRename={(buildingId, newName) => engine?.renameBuilding(buildingId, newName)}
            onDelete={(buildingId) => {
              engine?.deleteBuildingWithContents(buildingId);
              if (engine) {
                engine.getSelectionManager()?.clearSelection();
              }
            }}
          />
        );
      case 'floors':
        return (
          <FloorsPanel
            currentFloor={safeState.activeFloor ?? 0}
            availableFloors={engine?.getFloorManager()?.getAvailableFloors() ?? [0]}
            isFullBuildingView={!safeState.isFloorMode}
            fullViewOpacity={fullViewOpacity}
            hasBuildings={(safeState.buildings?.length ?? 0) > 0}
            onFloorChange={(floor) => engine?.setFloor(floor)}
            onAddFloorAbove={(copyFromCurrent?: boolean) =>
              engine?.addFloor(
                (safeState.activeFloor ?? 0) + 1,
                copyFromCurrent ? (safeState.activeFloor ?? 0) : undefined
              )
            }
            onAddFloorBelow={(copyFromCurrent?: boolean) =>
              engine?.addFloor(
                (safeState.activeFloor ?? 0) - 1,
                copyFromCurrent ? (safeState.activeFloor ?? 0) : undefined
              )
            }
            onToggleFullView={() => engine?.toggleFullBuildingView()}
            onFullViewOpacityChange={(opacity) => {
              setFullViewOpacity(opacity);
              engine?.getFloorManager()?.setGhostingConfig({ fullBuildingViewOpacity: opacity });
              if (!safeState.isFloorMode) {
                engine?.getFloorManager()?.applyFullBuildingGhosting();
              }
            }}
            onDeleteFloor={(floor) => engine?.deleteFloor(floor)}
            onInsertFloor={(atLevel) => engine?.insertFloor(atLevel)}
          />
        );
      case 'skins':
        return (
          <ThemeSelectorPanel
            activeThemeId={activeThemeId}
            onSelectTheme={handleThemeChange}
            onCreateTheme={() => {
              window.open('/bludesign/assets?tab=themes', '_blank');
            }}
          />
        );
      case 'datasource':
        return (
          <DataSourcePanel
            config={dataSourceConfig}
            onConfigChange={handleDataSourceChange}
            onSimulationModeChange={handleSimulationModeChange}
            simulationMode={simulationMode}
          />
        );
      case 'smartobjects':
        return (
          <SmartObjectsPanel
            objects={engine?.getSceneManager()?.getAllPlacedObjects() ?? []}
            buildings={safeState.buildings ?? []}
            selectedIds={safeState.selection.selectedIds}
            selectedBuildingId={safeState.selection.selectedBuildingId ?? null}
            onSelectObject={(objectId) => {
              engine?.getSelectionManager()?.clearSelection();
              engine?.getSelectionManager()?.select(objectId);
            }}
            onSelectBuilding={(buildingId) => {
              engine?.selectBuilding(buildingId);
            }}
            onFocusObject={(objectId, floor) => {
              engine?.focusOnObject(objectId, floor);
            }}
            onFocusBuilding={(buildingId) => {
              engine?.focusOnBuilding(buildingId);
            }}
          />
        );
      default:
        return null;
    }
  };

  const dockTabMeta = (id: PanelId): { title: string; icon?: React.ReactNode } => {
    switch (id) {
      case 'tools':
        return { title: 'Tools', icon: <CursorArrowRaysIcon className="w-4 h-4" /> };
      case 'assets':
        return { title: 'Assets', icon: <CubeIcon className="w-4 h-4" /> };
      case 'view':
        return { title: 'View', icon: <EyeIcon className="w-4 h-4" /> };
      case 'defaultCamera':
        return { title: 'Default Camera', icon: <VideoCameraIcon className="w-4 h-4" /> };
      case 'importPlan':
        return { title: 'Import Plan', icon: <PhotoIcon className="w-4 h-4" /> };
      case 'properties':
        return { title: 'Properties', icon: <AdjustmentsHorizontalIcon className="w-4 h-4" /> };
      case 'buildingSkin':
        return { title: 'Building Style', icon: <BuildingOffice2Icon className="w-4 h-4" /> };
      case 'floors':
        return { title: 'Floors', icon: <RectangleStackIcon className="w-4 h-4" /> };
      case 'skins':
        return { title: 'Scene Theme', icon: <SwatchIcon className="w-4 h-4" /> };
      case 'datasource':
        return { title: 'Data Source', icon: <ServerIcon className="w-4 h-4" /> };
      case 'smartobjects':
        return { title: 'Smart Objects', icon: <CpuChipIcon className="w-4 h-4" /> };
      default:
        return { title: id };
    }
  };

  const buildDockTabs = (ids: PanelId[]): DockTabItem[] =>
    ids.map((pid) => {
      const m = dockTabMeta(pid);
      return {
        id: pid,
        title: m.title,
        icon: m.icon,
        visible: true,
      };
    });

  return (
    <div className={`relative w-full h-full flex flex-col ${className} ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      {/* Menu Bar */}
      <MenuBar
        currentFacilityName={currentFacilityName}
        hasUnsavedChanges={hasUnsavedChanges}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onLoad={handleLoad}
        onUndo={useCallback(() => engine?.undo(), [engine])}
        onRedo={useCallback(() => engine?.redo(), [engine])}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDeleteSelection}
        onSelectAll={handleSelectAll}
        canUndo={canUndo}
        canRedo={canRedo}
        hasSelection={(safeState.selection?.selectedIds?.length ?? 0) > 0}
        hasClipboard={hasClipboard}
        onSaveLayoutAsDefault={saveLayoutAsDefault}
        onResetPanels={() => { resetLayout(); showAllPanels(); }}
        onShowAbout={() => setAboutOpen(true)}
        onShowSelectionControls={() => setHelpOpen(true)}
        aboutInfo={aboutInfo}
        panelVisibility={{
          tools: panelLayout.tools?.visible ?? true,
          assets: panelLayout.assets?.visible ?? true,
          smartobjects: panelLayout.smartobjects?.visible ?? true,
          view: panelLayout.view?.visible ?? true,
          defaultCamera: panelLayout.defaultCamera?.visible ?? false,
          properties: panelLayout.properties?.visible ?? true,
          floors: panelLayout.floors?.visible ?? true,
          skins: panelLayout.skins?.visible ?? true,
          datasource: panelLayout.datasource?.visible ?? false,
          buildingSkin: panelLayout.buildingSkin?.visible ?? true,
        }}
        onTogglePanelVisibility={(panel) =>
          togglePanelVisibility(panel as keyof Omit<PanelLayoutState, 'docks'>)
        }
        onOpenPreferences={() => setPreferencesOpen(true)}
      />

      {/* Main Canvas Area - bounds for floating panels */}
      <div 
        ref={canvasAreaRef}
        className="flex-1 min-h-0 relative overflow-hidden"
      >
        {/* 3D Canvas Background */}
        <div
          className="absolute inset-0"
          style={{ background: canvasBackground }}
        >
          {/* Three.js Canvas Container */}
          <div 
            ref={containerRef} 
            className="absolute inset-0" 
            style={{ touchAction: 'none' }} 
          />
        </div>

        {/* Progress Overlay - show during time-consuming operations (batch placement, optimization) */}
        {progressState && (
          <ProgressOverlay progress={progressState} />
        )}
        
        {/* Loading Overlay - show during engine init OR during initial data loading (including draft check) */}
        <LoadingOverlay 
          isVisible={isLoading || (isReady && !initialLoadComplete)} 
          progress={isLoading ? loadingProgress : { 
            percentage: loadingState.progress,
            phase: loadingState.type === 'none' ? 'complete' : 'creating',
            message: loadingState.subtitle,
          }} 
          title={
            isLoading 
              ? "BluDesign" 
              : loadingState.type === 'draft' 
                ? "Restoring Draft"
                : loadingState.type === 'facility'
                  ? "BluDesign"
                  : "BluDesign"
          }
        />
        
        {/* Selection Overlay - for drag selection box only (3D highlights are in the engine) */}
        {isReady && initialLoadComplete && (
          <SelectionOverlay
            isActive={true}
            selectionBox={
              // Show selection box for tools that support drag selection
              (safeState.activeTool === EditorTool.SELECT || 
               safeState.activeTool === EditorTool.SELECT_BUILDING)
                ? selectionBox 
                : null
            }
            containerWidth={canvasAreaRef.current?.offsetWidth ?? 0}
            containerHeight={canvasAreaRef.current?.offsetHeight ?? 0}
          />
        )}

        {/* Dock drop hints + dock regions + floating panels */}
        {isReady && initialLoadComplete && (
          <>
            {dockDropTarget && (
              <div
                className="pointer-events-none absolute inset-0 z-[55]"
                aria-hidden
              >
                {dockDropTarget === 'left' && !panelLayout.docks.left.expanded && (
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-primary-500/20"
                    style={{ width: DOCK_EDGE_ZONE_PX }}
                  />
                )}
                {dockDropTarget === 'right' && !panelLayout.docks.right.expanded && (
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-primary-500/20"
                    style={{ width: DOCK_EDGE_ZONE_PX }}
                  />
                )}
              </div>
            )}

            {leftDockIds.length === 0 && (
              <div
                data-bludesign-dock="true"
                data-bludesign-dock-side="left"
                data-bludesign-dock-empty="true"
                className="pointer-events-none absolute top-0 bottom-0 left-0 z-[34]"
                style={{ width: DOCK_EDGE_ZONE_PX }}
                aria-hidden
              />
            )}
            {rightDockIds.length === 0 && (
              <div
                data-bludesign-dock="true"
                data-bludesign-dock-side="right"
                data-bludesign-dock-empty="true"
                className="pointer-events-none absolute top-0 bottom-0 right-0 z-[34]"
                style={{ width: DOCK_EDGE_ZONE_PX }}
                aria-hidden
              />
            )}

            {leftDockIds.length > 0 && leftDockActive && (
              <DockRegion
                side="left"
                dock={panelLayout.docks.left}
                dropHighlight={dockDropTarget === 'left'}
                tabs={buildDockTabs(leftDockIds)}
                activeId={leftDockActive}
                onSelect={(pid) =>
                  setPanelLayout((prev) => {
                    let next = prev;
                    if (!prev.docks.left.expanded) {
                      next = setDockExpanded(next, 'left', true);
                    }
                    return setDockActive(next, 'left', pid);
                  })
                }
                onToggleExpanded={() =>
                  setPanelLayout((prev) =>
                    setDockExpanded(prev, 'left', !prev.docks.left.expanded)
                  )
                }
                onResizeWidth={(w) =>
                  setPanelLayout((prev) => setDockWidth(prev, 'left', w))
                }
                onUndockAt={handleUndockAt}
                onUndockDrag={handleUndockDrag}
                onUndockGestureEnd={commitFloatPanelAtDockZones}
                onReorder={(from, to) =>
                  setPanelLayout((prev) => reorderDockPanelIds(prev, 'left', from, to))
                }
                zIndex={36}
              >
                {renderPanelBody(
                  leftDockActive,
                  leftDockActive === 'assets' ? dockAssetsInnerWidth('left') : undefined
                )}
              </DockRegion>
            )}

            {rightDockIds.length > 0 && rightDockActive && (
              <DockRegion
                side="right"
                dock={panelLayout.docks.right}
                dropHighlight={dockDropTarget === 'right'}
                tabs={buildDockTabs(rightDockIds)}
                activeId={rightDockActive}
                onSelect={(pid) =>
                  setPanelLayout((prev) => {
                    let next = prev;
                    if (!prev.docks.right.expanded) {
                      next = setDockExpanded(next, 'right', true);
                    }
                    return setDockActive(next, 'right', pid);
                  })
                }
                onToggleExpanded={() =>
                  setPanelLayout((prev) =>
                    setDockExpanded(prev, 'right', !prev.docks.right.expanded)
                  )
                }
                onResizeWidth={(w) =>
                  setPanelLayout((prev) => setDockWidth(prev, 'right', w))
                }
                onUndockAt={handleUndockAt}
                onUndockDrag={handleUndockDrag}
                onUndockGestureEnd={commitFloatPanelAtDockZones}
                onReorder={(from, to) =>
                  setPanelLayout((prev) => reorderDockPanelIds(prev, 'right', from, to))
                }
                zIndex={36}
              >
                {renderPanelBody(
                  rightDockActive,
                  rightDockActive === 'assets' ? dockAssetsInnerWidth('right') : undefined
                )}
              </DockRegion>
            )}

            {panelLayout.tools?.visible && panelLayout.tools.placement === 'float' && (
              <FloatingPanel
                key={`tools-${panelLayout.tools?.x ?? 0}-${panelLayout.tools?.y ?? 0}`}
                id="tools"
                title="Tools"
                icon={<CursorArrowRaysIcon className="w-4 h-4" />}
                position={panelLayout.tools ?? getDefaultLayout(0).tools}
                anchor="top-left"
                defaultWidth={180}
                maxHeight={400}
                zIndex={getPanelZIndex('tools')}
                boundsRef={canvasAreaRef}
                onBringToFront={() => bringPanelToFront('tools')}
                closable={true}
                onStateChange={(updates) => updatePanelState('tools', updates)}
                onClose={() => togglePanelVisibility('tools', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('tools')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('tools')}
              </FloatingPanel>
            )}

            {panelLayout.assets?.visible && panelLayout.assets.placement === 'float' && (
              <FloatingPanel
                key={`assets-${panelLayout.assets?.x ?? 0}-${panelLayout.assets?.y ?? 0}`}
                id="assets"
                title="Assets"
                icon={<CubeIcon className="w-4 h-4" />}
                position={panelLayout.assets ?? getDefaultLayout(0).assets}
                anchor="left"
                defaultWidth={getAssetsPanelWidth(4)}
                minWidth={getAssetsPanelWidth(2)}
                maxWidth={getAssetsPanelWidth(6)}
                defaultHeight={400}
                minHeight={200}
                maxHeight={700}
                zIndex={getPanelZIndex('assets')}
                onBringToFront={() => bringPanelToFront('assets')}
                resizable={true}
                resizableHeight={true}
                resizeSnapWidth={ASSET_COLUMN_WIDTH + 6}
                boundsRef={canvasAreaRef}
                closable={true}
                onStateChange={(updates) => updatePanelState('assets', updates)}
                onResizing={(width) => setAssetsResizeWidth(width)}
                onClose={() => togglePanelVisibility('assets', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('assets')}
                dockHoverTarget={dockDropTarget}
              >
                {() => {
                  const currentWidth =
                    assetsResizeWidth ?? (panelLayout.assets?.width ?? getAssetsPanelWidth(4));
                  const columns = Math.max(
                    2,
                    Math.round((currentWidth - PANEL_PADDING + ASSET_GRID_GAP) / ASSET_COLUMN_WIDTH)
                  );
                  return (
                    <AssetBrowserPanel
                      assets={availableAssets}
                      activeAssetId={safeState.activeAssetId}
                      onSelectAsset={handleSelectAsset}
                      columns={columns}
                    />
                  );
                }}
              </FloatingPanel>
            )}

            {panelLayout.view?.visible && panelLayout.view.placement === 'float' && (
              <FloatingPanel
                key={`view-${panelLayout.view?.x ?? 0}-${panelLayout.view?.y ?? 0}`}
                id="view"
                title="View"
                icon={<EyeIcon className="w-4 h-4" />}
                position={panelLayout.view ?? getDefaultLayout(0).view}
                anchor="top-right"
                defaultWidth={200}
                maxHeight={350}
                zIndex={getPanelZIndex('view')}
                boundsRef={canvasAreaRef}
                onBringToFront={() => bringPanelToFront('view')}
                closable={true}
                onStateChange={(updates) => updatePanelState('view', updates)}
                onClose={() => togglePanelVisibility('view', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('view')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('view')}
              </FloatingPanel>
            )}

            {panelLayout.defaultCamera?.visible && panelLayout.defaultCamera.placement === 'float' && (
              <FloatingPanel
                key={`defaultCamera-${panelLayout.defaultCamera?.x ?? 0}-${panelLayout.defaultCamera?.y ?? 0}`}
                id="defaultCamera"
                title="Default Camera"
                icon={<VideoCameraIcon className="w-4 h-4" />}
                position={panelLayout.defaultCamera ?? getDefaultLayout(0).defaultCamera}
                anchor="top-right"
                defaultWidth={240}
                maxHeight={420}
                zIndex={getPanelZIndex('defaultCamera')}
                boundsRef={canvasAreaRef}
                onBringToFront={() => bringPanelToFront('defaultCamera')}
                closable={true}
                onStateChange={(updates) => updatePanelState('defaultCamera', updates)}
                onClose={() => togglePanelVisibility('defaultCamera', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('defaultCamera')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('defaultCamera')}
              </FloatingPanel>
            )}

            {panelLayout.properties?.visible && panelLayout.properties.placement === 'float' && (
              <FloatingPanel
                key={`properties-${panelLayout.properties?.x ?? 0}-${panelLayout.properties?.y ?? 0}`}
                id="properties"
                title="Properties"
                icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />}
                position={panelLayout.properties ?? getDefaultLayout(0).properties}
                anchor="right"
                defaultWidth={260}
                maxHeight={400}
                zIndex={getPanelZIndex('properties')}
                boundsRef={canvasAreaRef}
                onBringToFront={() => bringPanelToFront('properties')}
                closable={true}
                onStateChange={(updates) => updatePanelState('properties', updates)}
                onClose={() => togglePanelVisibility('properties', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('properties')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('properties')}
              </FloatingPanel>
            )}

            {safeState.selection?.selectedBuildingId &&
              panelLayout.buildingSkin.placement === 'float' && (
                <FloatingPanel
                  key={`building-skin-${panelLayout.buildingSkin?.x ?? 0}-${panelLayout.buildingSkin?.y ?? 0}`}
                  id="building-skin"
                  title="Building Style"
                  position={panelLayout.buildingSkin ?? getDefaultLayout(0).buildingSkin}
                  anchor="right"
                  defaultWidth={240}
                  maxHeight={400}
                  zIndex={getPanelZIndex('buildingSkin')}
                  boundsRef={canvasAreaRef}
                  closable={true}
                  onBringToFront={() => bringPanelToFront('buildingSkin')}
                  onStateChange={(updates) => updatePanelState('buildingSkin', updates)}
                  onClose={() => {
                    engine?.getSelectionManager()?.clearSelection();
                  }}
                  onDragMove={handleFloatingPanelDragMove}
                  onDragEnd={makeFloatDragEnd('buildingSkin')}
                  dockHoverTarget={dockDropTarget}
                >
                  {renderPanelBody('buildingSkin')}
                </FloatingPanel>
              )}

            {panelLayout.floors?.visible && panelLayout.floors.placement === 'float' && (
              <FloatingPanel
                key={`floors-${panelLayout.floors?.x ?? 0}-${panelLayout.floors?.y ?? 0}`}
                id="floors"
                title="Floors"
                position={panelLayout.floors ?? getDefaultLayout(0).floors}
                anchor="right"
                defaultWidth={220}
                defaultHeight={300}
                minHeight={180}
                maxHeight={500}
                zIndex={getPanelZIndex('floors')}
                boundsRef={canvasAreaRef}
                resizableHeight={true}
                closable={true}
                onBringToFront={() => bringPanelToFront('floors')}
                onStateChange={(updates) => updatePanelState('floors', updates)}
                onClose={() => togglePanelVisibility('floors', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('floors')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('floors')}
              </FloatingPanel>
            )}

            {panelLayout.skins?.visible && panelLayout.skins.placement === 'float' && (
              <FloatingPanel
                key={`themes-${panelLayout.skins?.x ?? 0}-${panelLayout.skins?.y ?? 0}`}
                id="themes"
                title="Scene Theme"
                position={panelLayout.skins ?? getDefaultLayout(0).skins}
                anchor="left"
                defaultWidth={280}
                defaultHeight={350}
                minHeight={180}
                maxHeight={600}
                zIndex={getPanelZIndex('skins')}
                boundsRef={canvasAreaRef}
                resizableHeight={true}
                closable={true}
                onBringToFront={() => bringPanelToFront('skins')}
                onStateChange={(updates) => updatePanelState('skins', updates)}
                onClose={() => togglePanelVisibility('skins', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('skins')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('skins')}
              </FloatingPanel>
            )}

            {panelLayout.datasource?.visible && panelLayout.datasource.placement === 'float' && (
              <FloatingPanel
                key={`datasource-${panelLayout.datasource?.x ?? 0}-${panelLayout.datasource?.y ?? 0}`}
                id="datasource"
                title="Data Source"
                position={panelLayout.datasource ?? getDefaultLayout(0).datasource}
                anchor="right"
                defaultWidth={280}
                maxHeight={400}
                zIndex={getPanelZIndex('datasource')}
                boundsRef={canvasAreaRef}
                closable={true}
                onBringToFront={() => bringPanelToFront('datasource')}
                onStateChange={(updates) => updatePanelState('datasource', updates)}
                onClose={() => togglePanelVisibility('datasource', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('datasource')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('datasource')}
              </FloatingPanel>
            )}

            {panelLayout.smartobjects?.visible && panelLayout.smartobjects.placement === 'float' && (
              <FloatingPanel
                key={`smartobjects-${panelLayout.smartobjects?.x ?? 0}-${panelLayout.smartobjects?.y ?? 0}`}
                id="smartobjects"
                title="Smart Objects"
                icon={<CpuChipIcon className="w-4 h-4" />}
                position={panelLayout.smartobjects ?? getDefaultLayout(0).smartobjects}
                anchor="left"
                defaultWidth={240}
                defaultHeight={350}
                minHeight={180}
                maxHeight={600}
                zIndex={getPanelZIndex('smartobjects')}
                boundsRef={canvasAreaRef}
                onBringToFront={() => bringPanelToFront('smartobjects')}
                resizableHeight={true}
                closable={true}
                onStateChange={(updates) => updatePanelState('smartobjects', updates)}
                onClose={() => togglePanelVisibility('smartobjects', false)}
                onDragMove={handleFloatingPanelDragMove}
                onDragEnd={makeFloatDragEnd('smartobjects')}
                dockHoverTarget={dockDropTarget}
              >
                {renderPanelBody('smartobjects')}
              </FloatingPanel>
            )}

            {layoutImport &&
              currentFacilityId &&
              panelLayout.importPlan?.visible &&
              panelLayout.importPlan.placement === 'float' && (
                <FloatingPanel
                  key={`importPlan-${panelLayout.importPlan?.x ?? 0}-${panelLayout.importPlan?.y ?? 0}`}
                  id="importPlan"
                  title="Import Plan"
                  icon={<PhotoIcon className="w-4 h-4" />}
                  position={panelLayout.importPlan ?? getDefaultLayout(0).importPlan}
                  anchor="bottom-left"
                  defaultWidth={360}
                  minWidth={240}
                  maxWidth={720}
                  defaultHeight={320}
                  minHeight={200}
                  maxHeight={600}
                  resizable
                  resizableHeight
                  zIndex={getPanelZIndex('importPlan')}
                  boundsRef={canvasAreaRef}
                  onBringToFront={() => bringPanelToFront('importPlan')}
                  closable
                  onStateChange={(updates) => updatePanelState('importPlan', updates)}
                  onClose={() => togglePanelVisibility('importPlan', false)}
                  onDragMove={handleFloatingPanelDragMove}
                  onDragEnd={makeFloatDragEnd('importPlan')}
                  dockHoverTarget={dockDropTarget}
                >
                  {(width, height) => (
                    <ImportPlanPanelContent
                      facilityId={currentFacilityId}
                      layoutImport={layoutImport}
                      width={width}
                      height={height ?? 320}
                      selectedIds={importPlanSelectedIds}
                      getUnitColor={getImportPlanUnitColor}
                      isUnitDimmed={isImportPlanUnitDimmed}
                      onSelectUnit={handleImportPlanUnitSelect}
                    />
                  )}
                </FloatingPanel>
              )}
          </>
        )}

        {/* Camera Orbit Controls - bottom center */}
        {isReady && initialLoadComplete && (
          <div 
            data-ui-element="true"
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30`}
          >
            <div className={`
              flex items-center gap-1 p-1.5 rounded-xl backdrop-blur-md shadow-xl border
              ${isDark 
                ? 'bg-gray-900/95 border-gray-700/60' 
                : 'bg-white/95 border-gray-200/80'
              }
            `}>
              {/* Rotate Left Button (Counter-Clockwise) */}
              <button
                onClick={() => engine?.rotateCameraView('ccw')}
                className={`
                  group relative flex items-center justify-center w-10 h-10 rounded-lg
                  transition-all duration-200 ease-out
                  ${isDark 
                    ? 'bg-gray-800 hover:bg-primary-600 text-gray-300 hover:text-white border border-gray-700 hover:border-primary-500' 
                    : 'bg-gray-50 hover:bg-primary-500 text-gray-600 hover:text-white border border-gray-200 hover:border-primary-400'
                  }
                  hover:scale-105 hover:shadow-lg active:scale-95
                `}
                title="Rotate View Left (Ctrl+←)"
              >
                <svg 
                  className="w-5 h-5 transition-transform group-hover:-rotate-45" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v4M3 10l4 4M3 10l4-4" />
                </svg>
              </button>
              
              {/* Divider */}
              <div className={`w-px h-6 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
              
              {/* Rotate Right Button (Clockwise) */}
              <button
                onClick={() => engine?.rotateCameraView('cw')}
                className={`
                  group relative flex items-center justify-center w-10 h-10 rounded-lg
                  transition-all duration-200 ease-out
                  ${isDark 
                    ? 'bg-gray-800 hover:bg-primary-600 text-gray-300 hover:text-white border border-gray-700 hover:border-primary-500' 
                    : 'bg-gray-50 hover:bg-primary-500 text-gray-600 hover:text-white border border-gray-200 hover:border-primary-400'
                  }
                  hover:scale-105 hover:shadow-lg active:scale-95
                `}
                title="Rotate View Right (Ctrl+→)"
              >
                <svg 
                  className="w-5 h-5 transition-transform group-hover:rotate-45" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v4M21 10l-4 4M21 10l-4-4" />
                </svg>
              </button>

              <div className={`w-px h-6 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />

              <button
                type="button"
                onClick={handleResetCamera}
                className={`
                  group relative flex items-center justify-center w-10 h-10 rounded-lg
                  transition-all duration-200 ease-out
                  ${isDark
                    ? 'bg-gray-800 hover:bg-primary-600 text-gray-300 hover:text-white border border-gray-700 hover:border-primary-500'
                    : 'bg-gray-50 hover:bg-primary-500 text-gray-600 hover:text-white border border-gray-200 hover:border-primary-400'
                  }
                  hover:scale-105 hover:shadow-lg active:scale-95
                `}
                title={
                  engine?.hasDefaultCamera()
                    ? 'Reset view to default camera'
                    : 'Reset view (set a default camera to customize)'
                }
              >
                <ArrowsPointingOutIcon className="w-5 h-5" />
              </button>

              {!readonly && (
                <>
                  <div className={`w-px h-6 mx-1 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
                  <button
                    type="button"
                    title={
                      safeState.ui.gridAlignment
                        ? 'Turn off aligned grid — restore world axes (Ctrl+Alt+R)'
                        : 'Align snap grid to selected object — select one object first (Ctrl+Alt+A)'
                    }
                    aria-label={
                      safeState.ui.gridAlignment
                        ? 'Reset placement grid to world axes'
                        : 'Align placement grid to selected object'
                    }
                    aria-pressed={!!safeState.ui.gridAlignment}
                    onClick={() => {
                      if (!engine) return;
                      if (safeState.ui.gridAlignment) {
                        engine.resetGridAlignment();
                        return;
                      }
                      const ok = engine.alignGridToSelection();
                      if (!ok) {
                        addToast({
                          type: 'info',
                          title: 'Align grid',
                          message: 'Select a single object on this floor, then try again.',
                        });
                      }
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200 ease-out ${
                      safeState.ui.gridAlignment
                        ? isDark
                          ? 'border-[#147fd4] bg-[#147fd4]/25 text-[#6ec3ff] ring-1 ring-[#147fd4]/40'
                          : 'border-[#147fd4] bg-[#147fd4]/12 text-[#0b5fa8] ring-1 ring-[#147fd4]/30'
                        : isDark
                          ? 'border-gray-700 bg-gray-800 text-gray-300 hover:border-primary-500 hover:bg-primary-600/20'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:bg-primary-500/10'
                    } hover:scale-105 hover:shadow-lg active:scale-95`}
                  >
                    <Squares2X2Icon className="h-5 w-5" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>

      <EditorHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* About modal */}
      {aboutOpen && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/60"
          style={{ zIndex: 100000 }}
          onClick={() => setAboutOpen(false)}
        >
          <div 
            className={`rounded-lg shadow-2xl border w-[320px] ${
              isDark 
                ? 'bg-gray-900 text-gray-100 border-gray-700' 
                : 'bg-white text-gray-900 border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-4 py-3 border-b flex items-center justify-between ${
              isDark ? 'border-gray-800' : 'border-gray-200'
            }`}>
              <div className="text-sm font-semibold">About BluDesign</div>
              <button
                className={`transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setAboutOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {aboutInfo.map((info) => (
                <div key={info.label} className="flex justify-between">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{info.label}</span>
                  <span className={isDark ? 'text-gray-200' : 'text-gray-700'}>{info.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      <SaveDialog
        isOpen={showSaveDialog}
        currentName={currentFacilityName || undefined}
        thumbnail={engine ? undefined : undefined} // Will be captured on save
        onSave={handleSaveDialogSave}
        onCancel={() => setShowSaveDialog(false)}
      />

      {/* Load Dialog */}
      <LoadDialog
        isOpen={showLoadDialog}
        onLoad={handleLoadDialogLoad}
        onCancel={() => setShowLoadDialog(false)}
      />

      {/* Draft Recovery Dialog - Renders on top of loading overlay */}
      {showDraftRecoveryDialog && (
        <div 
          className="fixed inset-0 z-[10001] flex items-center justify-center"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {/* Semi-transparent backdrop overlay */}
          <div className="absolute inset-0 bg-black/30" />
          
          {/* Dialog card */}
          <div 
            className={`
              relative w-full max-w-md mx-4 rounded-2xl shadow-2xl overflow-hidden
              ${isDark 
                ? 'bg-gray-800/95 border border-gray-600/50 backdrop-blur-lg' 
                : 'bg-white/95 border border-gray-200/80 backdrop-blur-lg'
              }
            `}
            style={{ animation: 'slideUp 0.3s ease-out' }}
          >
            {/* Header with icon */}
            <div className={`px-6 py-5 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center
                  ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}
                `}>
                  <svg className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Unsaved Work Found
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {draftTimestamp ? new Date(draftTimestamp).toLocaleString() : 'Previous session'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="px-6 py-5">
              <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                We found an auto-saved draft from your previous session. Would you like to continue where you left off?
              </p>
            </div>
            
            {/* Actions */}
            <div className={`px-6 py-4 flex gap-3 justify-end ${isDark ? 'bg-gray-900/30' : 'bg-gray-50/50'}`}>
              <button
                onClick={handleDiscardDraft}
                className={`
                  px-5 py-2.5 text-sm font-medium rounded-lg transition-all
                  ${isDark 
                    ? 'text-gray-300 hover:bg-gray-700/50 hover:text-white' 
                    : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'
                  }
                `}
              >
                Start Fresh
              </button>
              <button
                onClick={handleRecoverDraft}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-all shadow-lg shadow-primary-600/20 hover:shadow-primary-500/30"
              >
                Recover Draft
              </button>
            </div>
          </div>
          
          {/* Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(20px) scale(0.95);
              }
              to { 
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>
        </div>
      )}

      {/* Preferences Dialog */}
      <PreferencesDialog
        isOpen={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onPreferencesChange={handlePreferencesChange}
      />

      {/* Performance Monitor */}
      <PerformanceMonitor engine={engine} />

      {/* Theme Missing Dialog */}
      <ThemeMissingDialog
        isOpen={showThemeMissingDialog}
        missingThemeId={missingThemeId || ''}
        onClose={() => {
          setShowThemeMissingDialog(false);
          setMissingThemeId(null);
        }}
      />
      <ConfirmDialog
        isOpen={showNewFacilityConfirm}
        title="Discard Unsaved Changes?"
        message="You have unsaved changes. Create a new facility anyway?"
        confirmLabel="Create New"
        confirmTone="danger"
        onCancel={() => setShowNewFacilityConfirm(false)}
        onConfirm={() => {
          setShowNewFacilityConfirm(false);
          executeNewFacility();
        }}
      />

      {/* Auto-save toast */}
      {autoSaveToast && (
        <div className="fixed bottom-4 right-4 z-[100000] animate-fade-in">
          <div className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
            isDark ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-200'
          }`}>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">Auto-saved</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorCanvas;
