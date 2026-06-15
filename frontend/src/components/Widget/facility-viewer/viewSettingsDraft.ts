import type {
  FacilityViewerEnvironmentOptions,
  FacilityViewerWidgetConfig,
} from '@/types/widget.types';
import type { GroundPresetId, SkyPresetId } from '@/components/bludesign/core/environment/ScenePresets';

export interface ViewSettingsDraft {
  skyPreset: SkyPresetId;
  groundPreset: GroundPresetId;
  environmentOptions?: FacilityViewerEnvironmentOptions;
}

export function createViewSettingsDraft(config: ViewSettingsDraft): ViewSettingsDraft {
  return {
    skyPreset: config.skyPreset,
    groundPreset: config.groundPreset,
    environmentOptions: config.environmentOptions
      ? JSON.parse(JSON.stringify(config.environmentOptions))
      : undefined,
  };
}

export function applyViewSettingsDraftPatch(
  draft: ViewSettingsDraft,
  patch: Partial<FacilityViewerWidgetConfig>
): ViewSettingsDraft {
  return {
    skyPreset: patch.skyPreset ?? draft.skyPreset,
    groundPreset: patch.groundPreset ?? draft.groundPreset,
    environmentOptions:
      patch.environmentOptions !== undefined
        ? patch.environmentOptions
        : draft.environmentOptions,
  };
}
