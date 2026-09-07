/**
 * Optimization Manager
 * 
 * Centralized optimization system for BluDesign.
 * Coordinates geometry optimization across all managers (BuildingManager, GroundTileManager).
 * 
 * Provides:
 * - Single source of truth for optimization state
 * - Unified caching and invalidation
 * - Consistent optimization behavior
 * - Performance analytics
 */

import {
  GeometryOptimizer,
  OptimizationResult,
  OptimizationOptions,
} from './utils/GeometryOptimizer';
import {
  OptimizationClient,
  OptimizationContext,
} from './utils/OptimizationClient';

/**
 * Statistics about optimization performance
 */
export interface OptimizationStats {
  totalOptimizations: number;
  totalCellsOptimized: number;
  averageOptimizationRatio: number;
  cacheHits: number;
  cacheMisses: number;
  lastOptimizationTime: number;
}

/**
 * Progress callback for optimization operations
 */
export type OptimizationProgressCallback = (progress: {
  percentage: number;
  message: string;
  operation: 'optimization';
}) => void;

/**
 * Centralized optimization manager
 */
export class OptimizationManager {
  private static instance: OptimizationManager | null = null;
  
  // Client registry
  private clients: Map<string, OptimizationClient> = new Map();
  
  // Optimization state
  private enabled: boolean = true;
  private readonlyMode: boolean = false;
  
  // Result cache: contextId -> OptimizationResult
  private cache: Map<string, OptimizationResult> = new Map();
  
  // Statistics
  private stats: OptimizationStats = {
    totalOptimizations: 0,
    totalCellsOptimized: 0,
    averageOptimizationRatio: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastOptimizationTime: 0,
  };
  
  // Pending optimizations (for debouncing/batching)
  private pendingOptimizations: Set<string> = new Set();
  private optimizationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly OPTIMIZE_DEBOUNCE_MS = 666; // Debounce for batching (increased to reduce progress flickering)
  
  // Flag to prevent re-entrant optimization processing
  private isProcessing: boolean = false;
  
  // Progress callback (optional, set by BluDesignEngine)
  private progressCallback: OptimizationProgressCallback | null = null;
  
  /**
   * Check if optimization is currently in progress (processing or pending)
   */
  isOptimizing(): boolean {
    return this.isProcessing || this.pendingOptimizations.size > 0;
  }
  
  /**
   * Check if optimization will show progress (i.e., if there are enough cells to warrant progress reporting)
   * This helps determine if we should wait for optimization progress or complete immediately
   */
  willShowOptimizationProgress(): boolean {
    if (!this.enabled || this.pendingOptimizations.size === 0) {
      return false;
    }
    
    // Collect all contexts from all clients to count total cells
    let totalCells = 0;
    this.clients.forEach(client => {
      try {
        const contexts = client.getOptimizationContexts();
        contexts.forEach(context => {
          if (this.pendingOptimizations.has(context.id)) {
            totalCells += context.cells.length;
          }
        });
      } catch (error) {
        // Ignore errors - will return false
      }
    });
    
    // Only show progress if >= 500 cells (matches the threshold in processPendingOptimizations)
    return totalCells >= 500;
  }
  
  private constructor() {
    // Private constructor for singleton
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): OptimizationManager {
    if (!this.instance) {
      this.instance = new OptimizationManager();
    }
    return this.instance;
  }
  
  /**
   * Set progress callback for optimization operations
   */
  setProgressCallback(callback: OptimizationProgressCallback | null): void {
    this.progressCallback = callback;
  }
  
  /**
   * Register an optimization client
   */
  registerClient(client: OptimizationClient): void {
    const id = client.getOptimizationId();
    this.clients.set(id, client);
    
    // If already enabled, trigger initial optimization for this client
    if (this.enabled) {
      // Run async optimization (don't await to avoid blocking registration)
      this.optimizeClient(client, true).catch(error => {
        console.error(`[OptimizationManager] Error during initial optimization for client ${client.getOptimizationId()}:`, error);
      });
    }
  }
  
