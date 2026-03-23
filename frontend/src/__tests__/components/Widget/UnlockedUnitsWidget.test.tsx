/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UnlockedUnitsWidget } from '@/components/Widget/UnlockedUnitsWidget';

const mockNavigate = jest.fn();
const mockRefetch = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockUseUnitsData = jest.fn();

jest.mock('@/hooks/useUnitsData', () => ({
  useUnitsData: () => mockUseUnitsData(),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
  },
}));

jest.mock('@/components/Widget/Widget', () => ({
  Widget: ({
    children,
    title,
    enhancedMenu,
  }: {
    children: React.ReactNode;
    title: string;
    enhancedMenu?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="widget-menu">{enhancedMenu}</div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

describe('UnlockedUnitsWidget', () => {
  const unlockedSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUnitsData.mockReturnValue({
      data: {
        unlockedUnits: [
          {
            id: 'unit-1',
            unit_number: '205',
            facility_name: 'North Storage',
            unlocked_since: unlockedSince,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  it('renders unit and navigates on click', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UnlockedUnitsWidget id="uw" title="Unlocked" />
      </MemoryRouter>
    );

    expect(screen.getByText(/1 unit unlocked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unit 205/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /unit 205/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/units/unit-1');
  });

  it('calls refetch when refresh is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UnlockedUnitsWidget id="uw" title="Unlocked" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows error state from hook', () => {
    mockUseUnitsData.mockReturnValue({
      data: null,
      loading: false,
      error: 'Units unavailable',
      refetch: mockRefetch,
    });

    render(
      <MemoryRouter>
        <UnlockedUnitsWidget id="uw" title="Unlocked" />
      </MemoryRouter>
    );

    expect(screen.getByText('Units unavailable')).toBeInTheDocument();
  });
});
