import {
  createMinimumStageProgressSetter,
  IMPORT_PIPELINE_MIN_STAGE_MS,
} from '@/components/bludesign/layout-import/importProgressTiming';
import type { DetectionProgress } from '@/components/bludesign/layout-import/types';

describe('createMinimumStageProgressSetter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a 1s default minimum stage duration', () => {
    expect(IMPORT_PIPELINE_MIN_STAGE_MS).toBe(1000);
  });

  it('delays advancing to the next stage until min duration elapses', () => {
    const values: Array<DetectionProgress | null> = [];
    const setProgress = (next: DetectionProgress | null) => {
      values.push(next);
    };
    const { set: push } = createMinimumStageProgressSetter(setProgress, 1000);

    push({ stage: 'finding', total: 0, done: 0 });
    push({ stage: 'reading', total: 10, done: 0 });

    expect(values).toHaveLength(1);
    expect(values[0]?.stage).toBe('finding');

    jest.advanceTimersByTime(999);
    expect(values).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(values).toHaveLength(2);
    expect(values[1]?.stage).toBe('reading');
  });

  it('updates progress within the same stage immediately', () => {
    const values: Array<DetectionProgress | null> = [];
    const setProgress = (next: DetectionProgress | null) => {
      values.push(next);
    };
    const { set: push } = createMinimumStageProgressSetter(setProgress, 1000);

    push({ stage: 'reading', total: 10, done: 0 });
    push({ stage: 'reading', total: 10, done: 5 });

    expect(values).toHaveLength(2);
    expect(values[1]?.done).toBe(5);
  });

  it('queues rapid stage changes so none are skipped', () => {
    const values: Array<DetectionProgress | null> = [];
    const setProgress = (next: DetectionProgress | null) => {
      values.push(next);
    };
    const { set: push } = createMinimumStageProgressSetter(setProgress, 1000);

    push({ stage: 'finding', total: 0, done: 0 });
    push({ stage: 'filtering', total: 0, done: 0 });
    push({ stage: 'labeling', total: 0, done: 0 });
    push({ stage: 'aligning', total: 0, done: 0 });
    push({ stage: 'doors', total: 0, done: 0 });
    push(null);

    expect(values.map((v) => v?.stage)).toEqual(['finding']);

    jest.advanceTimersByTime(1000);
    expect(values.map((v) => v?.stage)).toEqual(['finding', 'filtering']);

    jest.advanceTimersByTime(1000);
    expect(values.map((v) => v?.stage)).toEqual(['finding', 'filtering', 'labeling']);

    jest.advanceTimersByTime(1000);
    expect(values.map((v) => v?.stage)).toEqual([
      'finding',
      'filtering',
      'labeling',
      'aligning',
    ]);

    jest.advanceTimersByTime(1000);
    expect(values.map((v) => v?.stage)).toEqual([
      'finding',
      'filtering',
      'labeling',
      'aligning',
      'doors',
    ]);

    jest.advanceTimersByTime(1000);
    expect(values).toHaveLength(6);
    expect(values[5]).toBeNull();
  });

  it('delays clearing progress until the active stage has been visible', () => {
    const values: Array<DetectionProgress | null> = [];
    const setProgress = (next: DetectionProgress | null) => {
      values.push(next);
    };
    const { set: push } = createMinimumStageProgressSetter(setProgress, 1000);

    push({ stage: 'doors', total: 0, done: 0 });
    push(null);

    expect(values).toHaveLength(1);
    jest.advanceTimersByTime(1000);
    expect(values).toHaveLength(2);
    expect(values[1]).toBeNull();
  });

  it('clearImmediately dismisses without waiting for queued stages', () => {
    const values: Array<DetectionProgress | null> = [];
    const setProgress = (next: DetectionProgress | null) => {
      values.push(next);
    };
    const { set: push, clearImmediately } = createMinimumStageProgressSetter(setProgress, 1000);

    push({ stage: 'finding', total: 0, done: 0 });
    push({ stage: 'reading', total: 10, done: 0 });
    clearImmediately();

    expect(values).toEqual([
      { stage: 'finding', total: 0, done: 0 },
      null,
    ]);
  });
});
