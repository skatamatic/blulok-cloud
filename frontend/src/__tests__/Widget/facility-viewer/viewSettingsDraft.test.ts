import {
  applyViewSettingsDraftPatch,
  createViewSettingsDraft,
} from '@/components/Widget/facility-viewer/viewSettingsDraft';

describe('viewSettingsDraft', () => {
  it('clones the committed config when opening the panel', () => {
    const draft = createViewSettingsDraft({
      skyPreset: 'day',
      groundPreset: 'grass',
      environmentOptions: { sky: { sunElevation: 40 } },
    });

    expect(draft).toEqual({
      skyPreset: 'day',
      groundPreset: 'grass',
      environmentOptions: { sky: { sunElevation: 40 } },
    });
    expect(draft.environmentOptions).not.toBe({ sky: { sunElevation: 40 } });
  });

  it('merges draft patches without persisting until apply', () => {
    const draft = createViewSettingsDraft({
      skyPreset: 'blank',
      groundPreset: 'blank',
    });

    const next = applyViewSettingsDraftPatch(draft, {
      skyPreset: 'sunset',
      environmentOptions: { sky: { sunElevation: 12 } },
    });

    expect(next).toEqual({
      skyPreset: 'sunset',
      groundPreset: 'blank',
      environmentOptions: { sky: { sunElevation: 12 } },
    });
  });
});
