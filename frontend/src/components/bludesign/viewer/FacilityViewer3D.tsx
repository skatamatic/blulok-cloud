/**
 * Facility Viewer 3D
 * 
 * Readonly 3D facility viewer component that can be used in widgets and the BluFMS page.
 * Loads and displays a BluDesign facility with real-time state updates via WebSocket.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBluDesignEngine } from '../hooks/useBluDesignEngine';
import { useViewerKeyboardShortcuts } from '../hooks/useViewerKeyboardShortcuts';
import { useTheme } from '@/contexts/ThemeContext';
import * as bludesignApi from '@/api/bludesign';
import { ViewerLoadingOverlay } from './ViewerLoadingOverlay';
import { ViewerFloorsPanel } from './ViewerFloorsPanel';
import { ViewerPropertiesPanel } from './ViewerPropertiesPanel';
import { ViewerSmartObjectsPanel } from './ViewerSmartObjectsPanel';
import { PerformanceMonitor } from '../ui/PerformanceMonitor';
import { shouldUseExpandedViewerChrome } from './viewer-layout.utils';
import { useFacilityViewerLiveState } from './useFacilityViewerLiveState';
import { type ViewerSmartAssetState } from './viewerLiveState';
import type { BluLokUnit } from '@/api/bludesign';
import {
  PlacedObject,
  DeviceState,
  Building,
  CameraMode,
} from '../core/types';
import {
  GroundPresetId,
  SkyPresetId,
  DEFAULT_SCENE_PRESETS,
  normalizeGroundPreset,
  normalizeSkyPreset,
  type EnvironmentOptions,
} from '../core/environment';
import { applyViewerViewPresets } from './applyViewerViewPresets';
import type { FacilityResponse } from '@/api/bludesign';

interface FacilityViewer3DProps {
  /** BluDesign facility ID to load */
  bluDesignFacilityId: string;
  /** BluLok facility ID for WebSocket subscriptions */
  bluLokFacilityId?: string;
  /** When provided, skips an initial facility fetch (e.g. from the widget). */
  prefetchedFacility?: FacilityResponse | null;
  /** Optional CSS class name */
  className?: string;
  /** When false, WebGL rendering pauses and a static snapshot is shown instead. */
  isRenderActive?: boolean;
  skyPreset?: SkyPresetId;
  groundPreset?: GroundPresetId;
  environmentOptions?: EnvironmentOptions;
  /** When false, units render in their default locked look (live binding visuals off). */
  bindingEffectsEnabled?: boolean;
  /** Callback when the viewer is ready */
  onReady?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

