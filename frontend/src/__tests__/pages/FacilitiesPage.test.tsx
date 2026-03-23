/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FacilitiesPage from '@/pages/FacilitiesPage';

const mockNavigate = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

describe('FacilitiesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows all-facilities message when global selector is all', () => {
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
      isAllFacilitiesSelected: true,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <FacilitiesPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/All Facilities View/i)).toBeInTheDocument();
  });

  it('shows loading when facility context loading', () => {
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: null,
      isAllFacilitiesSelected: false,
      isLoading: true,
    });

    render(
      <MemoryRouter>
        <FacilitiesPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading facilities/i)).toBeInTheDocument();
  });

  it('redirects to facility details when specific facility selected', () => {
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '550e8400-e29b-41d4-a716-446655440001',
      isAllFacilitiesSelected: false,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <FacilitiesPage />
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      '/facilities/550e8400-e29b-41d4-a716-446655440001',
      { replace: true }
    );
  });
});
