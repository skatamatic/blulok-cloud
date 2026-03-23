/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopLevelFacilitySelector } from '@/components/Layout/TopLevelFacilitySelector';

const mockSetSelectedFacilityId = jest.fn();

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({ isCollapsed: false }),
}));

const mockUseGlobalFacility = jest.fn();

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

describe('TopLevelFacilitySelector', () => {
  const facility = {
    id: 'fac-1',
    name: 'Alpha Storage',
    address: '1 Main St',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      facilities: [facility],
      selectedFacilityId: 'fac-1',
      selectedFacility: facility,
      setSelectedFacilityId: mockSetSelectedFacilityId,
      isAllFacilitiesSelected: false,
      isLoading: false,
    });
  });

  it('renders nothing while loading', () => {
    mockUseGlobalFacility.mockReturnValue({
      facilities: [facility],
      selectedFacilityId: null,
      selectedFacility: null,
      setSelectedFacilityId: mockSetSelectedFacilityId,
      isAllFacilitiesSelected: false,
      isLoading: true,
    });

    const { container } = render(<TopLevelFacilitySelector />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there are no facilities', () => {
    mockUseGlobalFacility.mockReturnValue({
      facilities: [],
      selectedFacilityId: null,
      selectedFacility: null,
      setSelectedFacilityId: mockSetSelectedFacilityId,
      isAllFacilitiesSelected: false,
      isLoading: false,
    });

    const { container } = render(<TopLevelFacilitySelector />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the menu and selects All Facilities', async () => {
    const user = userEvent.setup();

    render(<TopLevelFacilitySelector />);

    await user.click(screen.getByRole('button', { name: /Alpha Storage/i }));

    const allBtn = screen.getAllByRole('button', { name: /All Facilities/i })[0];
    await user.click(allBtn);

    expect(mockSetSelectedFacilityId).toHaveBeenCalledWith('__ALL_FACILITIES__');
  });

  it('selects a facility from the list', async () => {
    const user = userEvent.setup();

    mockUseGlobalFacility.mockReturnValue({
      facilities: [facility],
      selectedFacilityId: '__ALL_FACILITIES__',
      selectedFacility: null,
      setSelectedFacilityId: mockSetSelectedFacilityId,
      isAllFacilitiesSelected: true,
      isLoading: false,
    });

    render(<TopLevelFacilitySelector />);

    await user.click(screen.getByRole('button', { name: /All Facilities/i }));

    await user.click(screen.getByRole('button', { name: /Alpha Storage/i }));

    expect(mockSetSelectedFacilityId).toHaveBeenCalledWith('fac-1');
  });
});
