/**
 * Contextual advanced environment controls for the Facility 3D View settings panel.
 */

import React from 'react';
import {
  DEFAULT_ENVIRONMENT_OPTIONS,
  ENVIRONMENT_OPTION_RANGES,
  type GroundPresetId,
  type SkyPresetId,
} from '@/components/bludesign/core/environment/ScenePresets';
import type { FacilityViewerEnvironmentOptions } from '@/types/widget.types';

interface EnvironmentFineTuneControlsProps {
  skyPreset: SkyPresetId;
  groundPreset: GroundPresetId;
  environmentOptions?: FacilityViewerEnvironmentOptions;
  isDark: boolean;
  onChange: (patch: Partial<{ environmentOptions: FacilityViewerEnvironmentOptions }>) => void;
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  isDark: boolean;
  onChange: (value: number) => void;
}

interface ColorControlProps {
  label: string;
  value: string;
  isDark: boolean;
  onChange: (value: string) => void;
}

interface ToggleControlProps {
  label: string;
  hint?: string;
  value: boolean;
  isDark: boolean;
  onChange: (value: boolean) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  isDark,
  onChange,
}) => {
  const id = `env-slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
  <label htmlFor={id} className="block space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
        {label}
      </span>
      <span className={`text-xs tabular-nums ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        {Number.isInteger(step) ? value : value.toFixed(2)}
      </span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#147FD4]"
    />
  </label>
  );
};

const ColorControl: React.FC<ColorControlProps> = ({ label, value, isDark, onChange }) => (
  <label className="flex items-center justify-between gap-3">
    <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
      {label}
    </span>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-12 cursor-pointer rounded border border-gray-300 dark:border-gray-600 bg-transparent"
    />
  </label>
);

