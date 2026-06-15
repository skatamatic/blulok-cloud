/**
 * Sky and ground preset definitions for BluDesign viewer environments.
 */

export type SkyPresetId = 'blank' | 'day' | 'sunset' | 'night' | 'natural' | 'space';

export type GroundPresetId =
  | 'blank'
  | 'grid'
  | 'grass'
  | 'concrete'
  | 'natural'
  | 'woodland'
  | 'urban'
  | 'techno';

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
  spaceHdr: `${ENV_ASSET_BASE}/sky/space_2k.exr`,
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
  {
    id: 'space',
    label: 'Space',
    description: 'Deep starfield HDR with Milky Way',
    swatchClass: 'from-indigo-950 via-violet-950 to-black',
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
  {
    id: 'woodland',
    label: 'Woodland',
    description: 'Rolling hills, grass surround, and scattered Canadian trees',
    swatchClass: 'from-green-600 via-emerald-500 to-sky-300',
  },
  {
    id: 'urban',
    label: 'Urban',
    description: 'Muted city blocks, streets, parking, and distant buildings',
    swatchClass: 'from-slate-500 via-gray-400 to-sky-300',
  },
  {
    id: 'techno',
    label: 'Techno Grid',
    description: 'Tron-inspired glowing grid with animated pulses',
    swatchClass: 'from-cyan-400 via-[#147FD4] to-black',
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
  ground: GroundPresetId,
  environmentOptions?: EnvironmentOptions
): boolean {
  const technoSpaceBackdrop =
    ground === 'techno' &&
    (environmentOptions?.techno?.showSpaceBackdrop ??
      DEFAULT_ENVIRONMENT_OPTIONS.techno.showSpaceBackdrop) &&
    sky !== 'space';

  return (
    sky === 'natural' ||
    sky === 'space' ||
    technoSpaceBackdrop ||
    ground === 'grass' ||
    ground === 'concrete' ||
    ground === 'natural' ||
    ground === 'woodland' ||
    ground === 'urban'
  );
}

/** User-overridable sky tuning (partial — unset fields use preset defaults). */
export interface SkyEnvironmentOptions {
  backgroundTint?: string;
  sunElevation?: number;
  sunAzimuth?: number;
  turbidity?: number;
  atmosphereIntensity?: number;
  exposure?: number;
  backgroundIntensity?: number;
}

/** Ground tint / fade tuning shared by textured ground presets. */
export interface GroundEnvironmentOptions {
  primaryTint?: string;
  secondaryTint?: string;
  primaryTintMix?: number;
  secondaryTintMix?: number;
  primaryBrightness?: number;
  secondaryBrightness?: number;
  primarySaturation?: number;
  secondarySaturation?: number;
  horizonColor?: string;
  fadeStartScale?: number;
  outerFadeScale?: number;
}

export interface WoodlandEnvironmentOptions {
  hillAmplitude?: number;
  hillScale?: number;
  treeDensity?: number;
  treeScaleMin?: number;
  treeScaleMax?: number;
  landmarkTreeChance?: number;
  pineMix?: number;
  /** Water features: number of rivers / ponds and their proportions. */
  riverCount?: number;
  pondCount?: number;
  riverWidth?: number;
  pondSize?: number;
  waterDepth?: number;
  riverMeander?: number;
}

export interface UrbanEnvironmentOptions {
  cityDensity?: number;
  buildingHeightScale?: number;
  buildingFootprintScale?: number;
  parkFrequency?: number;
  largeParkChance?: number;
  streetWidth?: number;
  blockSize?: number;
  streetTreeDensity?: number;
  sceneryFadeStartScale?: number;
  sceneryFadeEndScale?: number;
}

export interface TechnoEnvironmentOptions {
  /** Render the glowing Tron-style grid plane. */
  showGrid?: boolean;
  /** Load the space starfield HDR behind/under the grid (facility floating in space). */
  showSpaceBackdrop?: boolean;
  /** World-space size of one minor grid cell (meters). */
  cellSize?: number;
  /** Minor cells per major grid line. */
  majorInterval?: number;
  /** Minor cells per super grid line. */
  superInterval?: number;
  /** Multiplier on auto fade-start distance. */
  fadeStartScale?: number;
  /** Multiplier on auto outer-fade distance. */
  outerFadeScale?: number;
  lineColor?: string;
  accentColor?: string;
  horizonColor?: string;
  voidColor?: string;
  glowIntensity?: number;
  pulseSpeed?: number;
  lineThickness?: number;
  majorLineThickness?: number;
  superLineThickness?: number;
  platformGlow?: number;
  /** Dark fill alpha between lines when space backdrop is off. */
  baseAlpha?: number;
}

/** Persisted partial overrides — only non-default values need to be stored. */
export interface EnvironmentOptions {
  sky?: SkyEnvironmentOptions;
  ground?: GroundEnvironmentOptions;
  woodland?: WoodlandEnvironmentOptions;
  urban?: UrbanEnvironmentOptions;
  techno?: TechnoEnvironmentOptions;
}

export const DEFAULT_ENVIRONMENT_OPTIONS: Required<{
  sky: SkyEnvironmentOptions;
  ground: GroundEnvironmentOptions;
  woodland: WoodlandEnvironmentOptions;
  urban: UrbanEnvironmentOptions;
  techno: TechnoEnvironmentOptions;
}> = {
  sky: {
    atmosphereIntensity: 2,
    exposure: 1,
    backgroundIntensity: 1,
  },
  ground: {
    fadeStartScale: 1,
    outerFadeScale: 1,
  },
  woodland: {
    hillAmplitude: 18,
    hillScale: 0.004,
    treeDensity: 1,
    treeScaleMin: 0.55,
    treeScaleMax: 3.75,
    landmarkTreeChance: 0.045,
    pineMix: 0.5,
    riverCount: 1,
    pondCount: 1,
    riverWidth: 1,
    pondSize: 1,
    waterDepth: 1,
    riverMeander: 1,
  },
  urban: {
    cityDensity: 1,
    buildingHeightScale: 1,
    buildingFootprintScale: 1,
    parkFrequency: 1,
    largeParkChance: 0.18,
    streetWidth: 10,
    blockSize: 58,
    streetTreeDensity: 1,
    sceneryFadeStartScale: 1,
    sceneryFadeEndScale: 1,
  },
  techno: {
    showGrid: true,
    showSpaceBackdrop: false,
    cellSize: 2.4,
    majorInterval: 5,
    superInterval: 25,
    fadeStartScale: 1,
    outerFadeScale: 1,
    lineColor: '#147fd4',
    accentColor: '#00e8ff',
    horizonColor: '#0a1628',
    voidColor: '#050812',
    glowIntensity: 1.15,
    pulseSpeed: 1.6,
    lineThickness: 1,
    majorLineThickness: 1,
    superLineThickness: 1,
    platformGlow: 0.12,
    baseAlpha: 0.06,
  },
};

/** Authoritative min/max for environment sliders and persisted-value clamping. */
export const ENVIRONMENT_OPTION_RANGES = {
  sky: {
    sunElevation: { min: 0, max: 90 },
    sunAzimuth: { min: 0, max: 360 },
    turbidity: { min: 0.5, max: 40 },
    atmosphereIntensity: { min: 0.05, max: 12 },
    exposure: { min: 0.05, max: 6 },
    backgroundIntensity: { min: 0.05, max: 5 },
  },
  ground: {
    primaryTintMix: { min: 0, max: 1 },
    secondaryTintMix: { min: 0, max: 1 },
    primaryBrightness: { min: 0.05, max: 4 },
    secondaryBrightness: { min: 0.05, max: 4 },
    primarySaturation: { min: 0, max: 4 },
    secondarySaturation: { min: 0, max: 4 },
    fadeStartScale: { min: 0.1, max: 6 },
    outerFadeScale: { min: 0.1, max: 8 },
  },
  woodland: {
    hillAmplitude: { min: 0, max: 120 },
    hillScale: { min: 0.0002, max: 0.04 },
    treeDensity: { min: 0.05, max: 6 },
    treeScaleMin: { min: 0.05, max: 8 },
    treeScaleMax: { min: 0.5, max: 24 },
    landmarkTreeChance: { min: 0, max: 0.65 },
    pineMix: { min: 0, max: 1 },
    riverCount: { min: 0, max: 3 },
    pondCount: { min: 0, max: 4 },
    riverWidth: { min: 0.3, max: 3 },
    pondSize: { min: 0.3, max: 3 },
    waterDepth: { min: 0.4, max: 2.5 },
    riverMeander: { min: 0, max: 2 },
  },
  urban: {
    cityDensity: { min: 0.05, max: 6 },
    buildingHeightScale: { min: 0.15, max: 6 },
    buildingFootprintScale: { min: 0.15, max: 5 },
    parkFrequency: { min: 0, max: 6 },
    largeParkChance: { min: 0, max: 0.95 },
    streetWidth: { min: 2, max: 48 },
    blockSize: { min: 16, max: 180 },
    streetTreeDensity: { min: 0, max: 6 },
    sceneryFadeStartScale: { min: 0.05, max: 4 },
    sceneryFadeEndScale: { min: 0.05, max: 5 },
  },
  techno: {
    cellSize: { min: 0.4, max: 12 },
    majorInterval: { min: 2, max: 20 },
    superInterval: { min: 5, max: 80 },
    fadeStartScale: { min: 0.1, max: 6 },
    outerFadeScale: { min: 0.1, max: 8 },
    glowIntensity: { min: 0.05, max: 4 },
    pulseSpeed: { min: 0, max: 6 },
    lineThickness: { min: 0.2, max: 4 },
    majorLineThickness: { min: 0.2, max: 4 },
    superLineThickness: { min: 0.2, max: 4 },
    platformGlow: { min: 0, max: 1 },
    baseAlpha: { min: 0, max: 0.5 },
  },
} as const;

function clampToRange(
  value: unknown,
  range: { min: number; max: number },
  fallback: number
): number {
  return clampNumber(value, range.min, range.max, fallback);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
}

function mergePartialSection<T extends object>(
  partial: Partial<T> | undefined,
  normalizers: Partial<Record<keyof T, (v: unknown) => T[keyof T] | undefined>>
): Partial<T> | undefined {
  if (!partial) return undefined;
  const result: Partial<T> = {};
  for (const key of Object.keys(normalizers) as Array<keyof T>) {
    if (partial[key] === undefined) continue;
    const normalize = normalizers[key];
    if (!normalize) continue;
    const next = normalize(partial[key]);
    if (next !== undefined) result[key] = next;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Validate and clamp persisted partial overrides (sparse — unset fields omitted). */
export function normalizeEnvironmentOptions(value: unknown): EnvironmentOptions {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const raw = value as EnvironmentOptions;
  const R = ENVIRONMENT_OPTION_RANGES;
  return {
    sky: mergePartialSection<SkyEnvironmentOptions>(raw.sky, {
      backgroundTint: (v) => normalizeHexColor(v),
      sunElevation: (v) => clampToRange(v, R.sky.sunElevation, 55),
      sunAzimuth: (v) => clampToRange(v, R.sky.sunAzimuth, 180),
      turbidity: (v) => clampToRange(v, R.sky.turbidity, 4),
      atmosphereIntensity: (v) =>
        clampToRange(v, R.sky.atmosphereIntensity, DEFAULT_ENVIRONMENT_OPTIONS.sky.atmosphereIntensity!),
      exposure: (v) => clampToRange(v, R.sky.exposure, DEFAULT_ENVIRONMENT_OPTIONS.sky.exposure!),
      backgroundIntensity: (v) =>
        clampToRange(v, R.sky.backgroundIntensity, DEFAULT_ENVIRONMENT_OPTIONS.sky.backgroundIntensity!),
    }),
    ground: mergePartialSection<GroundEnvironmentOptions>(raw.ground, {
      primaryTint: (v) => normalizeHexColor(v),
      secondaryTint: (v) => normalizeHexColor(v),
      primaryTintMix: (v) => clampToRange(v, R.ground.primaryTintMix, 0),
      secondaryTintMix: (v) => clampToRange(v, R.ground.secondaryTintMix, 0),
      primaryBrightness: (v) => clampToRange(v, R.ground.primaryBrightness, 1),
      secondaryBrightness: (v) => clampToRange(v, R.ground.secondaryBrightness, 1),
      primarySaturation: (v) => clampToRange(v, R.ground.primarySaturation, 1),
      secondarySaturation: (v) => clampToRange(v, R.ground.secondarySaturation, 1),
      horizonColor: (v) => normalizeHexColor(v),
      fadeStartScale: (v) =>
        clampToRange(v, R.ground.fadeStartScale, DEFAULT_ENVIRONMENT_OPTIONS.ground.fadeStartScale!),
      outerFadeScale: (v) =>
        clampToRange(v, R.ground.outerFadeScale, DEFAULT_ENVIRONMENT_OPTIONS.ground.outerFadeScale!),
    }),
    woodland: mergePartialSection<WoodlandEnvironmentOptions>(raw.woodland, {
      hillAmplitude: (v) =>
        clampToRange(v, R.woodland.hillAmplitude, DEFAULT_ENVIRONMENT_OPTIONS.woodland.hillAmplitude!),
      hillScale: (v) =>
        clampToRange(v, R.woodland.hillScale, DEFAULT_ENVIRONMENT_OPTIONS.woodland.hillScale!),
      treeDensity: (v) =>
        clampToRange(v, R.woodland.treeDensity, DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeDensity!),
      treeScaleMin: (v) =>
        clampToRange(v, R.woodland.treeScaleMin, DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeScaleMin!),
      treeScaleMax: (v) =>
        clampToRange(v, R.woodland.treeScaleMax, DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeScaleMax!),
      landmarkTreeChance: (v) =>
        clampToRange(v, R.woodland.landmarkTreeChance, DEFAULT_ENVIRONMENT_OPTIONS.woodland.landmarkTreeChance!),
      pineMix: (v) => clampToRange(v, R.woodland.pineMix, DEFAULT_ENVIRONMENT_OPTIONS.woodland.pineMix!),
      riverCount: (v) =>
        Math.round(clampToRange(v, R.woodland.riverCount, DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverCount!)),
      pondCount: (v) =>
        Math.round(clampToRange(v, R.woodland.pondCount, DEFAULT_ENVIRONMENT_OPTIONS.woodland.pondCount!)),
      riverWidth: (v) =>
        clampToRange(v, R.woodland.riverWidth, DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverWidth!),
      pondSize: (v) =>
        clampToRange(v, R.woodland.pondSize, DEFAULT_ENVIRONMENT_OPTIONS.woodland.pondSize!),
      waterDepth: (v) =>
        clampToRange(v, R.woodland.waterDepth, DEFAULT_ENVIRONMENT_OPTIONS.woodland.waterDepth!),
      riverMeander: (v) =>
        clampToRange(v, R.woodland.riverMeander, DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverMeander!),
    }),
    urban: mergePartialSection<UrbanEnvironmentOptions>(raw.urban, {
      cityDensity: (v) =>
        clampToRange(v, R.urban.cityDensity, DEFAULT_ENVIRONMENT_OPTIONS.urban.cityDensity!),
      buildingHeightScale: (v) =>
        clampToRange(v, R.urban.buildingHeightScale, DEFAULT_ENVIRONMENT_OPTIONS.urban.buildingHeightScale!),
      buildingFootprintScale: (v) =>
        clampToRange(v, R.urban.buildingFootprintScale, DEFAULT_ENVIRONMENT_OPTIONS.urban.buildingFootprintScale!),
      parkFrequency: (v) =>
        clampToRange(v, R.urban.parkFrequency, DEFAULT_ENVIRONMENT_OPTIONS.urban.parkFrequency!),
      largeParkChance: (v) =>
        clampToRange(v, R.urban.largeParkChance, DEFAULT_ENVIRONMENT_OPTIONS.urban.largeParkChance!),
      streetWidth: (v) =>
        clampToRange(v, R.urban.streetWidth, DEFAULT_ENVIRONMENT_OPTIONS.urban.streetWidth!),
      blockSize: (v) => clampToRange(v, R.urban.blockSize, DEFAULT_ENVIRONMENT_OPTIONS.urban.blockSize!),
      streetTreeDensity: (v) =>
        clampToRange(v, R.urban.streetTreeDensity, DEFAULT_ENVIRONMENT_OPTIONS.urban.streetTreeDensity!),
      sceneryFadeStartScale: (v) =>
        clampToRange(v, R.urban.sceneryFadeStartScale, DEFAULT_ENVIRONMENT_OPTIONS.urban.sceneryFadeStartScale!),
      sceneryFadeEndScale: (v) =>
        clampToRange(v, R.urban.sceneryFadeEndScale, DEFAULT_ENVIRONMENT_OPTIONS.urban.sceneryFadeEndScale!),
    }),
    techno: mergePartialSection<TechnoEnvironmentOptions>(raw.techno, {
      showGrid: (v) => normalizeBoolean(v, DEFAULT_ENVIRONMENT_OPTIONS.techno.showGrid!),
      showSpaceBackdrop: (v) =>
        normalizeBoolean(v, DEFAULT_ENVIRONMENT_OPTIONS.techno.showSpaceBackdrop!),
      cellSize: (v) =>
        clampToRange(v, R.techno.cellSize, DEFAULT_ENVIRONMENT_OPTIONS.techno.cellSize!),
      majorInterval: (v) =>
        clampToRange(v, R.techno.majorInterval, DEFAULT_ENVIRONMENT_OPTIONS.techno.majorInterval!),
      superInterval: (v) =>
        clampToRange(v, R.techno.superInterval, DEFAULT_ENVIRONMENT_OPTIONS.techno.superInterval!),
      fadeStartScale: (v) =>
        clampToRange(v, R.techno.fadeStartScale, DEFAULT_ENVIRONMENT_OPTIONS.techno.fadeStartScale!),
      outerFadeScale: (v) =>
        clampToRange(v, R.techno.outerFadeScale, DEFAULT_ENVIRONMENT_OPTIONS.techno.outerFadeScale!),
      lineColor: normalizeHexColor,
      accentColor: normalizeHexColor,
      horizonColor: normalizeHexColor,
      voidColor: normalizeHexColor,
      glowIntensity: (v) =>
        clampToRange(v, R.techno.glowIntensity, DEFAULT_ENVIRONMENT_OPTIONS.techno.glowIntensity!),
      pulseSpeed: (v) =>
        clampToRange(v, R.techno.pulseSpeed, DEFAULT_ENVIRONMENT_OPTIONS.techno.pulseSpeed!),
      lineThickness: (v) =>
        clampToRange(v, R.techno.lineThickness, DEFAULT_ENVIRONMENT_OPTIONS.techno.lineThickness!),
      majorLineThickness: (v) =>
        clampToRange(v, R.techno.majorLineThickness, DEFAULT_ENVIRONMENT_OPTIONS.techno.majorLineThickness!),
      superLineThickness: (v) =>
        clampToRange(v, R.techno.superLineThickness, DEFAULT_ENVIRONMENT_OPTIONS.techno.superLineThickness!),
      platformGlow: (v) =>
        clampToRange(v, R.techno.platformGlow, DEFAULT_ENVIRONMENT_OPTIONS.techno.platformGlow!),
      baseAlpha: (v) =>
        clampToRange(v, R.techno.baseAlpha, DEFAULT_ENVIRONMENT_OPTIONS.techno.baseAlpha!),
    }),
  };
}

/** Merge normalized options with defaults for engine application. */
export function resolveEnvironmentOptions(partial?: EnvironmentOptions): {
  sky: SkyEnvironmentOptions;
  ground: GroundEnvironmentOptions;
  woodland: WoodlandEnvironmentOptions;
  urban: UrbanEnvironmentOptions;
  techno: TechnoEnvironmentOptions;
} {
  const normalized = normalizeEnvironmentOptions(partial ?? {});
  return {
    sky: { ...DEFAULT_ENVIRONMENT_OPTIONS.sky, ...normalized.sky },
    ground: { ...DEFAULT_ENVIRONMENT_OPTIONS.ground, ...normalized.ground },
    woodland: { ...DEFAULT_ENVIRONMENT_OPTIONS.woodland, ...normalized.woodland },
    urban: { ...DEFAULT_ENVIRONMENT_OPTIONS.urban, ...normalized.urban },
    techno: { ...DEFAULT_ENVIRONMENT_OPTIONS.techno, ...normalized.techno },
  };
}

export interface ScenePresetApplyOptions {
  /** 0–1 progress while fetching preset-specific assets (HDR, textures). */
  onAssetProgress?: (ratio: number) => void;
  /** Stable seed for procedural terrain/scenery (typically facility id). */
  environmentSeed?: string;
  /** Resolved environment tuning overrides. */
  environmentOptions?: EnvironmentOptions;
}
