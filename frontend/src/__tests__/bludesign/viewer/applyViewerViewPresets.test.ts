import type { BluDesignEngine } from '@/components/bludesign/core/BluDesignEngine';
import { applyViewerViewPresets } from '@/components/bludesign/viewer/applyViewerViewPresets';

describe('applyViewerViewPresets', () => {
  it('reports staged progress while applying ground then sky presets', async () => {
    const progress: Array<{ progress: number; message: string }> = [];
    const applySkyPreset = jest.fn(
      (_sky: string, options?: { onAssetProgress?: (ratio: number) => void }) => {
        options?.onAssetProgress?.(1);
        return Promise.resolve();
      }
    );
    const applyGroundPreset = jest.fn(
      (_ground: string, options?: { onAssetProgress?: (ratio: number) => void }) => {
        options?.onAssetProgress?.(1);
        return Promise.resolve();
      }
    );
    const engine = {
      applySkyPreset,
      applyGroundPreset,
      refreshGroundPlaneBounds: jest.fn(),
    } as unknown as BluDesignEngine;

    await applyViewerViewPresets(engine, 'natural', 'grass', (update) => progress.push(update));

    expect(applyGroundPreset).toHaveBeenCalledWith('grass', expect.any(Object));
    expect(applySkyPreset).toHaveBeenCalledWith('natural', expect.any(Object));
    expect(engine.refreshGroundPlaneBounds).toHaveBeenCalled();
    expect(progress.some((p) => p.message === 'Loading sky environment...')).toBe(true);
    expect(progress.some((p) => p.message === 'Loading ground environment...')).toBe(true);
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
