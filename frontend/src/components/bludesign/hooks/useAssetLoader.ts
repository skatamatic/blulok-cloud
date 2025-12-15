/**
 * Asset Loader Hook
 * 
 * React hook for loading BluDesign assets with progress tracking.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAssetLoader, LoadedAsset, AssetLoadOptions } from '../loading/AssetLoader';
import { LoadingProgress, ProgressCallback } from '../loading/LoadingManager';
import { BluDesignAsset } from '../core/types';

export interface UseAssetLoaderOptions {
  baseUrl: string;
  loadOptions?: AssetLoadOptions;
  onProgress?: ProgressCallback;
  onComplete?: (loaded: LoadedAsset[], failed: Array<{ assetId: string; error: string }>) => void;
  onError?: (error: string) => void;
}

export interface UseAssetLoaderReturn {
  isLoading: boolean;
  progress: LoadingProgress | null;
  loadedAssets: LoadedAsset[];
  errors: Array<{ assetId: string; error: string }>;
  loadAsset: (asset: BluDesignAsset) => Promise<LoadedAsset | null>;
  loadAssets: (assets: BluDesignAsset[]) => Promise<void>;
  unloadAsset: (assetId: string) => void;
  unloadAll: () => void;
  getAsset: (assetId: string) => LoadedAsset | undefined;
  cloneAsset: (assetId: string) => import('three').Object3D | null;
}

export function useAssetLoader(options: UseAssetLoaderOptions): UseAssetLoaderReturn {
  const { baseUrl, loadOptions, onProgress, onComplete, onError } = options;
  
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<LoadingProgress | null>(null);
  const [loadedAssets, setLoadedAssets] = useState<LoadedAsset[]>([]);
  const [errors, setErrors] = useState<Array<{ assetId: string; error: string }>>([]);
  
  const assetLoaderRef = useRef(getAssetLoader());
  
  // Set up progress callback
  useEffect(() => {
    const handleProgress: ProgressCallback = (prog) => {
      setProgress(prog);
      onProgress?.(prog);
    };
    
    assetLoaderRef.current.setProgressCallback(handleProgress);
    
    return () => {
      assetLoaderRef.current.setProgressCallback(null);
    };
  }, [onProgress]);
  
  // Load a single asset
  const loadAsset = useCallback(async (asset: BluDesignAsset): Promise<LoadedAsset | null> => {
    setIsLoading(true);
    setProgress({
      phase: 'initializing',
      current: 0,
      total: 1,
      percentage: 0,
      currentItem: asset.name,
      message: `Loading ${asset.name}...`,
    });
    
    try {
      const result = await assetLoaderRef.current.loadAsset(asset, baseUrl, loadOptions);
      
      if (result.success && result.data) {
        setLoadedAssets((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.asset.id === asset.id)) {
            return prev;
          }
          return [...prev, result.data!];
        });
        setProgress({
          phase: 'complete',
          current: 1,
          total: 1,
          percentage: 100,
          message: `Loaded ${asset.name}`,
        });
        return result.data;
      } else {
        const error = result.error || 'Unknown error';
        setErrors((prev) => [...prev, { assetId: asset.id, error }]);
        setProgress({
          phase: 'error',
          current: 0,
          total: 1,
          percentage: 0,
          error,
        });
        onError?.(error);
        return null;
      }
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, loadOptions, onError]);
  
  // Load multiple assets
  const loadAssets = useCallback(async (assets: BluDesignAsset[]): Promise<void> => {
    if (assets.length === 0) return;
    
    setIsLoading(true);
    setErrors([]);
    setProgress({
      phase: 'initializing',
      current: 0,
      total: assets.length,
      percentage: 0,
      message: `Loading ${assets.length} assets...`,
    });
    
    try {
      const result = await assetLoaderRef.current.loadAssets(assets, baseUrl, loadOptions);
      
      setLoadedAssets((prev) => {
        const newAssets = result.loaded.filter(
          (a) => !prev.some((p) => p.asset.id === a.asset.id)
        );
        return [...prev, ...newAssets];
      });
      
      if (result.failed.length > 0) {
        setErrors(result.failed);
      }
      
      setProgress({
        phase: result.failed.length === 0 ? 'complete' : 'error',
        current: result.loaded.length,
        total: assets.length,
        percentage: Math.round((result.loaded.length / assets.length) * 100),
        message: `Loaded ${result.loaded.length}/${assets.length} assets`,
        error: result.failed.length > 0 ? `${result.failed.length} assets failed to load` : undefined,
      });
      
      onComplete?.(result.loaded, result.failed);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, loadOptions, onComplete]);
  
  // Unload a single asset
  const unloadAsset = useCallback((assetId: string): void => {
    assetLoaderRef.current.unloadAsset(assetId);
    setLoadedAssets((prev) => prev.filter((a) => a.asset.id !== assetId));
  }, []);
  
  // Unload all assets
  const unloadAll = useCallback((): void => {
    assetLoaderRef.current.unloadAll();
    setLoadedAssets([]);
    setErrors([]);
    setProgress(null);
  }, []);
  
  // Get a loaded asset
  const getAsset = useCallback((assetId: string): LoadedAsset | undefined => {
    return assetLoaderRef.current.getLoadedAsset(assetId);
  }, []);
  
  // Clone an asset
  const cloneAsset = useCallback((assetId: string): import('three').Object3D | null => {
    return assetLoaderRef.current.cloneAsset(assetId);
  }, []);
  
  return {
    isLoading,
    progress,
    loadedAssets,
    errors,
    loadAsset,
    loadAssets,
    unloadAsset,
    unloadAll,
    getAsset,
    cloneAsset,
  };
}

