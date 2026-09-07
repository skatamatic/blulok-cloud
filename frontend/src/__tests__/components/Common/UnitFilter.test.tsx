/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnitFilter } from '@/components/Common/UnitFilter';

const mockGetUnits = jest.fn();
const mockGetUnit = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: (...args: unknown[]) => mockGetUnits(...args),
    getUnit: (...args: unknown[]) => mockGetUnit(...args),
  },
}));

describe('UnitFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnit.mockResolvedValue({
      unit: { id: 'unit-99', unit_number: '205', unit_type: 'standard', status: 'available' },
    });
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

    render(<UnitFilter value="" onChange={onChange} placeholder="Search units..." facilityId="fac-7" />);

    await waitFor(() => {
      expect(mockGetUnits).toHaveBeenCalledWith(
        expect.objectContaining({ facility_id: 'fac-7' }),
      );
    });

    const input = screen.getByPlaceholderText('Search units...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('101')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /101/i }));
    expect(onChange).toHaveBeenCalledWith('unit-1');
  });

  it('resolves preselected unit id to unit number via getUnit', async () => {
    const onDisplayLabelChange = jest.fn();

    render(
      <UnitFilter
        value="unit-99"
        onChange={jest.fn()}
        onDisplayLabelChange={onDisplayLabelChange}
      />,
    );

    await waitFor(() => {
      expect(mockGetUnit).toHaveBeenCalledWith('unit-99');
    });

    await waitFor(() => {
      expect(onDisplayLabelChange).toHaveBeenCalledWith('205');
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('205')).toBeInTheDocument();
    });
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

  it('clears the selection via All units when allowEmpty is set', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(
      <UnitFilter
        value="unit-1"
        onChange={onChange}
        allowEmpty
        emptyLabel="All units"
        facilityId="fac-7"
      />,
    );

    await waitFor(() => {
      expect(mockGetUnits).toHaveBeenCalled();
    });

    await user.click(screen.getByPlaceholderText('Search units...'));
    await user.click(await screen.findByRole('button', { name: /all units/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
