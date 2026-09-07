import { attachOptimizationProgressEmitter } from '../../../../components/bludesign/core/editor/optimizationProgressBridge';
import { OptimizationManager } from '../../../../components/bludesign/core/OptimizationManager';

describe('attachOptimizationProgressEmitter', () => {
  it('forwards progress and schedules complete at 100%', () => {
    jest.useFakeTimers();
    const onProgress = jest.fn();
    const onComplete = jest.fn();
    let cb: ((p: { percentage: number; message: string }) => void) | null = null;

    const spy = jest.spyOn(OptimizationManager, 'getInstance').mockReturnValue({
      setProgressCallback: (fn: typeof cb) => {
        cb = fn;
      },
    } as unknown as OptimizationManager);

    attachOptimizationProgressEmitter(
      OptimizationManager.getInstance(),
      onProgress,
      onComplete
    );

    cb!({ percentage: 50, message: 'x' });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percentage: 50, message: 'x', operation: 'processing' })
    );
    expect(onComplete).not.toHaveBeenCalled();

    cb!({ percentage: 100, message: 'done' });
    jest.advanceTimersByTime(300);
    expect(onComplete).toHaveBeenCalledWith({ operation: 'processing' });

    spy.mockRestore();
    jest.useRealTimers();
  });
});
