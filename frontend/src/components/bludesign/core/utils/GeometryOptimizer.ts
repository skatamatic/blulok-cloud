/**
 * Geometry Optimizer
 * 
 * Pure utility for merging adjacent grid cells into larger rectangles.
 * Reduces draw calls by combining many small tiles into fewer large rectangles.
 * 
 * Algorithm: Greedy largest-rectangle-first approach
 * - Finds the largest possible rectangle at each step
 * - Removes covered cells and repeats
 * - Validates result to ensure correctness
 */

export interface OptimizedRectangle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cells: Set<string>; // "x,z" keys for validation
  area: number; // For sorting/prioritization
  instanceIndex?: number; // For tracking in rendering system
}

export interface OptimizationResult {
  rectangles: OptimizedRectangle[];
  cellToRectangle: Map<string, OptimizedRectangle>; // "x,z" -> rectangle
  totalCells: number; // Validation: sum of rectangle areas should equal this
  optimizationRatio: number; // rectangles.length / totalCells (lower is better)
}

export interface OptimizationOptions {
  readonly?: boolean; // More aggressive in readonly mode
  maxRectangleSize?: number; // Limit for texture tiling (optional)
  minRectangleSize?: number; // Don't merge if too small (optional)
  onProgress?: (progress: { current: number; total: number; percentage: number }) => void; // Progress callback
}

export class GeometryOptimizer {
  /**
   * Main optimization function - pure, testable
   * 
   * @param cells - Array of grid cell positions
   * @param options - Optimization options
   * @returns Optimization result with rectangles and validation data
   */
  static async optimize(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions = {}
  ): Promise<OptimizationResult> {
    
    // Handle edge cases
    if (cells.length === 0) {
      return {
        rectangles: [],
        cellToRectangle: new Map(),
        totalCells: 0,
        optimizationRatio: 0,
      };
    }
    
    if (cells.length === 1) {
      const cell = cells[0];
      const rect: OptimizedRectangle = {
        minX: cell.x,
        maxX: cell.x,
        minZ: cell.z,
        maxZ: cell.z,
        cells: new Set([`${cell.x},${cell.z}`]),
        area: 1,
      };
      const cellToRectangle = new Map([[`${cell.x},${cell.z}`, rect]]);
      return {
        rectangles: [rect],
        cellToRectangle,
        totalCells: 1,
        optimizationRatio: 1,
      };
    }
    
    // Fast path: Check if cells form a single rectangle
    // But only use fast path if it doesn't exceed maxRectangleSize (or if no limit is set)
    const singleRect = this.isSingleRectangle(cells);
    if (singleRect) {
      // If single rectangle exceeds max size, we need to split it
      if (options.maxRectangleSize && singleRect.area > options.maxRectangleSize) {
        const splitRects = this.splitRectangle(singleRect, options.maxRectangleSize);
        const cellToRectangle = new Map<string, OptimizedRectangle>();
        splitRects.forEach(rect => {
          rect.cells.forEach(cellKey => {
            cellToRectangle.set(cellKey, rect);
          });
        });
        return {
          rectangles: splitRects,
          cellToRectangle,
          totalCells: cells.length,
          optimizationRatio: splitRects.length / cells.length,
        };
      }
      
      // Single rectangle is within size limit, use it
      const cellToRectangle = new Map<string, OptimizedRectangle>();
      singleRect.cells.forEach(cellKey => {
        cellToRectangle.set(cellKey, singleRect);
      });
      return {
        rectangles: [singleRect],
        cellToRectangle,
        totalCells: cells.length,
        optimizationRatio: 1 / cells.length,
      };
    }
    
    // Greedy algorithm: Find largest rectangles
    const rectangles = await this.findLargestRectangles(cells, options);
    
    // Build cell-to-rectangle mapping
    const cellToRectangle = new Map<string, OptimizedRectangle>();
    rectangles.forEach(rect => {
      rect.cells.forEach(cellKey => {
        cellToRectangle.set(cellKey, rect);
      });
    });
    
    const totalCells = cells.length;
    const optimizationRatio = rectangles.length / totalCells;
    return {
      rectangles,
      cellToRectangle,
      totalCells,
      optimizationRatio,
    };
  }
  
