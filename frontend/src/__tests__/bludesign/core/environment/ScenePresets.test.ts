import {
  DEFAULT_SCENE_PRESETS,
  GROUND_PRESETS,
  SKY_PRESETS,
  normalizeEnvironmentOptions,
  normalizeGroundPreset,
  normalizeSkyPreset,
  viewPresetsRequireAssetDownload,
} from '@/components/bludesign/core/environment/ScenePresets';
import { DEFAULT_FACILITY_VIEWER_CONFIG } from '@/types/widget.types';

describe('ScenePresets', () => {
  it('defines expected sky and ground preset catalogs', () => {
    expect(SKY_PRESETS.map((p) => p.id)).toEqual([
      'blank',
      'day',
      'sunset',
      'night',
      'natural',
      'space',
    ]);
    expect(GROUND_PRESETS.map((p) => p.id)).toEqual([
      'blank',
      'grid',
      'grass',
      'concrete',
      'natural',
      'woodland',
      'urban',
      'techno',
      'local',
    ]);
  });

  it('uses blank defaults for existing dashboards', () => {
    expect(DEFAULT_SCENE_PRESETS).toEqual({ skyPreset: 'blank', groundPreset: 'blank' });
    expect(DEFAULT_FACILITY_VIEWER_CONFIG).toEqual({
      skyPreset: 'blank',
      groundPreset: 'blank',
    });
  });

  it('normalizes sparse environment option overrides', () => {
    expect(normalizeEnvironmentOptions(undefined)).toEqual({});
    expect(
      normalizeEnvironmentOptions({ sky: { sunElevation: 120, sunAzimuth: 400 } })
    ).toEqual({
      sky: { sunElevation: 90, sunAzimuth: 360 },
    });
    expect(
      normalizeEnvironmentOptions({ woodland: { treeDensity: 5, hillAmplitude: 2 } })
    ).toEqual({
      woodland: { treeDensity: 5, hillAmplitude: 2 },
    });
    expect(
      normalizeEnvironmentOptions({ urban: { cityDensity: 99, streetWidth: 1 } })
    ).toEqual({
      urban: { cityDensity: 6, streetWidth: 2 },
    });
    expect(
      normalizeEnvironmentOptions({ techno: { showGrid: false, showSpaceBackdrop: true } })
    ).toEqual({
      techno: { showGrid: false, showSpaceBackdrop: true },
    });
    expect(
      normalizeEnvironmentOptions({ techno: { cellSize: 99, glowIntensity: 10, lineColor: '#abc' } })
    ).toEqual({
      techno: { cellSize: 12, glowIntensity: 4 },
    });
    expect(
      normalizeEnvironmentOptions({ local: { assetDim: 2, wireframeAmount: 0.1 } })
    ).toEqual({
      local: { assetDim: 1, wireframeAmount: 0.2 },
    });
  });

  it('normalizes unknown preset ids to blank', () => {
    expect(normalizeSkyPreset(undefined)).toBe('blank');
    expect(normalizeSkyPreset('invalid')).toBe('blank');
    expect(normalizeSkyPreset('sunset')).toBe('sunset');

    expect(normalizeGroundPreset(null)).toBe('blank');
    expect(normalizeGroundPreset('grid')).toBe('grid');
    expect(normalizeGroundPreset('sand')).toBe('blank');
  });

  it('detects presets that require environment asset downloads', () => {
    expect(viewPresetsRequireAssetDownload('blank', 'blank')).toBe(false);
    expect(viewPresetsRequireAssetDownload('natural', 'blank')).toBe(true);
    expect(viewPresetsRequireAssetDownload('space', 'blank')).toBe(true);
    expect(viewPresetsRequireAssetDownload('day', 'grass')).toBe(true);
    expect(viewPresetsRequireAssetDownload('night', 'concrete')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'natural')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'woodland')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'urban')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'local')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'techno')).toBe(false);
    expect(
      viewPresetsRequireAssetDownload('blank', 'techno', { techno: { showSpaceBackdrop: true } })
    ).toBe(true);
    expect(
      viewPresetsRequireAssetDownload('space', 'techno', { techno: { showSpaceBackdrop: true } })
    ).toBe(true);
  });
});
