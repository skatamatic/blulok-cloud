/**
 * Sky and ground preset definitions for BluDesign viewer environments.
 */

export type SkyPresetId = 'blank' | 'day' | 'sunset' | 'night' | 'natural';

export type GroundPresetId = 'blank' | 'grid' | 'grass' | 'concrete' | 'natural';

export interface SkyPresetDefinition {
  id: SkyPresetId;
  label: string;
  description: string;
  /** CSS gradient for UI swatch preview */
  swatchClass: string;
}

export interface GroundPresetDefinition {
  id: GroundPresetId;
  label: string;
  description: string;
  swatchClass: string;
}

export const ENV_ASSET_BASE = '/bludesign/environment';

export const SKY_PRESET_ASSETS = {
  naturalHdr: `${ENV_ASSET_BASE}/sky/natural_2k.hdr`,
} as const;

export const GROUND_PRESET_ASSETS = {
  grassDiffuse: `${ENV_ASSET_BASE}/ground/grass_diffuse.jpg`,
  grassNormal: `${ENV_ASSET_BASE}/ground/grass_normal.jpg`,
  concreteDiffuse: `${ENV_ASSET_BASE}/ground/concrete_diffuse.jpg`,
  concreteNormal: `${ENV_ASSET_BASE}/ground/concrete_normal.jpg`,
} as const;

export const SKY_PRESETS: SkyPresetDefinition[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Solid theme background (default)',
    swatchClass: 'from-slate-200 to-slate-400 dark:from-slate-800 dark:to-slate-950',
  },
  {
    id: 'day',
    label: 'Daytime',
    description: 'Bright procedural sky with sun',
    swatchClass: 'from-sky-300 via-blue-400 to-blue-600',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm golden-hour sky',
    swatchClass: 'from-amber-300 via-orange-400 to-indigo-700',
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Dark sky with lit facility',
    swatchClass: 'from-slate-900 via-indigo-950 to-black',
  },
  {
    id: 'natural',
    label: 'Natural',
    description: 'Cloudy HDR with PBR reflections',
    swatchClass: 'from-sky-200 via-white to-blue-300',
  },
];

export const GROUND_PRESETS: GroundPresetDefinition[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'No ground plane (default)',
    swatchClass: 'from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900',
  },
  {
    id: 'grid',
    label: 'Grid',
    description: 'Editor-style snap grid',
    swatchClass: 'from-primary-100 to-primary-300 dark:from-primary-900 dark:to-primary-700',
  },
  {
    id: 'grass',
    label: 'Grass',
    description: 'Textured lawn that fades at edges',
    swatchClass: 'from-green-400 to-green-700',
  },
  {
    id: 'concrete',
    label: 'Concrete',
    description: 'Industrial pad that fades at edges',
    swatchClass: 'from-gray-300 to-gray-500',
  },
  {
    id: 'natural',
    label: 'Natural',
    description: 'Concrete pad with bright grass surround fading to sky',
    swatchClass: 'from-gray-300 via-green-400 to-sky-300',
  },
];

export const DEFAULT_SCENE_PRESETS = {
  skyPreset: 'blank' as SkyPresetId,
  groundPreset: 'blank' as GroundPresetId,
};

export const THEME_BACKGROUND_COLORS = {
  light: '#e8eef5',
  dark: '#1a1a2e',
} as const;

export const NIGHT_SKY_COLOR = '#0b1020';

export function normalizeSkyPreset(value: unknown): SkyPresetId {
  if (typeof value === 'string' && SKY_PRESETS.some((p) => p.id === value)) {
    return value as SkyPresetId;
  }
  return DEFAULT_SCENE_PRESETS.skyPreset;
}

export function normalizeGroundPreset(value: unknown): GroundPresetId {
  if (typeof value === 'string' && GROUND_PRESETS.some((p) => p.id === value)) {
    return value as GroundPresetId;
  }
  return DEFAULT_SCENE_PRESETS.groundPreset;
}

/** Whether applying these presets may fetch environment assets over the network. */
export function viewPresetsRequireAssetDownload(
  sky: SkyPresetId,
  ground: GroundPresetId
): boolean {
  return (
    sky === 'natural' ||
    ground === 'grass' ||
    ground === 'concrete' ||
    ground === 'natural'
  );
}

export interface ScenePresetApplyOptions {
  /** 0–1 progress while fetching preset-specific assets (HDR, textures). */
  onAssetProgress?: (ratio: number) => void;
}
