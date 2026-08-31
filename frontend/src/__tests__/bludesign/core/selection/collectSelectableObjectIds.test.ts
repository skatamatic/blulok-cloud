import { collectSelectableObjectIds } from '../../../../components/bludesign/core/selection/collectSelectableObjectIds';

describe('collectSelectableObjectIds', () => {
  it('returns keys from the selectable map in iteration order', () => {
    const map = new Map<string, unknown>([
      ['a', {}],
      ['b', {}],
    ]);
    expect(collectSelectableObjectIds(map)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty map', () => {
    expect(collectSelectableObjectIds(new Map())).toEqual([]);
  });
});
