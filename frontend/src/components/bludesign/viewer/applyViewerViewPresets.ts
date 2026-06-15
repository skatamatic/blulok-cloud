import type { BluDesignEngine } from '../core/BluDesignEngine';
import {
  resolveEnvironmentOptions,
  type EnvironmentOptions,
  type GroundPresetId,
  type SkyPresetId,
} from '../core/environment';

export interface ViewerViewPresetProgress {
  progress: number;
  message: string;
}

const GROUND_STAGE = { start: 68, span: 14 } as const;
const SKY_STAGE = { start: 82, span: 12 } as const;

function stageProgress(start: number, span: number, ratio: number): number {
  return start + span * Math.min(1, Math.max(0, ratio));
}

/**
 * Apply sky/ground presets and optionally report loading progress for the viewer overlay.
 * Asset downloads (HDR, ground textures) are awaited before this resolves.
 *
 * Ground is applied before sky so techno space-backdrop sync runs while the active ground
 * preset is already set, and the sky pass preserves the overlay when active.
 */
export async function applyViewerViewPresets(
  engine: BluDesignEngine,
  sky: SkyPresetId,
  ground: GroundPresetId,
  onProgress?: (update: ViewerViewPresetProgress) => void,
  environmentOptions?: EnvironmentOptions
): Promise<void> {
  const report = (progress: number, message: string) => onProgress?.({ progress, message });
  const presetApplyOptions = environmentOptions ? { environmentOptions } : undefined;
  const resolved = environmentOptions ? resolveEnvironmentOptions(environmentOptions) : null;

  const technoSpaceBackdrop =
    ground === 'techno' && (resolved?.techno.showSpaceBackdrop ?? false) && sky !== 'space';

  const splitSpaceLighting = sky === 'space' || technoSpaceBackdrop;

  const groundNeedsDownload =
    ground === 'grass' ||
    ground === 'concrete' ||
    ground === 'natural' ||
    ground === 'woodland' ||
    ground === 'urban' ||
    splitSpaceLighting;

  const skyNeedsDownload = sky === 'natural' || splitSpaceLighting;

  report(
    GROUND_STAGE.start,
    groundNeedsDownload ? 'Loading ground environment...' : 'Applying ground...'
  );

  await engine.applyGroundPreset(ground, {
    ...presetApplyOptions,
    onAssetProgress: (ratio) =>
      report(
        stageProgress(GROUND_STAGE.start, GROUND_STAGE.span, ratio),
        groundNeedsDownload ? 'Loading ground environment...' : 'Applying ground...'
      ),
  });

  report(
    SKY_STAGE.start,
    skyNeedsDownload ? 'Loading sky environment...' : 'Applying view settings...'
  );

  await engine.applySkyPreset(sky, {
    ...presetApplyOptions,
    onAssetProgress: (ratio) =>
      report(
        stageProgress(SKY_STAGE.start, SKY_STAGE.span, ratio),
        skyNeedsDownload ? 'Loading sky environment...' : 'Applying view settings...'
      ),
  });

  engine.refreshGroundPlaneBounds();
}
