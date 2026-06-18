import type {
  FacilityViewerEnvironmentOptions,
  FacilityViewerWidgetConfig,
} from '@/types/widget.types';
import type { GroundPresetId, SkyPresetId } from '@/components/bludesign/core/environment/ScenePresets';

export interface ViewSettingsDraft {
  skyPreset: SkyPresetId;
  groundPreset: GroundPresetId;
  environmentOptions?: FacilityViewerEnvironmentOptions;
  terrainAlignAssets?: boolean;
  terrainFlattenToGround?: boolean;
  terrainFlattenDistance?: number;
  terrainFlattenBlend?: number;
  terrainFlattenBaseline?: number;
}

export function createViewSettingsDraft(config: ViewSettingsDraft): ViewSettingsDraft {
  return {
    skyPreset: config.skyPreset,
    groundPreset: config.groundPreset,
    environmentOptions: config.environmentOptions
      ? JSON.parse(JSON.stringify(config.environmentOptions))
      : undefined,
    terrainAlignAssets: config.terrainAlignAssets,
    terrainFlattenToGround: config.terrainFlattenToGround,
    terrainFlattenDistance: config.terrainFlattenDistance,
    terrainFlattenBlend: config.terrainFlattenBlend,
    terrainFlattenBaseline: config.terrainFlattenBaseline,
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
    terrainAlignAssets:
      patch.terrainAlignAssets !== undefined
        ? patch.terrainAlignAssets
        : draft.terrainAlignAssets,
    terrainFlattenToGround:
      patch.terrainFlattenToGround !== undefined
        ? patch.terrainFlattenToGround
        : draft.terrainFlattenToGround,
    terrainFlattenDistance:
      patch.terrainFlattenDistance !== undefined
        ? patch.terrainFlattenDistance
        : draft.terrainFlattenDistance,
    terrainFlattenBlend:
      patch.terrainFlattenBlend !== undefined
        ? patch.terrainFlattenBlend
        : draft.terrainFlattenBlend,
    terrainFlattenBaseline:
      patch.terrainFlattenBaseline !== undefined
        ? patch.terrainFlattenBaseline
        : draft.terrainFlattenBaseline,
  };
}
