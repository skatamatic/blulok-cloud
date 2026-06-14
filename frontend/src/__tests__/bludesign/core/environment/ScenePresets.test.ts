import {
  DEFAULT_SCENE_PRESETS,
  GROUND_PRESETS,
  SKY_PRESETS,
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
    ]);
    expect(GROUND_PRESETS.map((p) => p.id)).toEqual([
      'blank',
      'grid',
      'grass',
      'concrete',
      'natural',
    ]);
  });

  it('uses blank defaults for existing dashboards', () => {
    expect(DEFAULT_SCENE_PRESETS).toEqual({ skyPreset: 'blank', groundPreset: 'blank' });
    expect(DEFAULT_FACILITY_VIEWER_CONFIG).toEqual({
      skyPreset: 'blank',
      groundPreset: 'blank',
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
    expect(viewPresetsRequireAssetDownload('day', 'grass')).toBe(true);
    expect(viewPresetsRequireAssetDownload('night', 'concrete')).toBe(true);
    expect(viewPresetsRequireAssetDownload('blank', 'natural')).toBe(true);
  });
});
