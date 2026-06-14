import type { BluDesignEngine } from '../core/BluDesignEngine';
import type { GroundPresetId, SkyPresetId } from '../core/environment';

export interface ViewerViewPresetProgress {
  progress: number;
  message: string;
}

const SKY_STAGE = { start: 68, span: 14 } as const;
const GROUND_STAGE = { start: 82, span: 12 } as const;

function stageProgress(start: number, span: number, ratio: number): number {
  return start + span * Math.min(1, Math.max(0, ratio));
}

/**
 * Apply sky/ground presets and optionally report loading progress for the viewer overlay.
 * Asset downloads (HDR, ground textures) are awaited before this resolves.
 */
export async function applyViewerViewPresets(
  engine: BluDesignEngine,
  sky: SkyPresetId,
  ground: GroundPresetId,
  onProgress?: (update: ViewerViewPresetProgress) => void
): Promise<void> {
  const report = (progress: number, message: string) => onProgress?.({ progress, message });

  const skyNeedsDownload = sky === 'natural';
  const groundNeedsDownload =
    ground === 'grass' || ground === 'concrete' || ground === 'natural';

  report(
    SKY_STAGE.start,
    skyNeedsDownload ? 'Loading sky environment...' : 'Applying view settings...'
  );

  await engine.applySkyPreset(sky, {
    onAssetProgress: (ratio) =>
      report(
        stageProgress(SKY_STAGE.start, SKY_STAGE.span, ratio),
        skyNeedsDownload ? 'Loading sky environment...' : 'Applying view settings...'
      ),
  });

  report(
    GROUND_STAGE.start,
    groundNeedsDownload ? 'Loading ground textures...' : 'Applying ground...'
  );

  await engine.applyGroundPreset(ground, {
    onAssetProgress: (ratio) =>
      report(
        stageProgress(GROUND_STAGE.start, GROUND_STAGE.span, ratio),
        groundNeedsDownload ? 'Loading ground textures...' : 'Applying ground...'
      ),
  });

  engine.refreshGroundPlaneBounds();
}