const ToggleControl: React.FC<ToggleControlProps> = ({ label, hint, value, isDark, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
        {label}
      </span>
      {hint && (
        <p className={`mt-0.5 text-[11px] leading-snug ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {hint}
        </p>
      )}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        ${value ? 'bg-[#147FD4]' : isDark ? 'bg-gray-600' : 'bg-gray-300'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${value ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  </div>
);

function patchSection<S extends keyof FacilityViewerEnvironmentOptions>(
  current: FacilityViewerEnvironmentOptions | undefined,
  section: S,
  patch: NonNullable<FacilityViewerEnvironmentOptions[S]>
): FacilityViewerEnvironmentOptions {
  return {
    ...current,
    [section]: {
      ...(current?.[section] ?? {}),
      ...patch,
    },
  };
}

function resetSection(
  current: FacilityViewerEnvironmentOptions | undefined,
  section: keyof FacilityViewerEnvironmentOptions
): FacilityViewerEnvironmentOptions {
  const next = { ...current };
  delete next[section];
  return next;
}

const SectionHeader: React.FC<{
  title: string;
  isDark: boolean;
  onReset?: () => void;
}> = ({ title, isDark, onReset }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
      {title}
    </h4>
    {onReset && (
      <button
        type="button"
        onClick={onReset}
        className="text-xs font-medium text-[#147FD4] hover:text-[#1269b0] transition-colors"
      >
        Reset
      </button>
    )}
  </div>
);

export const EnvironmentFineTuneControls: React.FC<EnvironmentFineTuneControlsProps> = ({
  skyPreset,
  groundPreset,
  environmentOptions,
  isDark,
  onChange,
}) => {
  const sky = environmentOptions?.sky ?? {};
  const ground = environmentOptions?.ground ?? {};
  const woodland = environmentOptions?.woodland ?? {};
  const urban = environmentOptions?.urban ?? {};
  const techno = environmentOptions?.techno ?? {};

  const patchSky = (patch: typeof sky) =>
    onChange({ environmentOptions: patchSection(environmentOptions, 'sky', patch) });
  const patchGround = (patch: typeof ground) =>
    onChange({ environmentOptions: patchSection(environmentOptions, 'ground', patch) });
  const patchWoodland = (patch: typeof woodland) =>
    onChange({ environmentOptions: patchSection(environmentOptions, 'woodland', patch) });
  const patchUrban = (patch: typeof urban) =>
    onChange({ environmentOptions: patchSection(environmentOptions, 'urban', patch) });
  const patchTechno = (patch: typeof techno) =>
    onChange({ environmentOptions: patchSection(environmentOptions, 'techno', patch) });

  const showSkyFineTune =
    skyPreset === 'blank' ||
    skyPreset === 'night' ||
    skyPreset === 'day' ||
    skyPreset === 'sunset' ||
    skyPreset === 'natural' ||
    skyPreset === 'space';

  const showGroundFineTune =
    groundPreset === 'grass' ||
    groundPreset === 'concrete' ||
    groundPreset === 'natural' ||
    groundPreset === 'woodland' ||
    groundPreset === 'urban';

  const hasFineTune =
    showSkyFineTune ||
    showGroundFineTune ||
    groundPreset === 'woodland' ||
    groundPreset === 'urban' ||
    groundPreset === 'techno';

  const dayDefaults = skyPreset === 'sunset'
    ? { elevation: 4, azimuth: 200, turbidity: 8 }
    : { elevation: 55, azimuth: 180, turbidity: 4 };
  const R = ENVIRONMENT_OPTION_RANGES;

  return (
    <div className={`rounded-xl border p-4 space-y-5 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50/80'}`}>
      <div>
        <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Fine tune
        </h3>
        <p className={`mt-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Adjust the active sky and ground presets. Values are saved and restored when you switch back.
        </p>
      </div>

      {showSkyFineTune && (
        <section>
          <SectionHeader
            title="Sky"
            isDark={isDark}
            onReset={() => onChange({ environmentOptions: resetSection(environmentOptions, 'sky') })}
          />
          <div className="space-y-3">
            {(skyPreset === 'blank' || skyPreset === 'night') && (
              <ColorControl
                label="Background tint"
                value={sky.backgroundTint ?? (skyPreset === 'night' ? '#0b1020' : '#1a1a2e')}
                isDark={isDark}
                onChange={(backgroundTint) => patchSky({ backgroundTint })}
              />
            )}
            {(skyPreset === 'day' || skyPreset === 'sunset') && (
              <>
                <SliderControl
                  label="Sun elevation"
                  value={sky.sunElevation ?? dayDefaults.elevation}
                  min={R.sky.sunElevation.min}
                  max={R.sky.sunElevation.max}
                  isDark={isDark}
                  onChange={(sunElevation) => patchSky({ sunElevation })}
                />
                <SliderControl
                  label="Sun azimuth"
                  value={sky.sunAzimuth ?? dayDefaults.azimuth}
                  min={R.sky.sunAzimuth.min}
                  max={R.sky.sunAzimuth.max}
                  isDark={isDark}
                  onChange={(sunAzimuth) => patchSky({ sunAzimuth })}
                />
                <SliderControl
                  label="Turbidity"
                  value={sky.turbidity ?? dayDefaults.turbidity}
                  min={R.sky.turbidity.min}
                  max={R.sky.turbidity.max}
                  step={0.5}
                  isDark={isDark}
                  onChange={(turbidity) => patchSky({ turbidity })}
                />
                <SliderControl
                  label="Atmosphere intensity"
                  value={sky.atmosphereIntensity ?? DEFAULT_ENVIRONMENT_OPTIONS.sky.atmosphereIntensity!}
                  min={R.sky.atmosphereIntensity.min}
                  max={R.sky.atmosphereIntensity.max}
                  step={0.1}
                  isDark={isDark}
                  onChange={(atmosphereIntensity) => patchSky({ atmosphereIntensity })}
                />
              </>
            )}
            {(skyPreset === 'natural' || skyPreset === 'space') && (
              <>
                <SliderControl
                  label="Exposure"
                  value={sky.exposure ?? DEFAULT_ENVIRONMENT_OPTIONS.sky.exposure!}
                  min={R.sky.exposure.min}
                  max={R.sky.exposure.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(exposure) => patchSky({ exposure })}
                />
                <SliderControl
                  label="Background intensity"
                  value={sky.backgroundIntensity ?? DEFAULT_ENVIRONMENT_OPTIONS.sky.backgroundIntensity!}
                  min={R.sky.backgroundIntensity.min}
                  max={R.sky.backgroundIntensity.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(backgroundIntensity) => patchSky({ backgroundIntensity })}
                />
              </>
            )}
          </div>
        </section>
      )}

      {showGroundFineTune && (
        <section>
          <SectionHeader
            title="Ground"
            isDark={isDark}
            onReset={() => onChange({ environmentOptions: resetSection(environmentOptions, 'ground') })}
          />
          <div className="space-y-3">
            <ColorControl
              label="Primary tint"
              value={ground.primaryTint ?? '#a4dc6a'}
              isDark={isDark}
              onChange={(primaryTint) => patchGround({ primaryTint })}
            />
            {(groundPreset === 'natural' || groundPreset === 'woodland') && (
              <ColorControl
                label="Secondary tint"
                value={ground.secondaryTint ?? '#86bd52'}
                isDark={isDark}
                onChange={(secondaryTint) => patchGround({ secondaryTint })}
              />
            )}
            <SliderControl
              label="Primary tint mix"
              value={ground.primaryTintMix ?? 0.14}
              min={R.ground.primaryTintMix.min}
              max={R.ground.primaryTintMix.max}
              step={0.01}
              isDark={isDark}
              onChange={(primaryTintMix) => patchGround({ primaryTintMix })}
            />
            <SliderControl
              label="Brightness"
              value={ground.primaryBrightness ?? 1.2}
              min={R.ground.primaryBrightness.min}
              max={R.ground.primaryBrightness.max}
              step={0.05}
              isDark={isDark}
              onChange={(primaryBrightness) => patchGround({ primaryBrightness })}
            />
            <SliderControl
              label="Saturation"
              value={ground.primarySaturation ?? 1.28}
              min={R.ground.primarySaturation.min}
              max={R.ground.primarySaturation.max}
              step={0.05}
              isDark={isDark}
              onChange={(primarySaturation) => patchGround({ primarySaturation })}
            />
            <ColorControl
              label="Horizon color"
              value={ground.horizonColor ?? '#c5d8e6'}
              isDark={isDark}
              onChange={(horizonColor) => patchGround({ horizonColor })}
            />
            <SliderControl
              label="Fade start"
              value={ground.fadeStartScale ?? DEFAULT_ENVIRONMENT_OPTIONS.ground.fadeStartScale!}
              min={R.ground.fadeStartScale.min}
              max={R.ground.fadeStartScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(fadeStartScale) => patchGround({ fadeStartScale })}
            />
            <SliderControl
              label="Outer fade"
              value={ground.outerFadeScale ?? DEFAULT_ENVIRONMENT_OPTIONS.ground.outerFadeScale!}
              min={R.ground.outerFadeScale.min}
              max={R.ground.outerFadeScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(outerFadeScale) => patchGround({ outerFadeScale })}
            />
          </div>
        </section>
      )}

      {groundPreset === 'woodland' && (
        <section>
          <SectionHeader
            title="Woodland scenery"
            isDark={isDark}
            onReset={() => onChange({ environmentOptions: resetSection(environmentOptions, 'woodland') })}
          />
          <div className="space-y-3">
            <SliderControl
              label="Hill amplitude"
              value={woodland.hillAmplitude ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.hillAmplitude!}
              min={R.woodland.hillAmplitude.min}
              max={R.woodland.hillAmplitude.max}
              isDark={isDark}
              onChange={(hillAmplitude) => patchWoodland({ hillAmplitude })}
            />
            <SliderControl
              label="Hill scale"
              value={woodland.hillScale ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.hillScale!}
              min={R.woodland.hillScale.min}
              max={R.woodland.hillScale.max}
              step={0.0005}
              isDark={isDark}
              onChange={(hillScale) => patchWoodland({ hillScale })}
            />
            <SliderControl
              label="Tree density"
              value={woodland.treeDensity ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeDensity!}
              min={R.woodland.treeDensity.min}
              max={R.woodland.treeDensity.max}
              step={0.05}
              isDark={isDark}
              onChange={(treeDensity) => patchWoodland({ treeDensity })}
            />
            <SliderControl
              label="Min tree scale"
              value={woodland.treeScaleMin ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeScaleMin!}
              min={R.woodland.treeScaleMin.min}
              max={R.woodland.treeScaleMin.max}
              step={0.05}
              isDark={isDark}
              onChange={(treeScaleMin) => patchWoodland({ treeScaleMin })}
            />
            <SliderControl
              label="Max tree scale"
              value={woodland.treeScaleMax ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.treeScaleMax!}
              min={R.woodland.treeScaleMax.min}
              max={R.woodland.treeScaleMax.max}
              step={0.05}
              isDark={isDark}
              onChange={(treeScaleMax) => patchWoodland({ treeScaleMax })}
            />
            <SliderControl
              label="Landmark tree chance"
              value={woodland.landmarkTreeChance ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.landmarkTreeChance!}
              min={R.woodland.landmarkTreeChance.min}
              max={R.woodland.landmarkTreeChance.max}
              step={0.005}
              isDark={isDark}
              onChange={(landmarkTreeChance) => patchWoodland({ landmarkTreeChance })}
            />
            <SliderControl
              label="Pine / deciduous mix"
              value={woodland.pineMix ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.pineMix!}
              min={R.woodland.pineMix.min}
              max={R.woodland.pineMix.max}
              step={0.05}
              isDark={isDark}
              onChange={(pineMix) => patchWoodland({ pineMix })}
            />

            <div className={`pt-1 mt-1 border-t ${isDark ? 'border-gray-700/70' : 'border-gray-200'}`}>
              <p className={`mt-2 mb-2 text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Water features
              </p>
              <div className="space-y-3">
                <SliderControl
                  label="Rivers"
                  value={woodland.riverCount ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverCount!}
                  min={R.woodland.riverCount.min}
                  max={R.woodland.riverCount.max}
                  step={1}
                  isDark={isDark}
                  onChange={(riverCount) => patchWoodland({ riverCount })}
                />
                <SliderControl
                  label="Ponds"
                  value={woodland.pondCount ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.pondCount!}
                  min={R.woodland.pondCount.min}
                  max={R.woodland.pondCount.max}
                  step={1}
                  isDark={isDark}
                  onChange={(pondCount) => patchWoodland({ pondCount })}
                />
                <SliderControl
                  label="River width"
                  value={woodland.riverWidth ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverWidth!}
                  min={R.woodland.riverWidth.min}
                  max={R.woodland.riverWidth.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(riverWidth) => patchWoodland({ riverWidth })}
                />
                <SliderControl
                  label="River meander"
                  value={woodland.riverMeander ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.riverMeander!}
                  min={R.woodland.riverMeander.min}
                  max={R.woodland.riverMeander.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(riverMeander) => patchWoodland({ riverMeander })}
                />
                <SliderControl
                  label="Pond size"
                  value={woodland.pondSize ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.pondSize!}
                  min={R.woodland.pondSize.min}
                  max={R.woodland.pondSize.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(pondSize) => patchWoodland({ pondSize })}
                />
                <SliderControl
                  label="Water depth"
                  value={woodland.waterDepth ?? DEFAULT_ENVIRONMENT_OPTIONS.woodland.waterDepth!}
                  min={R.woodland.waterDepth.min}
                  max={R.woodland.waterDepth.max}
                  step={0.05}
                  isDark={isDark}
                  onChange={(waterDepth) => patchWoodland({ waterDepth })}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {groundPreset === 'urban' && (
        <section>
          <SectionHeader
            title="Urban scenery"
            isDark={isDark}
            onReset={() => onChange({ environmentOptions: resetSection(environmentOptions, 'urban') })}
          />
          <div className="space-y-3">
            <SliderControl
              label="City density"
              value={urban.cityDensity ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.cityDensity!}
              min={R.urban.cityDensity.min}
              max={R.urban.cityDensity.max}
              step={0.05}
              isDark={isDark}
              onChange={(cityDensity) => patchUrban({ cityDensity })}
            />
            <SliderControl
              label="Building height scale"
              value={urban.buildingHeightScale ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.buildingHeightScale!}
              min={R.urban.buildingHeightScale.min}
              max={R.urban.buildingHeightScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(buildingHeightScale) => patchUrban({ buildingHeightScale })}
            />
            <SliderControl
              label="Building footprint scale"
              value={urban.buildingFootprintScale ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.buildingFootprintScale!}
              min={R.urban.buildingFootprintScale.min}
              max={R.urban.buildingFootprintScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(buildingFootprintScale) => patchUrban({ buildingFootprintScale })}
            />
            <SliderControl
              label="Park frequency"
              value={urban.parkFrequency ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.parkFrequency!}
              min={R.urban.parkFrequency.min}
              max={R.urban.parkFrequency.max}
              step={0.05}
              isDark={isDark}
              onChange={(parkFrequency) => patchUrban({ parkFrequency })}
            />
            <SliderControl
              label="Large park chance"
              value={urban.largeParkChance ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.largeParkChance!}
              min={R.urban.largeParkChance.min}
              max={R.urban.largeParkChance.max}
              step={0.01}
              isDark={isDark}
              onChange={(largeParkChance) => patchUrban({ largeParkChance })}
            />
            <SliderControl
              label="Street width"
              value={urban.streetWidth ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.streetWidth!}
              min={R.urban.streetWidth.min}
              max={R.urban.streetWidth.max}
              step={0.5}
              isDark={isDark}
              onChange={(streetWidth) => patchUrban({ streetWidth })}
            />
            <SliderControl
              label="Block size"
              value={urban.blockSize ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.blockSize!}
              min={R.urban.blockSize.min}
              max={R.urban.blockSize.max}
              step={1}
              isDark={isDark}
              onChange={(blockSize) => patchUrban({ blockSize })}
            />
            <SliderControl
              label="Street tree density"
              value={urban.streetTreeDensity ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.streetTreeDensity!}
              min={R.urban.streetTreeDensity.min}
              max={R.urban.streetTreeDensity.max}
              step={0.05}
              isDark={isDark}
              onChange={(streetTreeDensity) => patchUrban({ streetTreeDensity })}
            />
            <SliderControl
              label="Scenery fade start"
              value={urban.sceneryFadeStartScale ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.sceneryFadeStartScale!}
              min={R.urban.sceneryFadeStartScale.min}
              max={R.urban.sceneryFadeStartScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(sceneryFadeStartScale) => patchUrban({ sceneryFadeStartScale })}
            />
            <SliderControl
              label="Scenery fade end"
              value={urban.sceneryFadeEndScale ?? DEFAULT_ENVIRONMENT_OPTIONS.urban.sceneryFadeEndScale!}
              min={R.urban.sceneryFadeEndScale.min}
              max={R.urban.sceneryFadeEndScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(sceneryFadeEndScale) => patchUrban({ sceneryFadeEndScale })}
            />
          </div>
        </section>
      )}

      {groundPreset === 'techno' && (
        <section>
          <SectionHeader
            title="Techno grid"
            isDark={isDark}
            onReset={() => onChange({ environmentOptions: resetSection(environmentOptions, 'techno') })}
          />
          <div className="space-y-3">
            <ToggleControl
              label="Show grid"
              hint="Turn off for a facility floating in open space."
              value={techno.showGrid ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.showGrid!}
              isDark={isDark}
              onChange={(showGrid) => patchTechno({ showGrid })}
            />
            <ToggleControl
              label="Space backdrop"
              hint="Starfield HDR behind the grid; facility lighting uses the daylight HDR."
              value={techno.showSpaceBackdrop ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.showSpaceBackdrop!}
              isDark={isDark}
              onChange={(showSpaceBackdrop) => patchTechno({ showSpaceBackdrop })}
            />
            <SliderControl
              label="Cell size"
              value={techno.cellSize ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.cellSize!}
              min={R.techno.cellSize.min}
              max={R.techno.cellSize.max}
              step={0.1}
              isDark={isDark}
              onChange={(cellSize) => patchTechno({ cellSize })}
            />
            <SliderControl
              label="Major line every (cells)"
              value={techno.majorInterval ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.majorInterval!}
              min={R.techno.majorInterval.min}
              max={R.techno.majorInterval.max}
              step={1}
              isDark={isDark}
              onChange={(majorInterval) => patchTechno({ majorInterval })}
            />
            <SliderControl
              label="Super line every (cells)"
              value={techno.superInterval ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.superInterval!}
              min={R.techno.superInterval.min}
              max={R.techno.superInterval.max}
              step={1}
              isDark={isDark}
              onChange={(superInterval) => patchTechno({ superInterval })}
            />
            <SliderControl
              label="Fade start scale"
              value={techno.fadeStartScale ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.fadeStartScale!}
              min={R.techno.fadeStartScale.min}
              max={R.techno.fadeStartScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(fadeStartScale) => patchTechno({ fadeStartScale })}
            />
            <SliderControl
              label="Outer fade scale"
              value={techno.outerFadeScale ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.outerFadeScale!}
              min={R.techno.outerFadeScale.min}
              max={R.techno.outerFadeScale.max}
              step={0.05}
              isDark={isDark}
              onChange={(outerFadeScale) => patchTechno({ outerFadeScale })}
            />
            <ColorControl
              label="Line color"
              value={techno.lineColor ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.lineColor!}
              isDark={isDark}
              onChange={(lineColor) => patchTechno({ lineColor })}
            />
            <ColorControl
              label="Accent color"
              value={techno.accentColor ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.accentColor!}
              isDark={isDark}
              onChange={(accentColor) => patchTechno({ accentColor })}
            />
            <ColorControl
              label="Horizon tint"
              value={techno.horizonColor ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.horizonColor!}
              isDark={isDark}
              onChange={(horizonColor) => patchTechno({ horizonColor })}
            />
            {!techno.showSpaceBackdrop && (
              <ColorControl
                label="Void color"
                value={techno.voidColor ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.voidColor!}
                isDark={isDark}
                onChange={(voidColor) => patchTechno({ voidColor })}
              />
            )}
            <SliderControl
              label="Glow intensity"
              value={techno.glowIntensity ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.glowIntensity!}
              min={R.techno.glowIntensity.min}
              max={R.techno.glowIntensity.max}
              step={0.05}
              isDark={isDark}
              onChange={(glowIntensity) => patchTechno({ glowIntensity })}
            />
            <SliderControl
              label="Pulse speed"
              value={techno.pulseSpeed ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.pulseSpeed!}
              min={R.techno.pulseSpeed.min}
              max={R.techno.pulseSpeed.max}
              step={0.05}
              isDark={isDark}
              onChange={(pulseSpeed) => patchTechno({ pulseSpeed })}
            />
            <SliderControl
              label="Line thickness"
              value={techno.lineThickness ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.lineThickness!}
              min={R.techno.lineThickness.min}
              max={R.techno.lineThickness.max}
              step={0.05}
              isDark={isDark}
              onChange={(lineThickness) => patchTechno({ lineThickness })}
            />
            <SliderControl
              label="Major line thickness"
              value={techno.majorLineThickness ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.majorLineThickness!}
              min={R.techno.majorLineThickness.min}
              max={R.techno.majorLineThickness.max}
              step={0.05}
              isDark={isDark}
              onChange={(majorLineThickness) => patchTechno({ majorLineThickness })}
            />
            <SliderControl
              label="Super line thickness"
              value={techno.superLineThickness ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.superLineThickness!}
              min={R.techno.superLineThickness.min}
              max={R.techno.superLineThickness.max}
              step={0.05}
              isDark={isDark}
              onChange={(superLineThickness) => patchTechno({ superLineThickness })}
            />
            <SliderControl
              label="Platform glow"
              value={techno.platformGlow ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.platformGlow!}
              min={R.techno.platformGlow.min}
              max={R.techno.platformGlow.max}
              step={0.01}
              isDark={isDark}
              onChange={(platformGlow) => patchTechno({ platformGlow })}
            />
            {!techno.showSpaceBackdrop && (
              <SliderControl
                label="Void fill opacity"
                value={techno.baseAlpha ?? DEFAULT_ENVIRONMENT_OPTIONS.techno.baseAlpha!}
                min={R.techno.baseAlpha.min}
                max={R.techno.baseAlpha.max}
                step={0.01}
                isDark={isDark}
                onChange={(baseAlpha) => patchTechno({ baseAlpha })}
              />
            )}
          </div>
        </section>
      )}

      {!hasFineTune && (
        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Select a sky or textured ground preset to unlock advanced controls.
        </p>
      )}
    </div>
  );
};
