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
  it('returns null in all-facilities mode regardless of available models', () => {
    expect(resolveActiveDesignFacility(options, true, null)).toBeNull();
    expect(
      resolveActiveDesignFacility(options, true, {
        id: 'blulok-1',
        name: 'North Site',
        bluDesignFacilityId: 'design-a',
      })
    ).toBeNull();
  });

  it('uses bluDesignFacilityId on the selected facility when scoped', () => {
    expect(
      resolveActiveDesignFacility(options, false, {
        id: 'blulok-1',
        name: 'North Site',
        bluDesignFacilityId: 'design-a',
      })
    ).toMatchObject({ id: 'design-a' });
  });

  it('falls back to link lookup when bluDesignFacilityId is missing', () => {
    expect(
      resolveActiveDesignFacility(options, false, {
        id: 'blulok-2',
        name: 'South Site',
      })
    ).toMatchObject({ id: 'design-b' });
  });

  it('returns null when scoped facility has no linked model', () => {
    expect(
      resolveActiveDesignFacility(options, false, {
        id: 'blulok-9',
        name: 'Unlinked Site',
      })
    ).toBeNull();
  });
});
