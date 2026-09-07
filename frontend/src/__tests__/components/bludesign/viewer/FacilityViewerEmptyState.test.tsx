import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FacilityViewerEmptyState } from '@/components/bludesign/viewer/FacilityViewerEmptyState';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

const renderEmptyState = (props: React.ComponentProps<typeof FacilityViewerEmptyState>) =>
  render(
    <MemoryRouter>
      <FacilityViewerEmptyState {...props} />
    </MemoryRouter>
  );

describe('FacilityViewerEmptyState', () => {
  it('shows no-model messaging for an unlinked facility', () => {
    renderEmptyState({ variant: 'no-model', facilityName: 'North Site' });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('No 3D model configured')).toBeInTheDocument();
    expect(
      screen.getByText('Link a BluDesign model for North Site to view it here.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bludesign configuration/i })).toHaveAttribute(
      'href',
      '/bludesign/config'
    );
  });

  it('shows select-facility messaging in all-facilities scope', () => {
    renderEmptyState({ variant: 'select-facility' });

    expect(screen.getByText('Select a facility')).toBeInTheDocument();
    expect(
      screen.getByText('Pick one facility from the header to open its 3D view.')
    ).toBeInTheDocument();
  });
});
