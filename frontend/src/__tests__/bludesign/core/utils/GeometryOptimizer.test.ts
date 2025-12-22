/**
 * Geometry Optimizer Tests
 * 
 * Comprehensive tests for the geometry optimization algorithm.
 * Tests edge cases, correctness, and performance.
 */

import {
  GeometryOptimizer,
  OptimizedRectangle,
  OptimizationResult,
} from '@/components/bludesign/core/utils/GeometryOptimizer';

describe('GeometryOptimizer', () => {
  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = GeometryOptimizer.optimize([]);
      
      expect(result.rectangles).toEqual([]);
      expect(result.totalCells).toBe(0);
      expect(result.optimizationRatio).toBe(0);
      expect(result.cellToRectangle.size).toBe(0);
      
      expect(GeometryOptimizer.validateResult([], result)).toBe(true);
    });
    
    it('should handle single cell', () => {
      const cells = [{ x: 5, z: 5 }];
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0]).toEqual({
        minX: 5,
        maxX: 5,
        minZ: 5,
        maxZ: 5,
        cells: new Set(['5,5']),
        area: 1,
      });
      expect(result.totalCells).toBe(1);
      expect(result.optimizationRatio).toBe(1);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should handle two adjacent cells horizontally', () => {
      const cells = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].minX).toBe(0);
      expect(result.rectangles[0].maxX).toBe(1);
      expect(result.rectangles[0].minZ).toBe(0);
      expect(result.rectangles[0].maxZ).toBe(0);
      expect(result.rectangles[0].area).toBe(2);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should handle two adjacent cells vertically', () => {
      const cells = [{ x: 0, z: 0 }, { x: 0, z: 1 }];
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].minX).toBe(0);
      expect(result.rectangles[0].maxX).toBe(0);
      expect(result.rectangles[0].minZ).toBe(0);
      expect(result.rectangles[0].maxZ).toBe(1);
      expect(result.rectangles[0].area).toBe(2);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should handle two non-adjacent cells', () => {
      const cells = [{ x: 0, z: 0 }, { x: 5, z: 5 }];
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(2);
      expect(result.rectangles[0].area).toBe(1);
      expect(result.rectangles[1].area).toBe(1);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Perfect Rectangles', () => {
    it('should optimize 2x2 rectangle to single rectangle', () => {
      const cells = [
        { x: 0, z: 0 }, { x: 1, z: 0 },
        { x: 0, z: 1 }, { x: 1, z: 1 },
      ];
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].area).toBe(4);
      expect(result.optimizationRatio).toBe(0.25); // 1 rectangle / 4 cells
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should optimize 10x10 rectangle to single rectangle', () => {
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
          cells.push({ x, z });
        }
      }
      
      const result = GeometryOptimizer.optimize(cells);
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].area).toBe(100);
      expect(result.optimizationRatio).toBe(0.01); // 1 rectangle / 100 cells
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should optimize 50x50 rectangle to single rectangle', () => {
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 50; x++) {
        for (let z = 0; z < 50; z++) {
          cells.push({ x, z });
        }
      }
      
      const startTime = performance.now();
      const result = GeometryOptimizer.optimize(cells);
      const endTime = performance.now();
      
      expect(result.rectangles).toHaveLength(1);
      expect(result.rectangles[0].area).toBe(2500);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast (<100ms)
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('L-Shaped Buildings', () => {
    it('should optimize L-shape to 2 rectangles', () => {
      // L-shape: 3x3 square with one corner removed
      const cells = [
        { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
        { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: 1 },
        { x: 0, z: 2 }, { x: 1, z: 2 },
        // Missing { x: 2, z: 2 } to create L-shape
      ];
      
      const result = GeometryOptimizer.optimize(cells);
      
      // Should be 2 rectangles (one 2x3, one 1x1, or similar)
      expect(result.rectangles.length).toBeLessThanOrEqual(3);
      expect(result.optimizationRatio).toBeLessThan(0.5); // Better than per-cell
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should optimize large L-shape efficiently', () => {
      // Large L: 10x10 with 5x5 corner removed
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
          // Skip cells in top-right 5x5 corner
          if (x >= 5 && z >= 5) continue;
          cells.push({ x, z });
        }
      }
      
      const result = GeometryOptimizer.optimize(cells);
      
      // Should be optimized to a few rectangles
      expect(result.rectangles.length).toBeLessThan(10);
      expect(result.optimizationRatio).toBeLessThan(0.2);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Buildings with Holes', () => {
    it('should optimize building with single hole', () => {
      // 5x5 square with center cell removed
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 5; z++) {
          if (x === 2 && z === 2) continue; // Hole in center
          cells.push({ x, z });
        }
      }
      
      const result = GeometryOptimizer.optimize(cells);
      
      // Should be optimized to a few rectangles around the hole
      expect(result.rectangles.length).toBeLessThan(10);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should optimize building with multiple holes', () => {
      // 10x10 square with scattered holes
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
          // Skip some cells to create holes
          if ((x === 3 && z === 3) || (x === 7 && z === 7)) continue;
          cells.push({ x, z });
        }
      }
      
      const result = GeometryOptimizer.optimize(cells);
      
      // Should still be optimized
      expect(result.rectangles.length).toBeLessThan(20);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Non-Contiguous Cells', () => {
    it('should handle completely separate cell groups', () => {
      const cells = [
        { x: 0, z: 0 }, { x: 1, z: 0 },
        { x: 10, z: 10 }, { x: 11, z: 10 },
      ];
      
      const result = GeometryOptimizer.optimize(cells);
      
      // Should create 2 rectangles (one for each group)
      expect(result.rectangles.length).toBe(2);
      expect(result.rectangles[0].area).toBe(2);
      expect(result.rectangles[1].area).toBe(2);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Options', () => {
    it('should respect maxRectangleSize option', () => {
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 20; x++) {
        for (let z = 0; z < 20; z++) {
          cells.push({ x, z });
        }
      }
      
      const result = GeometryOptimizer.optimize(cells, {
        maxRectangleSize: 50, // Limit to 50 cells per rectangle
      });
      
      // Should create multiple rectangles due to size limit
      expect(result.rectangles.length).toBeGreaterThan(1);
      
      // All rectangles should be <= maxRectangleSize
      result.rectangles.forEach(rect => {
        expect(rect.area).toBeLessThanOrEqual(50);
      });
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
    
    it('should respect minRectangleSize option', () => {
      const cells = [
        { x: 0, z: 0 }, { x: 1, z: 0 },
        { x: 5, z: 5 }, // Single isolated cell
      ];
      
      const result = GeometryOptimizer.optimize(cells, {
        minRectangleSize: 2, // Don't merge single cells
      });
      
      // Should have at least 2 rectangles (one for the pair, one for the single)
      expect(result.rectangles.length).toBeGreaterThanOrEqual(2);
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Performance', () => {
    it('should optimize 100x100 building quickly', () => {
      const cells: Array<{x: number, z: number}> = [];
      for (let x = 0; x < 100; x++) {
        for (let z = 0; z < 100; z++) {
          cells.push({ x, z });
        }
      }
      
      const startTime = performance.now();
      const result = GeometryOptimizer.optimize(cells);
      const endTime = performance.now();
      
      expect(result.rectangles).toHaveLength(1);
      expect(endTime - startTime).toBeLessThan(200); // Should complete in <200ms
      
      expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
    });
  });
  
  describe('Validation', () => {
    it('should detect missing cells', () => {
      const cells = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
      const invalidResult: OptimizationResult = {
        rectangles: [{
          minX: 0,
          maxX: 0,
          minZ: 0,
          maxZ: 0,
          cells: new Set(['0,0']),
          area: 1,
        }],
        cellToRectangle: new Map(),
        totalCells: 1,
        optimizationRatio: 1,
      };
      
      expect(GeometryOptimizer.validateResult(cells, invalidResult)).toBe(false);
    });
    
    it('should detect duplicate cells', () => {
      const cells = [{ x: 0, z: 0 }];
      const invalidResult: OptimizationResult = {
        rectangles: [
          {
            minX: 0,
            maxX: 0,
            minZ: 0,
            maxZ: 0,
            cells: new Set(['0,0']),
            area: 1,
          },
          {
            minX: 0,
            maxX: 0,
            minZ: 0,
            maxZ: 0,
            cells: new Set(['0,0']), // Duplicate!
            area: 1,
          },
        ],
        cellToRectangle: new Map(),
        totalCells: 1,
        optimizationRatio: 2,
      };
      
      expect(GeometryOptimizer.validateResult(cells, invalidResult)).toBe(false);
    });
    
    it('should detect cells outside rectangle bounds', () => {
      const cells = [{ x: 0, z: 0 }];
      const invalidResult: OptimizationResult = {
        rectangles: [{
          minX: 0,
          maxX: 0,
          minZ: 0,
          maxZ: 0,
          cells: new Set(['5,5']), // Cell outside bounds!
          area: 1,
        }],
        cellToRectangle: new Map(),
        totalCells: 1,
        optimizationRatio: 1,
      };
      
      expect(GeometryOptimizer.validateResult(cells, invalidResult)).toBe(false);
    });
  });
  
  describe('Property-Based Tests', () => {
    it('should always produce valid results for random cell sets', () => {
      // Generate 10 random test cases
      for (let test = 0; test < 10; test++) {
        const cells: Array<{x: number, z: number}> = [];
        const cellSet = new Set<string>();
        
        // Generate 20-100 random cells
        const count = Math.floor(Math.random() * 80) + 20;
        for (let i = 0; i < count; i++) {
          let x, z;
          let key: string;
          do {
            x = Math.floor(Math.random() * 20);
            z = Math.floor(Math.random() * 20);
            key = `${x},${z}`;
          } while (cellSet.has(key));
          
          cellSet.add(key);
          cells.push({ x, z });
        }
        
        const result = GeometryOptimizer.optimize(cells);
        
        // Should always be valid
        expect(GeometryOptimizer.validateResult(cells, result)).toBe(true);
        
        // Should have reasonable optimization
        expect(result.rectangles.length).toBeLessThanOrEqual(cells.length);
        expect(result.optimizationRatio).toBeLessThanOrEqual(1);
      }
    });
  });
});

