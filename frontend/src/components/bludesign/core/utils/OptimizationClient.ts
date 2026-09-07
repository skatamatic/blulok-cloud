/**
 * Optimization Client Interface
 * 
 * Implemented by managers that want to use the centralized optimization system.
 * Provides a clean contract for optimization requests and results.
 */

import { OptimizationResult, OptimizationOptions } from './GeometryOptimizer';

/**
 * Represents a cell position for optimization
 */
export interface OptimizationCell {
  x: number;
  z: number;
}

/**
 * Context for an optimization request
 * Used to identify and cache optimization results
 */
export interface OptimizationContext {
  /**
   * Unique identifier for this optimization context
   * Examples: "ground-tile-PAVEMENT", "building-floor-123-0", "building-roof-456"
   */
  id: string;
  
  /**
   * Cells to optimize
   */
  cells: OptimizationCell[];
  
  /**
   * Options for this optimization
   */
  options: OptimizationOptions;
  
  /**
   * Optional metadata for tracking/debugging
   */
  metadata?: Record<string, any>;
}

/**
 * Client interface for optimization consumers
 */
export interface OptimizationClient {
  /**
   * Get unique identifier for this client
   * Used for caching and invalidation
   */
  getOptimizationId(): string;
  
  /**
   * Get all optimization contexts this client manages
   * Each context represents a separate optimization target (e.g., category, floor, roof)
   */
  getOptimizationContexts(): OptimizationContext[];
  
  /**
   * Called when optimization completes successfully
   * @param contextId - The ID of the context that was optimized
   * @param result - The optimization result
   */
  onOptimizationComplete(contextId: string, result: OptimizationResult): void | Promise<void>;
  
  /**
   * Called when optimization is invalidated
   * @param contextId - The ID of the context that was invalidated (or undefined for all)
   */
  onOptimizationInvalidated(contextId?: string): void | Promise<void>;
}

