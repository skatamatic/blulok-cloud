import { describe, expect, it } from 'vitest';
import {
  appFacilitySelectionHint,
  buildAppFacilityOptions,
  formatAppFacilityOptionLabel,
  pickDefaultAppFacilityId,
} from '../src/renderer/utils/app-facility-options.utils';

describe('buildAppFacilityOptions', () => {
  it('ranks accessible+gateway first and marks gateway-only as inaccessible', () => {
    const options = buildAppFacilityOptions(
      [
        { id: 'fac-a', name: 'Alpha' },
        { id: 'fac-b', name: 'Beta' },
      ],
      [
        { id: 'fac-b', name: 'Beta GW' },
        { id: 'fac-c', name: 'Charlie' },
      ],
    );

    expect(options.map((o) => o.id)).toEqual(['fac-b', 'fac-a', 'fac-c']);
    expect(options[0]).toMatchObject({ accessible: true, hasLocalGateway: true });
    expect(options[1]).toMatchObject({ accessible: true, hasLocalGateway: false });
    expect(options[2]).toMatchObject({ accessible: false, hasLocalGateway: true, name: 'Charlie' });
  });

  it('prefers accessible facility names over gateway labels', () => {
    const options = buildAppFacilityOptions(
      [{ id: 'fac-1', name: 'Cloud Name' }],
      [{ id: 'fac-1', name: 'Gateway Label' }],
    );
    expect(options[0]?.name).toBe('Cloud Name');
  });
});

describe('pickDefaultAppFacilityId', () => {
  const options = buildAppFacilityOptions(
    [
      { id: 'fac-a', name: 'Alpha' },
      { id: 'fac-b', name: 'Beta' },
    ],
    [{ id: 'fac-b', name: 'Beta' }],
  );

  it('keeps a still-accessible current selection', () => {
    expect(pickDefaultAppFacilityId(options, 'fac-a')).toBe('fac-a');
  });

  it('defaults to accessible+local gateway', () => {
    expect(pickDefaultAppFacilityId(options, '')).toBe('fac-b');
  });

  it('ignores inaccessible current selection', () => {
    expect(pickDefaultAppFacilityId(options, 'fac-c')).toBe('fac-b');
  });
});

describe('formatAppFacilityOptionLabel / hint', () => {
  it('labels access and gateway presence', () => {
    expect(
      formatAppFacilityOptionLabel({
        id: '1',
        name: 'Riverside',
        accessible: true,
        hasLocalGateway: true,
      }),
    ).toBe('Riverside · local gateway');
    expect(
      formatAppFacilityOptionLabel({
        id: '2',
        name: 'Other',
        accessible: false,
        hasLocalGateway: true,
      }),
    ).toBe('Other (no access)');
  });

  it('hints when selection has no access or no local gateway', () => {
    const options = buildAppFacilityOptions(
      [{ id: 'fac-a', name: 'Alpha' }],
      [{ id: 'fac-b', name: 'Beta' }],
    );
    expect(appFacilitySelectionHint(options, 'fac-a')).toMatch(/No local simulator gateway/);
    expect(appFacilitySelectionHint(options, 'fac-b')).toMatch(/cannot subscribe/);
    expect(appFacilitySelectionHint([], '')).toMatch(/No facilities available/);
  });
});
