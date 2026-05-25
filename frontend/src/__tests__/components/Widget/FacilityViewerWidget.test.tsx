import { resolveActiveDesignFacility, DesignFacilityOption } from '@/components/Widget/FacilityViewerWidget';

const options: DesignFacilityOption[] = [
  {
    id: 'design-a',
    name: 'Model A',
    linkedBlulokId: 'blulok-1',
    linkedBlulokName: 'North Site',
  },
  {
    id: 'design-b',
    name: 'Model B',
    linkedBlulokId: 'blulok-2',
    linkedBlulokName: 'South Site',
  },
];

describe('resolveActiveDesignFacility', () => {
  it('uses the all-facilities picker selection', () => {
    expect(
      resolveActiveDesignFacility(options, true, 'design-b', null)
    ).toMatchObject({ id: 'design-b', linkedBlulokId: 'blulok-2' });
  });

  it('uses bluDesignFacilityId on the selected facility when scoped', () => {
    expect(
      resolveActiveDesignFacility(options, false, null, {
        id: 'blulok-1',
        name: 'North Site',
        bluDesignFacilityId: 'design-a',
      })
    ).toMatchObject({ id: 'design-a' });
  });

  it('falls back to link lookup when bluDesignFacilityId is missing', () => {
    expect(
      resolveActiveDesignFacility(options, false, null, {
        id: 'blulok-2',
        name: 'South Site',
      })
    ).toMatchObject({ id: 'design-b' });
  });

  it('returns null when scoped facility has no linked model', () => {
    expect(
      resolveActiveDesignFacility(options, false, null, {
        id: 'blulok-9',
        name: 'Unlinked Site',
      })
    ).toBeNull();
  });
});
