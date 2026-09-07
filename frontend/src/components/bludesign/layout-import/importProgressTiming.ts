import type { Dispatch, SetStateAction } from 'react';
import type { DetectionProgress } from './types';

/** Minimum time each import pipeline step stays visible in the progress modal. */
export const IMPORT_PIPELINE_MIN_STAGE_MS = 1000;

export interface MinimumStageProgressController {
  set: Dispatch<SetStateAction<DetectionProgress | null>>;
  /** Clears the overlay immediately (cancel / error / reset). */
  clearImmediately: () => void;
}

/**
 * Ensures each pipeline stage stays visible for at least `minStageMs` before
 * advancing. Stage changes are queued so fast post-process steps are not
 * skipped. Streaming updates within the same stage apply immediately.
 */
export function createMinimumStageProgressSetter(
  setProgress: Dispatch<SetStateAction<DetectionProgress | null>>,
  minStageMs = IMPORT_PIPELINE_MIN_STAGE_MS,
): MinimumStageProgressController {
  let currentStage: DetectionProgress['stage'] | null = null;
  let stageStartedAt = 0;
  let queue: DetectionProgress[] = [];
  let closeAfterQueue = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastValue: DetectionProgress | null = null;

  const apply = (value: DetectionProgress | null) => {
    lastValue = value;
    if (value === null) {
      currentStage = null;
      stageStartedAt = 0;
      setProgress(null);
      return;
    }
    setProgress(value);
    currentStage = value.stage;
    stageStartedAt = Date.now();
  };

  const resetInternal = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queue = [];
    closeAfterQueue = false;
    currentStage = null;
    stageStartedAt = 0;
    lastValue = null;
  };

  const drain = () => {
    timer = null;

    if (queue.length > 0) {
      const next = queue.shift()!;
      apply(next);
      timer = setTimeout(drain, minStageMs);
      return;
    }

    if (closeAfterQueue) {
      closeAfterQueue = false;
      apply(null);
    }
  };

  const scheduleDrain = () => {
    if (timer) return;
    if (currentStage === null) {
      drain();
      return;
    }
    const elapsed = Date.now() - stageStartedAt;
    const wait = Math.max(0, minStageMs - elapsed);
    if (wait === 0) {
      drain();
    } else {
      timer = setTimeout(drain, wait);
    }
  };

  const enqueueStage = (next: DetectionProgress) => {
    const tail = queue[queue.length - 1];
    if (tail?.stage === next.stage) {
      queue[queue.length - 1] = next;
      return;
    }
    queue.push(next);
  };

  const pushResolved = (next: DetectionProgress | null) => {
    if (next === null) {
      closeAfterQueue = true;
      if (currentStage === null && queue.length === 0) {
        apply(null);
        return;
      }
      scheduleDrain();
      return;
    }

    if (currentStage === null) {
      apply(next);
      return;
    }

    if (next.stage === currentStage) {
      lastValue = next;
      setProgress(next);
      return;
    }

    enqueueStage(next);
    scheduleDrain();
  };

  return {
    set: (next: SetStateAction<DetectionProgress | null>) => {
      const resolved = typeof next === 'function' ? next(lastValue) : next;
      pushResolved(resolved);
    },
    clearImmediately: () => {
      resetInternal();
      setProgress(null);
    },
  };
}
