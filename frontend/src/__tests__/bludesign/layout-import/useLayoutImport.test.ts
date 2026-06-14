/**
 * Tests for the layout-import editor state controller.
 *
 * `loadSource` (pdf.js worker via Vite `?url`) and the API client are mocked so
 * the reducer-like behavior (status flow, undo/redo, mutations, reprocess error
 * resilience) can be tested in jsdom.
 */

import { renderHook, act } from '@testing-library/react';

jest.mock('@/components/bludesign/layout-import/loadSource', () => ({
  loadSource: jest.fn(),
  validateSourceFile: jest.fn(() => null),
  peekSourcePageCount: jest.fn(async () => 1),
  ACCEPTED_FILE_TYPES: '',
}));
jest.mock('@/api/bludesign', () => ({
  detectLayoutStream: jest.fn(),
}));
jest.mock('@/components/bludesign/layout-import/importProgressTiming', () => ({
  ...jest.requireActual('@/components/bludesign/layout-import/importProgressTiming'),
  createMinimumStageProgressSetter: (setProgress: (value: unknown) => void) => ({
    set: setProgress,
    clearImmediately: () => setProgress(null),
  }),
}));

import { useLayoutImport } from '@/components/bludesign/layout-import/useLayoutImport';
import { loadSource, validateSourceFile } from '@/components/bludesign/layout-import/loadSource';
import { detectLayoutStream } from '@/api/bludesign';
import type { LayoutImportDetectionResult } from '@/components/bludesign/layout-import/types';

const mockLoadSource = loadSource as jest.MockedFunction<typeof loadSource>;
const mockValidate = validateSourceFile as jest.MockedFunction<typeof validateSourceFile>;
const mockDetect = detectLayoutStream as jest.MockedFunction<typeof detectLayoutStream>;

const SOURCE = {
  uploadFile: new File(['x'], 'plan.png', { type: 'image/png' }),
  previewUrl: 'blob:mock',
  width: 200,
  height: 100,
  pageCount: 1,
  rasterizedFromPdf: false,
};

const result2: LayoutImportDetectionResult = {
  imageWidth: 200,
  imageHeight: 100,
  warnings: ['heads up'],
  units: [
    {
      id: 'a',
      kind: 'unit',
      bounds: { cx: 10, cy: 10, width: 8, height: 6 },
      rotationRad: 0,
      label: '101',
      labelConfidence: 0.9,
      detectionConfidence: 0.92,
    },
    {
      id: 'b',
      kind: 'unit',
      bounds: { cx: 30, cy: 10, width: 8, height: 6 },
      rotationRad: 0,
      label: '102',
      labelConfidence: 0.85,
      detectionConfidence: 0.88,
    },
  ],
};

function streamOf(result: LayoutImportDetectionResult) {
  return (async (
    _file: File,
    _options: unknown,
    onEvent: (e: { type: string; [k: string]: unknown }) => void
  ) => {
    onEvent({ type: 'stage', stage: 'detecting' });
    onEvent({ type: 'rectangles', total: result.units.length, units: result.units });
    for (const u of result.units) {
      onEvent({ type: 'unit', unit: u });
      onEvent({ type: 'progress', done: 1, total: result.units.length });
    }
    return result;
  }) as unknown as typeof detectLayoutStream;
}

const file = () => new File(['x'], 'plan.png', { type: 'image/png' });

beforeAll(() => {
  Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), writable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockReturnValue(null);
  mockLoadSource.mockResolvedValue({ ...SOURCE });
  mockDetect.mockImplementation(streamOf(JSON.parse(JSON.stringify(result2))));
});

async function uploadReady() {
  const hook = renderHook(() => useLayoutImport());
  await act(async () => {
    await hook.result.current.onUpload(file());
  });
  return hook;
}