export const FacilityViewer3D: React.FC<FacilityViewer3DProps> = ({
  bluDesignFacilityId,
  bluLokFacilityId,
  prefetchedFacility,
  className = '',
  isRenderActive = true,
  skyPreset = DEFAULT_SCENE_PRESETS.skyPreset,
  groundPreset = DEFAULT_SCENE_PRESETS.groundPreset,
  environmentOptions,
  bindingEffectsEnabled = true,
  onReady,
  onError,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const selectedEntityIdRef = useRef<string | null>(null);
  
  // Container size for panel layout and sizing constraints
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerHeight = containerSize.height;
  const useExpandedChrome = shouldUseExpandedViewerChrome(
    containerSize.width,
    containerSize.height
  );
  
  // Loading states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Selected object state
  const [selectedObject, setSelectedObject] = useState<PlacedObject | null>(null);
  const [selectedObjectState, setSelectedObjectState] = useState<ViewerSmartAssetState | null>(null);
  const [unitsCatalog, setUnitsCatalog] = useState<Map<string, BluLokUnit>>(new Map());
  
  // Live states keyed by bound entity ID (unit or device UUID)
  const assetStatesRef = useRef<Map<string, ViewerSmartAssetState>>(new Map());
  const entityToObjectIdsRef = useRef<Map<string, string[]>>(new Map());
  const liveHydratedRef = useRef(false);
  const applyEngineUpdatesRef = useRef(true);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden
  );
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [engineAllowed, setEngineAllowed] = useState(isRenderActive);

  useEffect(() => {
    if (isRenderActive) setEngineAllowed(true);
  }, [isRenderActive]);

  const shouldRunEngine = isRenderActive && documentVisible;
  const showStaticPreview = !shouldRunEngine && snapshotUrl !== null;

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Initialize engine
  const {
    containerRef,
    engine,
    state,
    isReady: isEngineReady,
    pauseRendering,
    resumeRendering,
    captureSnapshot,
  } = useBluDesignEngine({
    readonly: true,
    enabled: engineAllowed,
    theme: effectiveTheme,
    onReady: () => {
      setLoadingProgress(40);
      setLoadingMessage('Engine ready...');
    },
  });

  // Pause WebGL while off-screen or tab hidden; show last frame as a still (no fade).
  useEffect(() => {
    if (!isEngineReady || !engine) return;

    applyEngineUpdatesRef.current = shouldRunEngine;

    if (shouldRunEngine) {
      setSnapshotUrl(null);
      resumeRendering();
      return;
    }

    if (engine.isRenderLoopRunning()) {
      const url = captureSnapshot();
      if (url) setSnapshotUrl(url);
      pauseRendering();
    }
  }, [
    shouldRunEngine,
    isEngineReady,
    engine,
    pauseRendering,
    resumeRendering,
    captureSnapshot,
  ]);

  // Reload scene when the bound BluDesign facility changes.
  useEffect(() => {
    setIsDataLoaded(false);
    setLoadError(null);
    setLoadingProgress(0);
    setLoadingMessage('Initializing...');
    setSelectedObject(null);
    setSelectedObjectState(null);
    setUnitsCatalog(new Map());
    assetStatesRef.current.clear();
    entityToObjectIdsRef.current.clear();
    liveHydratedRef.current = false;
  }, [bluDesignFacilityId]);

  useEffect(() => {
    assetStatesRef.current.clear();
    liveHydratedRef.current = false;
    setUnitsCatalog(new Map());
  }, [bluLokFacilityId]);

  // Safe state for rendering
  const safeState = useMemo(() => {
    if (state) return state;
    return {
      selection: { selectedIds: [] as string[], hoveredId: null, isMultiSelect: false, selectedBuildingId: null },
      buildings: [] as Building[],
      activeFloor: 0,
      isFloorMode: false,
    };
  }, [state]);

  const resolvedSkyPreset = normalizeSkyPreset(skyPreset);
  const resolvedGroundPreset = normalizeGroundPreset(groundPreset);
  const environmentOptionsRef = useRef(environmentOptions);
  environmentOptionsRef.current = environmentOptions;
  const viewPresetsRef = useRef({
    sky: resolvedSkyPreset,
    ground: resolvedGroundPreset,
  });
  viewPresetsRef.current = {
    sky: resolvedSkyPreset,
    ground: resolvedGroundPreset,
  };
  /** Skip one live preset apply after initial load (already applied with progress). */
  const skipNextLivePresetApplyRef = useRef(false);

  const applyViewPresets = useCallback(async () => {
    if (!engine || !isDataLoaded) return;
    if (skipNextLivePresetApplyRef.current) {
      skipNextLivePresetApplyRef.current = false;
      return;
    }
    await applyViewerViewPresets(
      engine,
      resolvedSkyPreset,
      resolvedGroundPreset,
      undefined,
      environmentOptionsRef.current
    );
  }, [engine, isDataLoaded, resolvedSkyPreset, resolvedGroundPreset, environmentOptions]);

  // Load facility data when engine is ready
  useEffect(() => {
    if (!isEngineReady || !engine || isDataLoaded) return;

    const loadFacility = async () => {
      try {
        setLoadingProgress(50);
        setLoadingMessage('Loading facility...');
        
        const facility =
          prefetchedFacility ?? (await bludesignApi.getFacility(bluDesignFacilityId));
        
        if (!facility || !facility.data) {
          throw new Error('Facility data not found');
        }

        setLoadingProgress(65);
        setLoadingMessage('Building scene...');

        engine.setEnvironmentSeed(bluDesignFacilityId);
        await engine.importSceneDataAsync(facility.data);

        if (engine.getState().isFloorMode) {
          engine.toggleFullBuildingView();
        }

        setLoadingProgress(68);
        setLoadingMessage('Preparing view...');

        await applyViewerViewPresets(
          engine,
          viewPresetsRef.current.sky,
          viewPresetsRef.current.ground,
          ({ progress, message }) => {
            setLoadingProgress(progress);
            setLoadingMessage(message);
          },
          environmentOptionsRef.current
        );

        const entityIndex = new Map<string, string[]>();
        for (const obj of engine.getSceneManager().getAllPlacedObjects()) {
          const entityId = obj.binding?.entityId;
          if (!entityId) continue;
          const list = entityIndex.get(entityId) ?? [];
          list.push(obj.id);
          entityIndex.set(entityId, list);
        }
        entityToObjectIdsRef.current = entityIndex;

        setLoadingProgress(98);
        setLoadingMessage('Finalizing...');

        // Brief moment at 100% so the overlay can show the success state.
        setLoadingProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 280));
        skipNextLivePresetApplyRef.current = true;
        setIsDataLoaded(true);
        onReady?.();
        
      } catch (error) {
        console.error('Failed to load facility:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load facility';
        setLoadError(errorMessage);
        onError?.(error instanceof Error ? error : new Error(errorMessage));
      }
    };

    loadFacility();
  }, [isEngineReady, engine, bluDesignFacilityId, isDataLoaded, onReady, onError, prefetchedFacility]);

  useEffect(() => {
    void applyViewPresets();
  }, [applyViewPresets]);

  const applyObjectVisualState = useCallback(
    (objectId: string, stateUpdate: ViewerSmartAssetState) => {
      if (!engine || !applyEngineUpdatesRef.current) return;

      const lockStatus =
        stateUpdate.state === DeviceState.UNLOCKED
          ? 'unlocked'
          : stateUpdate.state === DeviceState.LOCKED
            ? 'locked'
            : stateUpdate.lockStatus;

      engine.simulateObjectState?.(objectId, {
        isSimulating: true,
        simulatedState: stateUpdate.state,
        simulatedLockStatus:
          lockStatus === 'locked' || lockStatus === 'unlocked' ? lockStatus : undefined,
      });
    },
    [engine],
  );

  const updateAssetVisualState = useCallback(
    (stateUpdate: ViewerSmartAssetState) => {
      const objectIds = entityToObjectIdsRef.current.get(stateUpdate.entityId) ?? [];
      for (const objectId of objectIds) {
        applyObjectVisualState(objectId, stateUpdate);
      }
    },
    [applyObjectVisualState],
  );

  const applyUnknownStateToUnmappedBindings = useCallback(() => {
    if (!engine || !applyEngineUpdatesRef.current) return;

    const unknownUpdate: ViewerSmartAssetState = {
      entityId: '',
      entityType: 'unit',
      state: DeviceState.UNKNOWN,
    };

    for (const [entityId, objectIds] of entityToObjectIdsRef.current.entries()) {
      if (assetStatesRef.current.has(entityId)) continue;
      for (const objectId of objectIds) {
        applyObjectVisualState(objectId, { ...unknownUpdate, entityId });
      }
    }
  }, [engine, applyObjectVisualState]);

  const applyLiveStateUpdates = useCallback(
    (updates: ViewerSmartAssetState[]) => {
      for (const update of updates) {
        assetStatesRef.current.set(update.entityId, update);

        if (applyEngineUpdatesRef.current) {
          updateAssetVisualState(update);
        }

        if (selectedEntityIdRef.current === update.entityId) {
          setSelectedObjectState(update);
        }
      }
    },
    [updateAssetVisualState],
  );

  const handleHydrationComplete = useCallback(() => {
    liveHydratedRef.current = true;
    applyUnknownStateToUnmappedBindings();
  }, [applyUnknownStateToUnmappedBindings]);

  const handleUnitsCatalog = useCallback((unitsById: Map<string, BluLokUnit>) => {
    setUnitsCatalog(unitsById);
  }, []);

  useFacilityViewerLiveState({
    bluLokFacilityId,
    enabled: !!bluLokFacilityId && isDataLoaded,
    onUpdates: applyLiveStateUpdates,
    onUnitsCatalog: handleUnitsCatalog,
    onHydrationComplete: handleHydrationComplete,
  });

  // Force the default locked look when live binding effects are turned off.
  useEffect(() => {
    if (!engine || !isEngineReady) return;
    engine.setBindingEffectsEnabled?.(bindingEffectsEnabled);
  }, [engine, isEngineReady, isDataLoaded, bindingEffectsEnabled]);

  // Replay cached live states when rendering resumes after pause/hidden tab
  useEffect(() => {
    if (!shouldRunEngine || !isDataLoaded || !engine) return;
    assetStatesRef.current.forEach((state) => {
      updateAssetVisualState(state);
    });
  }, [shouldRunEngine, isDataLoaded, engine, updateAssetVisualState]);

  // Track container size for panel layout
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerSize({
        width: container.offsetWidth,
        height: container.offsetHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const selectedUnitInfo = useMemo(() => {
    const entityId = selectedObject?.binding?.entityId;
    if (selectedObject?.binding?.entityType !== 'unit' || !entityId) return null;
    return unitsCatalog.get(entityId) ?? null;
  }, [selectedObject, unitsCatalog]);

  // Handle selection changes
  useEffect(() => {
    if (!engine || !state?.selection?.selectedIds) return;

    const selectedIds = state.selection.selectedIds;
    
    if (selectedIds.length === 1) {
      const sceneManager = engine.getSceneManager();
      const obj = sceneManager.getObjectData(selectedIds[0]);
      
      if (obj) {
        setSelectedObject(obj);
        selectedEntityIdRef.current = obj.binding?.entityId ?? null;
        
        if (obj.binding?.entityId) {
          const liveState = assetStatesRef.current.get(obj.binding.entityId);
          setSelectedObjectState(liveState || null);
        } else {
          setSelectedObjectState(null);
        }
      }
    } else {
      selectedEntityIdRef.current = null;
      setSelectedObject(null);
      setSelectedObjectState(null);
    }
  }, [engine, state?.selection?.selectedIds]);

  // Floor management
  const availableFloors = engine?.getFloorManager()?.getAvailableFloors() ?? [0];
  const currentFloor = safeState.activeFloor ?? 0;
  const isFullBuildingView = !safeState.isFloorMode;

  const handleFloorChange = useCallback((floor: number) => {
    engine?.setFloor(floor);
    engine?.refreshGroundPlaneBounds();
  }, [engine]);

  const handleToggleFullView = useCallback(() => {
    engine?.toggleFullBuildingView();
    engine?.refreshGroundPlaneBounds();
  }, [engine]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    engine?.getSelectionManager()?.clearSelection();
    selectedEntityIdRef.current = null;
    setSelectedObject(null);
    setSelectedObjectState(null);
  }, [engine]);

  // Rotate camera
  const handleRotateCamera = useCallback((direction: 'cw' | 'ccw') => {
    engine?.rotateCameraView(direction);
  }, [engine]);

  useViewerKeyboardShortcuts({
    enabled: isEngineReady && isDataLoaded && shouldRunEngine,
    onRotateCamera90: handleRotateCamera,
  });

  const handleResetView = useCallback(() => {
    if (engine?.restoreDefaultCamera(true)) {
      return;
    }
    const cameraController = engine?.getCameraController();
    const bounds = engine?.calculateSceneBounds();
    if (cameraController && bounds) {
      cameraController.frameAllContent(bounds, true);
      return;
    }
    cameraController?.reset();
  }, [engine]);

  // Track camera mode
  const isIsometricMode = state?.camera?.mode === 'isometric';

  // Toggle camera mode between isometric and free
  const handleToggleCameraMode = useCallback(() => {
    if (!engine) return;
    
    const cameraController = engine.getCameraController();
    if (!cameraController) return;
    
    const currentMode = cameraController.getMode();
    
    if (currentMode === 'isometric') {
      // Switch to free mode
      engine.setCameraMode(CameraMode.FREE);
    } else {
      // Switch to isometric mode and frame content
      engine.setCameraMode(CameraMode.ISOMETRIC);
      const sceneBounds = engine.calculateSceneBounds();
      if (sceneBounds) {
        cameraController.frameAllContent(sceneBounds, true);
      }
    }
  }, [engine]);

  // Focus on object
  const handleFocusObject = useCallback((objectId: string, floor: number) => {
    if (!engine) return;
    engine.focusOnObject(objectId, floor);
  }, [engine]);

  // Focus the currently selected object (header button).
  const handleFocusSelected = useCallback(() => {
    if (!engine || !selectedObject) return;
    engine.focusOnObject(selectedObject.id, selectedObject.floor ?? 0);
  }, [engine, selectedObject]);

  // Double-click in the scene animates to focus whatever is selected (a click
  // of the double-click already selects the object under the cursor).
  const handleCanvasDoubleClick = useCallback(() => {
    if (!engine) return;
    const selectedIds = engine.getSelectionManager()?.getSelectedIds() ?? [];
    if (selectedIds.length !== 1) return;
    const obj = engine.getSceneManager()?.getObjectData(selectedIds[0]);
    if (!obj) return;
    engine.focusOnObject(obj.id, obj.floor ?? 0);
  }, [engine]);

  // Get all placed objects and buildings for smart objects panel
  const allPlacedObjects = useMemo(() => {
    if (!engine || !isDataLoaded) return [];
    return engine.getSceneManager()?.getAllPlacedObjects() || [];
  }, [engine, isDataLoaded]);

  const allBuildings = useMemo(() => {
    if (!engine || !isDataLoaded) return [];
    return engine.getBuildingManager()?.getAllBuildings() || [];
  }, [engine, isDataLoaded]);

  // Focus on building
  const handleFocusBuilding = useCallback((buildingId: string) => {
    if (!engine) return;
    engine.focusOnBuilding(buildingId);
  }, [engine]);

  // Background gradient
  const bgGradient = useMemo(() => {
    if (isDark) {
      return 'radial-gradient(circle at 20% 20%, rgba(40,80,140,0.15), transparent 40%), radial-gradient(circle at 80% 10%, rgba(80,120,200,0.12), transparent 35%), linear-gradient(135deg, #1e293b, #0f172a)';
    }
    return 'radial-gradient(circle at 20% 20%, rgba(100,150,220,0.15), transparent 40%), radial-gradient(circle at 80% 10%, rgba(120,160,230,0.12), transparent 35%), linear-gradient(135deg, #f1f5f9, #e2e8f0)';
  }, [isDark]);

  // Show loading state
  const showLoading = !isDataLoaded;

  return (
    <div 
      ref={canvasContainerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: bgGradient }}
    >
      {/* Three.js Canvas Container — hidden instantly when showing snapshot; no opacity tween */}
      <div
        ref={containerRef}
        className={`absolute inset-0${showStaticPreview ? ' invisible' : ''}`}
        style={{ touchAction: 'none' }}
        aria-hidden={showStaticPreview}
        onDoubleClick={handleCanvasDoubleClick}
      />

      {showStaticPreview && (
        <img
          src={snapshotUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
          draggable={false}
        />
      )}

      {/* Loading Overlay */}
      <ViewerLoadingOverlay
        isVisible={showLoading}
        progress={loadingProgress}
        message={loadError || loadingMessage}
      />

      {/* Error State */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className={`
            max-w-md p-6 rounded-xl text-center
            ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}
          `}>
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Unable to Load Facility</h3>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {loadError}
            </p>
          </div>
        </div>
      )}

      {/* Performance Monitor */}
      <PerformanceMonitor engine={engine} active={shouldRunEngine} />

      {/* UI Overlays - only show when loaded and actively rendering */}
      {isDataLoaded && !loadError && shouldRunEngine && (
        <>
          {/* Properties Panel */}
          <ViewerPropertiesPanel
            selectedObject={selectedObject}
            onClose={handleClearSelection}
            onFocus={handleFocusSelected}
            liveState={selectedObjectState ?? undefined}
            unitInfo={selectedUnitInfo}
          />

          {/* Smart Objects Search Panel */}
          <ViewerSmartObjectsPanel
            objects={allPlacedObjects}
            buildings={allBuildings}
            onFocusObject={handleFocusObject}
            onFocusBuilding={handleFocusBuilding}
            maxExpandedHeight={containerHeight > 0 ? Math.floor(containerHeight / 2) - 80 : undefined}
            anchor={useExpandedChrome ? 'corner' : 'above-controls'}
          />

          {/* Floor Selector with Camera Controls */}
          <ViewerFloorsPanel
            currentFloor={currentFloor}
            availableFloors={availableFloors}
            isFullBuildingView={isFullBuildingView}
            isIsometricMode={isIsometricMode}
            onFloorChange={handleFloorChange}
            onToggleFullView={handleToggleFullView}
            onRotateCamera={handleRotateCamera}
            onToggleCameraMode={handleToggleCameraMode}
            onResetView={handleResetView}
            anchor={useExpandedChrome ? 'bottom-center' : 'bottom-right'}
          />
        </>
      )}
    </div>
  );
};

export default FacilityViewer3D;