  /**
   * Unregister an optimization client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      // Invalidate all contexts for this client
      const contexts = client.getOptimizationContexts();
      contexts.forEach(context => {
        this.cache.delete(context.id);
      });
    }
    this.clients.delete(clientId);
  }
  
  /**
   * Set optimizer enabled state
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) return;
    
    this.enabled = enabled;
    
    if (enabled) {
      // Optimize all registered clients
      // Run async optimization (don't await to avoid blocking)
      this.optimizeAll().catch(error => {
        console.error('[OptimizationManager] Error during optimizeAll:', error);
      });
    } else {
      // Invalidate all caches but keep current rendering
      this.cache.clear();
      
      // Notify all clients that optimization is disabled
      const promises: Promise<void>[] = [];
      this.clients.forEach(client => {
        const result = client.onOptimizationInvalidated();
        if (result instanceof Promise) {
          promises.push(result);
        }
      });
      await Promise.all(promises);
    }
  }
  
  /**
   * Check if optimizer is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Set readonly mode (affects optimization aggressiveness)
   */
  setReadonlyMode(readonly: boolean): void {
    if (this.readonlyMode === readonly) return;
    
    this.readonlyMode = readonly;
    
    // Invalidate all optimizations to rebuild with new strategy
    this.invalidateAll();
  }
  
  /**
   * Check if in readonly mode
   */
  isReadonlyMode(): boolean {
    return this.readonlyMode;
  }
  
  /**
   * Optimize a specific context immediately
   * @param context - The optimization context
   * @param force - Force re-optimization even if cached
   * @returns The optimization result (may be cached)
   */
  async optimizeContext(context: OptimizationContext, force: boolean = false): Promise<OptimizationResult | null> {
    if (!this.enabled) {
      return null;
    }
    
    // Check cache first
    if (!force && this.cache.has(context.id)) {
      this.stats.cacheHits++;
      return this.cache.get(context.id)!;
    }
    
    this.stats.cacheMisses++;
    
    // Merge readonly mode into options
    const options: OptimizationOptions = {
      ...context.options,
      readonly: this.readonlyMode,
    };
    
    // Perform optimization with timing
    const startTime = performance.now();
    const result = await GeometryOptimizer.optimize(context.cells, options);
    const endTime = performance.now();
    
    // Validate result
    if (!GeometryOptimizer.validateResult(context.cells, result)) {
      console.error(`[OptimizationManager] Optimization validation failed for context: ${context.id}`);
      // Don't update stats on failure - revert cacheMisses increment
      this.stats.cacheMisses--;
      return null;
    }
    
    // Update statistics (only on successful optimization)
    this.stats.totalOptimizations++;
    this.stats.totalCellsOptimized += context.cells.length;
    this.stats.lastOptimizationTime = endTime - startTime;
    
    // Update average optimization ratio
    const totalRatio = this.stats.averageOptimizationRatio * (this.stats.totalOptimizations - 1);
    this.stats.averageOptimizationRatio = (totalRatio + result.optimizationRatio) / this.stats.totalOptimizations;
    
    // Cache result
    this.cache.set(context.id, result);
    
    return result;
  }
  
  /**
   * Optimize a context asynchronously with progress reporting
   * Yields control periodically to allow UI updates
   */
  private async optimizeContextAsync(
    context: OptimizationContext,
    force: boolean,
    onProgress?: (percentage: number) => void
  ): Promise<OptimizationResult | null> {
    if (!this.enabled) {
      return null;
    }
    
    // Check cache first
    if (!force && this.cache.has(context.id)) {
      this.stats.cacheHits++;
      return this.cache.get(context.id)!;
    }
    
    this.stats.cacheMisses++;
    
    // Merge readonly mode into options
    // Progress callback will be called during optimization, and the async algorithm will yield
    const options: OptimizationOptions = {
      ...context.options,
      readonly: this.readonlyMode,
      onProgress: onProgress ? (progress) => {
        // Call progress callback directly - the async algorithm yields between batches
        // This will be called during the optimization loop, and the algorithm yields after each batch
        onProgress(progress.percentage);
      } : undefined,
    };
    
    // Perform optimization with progress callbacks
    const startTime = performance.now();
    const result = await this.optimizeWithYielding(context.cells, options);
    const endTime = performance.now();
    
    if (!result) {
      return null;
    }
    
    // Validate result
    if (!GeometryOptimizer.validateResult(context.cells, result)) {
      console.error(`[OptimizationManager] Optimization validation failed for context: ${context.id}`);
      this.stats.cacheMisses--;
      return null;
    }
    
    // Update statistics
    this.stats.totalOptimizations++;
    this.stats.totalCellsOptimized += context.cells.length;
    this.stats.lastOptimizationTime = endTime - startTime;
    
    const totalRatio = this.stats.averageOptimizationRatio * (this.stats.totalOptimizations - 1);
    this.stats.averageOptimizationRatio = (totalRatio + result.optimizationRatio) / this.stats.totalOptimizations;
    
    // Cache result
    this.cache.set(context.id, result);
    
    return result;
  }
  