describe('useLayoutImport - upload + detection', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useLayoutImport());
    expect(result.current.status).toBe('idle');
    expect(result.current.units).toHaveLength(0);
  });

  it('loads, detects, and exposes unit stats', async () => {
    const { result } = await uploadReady();
    expect(result.current.status).toBe('ready');
    expect(result.current.units).toHaveLength(2);
    expect(result.current.warnings).toEqual(['heads up']);
    expect(result.current.stats.total).toBe(2);
    expect(result.current.stats.withLabel).toBe(2);
    expect(result.current.stats.unitCount).toBe(2);
    expect(result.current.stats.rectCount).toBe(0);
    expect(result.current.progress).toBeNull();
  });

  it('rejects invalid files before processing', async () => {
    mockValidate.mockReturnValue('bad file');
    const { result } = renderHook(() => useLayoutImport());
    await act(async () => {
      await result.current.onUpload(file());
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('bad file');
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('surfaces a fatal error when the initial detection fails', async () => {
    mockDetect.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useLayoutImport());
    await act(async () => {
      await result.current.onUpload(file());
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('boom');
  });
});

describe('useLayoutImport - reprocess resilience', () => {
  it('preserves the review and notices the failure when a re-run fails', async () => {
    const { result } = await uploadReady();
    mockDetect.mockRejectedValueOnce(new Error('flaky'));
    await act(async () => {
      await result.current.reprocess();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.units).toHaveLength(2);
    expect(result.current.notice?.type).toBe('error');
  });

  it('reports the unit-count delta on a successful re-run', async () => {
    const { result } = await uploadReady();
    mockDetect.mockImplementationOnce(
      streamOf({ ...result2, units: result2.units.slice(0, 1) })
    );
    await act(async () => {
      await result.current.reprocess();
    });
    expect(result.current.units).toHaveLength(1);
    expect(result.current.notice?.type).toBe('success');
    expect(result.current.notice?.text).toContain('-1');
  });
});

describe('useLayoutImport - mutations + history', () => {
  it('edits a label and supports undo/redo', async () => {
    const { result } = await uploadReady();
    act(() => result.current.setUnitLabel('b', '202'));
    expect(result.current.units.find((u) => u.id === 'b')?.label).toBe('202');
    expect(result.current.units.find((u) => u.id === 'b')?.kind).toBe('unit');
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.units.find((u) => u.id === 'b')?.label).toBe('102');
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.units.find((u) => u.id === 'b')?.label).toBe('202');
  });

  it('live label edits snapshot once per edit session', async () => {
    const { result } = await uploadReady();
    act(() => result.current.setUnitLabelLive('b', '2'));
    act(() => result.current.setUnitLabelLive('b', '20'));
    act(() => result.current.setUnitLabelLive('b', '202'));
    expect(result.current.units.find((u) => u.id === 'b')?.label).toBe('202');

    act(() => result.current.undo());
    expect(result.current.units.find((u) => u.id === 'b')?.label).toBe('102');
  });

  it('removes and adds units', async () => {
    const { result } = await uploadReady();
    act(() => result.current.removeUnit('a'));
    expect(result.current.units).toHaveLength(1);

    act(() =>
      result.current.addUnit({
        bounds: { cx: 50, cy: 50, width: 5, height: 5 },
        rotationRad: 0,
        detectionConfidence: 1,
        labelConfidence: 0,
      })
    );
    expect(result.current.units).toHaveLength(2);
    expect(result.current.units.find((u) => u.manual)).toBeTruthy();
  });

  it('flags duplicate and missing labels as errors', async () => {
    const { result } = await uploadReady();
    act(() => result.current.setUnitLabel('b', '101'));
    expect(result.current.errors.some((e) => e.type === 'duplicate-label')).toBe(true);
    act(() => result.current.setUnitLabel('b', ''));
    expect(result.current.errors.some((e) => e.type === 'no-label')).toBe(true);
  });

  it('selectNextProblemUnit cycles problem units in list order', async () => {
    const { result } = await uploadReady();
    act(() => result.current.setUnitLabel('b', ''));
    act(() => result.current.updateUnit('b', { kind: 'unit' }));
    expect(result.current.problemUnitIds).toEqual(['b']);

    act(() => result.current.selectNextProblemUnit(null));
    expect(result.current.selectedId).toBe('b');

    act(() => result.current.setUnitLabel('a', ''));
    expect(result.current.problemUnitIds).toEqual(['a', 'b']);

    act(() => result.current.setSelectedId('a'));
    act(() => result.current.selectNextProblemUnit('a'));
    expect(result.current.selectedId).toBe('b');

    act(() => result.current.selectNextProblemUnit('b'));
    expect(result.current.selectedId).toBe('a');
  });

  it('reset returns to the idle upload state', async () => {
    const { result } = await uploadReady();
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.units).toHaveLength(0);
    expect(result.current.source).toBeNull();
  });
});
