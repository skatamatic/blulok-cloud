/**
 * Facility Viewer 3D
 * 
 * Readonly 3D facility viewer component that can be used in widgets and the BluFMS page.
 * Loads and displays a BluDesign facility with real-time state updates via WebSocket.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBluDesignEngine } from '../hooks/useBluDesignEngine';
import { useTheme } from '@/contexts/ThemeContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import * as bludesignApi from '@/api/bludesign';
import { ViewerLoadingOverlay } from './ViewerLoadingOverlay';
import { ViewerFloorsPanel } from './ViewerFloorsPanel';
import { ViewerPropertiesPanel } from './ViewerPropertiesPanel';
import { ViewerSmartObjectsPanel } from './ViewerSmartObjectsPanel';
import {
  PlacedObject,
  DeviceState,
  Building,
  CameraMode,
} from '../core/types';

interface FacilityViewer3DProps {
  /** BluDesign facility ID to load */
  bluDesignFacilityId: string;
  /** BluLok facility ID for WebSocket subscriptions */
  bluLokFacilityId?: string;
  /** Optional CSS class name */
  className?: string;
  /** Callback when the viewer is ready */
  onReady?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

interface SmartAssetState {
  entityId: string;
  entityType: 'unit' | 'gate' | 'elevator' | 'door';
  state: DeviceState;
  lockStatus?: string;
  batteryLevel?: number;
  lastActivity?: string;
}

export const FacilityViewer3D: React.FC<FacilityViewer3DProps> = ({
  bluDesignFacilityId,
  bluLokFacilityId,
  className = '',
  onReady,
  onError,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const { subscribe, unsubscribe } = useWebSocket();
  
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // Container height for constraining child panels
  const [containerHeight, setContainerHeight] = useState(0);
  
  // Loading states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Selected object state
  const [selectedObject, setSelectedObject] = useState<PlacedObject | null>(null);
  const [selectedObjectState, setSelectedObjectState] = useState<SmartAssetState | null>(null);
  
  // Asset states from WebSocket
  const assetStatesRef = useRef<Map<string, SmartAssetState>>(new Map());

  // Initialize engine
  const {
    containerRef,
    engine,
    state,
    isReady: isEngineReady,
  } = useBluDesignEngine({
    readonly: true,
    theme: effectiveTheme,
    onReady: () => {
      setLoadingProgress(40);
      setLoadingMessage('Engine ready...');
    },
  });

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

  // Load facility data when engine is ready
  useEffect(() => {
    if (!isEngineReady || !engine || isDataLoaded) return;

    const loadFacility = async () => {
      try {
        setLoadingProgress(50);
        setLoadingMessage('Loading facility...');
        
        const facility = await bludesignApi.getFacility(bluDesignFacilityId);
        
        if (!facility || !facility.data) {
          throw new Error('Facility data not found');
        }

        setLoadingProgress(70);
        setLoadingMessage('Building scene...');
        
        // Hide grid in view-only mode (before and after import to ensure it stays hidden)
        engine.getGridSystem()?.setVisible(false);
        
        // Import scene data
        engine.importSceneData(facility.data);
        
        // Ensure grid stays hidden after import
        engine.getGridSystem()?.setVisible(false);
        
        // Start in full building view mode
        engine.toggleFullBuildingView();
        
        setLoadingProgress(90);
        setLoadingMessage('Finalizing...');
        
        // Small delay for visual smoothness
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setLoadingProgress(100);
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
  }, [isEngineReady, engine, bluDesignFacilityId, isDataLoaded, onReady, onError]);

  // Subscribe to WebSocket for state updates
  useEffect(() => {
    if (!bluLokFacilityId || !isDataLoaded) return;

    const subscriptionId = subscribe(
      'facility_state_update',
      (data: any) => {
        // Filter by facility
        if (data.facilityId !== bluLokFacilityId) return;

        // Update asset states
        if (data.updates && Array.isArray(data.updates)) {
          data.updates.forEach((update: SmartAssetState) => {
            assetStatesRef.current.set(update.entityId, update);
            
            // Update visual state in engine
            updateAssetVisualState(update);
            
            // Update selected object state if it matches
            if (selectedObject?.binding?.entityId === update.entityId) {
              setSelectedObjectState(update);
            }
          });
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );

    return () => {
      if (subscriptionId) {
        unsubscribe(subscriptionId);
      }
    };
  }, [bluLokFacilityId, isDataLoaded, subscribe, unsubscribe, selectedObject]);

  // Track container height for panel sizing constraints
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    
    const updateHeight = () => {
      setContainerHeight(container.offsetHeight);
    };
    
    // Initial measurement
    updateHeight();
    
    // Watch for resize
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update visual state in engine for an asset
  const updateAssetVisualState = useCallback((stateUpdate: SmartAssetState) => {
    if (!engine) return;

    const sceneManager = engine.getSceneManager();
    const allObjects = sceneManager.getAllPlacedObjects();

    // Find objects bound to this entity
    allObjects.forEach(obj => {
      if (obj.binding?.entityId === stateUpdate.entityId) {
        // Update the object's visual state via simulation
        engine.simulateObjectState?.(obj.id, {
          isSimulating: true,
          simulatedState: stateUpdate.state,
          simulatedLockStatus: (stateUpdate.lockStatus === 'locked' || stateUpdate.lockStatus === 'unlocked') 
            ? stateUpdate.lockStatus 
            : 'locked',
        });
      }
    });
  }, [engine]);

  // Handle selection changes
  useEffect(() => {
    if (!engine || !state?.selection?.selectedIds) return;

    const selectedIds = state.selection.selectedIds;
    
    if (selectedIds.length === 1) {
      const sceneManager = engine.getSceneManager();
      const obj = sceneManager.getObjectData(selectedIds[0]);
      
      if (obj) {
        setSelectedObject(obj);
        
        // Get live state if bound
        if (obj.binding?.entityId) {
          const liveState = assetStatesRef.current.get(obj.binding.entityId);
          setSelectedObjectState(liveState || null);
        } else {
          setSelectedObjectState(null);
        }
      }
    } else {
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
  }, [engine]);

  const handleToggleFullView = useCallback(() => {
    engine?.toggleFullBuildingView();
  }, [engine]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    engine?.getSelectionManager()?.clearSelection();
    setSelectedObject(null);
    setSelectedObjectState(null);
  }, [engine]);

  // Rotate camera
  const handleRotateCamera = useCallback((direction: 'cw' | 'ccw') => {
    engine?.rotateCameraView(direction);
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
      {/* Three.js Canvas Container */}
      <div 
        ref={containerRef} 
        className="absolute inset-0" 
        style={{ touchAction: 'none' }} 
      />

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

      {/* UI Overlays - only show when loaded */}
      {isDataLoaded && !loadError && (
        <>
          {/* Properties Panel */}
          <ViewerPropertiesPanel
            selectedObject={selectedObject}
            onClose={handleClearSelection}
            liveState={selectedObjectState ? {
              state: selectedObjectState.state,
              lockStatus: selectedObjectState.lockStatus,
              batteryLevel: selectedObjectState.batteryLevel,
              lastActivity: selectedObjectState.lastActivity,
            } : undefined}
          />

          {/* Smart Objects Search Panel */}
          <ViewerSmartObjectsPanel
            objects={allPlacedObjects}
            buildings={allBuildings}
            onFocusObject={handleFocusObject}
            onFocusBuilding={handleFocusBuilding}
            maxExpandedHeight={containerHeight > 0 ? Math.floor(containerHeight / 2) - 80 : undefined}
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
          />
        </>
      )}
    </div>
  );
};

export default FacilityViewer3D;