  /**
   * Fast path: Check if cells form a single rectangle
   * If bounding box area equals cell count, it's a filled rectangle
   */
  private static isSingleRectangle(
    cells: Array<{x: number, z: number}>
  ): OptimizedRectangle | null {
    if (cells.length === 0) return null;
    
    const minX = Math.min(...cells.map(c => c.x));
    const maxX = Math.max(...cells.map(c => c.x));
    const minZ = Math.min(...cells.map(c => c.z));
    const maxZ = Math.max(...cells.map(c => c.z));
    
    const width = maxX - minX + 1;
    const height = maxZ - minZ + 1;
    const expectedArea = width * height;
    
    // If area matches, check if all cells are present
    if (expectedArea === cells.length) {
      const cellSet = new Set(cells.map(c => `${c.x},${c.z}`));
      
      // Verify all cells in bounding box are present
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!cellSet.has(`${x},${z}`)) {
            return null; // Not a filled rectangle
          }
        }
      }
      
      // It's a filled rectangle!
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        cells: cellSet,
        area: expectedArea,
      };
    }
    
    return null;
  }
  
  /**
   * Efficient greedy algorithm: Find largest rectangles using incremental growing
   * 
   * Algorithm (O(n * k^2) where k is average rectangle size, much better than O(n^4)):
   * 1. Create cell set for O(1) lookup
   * 2. While cells remain:
   *    a. For each remaining cell as seed, find largest rectangle starting from it
   *    b. Use incremental growing: start with 1x1, expand in best direction iteratively
   *    c. Select the largest rectangle found across all seeds
   *    d. Remove covered cells
   *    e. Repeat
   */
  private static async findLargestRectangles(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions
  ): Promise<OptimizedRectangle[]> {
    // Use async version for progress reporting, sync version otherwise
    if (options.onProgress) {
      return this.findLargestRectanglesAsync(cells, options);
    }
    // For sync version, yield once to allow other tasks to run
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return this.findLargestRectanglesSync(cells, options);
  }
  
  /**
   * Synchronous version of findLargestRectangles
   */
  private static findLargestRectanglesSync(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions
  ): OptimizedRectangle[] {
    const cellSet = new Set(cells.map(c => `${c.x},${c.z}`));
    const rectangles: OptimizedRectangle[] = [];
    
    // Helper: Check if a rectangle is fully filled
    const isRectangleFilled = (
      minX: number,
      maxX: number,
      minZ: number,
      maxZ: number
    ): boolean => {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!cellSet.has(`${x},${z}`)) {
            return false;
          }
        }
      }
      return true;
    };
    
    // Helper: Get cells in rectangle
    const getRectangleCells = (
      minX: number,
      maxX: number,
      minZ: number,
      maxZ: number
    ): Set<string> => {
      const rectCells = new Set<string>();
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          rectCells.add(`${x},${z}`);
        }
      }
      return rectCells;
    };
    
    /**
     * Find the largest rectangle starting from a seed using a simple greedy approach
     * Algorithm: Find max width, then max height for that width
     * This is O(k) where k is rectangle size, much faster than incremental growing
     */
    const findLargestRectangleFromSeed = (
      seedX: number,
      seedZ: number
    ): OptimizedRectangle | null => {
      // Find maximum width we can extend horizontally from seed
      let minX = seedX;
      let maxX = seedX;
      
      // Extend right
      while (cellSet.has(`${maxX + 1},${seedZ}`)) {
        maxX++;
      }
      // Extend left
      while (cellSet.has(`${minX - 1},${seedZ}`)) {
        minX--;
      }
      
      // Now find maximum height for this width
      let minZ = seedZ;
      let maxZ = seedZ;
      let canExpandUp = true;
      let canExpandDown = true;
      
      // Try to expand vertically as far as possible
      while (canExpandUp || canExpandDown) {
        // Try expanding up (negative Z)
        if (canExpandUp) {
          let allCellsPresent = true;
          for (let x = minX; x <= maxX; x++) {
            if (!cellSet.has(`${x},${minZ - 1}`)) {
              allCellsPresent = false;
              break;
            }
          }
          if (allCellsPresent) {
            minZ--;
          } else {
            canExpandUp = false;
          }
        }
        
        // Try expanding down (positive Z)
        if (canExpandDown) {
          let allCellsPresent = true;
          for (let x = minX; x <= maxX; x++) {
            if (!cellSet.has(`${x},${maxZ + 1}`)) {
              allCellsPresent = false;
              break;
            }
          }
          if (allCellsPresent) {
            maxZ++;
          } else {
            canExpandDown = false;
          }
        }
      }
      
      const area = (maxX - minX + 1) * (maxZ - minZ + 1);
      
      // Check size constraints
      if (options.minRectangleSize && area < options.minRectangleSize) {
        return null; // Too small, skip
      }
      if (options.maxRectangleSize && area > options.maxRectangleSize) {
        // Rectangle is too large - we'll let it be split later
      }
      
      // Verify the rectangle is actually filled (safety check)
      if (!isRectangleFilled(minX, maxX, minZ, maxZ)) {
        // If not filled, return null - shouldn't happen with this algorithm but safety check
        return null;
      }
      
      const rectCells = getRectangleCells(minX, maxX, minZ, maxZ);
      
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        cells: rectCells,
        area,
      };
    };
    
    // Greedy: Keep finding largest rectangles
    let rectangleIterations = 0;
    while (cellSet.size > 0) {
      rectangleIterations++;
      const remainingCells = Array.from(cellSet).map(key => {
        const [x, z] = key.split(',').map(Number);
        return { x, z, key };
      });
      
      // #region agent log
      const iterationStartTime = performance.now();
      // #endregion
      
      // Find the largest rectangle starting from any remaining cell
      // OPTIMIZATION: Use aggressive seed limiting for performance
      // Try only a small number of seeds - this trades some optimality for speed
      // For very large datasets, we sample seeds to cover the space better
      const MAX_SEEDS_TO_TRY = Math.min(remainingCells.length, 20); // Try at most 20 seeds
      let seedsToTry: Array<{x: number, z: number, key: string}>;
      if (remainingCells.length <= MAX_SEEDS_TO_TRY) {
        seedsToTry = remainingCells;
      } else {
        // Sample seeds evenly across the space for better coverage
        const step = Math.floor(remainingCells.length / MAX_SEEDS_TO_TRY);
        seedsToTry = [];
        for (let i = 0; i < MAX_SEEDS_TO_TRY; i++) {
          seedsToTry.push(remainingCells[i * step]);
        }
      }
      
      let bestRect: OptimizedRectangle | null = null;
      let bestArea = 0;
      let seedsTried = 0;
      
      // Try a limited subset of cells as seeds
      for (const seed of seedsToTry) {
        seedsTried++;
        const rect = findLargestRectangleFromSeed(seed.x, seed.z);
        if (rect && rect.area > bestArea) {
          bestArea = rect.area;
          bestRect = rect;
        }
        
        // Early exit: if we found a rectangle that meets max size, use it immediately
        if (options.maxRectangleSize && bestArea >= options.maxRectangleSize) {
          break;
        }
      }
      
      // If no rectangle found, create single-cell rectangle from first remaining cell
      if (!bestRect) {
        const seed = remainingCells[0];
        const rectCells = new Set([seed.key]);
        bestRect = {
          minX: seed.x,
          maxX: seed.x,
          minZ: seed.z,
          maxZ: seed.z,
          cells: rectCells,
          area: 1,
        };
      }
      
      // If rectangle exceeds max size, split it into smaller rectangles
      if (options.maxRectangleSize && bestRect.area > options.maxRectangleSize) {
        const splitRects = this.splitRectangle(bestRect, options.maxRectangleSize);
        splitRects.forEach(rect => {
          rect.cells.forEach(cellKey => {
            cellSet.delete(cellKey);
          });
          rectangles.push(rect);
        });
        continue; // Skip adding bestRect, we've already added the splits
      }
      
      // Remove covered cells
      bestRect.cells.forEach(cellKey => {
        cellSet.delete(cellKey);
      });
      
      rectangles.push(bestRect);
      
      // Report progress after each rectangle is found (before next iteration)
      if (options.onProgress) {
        const processedCells = initialCellCount - cellSet.size;
        options.onProgress({
          current: processedCells,
          total: initialCellCount,
          percentage: Math.round((processedCells / initialCellCount) * 100),
        });
      }
    }
    
    return rectangles;
  }
  
  /**
   * Async version that processes rectangles in batches with yielding between batches
   * Allows UI updates to render progress
   */
  private static async findLargestRectanglesAsync(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions
  ): Promise<OptimizedRectangle[]> {
    const cellSet = new Set(cells.map(c => `${c.x},${c.z}`));
    const rectangles: OptimizedRectangle[] = [];
    
    // Track initial cell count for progress reporting
    const initialCellCount = cellSet.size;
    
    // Helper functions (same as sync version)
    const isRectangleFilled = (
      minX: number,
      maxX: number,
      minZ: number,
      maxZ: number
    ): boolean => {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!cellSet.has(`${x},${z}`)) {
            return false;
          }
        }
      }
      return true;
    };
    
    const getRectangleCells = (
      minX: number,
      maxX: number,
      minZ: number,
      maxZ: number
    ): Set<string> => {
      const rectCells = new Set<string>();
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          rectCells.add(`${x},${z}`);
        }
      }
      return rectCells;
    };
    
    const findLargestRectangleFromSeed = (
      seedX: number,
      seedZ: number
    ): OptimizedRectangle | null => {
      // Find maximum width we can extend horizontally from seed
      let minX = seedX;
      let maxX = seedX;
      
      // Extend right
      while (cellSet.has(`${maxX + 1},${seedZ}`)) {
        maxX++;
      }
      // Extend left
      while (cellSet.has(`${minX - 1},${seedZ}`)) {
        minX--;
      }
      
      // Now find maximum height for this width
      let minZ = seedZ;
      let maxZ = seedZ;
      let canExpandUp = true;
      let canExpandDown = true;
      
      // Try to expand vertically as far as possible
      while (canExpandUp || canExpandDown) {
        // Try expanding up (negative Z)
        if (canExpandUp) {
          let allCellsPresent = true;
          for (let x = minX; x <= maxX; x++) {
            if (!cellSet.has(`${x},${minZ - 1}`)) {
              allCellsPresent = false;
              break;
            }
          }
          if (allCellsPresent) {
            minZ--;
          } else {
            canExpandUp = false;
          }
        }
        
        // Try expanding down (positive Z)
        if (canExpandDown) {
          let allCellsPresent = true;
          for (let x = minX; x <= maxX; x++) {
            if (!cellSet.has(`${x},${maxZ + 1}`)) {
              allCellsPresent = false;
              break;
            }
          }
          if (allCellsPresent) {
            maxZ++;
          } else {
            canExpandDown = false;
          }
        }
      }
      
      const area = (maxX - minX + 1) * (maxZ - minZ + 1);
      
      // Check size constraints
      if (options.minRectangleSize && area < options.minRectangleSize) {
        return null;
      }
      if (options.maxRectangleSize && area > options.maxRectangleSize) {
        // Rectangle is too large - we'll let it be split later
      }
      
      // Verify the rectangle is actually filled
      if (!isRectangleFilled(minX, maxX, minZ, maxZ)) {
        return null;
      }
      
      const rectCells = getRectangleCells(minX, maxX, minZ, maxZ);
      
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        cells: rectCells,
        area,
      };
    };
    
    // Process rectangles in batches with yielding between batches
    const RECTANGLES_PER_BATCH = 1; // Process 1 rectangle, then yield (very frequent updates)
    let rectangleIterations = 0;
    let rectanglesInCurrentBatch = 0;
    
    while (cellSet.size > 0) {
      rectangleIterations++;
      rectanglesInCurrentBatch++;
      
      const remainingCells = Array.from(cellSet).map(key => {
        const [x, z] = key.split(',').map(Number);
        return { x, z, key };
      });
      
      // Find the largest rectangle starting from any remaining cell
      const MAX_SEEDS_TO_TRY = Math.min(remainingCells.length, 20);
      let seedsToTry: Array<{x: number, z: number, key: string}>;
      if (remainingCells.length <= MAX_SEEDS_TO_TRY) {
        seedsToTry = remainingCells;
      } else {
        const step = Math.floor(remainingCells.length / MAX_SEEDS_TO_TRY);
        seedsToTry = [];
        for (let i = 0; i < MAX_SEEDS_TO_TRY; i++) {
          seedsToTry.push(remainingCells[i * step]);
        }
      }
      
      let bestRect: OptimizedRectangle | null = null;
      let bestArea = 0;
      
      // Try a limited subset of cells as seeds
      for (const seed of seedsToTry) {
        const rect = findLargestRectangleFromSeed(seed.x, seed.z);
        if (rect && rect.area > bestArea) {
          bestArea = rect.area;
          bestRect = rect;
        }
        
        // Early exit: if we found a rectangle that meets max size, use it immediately
        if (options.maxRectangleSize && bestArea >= options.maxRectangleSize) {
          break;
        }
      }
      
      // If no rectangle found, create single-cell rectangle from first remaining cell
      if (!bestRect) {
        const seed = remainingCells[0];
        const rectCells = new Set([seed.key]);
        bestRect = {
          minX: seed.x,
          maxX: seed.x,
          minZ: seed.z,
          maxZ: seed.z,
          cells: rectCells,
          area: 1,
        };
      }
      
      // If rectangle exceeds max size, split it into smaller rectangles
      if (options.maxRectangleSize && bestRect.area > options.maxRectangleSize) {
        const splitRects = this.splitRectangle(bestRect, options.maxRectangleSize);
        splitRects.forEach(rect => {
          rect.cells.forEach(cellKey => {
            cellSet.delete(cellKey);
          });
          rectangles.push(rect);
        });
        continue; // Skip adding bestRect, we've already added the splits
      }
      
      // Remove covered cells
      bestRect.cells.forEach(cellKey => {
        cellSet.delete(cellKey);
      });
      
      rectangles.push(bestRect);
      
      // Report progress after each rectangle
      if (options.onProgress) {
        const processedCells = initialCellCount - cellSet.size;
        const percentage = Math.round((processedCells / initialCellCount) * 100);
        options.onProgress({
          current: processedCells,
          total: initialCellCount,
          percentage,
        });
      }
      
      // Yield control every N rectangles to allow UI updates
      if (rectanglesInCurrentBatch >= RECTANGLES_PER_BATCH) {
        rectanglesInCurrentBatch = 0;
        // Yield control to event loop - allows React to render progress updates
        // Use setTimeout with 1ms to ensure the event loop processes other tasks
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1);
        });
      }
    }
    
    return rectangles;
  }
  
  /**
   * Validate optimization result
   * 
   * Ensures:
   * - All input cells are covered exactly once
   * - No overlapping rectangles
   * - Rectangle bounds match cell bounds
   */
  static validateResult(
    cells: Array<{x: number, z: number}>,
    result: OptimizationResult
  ): boolean {
    // Check total cells match
    if (result.totalCells !== cells.length) {
      console.error('[GeometryOptimizer] Total cells mismatch:', {
        expected: cells.length,
        actual: result.totalCells,
      });
      return false;
    }
    
    // Check all cells are covered
    const coveredCells = new Set<string>();
    for (const rect of result.rectangles) {
      for (const cellKey of rect.cells) {
        if (coveredCells.has(cellKey)) {
          console.error('[GeometryOptimizer] Duplicate cell coverage:', cellKey);
          return false;
        }
        coveredCells.add(cellKey);
      }
    }
    
    // Check all input cells are covered
    const inputCellSet = new Set(cells.map(c => `${c.x},${c.z}`));
    for (const cellKey of inputCellSet) {
      if (!coveredCells.has(cellKey)) {
        console.error('[GeometryOptimizer] Missing cell coverage:', cellKey);
        return false;
      }
    }
    
    // Check for extra cells (shouldn't happen, but verify)
    for (const cellKey of coveredCells) {
      if (!inputCellSet.has(cellKey)) {
        console.error('[GeometryOptimizer] Extra cell in result:', cellKey);
        return false;
      }
    }
    
    // Validate rectangle bounds
    for (let index = 0; index < result.rectangles.length; index++) {
      const rect = result.rectangles[index];
      
      // Check rectangle contains all its cells
      for (const cellKey of rect.cells) {
        const [x, z] = cellKey.split(',').map(Number);
        if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) {
          console.error('[GeometryOptimizer] Cell outside rectangle bounds:', {
            cellKey,
            rect: { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ },
            index,
          });
          return false;
        }
      }
      
      // Check area matches
      const expectedArea = (rect.maxX - rect.minX + 1) * (rect.maxZ - rect.minZ + 1);
      if (rect.area !== expectedArea) {
        console.error('[GeometryOptimizer] Rectangle area mismatch:', {
          expected: expectedArea,
          actual: rect.area,
          index,
        });
        return false;
      }
      
      // Check area matches cell count
      if (rect.cells.size !== expectedArea) {
        console.error('[GeometryOptimizer] Rectangle cell count mismatch:', {
          expected: expectedArea,
          actual: rect.cells.size,
          index,
        });
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Split a rectangle that exceeds maxRectangleSize into smaller rectangles
   * Uses a simple grid-based splitting approach
   */
  private static splitRectangle(
    rect: OptimizedRectangle,
    maxSize: number
  ): OptimizedRectangle[] {
    const width = rect.maxX - rect.minX + 1;
    const height = rect.maxZ - rect.minZ + 1;
    const area = width * height;
    
    if (area <= maxSize) {
      return [rect]; // No need to split
    }
    
    const splitRects: OptimizedRectangle[] = [];
    
    // Calculate optimal grid dimensions to split into
    // Try to make rectangles as square as possible while respecting maxSize
    const cols = Math.ceil(Math.sqrt((width * height) / maxSize) * (width / height));
    const rows = Math.ceil((width * height) / (maxSize * cols));
    
    const cellWidth = Math.ceil(width / cols);
    const cellHeight = Math.ceil(height / rows);
    
    // Split into grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const startX = rect.minX + col * cellWidth;
        const endX = Math.min(rect.minX + (col + 1) * cellWidth - 1, rect.maxX);
        const startZ = rect.minZ + row * cellHeight;
        const endZ = Math.min(rect.minZ + (row + 1) * cellHeight - 1, rect.maxZ);
        
        // Only create rectangle if it has valid bounds
        if (startX <= endX && startZ <= endZ) {
          const rectCells = new Set<string>();
          for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
              const cellKey = `${x},${z}`;
              if (rect.cells.has(cellKey)) {
                rectCells.add(cellKey);
              }
            }
          }
          
          if (rectCells.size > 0) {
            const splitArea = (endX - startX + 1) * (endZ - startZ + 1);
            splitRects.push({
              minX: startX,
              maxX: endX,
              minZ: startZ,
              maxZ: endZ,
              cells: rectCells,
              area: splitArea,
            });
          }
        }
      }
    }
    
    return splitRects.length > 0 ? splitRects : [rect]; // Fallback to original if split failed
  }
}