  /**
   * Optimize with periodic yielding to allow UI updates
   * The GeometryOptimizer.optimize is now async and yields control between batches
   */
  private async optimizeWithYielding(
    cells: Array<{x: number, z: number}>,
    options: OptimizationOptions
  ): Promise<OptimizationResult> {
    // Run async optimization - it will yield control between batches internally
    const result = await GeometryOptimizer.optimize(cells, options);
    return result;
  }
  
  /**
   * Request optimization for a context (may be debounced)
   * Invalidates cache to ensure fresh optimization
   */
  requestOptimization(contextId: string): void {
    if (!this.enabled) return;
    
    // Invalidate cache for this context so we get fresh optimization
    this.cache.delete(contextId);
    
    this.pendingOptimizations.add(contextId);
    
    // Clear existing timer
    if (this.optimizationTimer) {
      clearTimeout(this.optimizationTimer);
    }
    
    // Schedule batch optimization
    this.optimizationTimer = setTimeout(() => {
      this.processPendingOptimizations();
      this.optimizationTimer = null;
    }, this.OPTIMIZE_DEBOUNCE_MS);
  }
  
  /**
   * Process all pending optimizations
   * Prevents re-entrant calls to avoid infinite loops
   */
  private processPendingOptimizations(): void {
    
    // Prevent re-entrant processing (e.g., if onOptimizationComplete triggers another optimization)
    if (this.isProcessing) {
      console.warn('[OptimizationManager] Already processing optimizations, skipping re-entrant call');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const contextIds = Array.from(this.pendingOptimizations);
      this.pendingOptimizations.clear();
      
      if (contextIds.length === 0) {
        this.isProcessing = false;
        return;
      }
      
      // Find contexts across all clients
      // Process optimizations asynchronously to avoid blocking UI thread
      // For large batches (3000+ cells), optimization can take 20+ seconds
      const optimizationPromises: Promise<void>[] = [];
      
      // Collect all contexts first to calculate progress
      const contextsToOptimize: Array<{context: OptimizationContext, client: OptimizationClient}> = [];
      this.clients.forEach(client => {
        try {
          const contexts = client.getOptimizationContexts();
          contexts.forEach(context => {
            if (contextIds.includes(context.id)) {
              contextsToOptimize.push({ context, client });
            }
          });
        } catch (error) {
          console.error(`[OptimizationManager] Error getting optimization contexts for client ${client.getOptimizationId()}:`, error);
        }
      });
      
      const totalContexts = contextsToOptimize.length;
      
      // Show progress for optimizations (lower threshold: 500 cells, or if we have a callback)
      // The callback will only be set if batch placement already showed progress
      const totalCells = contextsToOptimize.reduce((sum, item) => sum + item.context.cells.length, 0);
      const shouldShowProgress = this.progressCallback && totalCells >= 500;
      
      // Track overall progress across all contexts
      // We'll report progress based on completed contexts, not individual context progress
      let completedContexts = 0;
      
      if (shouldShowProgress) {
        // Start at 30% (batch placement was 0-30%)
        this.progressCallback!({
          percentage: 30,
          message: `Optimizing ${totalContexts} groups...`,
          operation: 'optimization',
        });
      }
      
      // Process each context
      contextsToOptimize.forEach(({ context, client }) => {
        
        // Run optimization asynchronously with progress reporting
        // We'll run it in chunks to allow UI updates between iterations
        const promise = new Promise<void>((resolve) => {
          const runOptimization = async () => {
            try {
              // Force re-optimization (cache was already invalidated in requestOptimization)
              // Don't report per-context progress - we'll report overall progress instead
              const result = await this.optimizeContextAsync(context, true, undefined);
              
              if (result) {
                try {
                  await client.onOptimizationComplete(context.id, result);
                } catch (error) {
                  console.error(`[OptimizationManager] Error in onOptimizationComplete for client ${client.getOptimizationId()}:`, error);
                }
              } else {
                console.warn(`[OptimizationManager] Optimization returned null for context: ${context.id}`);
              }
              
              // Update overall progress based on completed contexts
              completedContexts++;
              if (shouldShowProgress && this.progressCallback) {
                // Map from 30-100% based on how many contexts are done
                // Use 30% as minimum (batch placement was 0-30%), then 30-100% for optimization
                const contextProgress = completedContexts / totalContexts;
                const mappedPercentage = Math.min(100, 30 + Math.round(contextProgress * 70));
                this.progressCallback({
                  percentage: mappedPercentage,
                  message: `Optimizing ${completedContexts} of ${totalContexts} groups...`,
                  operation: 'optimization',
                });
              }
            } catch (error) {
              console.error(`[OptimizationManager] Error during optimization for context ${context.id}:`, error);
              // Still count as completed to avoid getting stuck
              completedContexts++;
            } finally {
              resolve();
            }
          };
          
          // Run immediately (async function handles yielding internally)
          runOptimization();
        });
        
        optimizationPromises.push(promise);
      });
      
      // Wait for all optimizations to complete before clearing isProcessing flag
      // This ensures we don't allow re-entrant calls while optimizations are still running
      Promise.all(optimizationPromises).finally(() => {
        // Complete progress - emit 100% once when ALL optimizations are done
        if (shouldShowProgress && this.progressCallback) {
          this.progressCallback({
            percentage: 100,
            message: 'Optimization complete!',
            operation: 'optimization',
          });
          // BluDesignEngine will emit progress-complete when it receives percentage >= 100
        }
        
        this.isProcessing = false;
      });
    } catch (error) {
      // If there's an error in the setup, clear the flag immediately
      this.isProcessing = false;
      console.error('[OptimizationManager] Error in processPendingOptimizations:', error);
    }
    // Note: isProcessing flag is cleared in Promise.all().finally() above
    // This allows optimizations to run asynchronously while preventing re-entrant calls
  }
  
