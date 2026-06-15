import type { BluDesignEngine } from '@/components/bludesign/core/BluDesignEngine';
import { applyViewerViewPresets } from '@/components/bludesign/viewer/applyViewerViewPresets';

describe('applyViewerViewPresets', () => {
  it('reports staged progress while applying sky and ground presets', async () => {
    const progress: Array<{ progress: number; message: string }> = [];
    const engine = {
      applySkyPreset: jest.fn((_sky, options) => {
        options?.onAssetProgress?.(0.5);
        return Promise.resolve();
      }),
      applyGroundPreset: jest.fn((_ground, options) => {
        options?.onAssetProgress?.(1);
        return Promise.resolve();
      }),
      refreshGroundPlaneBounds: jest.fn(),
    } as unknown as BluDesignEngine;

    await applyViewerViewPresets(engine, 'natural', 'grass', (update) => progress.push(update));

    expect(engine.applySkyPreset).toHaveBeenCalledWith('natural', expect.any(Object));
    expect(engine.applyGroundPreset).toHaveBeenCalledWith('grass', expect.any(Object));
    expect(engine.refreshGroundPlaneBounds).toHaveBeenCalled();
    expect(progress.some((p) => p.message === 'Loading sky environment...')).toBe(true);
    expect(progress.some((p) => p.message === 'Loading ground textures...')).toBe(true);
    expect(progress[progress.length - 1]?.progress).toBeGreaterThanOrEqual(94);
  });

  it('forwards environmentOptions to sky and ground preset application', async () => {
    const engine = {
      applySkyPreset: jest.fn().mockResolvedValue(undefined),
      applyGroundPreset: jest.fn().mockResolvedValue(undefined),
      refreshGroundPlaneBounds: jest.fn(),
    } as unknown as BluDesignEngine;

    const environmentOptions = {
      sky: { sunElevation: 42 },
      woodland: { treeDensity: 1.4 },
    };

    await applyViewerViewPresets(
      engine,
      'day',
      'woodland',
      undefined,
      environmentOptions
    );

    expect(engine.applySkyPreset).toHaveBeenCalledWith(
      'day',
      expect.objectContaining({ environmentOptions })
    );
    expect(engine.applyGroundPreset).toHaveBeenCalledWith(
      'woodland',
      expect.objectContaining({ environmentOptions })
    );
  });
});
