/**
 * useAssets Hook
 * 
 * Fetches and caches asset definitions from the backend.
 * Falls back to placeholder assets if backend is unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import * as bludesignApi from '@/api/bludesign';
import { AssetMetadata, AssetCategory } from '../core/types';

// Placeholder assets for when backend is unavailable
const PLACEHOLDER_ASSETS: AssetMetadata[] = [
  // Storage Units
  {
    id: 'unit-tiny-smart',
    name: 'Tiny Locker (Smart)',
    category: AssetCategory.STORAGE_UNIT,
    description: 'Small locker with smart lock',
    dimensions: { width: 1, height: 2, depth: 1 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'unit-small-smart',
    name: 'Small Unit (Smart)',
    category: AssetCategory.STORAGE_UNIT,
    description: '5×5 storage unit with smart lock',
    dimensions: { width: 1, height: 2.5, depth: 2 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 2 },
  },
  {
    id: 'unit-medium-smart',
    name: 'Medium Unit (Smart)',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×10 storage unit with smart lock',
    dimensions: { width: 2, height: 2.5, depth: 2 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
  },
  {
    id: 'unit-large-smart',
    name: 'Large Unit (Smart)',
    category: AssetCategory.STORAGE_UNIT,
    description: '10×15 storage unit with smart lock',
    dimensions: { width: 2, height: 3, depth: 3 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 3 },
  },
  // Gates
  {
    id: 'gate-single-smart',
    name: 'Gate 1×1 (Smart)',
    category: AssetCategory.GATE,
    description: 'Single lane smart gate',
    dimensions: { width: 1, height: 3, depth: 0.3 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  // Walls (1x1 only for painting)
  {
    id: 'wall-brick-1x1',
    name: 'Brick Wall',
    category: AssetCategory.WALL,
    description: 'Brick wall section',
    dimensions: { width: 1, height: 3, depth: 0.3 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  // Fences (1x1 only for painting)
  {
    id: 'fence-chainlink-1x1',
    name: 'Chain Link',
    category: AssetCategory.FENCE,
    description: 'Chain link fence',
    dimensions: { width: 1, height: 2.5, depth: 0.1 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'fence-wood-1x1',
    name: 'Wood Fence',
    category: AssetCategory.FENCE,
    description: 'Wood fence',
    dimensions: { width: 1, height: 2, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
  // Ground (1x1 only for painting)
  {
    id: 'floor-grass-1x1',
    name: 'Grass',
    category: AssetCategory.GRASS,
    description: 'Grass surface',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'floor-gravel-1x1',
    name: 'Gravel',
    category: AssetCategory.GRAVEL,
    description: 'Gravel surface',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'floor-pavement-1x1',
    name: 'Pavement',
    category: AssetCategory.PAVEMENT,
    description: 'Pavement surface',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  {
    id: 'floor-concrete-1x1',
    name: 'Concrete',
    category: AssetCategory.FLOOR,
    description: 'Concrete surface',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    isSmart: false,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  },
  // Structures
  {
    id: 'elevator-standard',
    name: 'Elevator (Smart)',
    category: AssetCategory.ELEVATOR,
    description: 'Freight elevator',
    dimensions: { width: 2, height: 3, depth: 2 },
    isSmart: true,
    canRotate: false,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
  },
  {
    id: 'stairwell-standard',
    name: 'Stairwell',
    category: AssetCategory.STAIRWELL,
    description: 'Standard stairwell',
    dimensions: { width: 2, height: 3, depth: 2 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 2, z: 2 },
  },
  {
    id: 'door-standard',
    name: 'Door',
    category: AssetCategory.DOOR,
    description: 'Standard door',
    dimensions: { width: 1, height: 2.5, depth: 0.2 },
    isSmart: false,
    canRotate: true,
    canStack: true,
    gridUnits: { x: 1, z: 1 },
  },
];

interface UseAssetsOptions {
  autoLoad?: boolean;
}

interface UseAssetsResult {
  assets: AssetMetadata[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useAssets(options: UseAssetsOptions = {}): UseAssetsResult {
  const { autoLoad = true } = options;
  
  const [assets, setAssets] = useState<AssetMetadata[]>(PLACEHOLDER_ASSETS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const definitions = await bludesignApi.listAssetDefinitions();
      if (definitions && definitions.length > 0) {
        // Convert AssetDefinition to AssetMetadata
        const converted = definitions.map(def => ({
          id: def.id,
          name: def.name,
          category: def.category as AssetCategory,
          description: def.description,
          dimensions: def.dimensions,
          gridUnits: def.gridUnits,
          isSmart: def.isSmart,
          canRotate: def.canRotate,
          canStack: def.canStack,
          modelPath: def.modelUrl,
          thumbnail: def.thumbnailUrl,
        }));
        setAssets(converted);
      } else {
        // Use placeholders if no backend assets
        setAssets(PLACEHOLDER_ASSETS);
      }
    } catch (err) {
      console.warn('Failed to load assets from backend, using placeholders:', err);
      setError(err instanceof Error ? err : new Error('Failed to load assets'));
      setAssets(PLACEHOLDER_ASSETS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      // For now, just use placeholders - backend integration can be enabled later
      // refresh();
    }
  }, [autoLoad, refresh]);

  return {
    assets,
    isLoading,
    error,
    refresh,
  };
}

export default useAssets;

