/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitFilter } from '@/components/Common/UnitFilter';

const mockGetUnits = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
  },
}));

describe('UnitFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnits.mockResolvedValue({
      success: true,
      units: [
        {
          id: 'unit-1',
          unit_number: '101',
          unit_type: 'standard',
          status: 'occupied',
        },
      ],
      total: 1,
    });
  });

  it('loads units and calls onChange when a unit is selected', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<UnitFilter value="" onChange={onChange} placeholder="Search units..." />);

    await waitFor(() => {
      expect(mockGetUnits).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Search units...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('101')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /101/i }));
    expect(onChange).toHaveBeenCalledWith('unit-1');
  });

  it('shows empty state when API returns no units', async () => {
    mockGetUnits.mockResolvedValue({ success: true, units: [], total: 0 });
    const user = userEvent.setup();

    render(<UnitFilter value="" onChange={jest.fn()} />);

    await waitFor(() => {
      expect(mockGetUnits).toHaveBeenCalled();
    });

    await user.click(screen.getByPlaceholderText('Search units...'));

    await waitFor(() => {
      expect(screen.getByText(/no units available/i)).toBeInTheDocument();
    });
  });
});
