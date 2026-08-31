import { OptimizationManager } from '../OptimizationManager';

export interface OptimizationProgressPayload {
  percentage: number;
  message: string;
  operation: string;
}

/**
 * Maps {@link OptimizationManager} progress into editor `progress-updated` / `progress-complete` events.
 */
export function attachOptimizationProgressEmitter(
  optimizationManager: OptimizationManager,
  onProgressUpdated: (payload: OptimizationProgressPayload) => void,
  onProgressComplete: (payload: { operation: string }) => void
): void {
  optimizationManager.setProgressCallback((progress) => {
    onProgressUpdated({
      percentage: progress.percentage,
      message: progress.message,
      operation: 'processing',
    });

    if (progress.percentage >= 100) {
      setTimeout(() => {
        onProgressComplete({ operation: 'processing' });
      }, 300);
    }
  });
}