  /**
   * Optimize a specific client
   */
  async optimizeClient(client: OptimizationClient, force: boolean = false): Promise<void> {
    try {
      const contexts = client.getOptimizationContexts();
      
      for (const context of contexts) {
        const result = await this.optimizeContext(context, force);
        if (result) {
          try {
            await client.onOptimizationComplete(context.id, result);
          } catch (error) {
            console.error(`[OptimizationManager] Error in onOptimizationComplete for client ${client.getOptimizationId()}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`[OptimizationManager] Error optimizing client ${client.getOptimizationId()}:`, error);
    }
  }
  
  /**
   * Optimize all registered clients
   */
  async optimizeAll(force: boolean = false): Promise<void> {
    const promises = Array.from(this.clients.values()).map(client => 
      this.optimizeClient(client, force)
    );
    await Promise.all(promises);
  }
  
  /**
   * Invalidate a specific context
   */
  async invalidate(contextId: string): Promise<void> {
    this.cache.delete(contextId);
    
    // Notify the client that owns this context
    const promises: Promise<void>[] = [];
    this.clients.forEach(client => {
      const contexts = client.getOptimizationContexts();
      if (contexts.some(ctx => ctx.id === contextId)) {
        const result = client.onOptimizationInvalidated(contextId);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    });
    await Promise.all(promises);
  }
  
  /**
   * Invalidate all optimizations for a client
   */
  async invalidateClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      const contexts = client.getOptimizationContexts();
      contexts.forEach(context => {
        this.cache.delete(context.id);
      });
      const result = client.onOptimizationInvalidated();
      if (result instanceof Promise) {
        await result;
      }
    }
  }
  
  /**
   * Invalidate all optimizations
   */
  async invalidateAll(): Promise<void> {
    this.cache.clear();
    
    const promises: Promise<void>[] = [];
    this.clients.forEach(client => {
      const result = client.onOptimizationInvalidated();
      if (result instanceof Promise) {
        promises.push(result);
      }
    });
    await Promise.all(promises);
  }
  
  /**
   * Get cached result for a context (if available)
   */
  getCachedResult(contextId: string): OptimizationResult | undefined {
    return this.cache.get(contextId);
  }
  
  /**
   * Get optimization statistics
   */
  getStats(): OptimizationStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalOptimizations: 0,
      totalCellsOptimized: 0,
      averageOptimizationRatio: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastOptimizationTime: 0,
    };
  }
  
  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.optimizationTimer) {
      clearTimeout(this.optimizationTimer);
      this.optimizationTimer = null;
    }
    
    this.pendingOptimizations.clear();
    this.cache.clear();
    this.clients.clear();
  }
}

