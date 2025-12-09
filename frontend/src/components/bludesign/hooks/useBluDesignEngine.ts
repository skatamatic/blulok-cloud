/**
 * BluDesign Engine Hook
 * 
 * React hook for managing the BluDesign engine lifecycle.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BluDesignEngine, BluDesignEngineOptions } from '../core/BluDesignEngine';
import {
  EditorState,
  EditorTool,
  CameraMode,
  GridSize,
  SelectionState,
  CameraState,
  AssetMetadata,
} from '../core/types';
import { LoadingProgress } from '../loading/LoadingManager';

const MIN_LOADING_TIME_MS = 2000;

interface UseBluDesignEngineOptions {
  readonly?: boolean;
  theme?: 'light' | 'dark';
  onReady?: () => void;
  onSelectionChange?: (selection: SelectionState) => void;
  onCameraChange?: (camera: CameraState) => void;
}

interface UseBluDesignEngineReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  engine: BluDesignEngine | null;
  state: EditorState | null;
  isReady: boolean;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  
  // Actions
  setTool: (tool: EditorTool) => void;
  setCameraMode: (mode: CameraMode) => void;
  rotateIsometric: (direction: 'cw' | 'ccw') => void;
  setGridSize: (size: GridSize) => void;
  toggleGrid: (visible?: boolean) => void;
  setActiveAsset: (assetId: string | null, assetMetadata?: AssetMetadata) => void;
  rotateOrientation: (direction: 'cw' | 'ccw') => void;
  resetCamera: () => void;
  clearSelection: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export function useBluDesignEngine(
  options: UseBluDesignEngineOptions = {}
): UseBluDesignEngineReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BluDesignEngine | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isMinTimeElapsed, setIsMinTimeElapsed] = useState(false);
  const [state, setState] = useState<EditorState | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const startTimeRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Combined ready state - both engine ready AND minimum time elapsed
  const isReady = isEngineReady && isMinTimeElapsed;
  const isLoading = !isReady;

  // Fake progress animation while loading
  useEffect(() => {
    if (isReady) {
      // Clear interval when ready
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoadingProgress({
        phase: 'complete',
        percentage: 100,
        message: 'Ready!',
      });
      return;
    }

    // Start fake progress animation
    startTimeRef.current = Date.now();
    let fakeProgress = 0;
    
    setLoadingProgress({
      phase: 'initializing',
      percentage: 0,
      message: 'Starting engine...',
    });

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const targetProgress = Math.min(80, (elapsed / MIN_LOADING_TIME_MS) * 100);
      
      // Ease-out animation
      fakeProgress += (targetProgress - fakeProgress) * 0.1;
      
      const phase = fakeProgress < 20 ? 'initializing' :
                    fakeProgress < 45 ? 'downloading' :
                    fakeProgress < 70 ? 'parsing' : 'creating';
      
      // More descriptive, concise messages
      const messages = {
        initializing: 'Initializing engine...',
        downloading: 'Loading assets...',
        parsing: 'Building renderer...',
        creating: 'Preparing workspace...',
      };
      
      setLoadingProgress({
        phase,
        percentage: Math.round(fakeProgress),
        message: messages[phase],
      });
    }, 50);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isReady]);

  // Initialize engine
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    let initTimeout: ReturnType<typeof setTimeout> | null = null;

    // Start minimum time timer
    const minTimeTimer = setTimeout(() => {
      if (!cancelled) {
        setIsMinTimeElapsed(true);
      }
    }, MIN_LOADING_TIME_MS);

    const tryInit = () => {
      if (cancelled || engineRef.current) return true; // Already init'd or cancelled
      if (!containerRef.current) return false; // Container not ready
      
      // Check if container has dimensions
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) {
        return false; // Wait for container to have size
      }

      const engineOptions: BluDesignEngineOptions = {
        container: containerRef.current,
        readonly: options.readonly,
      };

      try {
        const engine = new BluDesignEngine(engineOptions);
        engineRef.current = engine;

        // Subscribe to events
        const unsubReady = engine.on('ready', () => {
          if (!cancelled) {
            setIsEngineReady(true);
            setState(engine.getState());
            options.onReady?.();
          }
        });

        const unsubSelection = engine.on<SelectionState>('selection-changed', (event) => {
          setState(engine.getState());
          options.onSelectionChange?.(event.data);
        });

        const unsubCamera = engine.on<CameraState>('camera-changed', (event) => {
          setState(engine.getState());
          options.onCameraChange?.(event.data);
        });

        const unsubTool = engine.on('tool-changed', () => {
          setState(engine.getState());
        });

        const unsubState = engine.on('state-updated', () => {
          setState(engine.getState());
        });

        // Start the engine
        engine.start();

        cleanup = () => {
          unsubReady();
          unsubSelection();
          unsubCamera();
          unsubTool();
          unsubState();
          engine.dispose();
          engineRef.current = null;
        };
      } catch (error) {
        console.error('Failed to initialize BluDesign engine:', error);
      }

      return true;
    };

    // Try immediate init, otherwise poll briefly until container is ready
    if (!tryInit()) {
      const pollInit = () => {
        if (cancelled) return;
        if (!tryInit()) {
          initTimeout = setTimeout(pollInit, 50);
        }
      };
      initTimeout = setTimeout(pollInit, 50);
    }

    return () => {
      cancelled = true;
      clearTimeout(minTimeTimer);
      if (initTimeout) clearTimeout(initTimeout);
      if (cleanup) cleanup();
      setIsEngineReady(false);
      setIsMinTimeElapsed(false);
    };
  }, [options.readonly]);

  // Action callbacks
  const setTool = useCallback((tool: EditorTool) => {
    engineRef.current?.setTool(tool);
  }, []);

  const setCameraMode = useCallback((mode: CameraMode) => {
    engineRef.current?.setCameraMode(mode);
  }, []);

  const rotateIsometric = useCallback((direction: 'cw' | 'ccw') => {
    engineRef.current?.rotateIsometric(direction);
  }, []);

  const setGridSize = useCallback((size: GridSize) => {
    engineRef.current?.setGridSize(size);
  }, []);

  const toggleGrid = useCallback((visible?: boolean) => {
    engineRef.current?.toggleGrid(visible);
  }, []);

  const setActiveAsset = useCallback((assetId: string | null, assetMetadata?: AssetMetadata) => {
    if (assetId && assetMetadata) {
      engineRef.current?.setActiveAsset(assetId);
      engineRef.current?.startAssetPlacement(assetMetadata);
      engineRef.current?.getPlacementManager().startPlacement(assetMetadata, engineRef.current.getState().activeOrientation);
    } else {
      engineRef.current?.setActiveAsset(null);
    }
  }, []);

  const rotateOrientation = useCallback((direction: 'cw' | 'ccw') => {
    engineRef.current?.rotateOrientation(direction);
  }, []);

  const resetCamera = useCallback(() => {
    engineRef.current?.getCameraController().reset();
  }, []);

  const clearSelection = useCallback(() => {
    engineRef.current?.getSelectionManager().clearSelection();
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    engineRef.current?.setTheme(theme);
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (options.theme && isReady) {
      engineRef.current?.setTheme(options.theme);
    }
  }, [options.theme, isReady]);

  return {
    containerRef,
    engine: engineRef.current,
    state,
    isReady,
    isLoading,
    loadingProgress,
    setTool,
    setCameraMode,
    rotateIsometric,
    setGridSize,
    toggleGrid,
    setActiveAsset,
    rotateOrientation,
    resetCamera,
    clearSelection,
    setTheme,
  };
}
