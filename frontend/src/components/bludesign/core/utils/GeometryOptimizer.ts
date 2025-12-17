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
}

export class GeometryOptimizer {
  /**
   * Main optimization function - pure, testable
   * 
   * @param cells - Array of grid cell positions
   * @param options - Optimization options
   * @returns Optimization result with rectangles and validation data
   */
  static optimize(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions = {}
  ): OptimizationResult {
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
    const singleRect = this.isSingleRectangle(cells);
    if (singleRect) {
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
    const rectangles = this.findLargestRectangles(cells, options);
    
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
   * Greedy algorithm: Find largest rectangles
   * 
   * Algorithm:
   * 1. Create cell set for O(1) lookup
   * 2. While cells remain:
   *    a. Pick any remaining cell as seed
   *    b. Try all possible rectangles starting from that cell
   *    c. Select largest valid rectangle
   *    d. Remove covered cells
   *    e. Repeat
   */
  private static findLargestRectangles(
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
    
    // Greedy: Keep finding largest rectangles
    while (cellSet.size > 0) {
      // Get any remaining cell as seed
      const seedKey = Array.from(cellSet)[0];
      const [seedX, seedZ] = seedKey.split(',').map(Number);
      
      // Find largest rectangle starting from this seed
      let bestRect: OptimizedRectangle | null = null;
      let bestArea = 0;
      
      // Try all possible rectangles that include this seed
      // We'll try all possible top-left corners that could contain this seed
      const remainingCells = Array.from(cellSet).map(key => {
        const [x, z] = key.split(',').map(Number);
        return { x, z };
      });
      
      const minX = Math.min(...remainingCells.map(c => c.x));
      const maxX = Math.max(...remainingCells.map(c => c.x));
      const minZ = Math.min(...remainingCells.map(c => c.z));
      const maxZ = Math.max(...remainingCells.map(c => c.z));
      
      // Try all possible rectangles
      for (let startX = minX; startX <= seedX; startX++) {
        for (let startZ = minZ; startZ <= seedZ; startZ++) {
          // Try all possible end positions
          for (let endX = seedX; endX <= maxX; endX++) {
            for (let endZ = seedZ; endZ <= maxZ; endZ++) {
              // Check size constraints
              const width = endX - startX + 1;
              const height = endZ - startZ + 1;
              const area = width * height;
              
              if (options.maxRectangleSize && area > options.maxRectangleSize) {
                continue; // Too large
              }
              
              if (options.minRectangleSize && area < options.minRectangleSize) {
                continue; // Too small (skip merging)
              }
              
              // Check if rectangle is filled
              if (isRectangleFilled(startX, endX, startZ, endZ)) {
                if (area > bestArea) {
                  bestArea = area;
                  const rectCells = getRectangleCells(startX, endX, startZ, endZ);
                  bestRect = {
                    minX: startX,
                    maxX: endX,
                    minZ: startZ,
                    maxZ: endZ,
                    cells: rectCells,
                    area,
                  };
                }
              }
            }
          }
        }
      }
      
      // If no rectangle found, create single-cell rectangle
      if (!bestRect) {
        const rectCells = new Set([seedKey]);
        bestRect = {
          minX: seedX,
          maxX: seedX,
          minZ: seedZ,
          maxZ: seedZ,
          cells: rectCells,
          area: 1,
        };
      }
      
      // Remove covered cells
      bestRect.cells.forEach(cellKey => {
        cellSet.delete(cellKey);
      });
      
      rectangles.push(bestRect);
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
}
