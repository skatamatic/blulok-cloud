/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { AddFacilityModal } from '@/components/Facilities/AddFacilityModal';

jest.mock('@/components/GoogleMaps/AddressAutocomplete', () => ({
  AddressAutocomplete: ({
    onAddressSelect,
  }: {
    onAddressSelect?: (addr: { formatted_address: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-address"
      onClick={() => onAddressSelect?.({ formatted_address: '123 Test Rd' })}
    >
      pick-address
    </button>
  ),
}));

jest.mock('@/components/GoogleMaps/MapCard', () => ({
  MapCard: () => <div data-testid="mock-map" />,
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    createFacility: jest.fn().mockResolvedValue({ facility: { id: 'fac-1' } }),
  },
}));

describe('AddFacilityModal', () => {
  it('shows validation errors when required fields missing', async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    render(<AddFacilityModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));
    expect(await screen.findByText(/Facility name is required/i)).toBeInTheDocument();
  });

  it('renders closed without form fields accessible', () => {
    render(
      <AddFacilityModal isOpen={false} onClose={jest.fn()} onSuccess={jest.fn()} />
    );
    expect(screen.queryByText(/Add New Facility/i)).not.toBeInTheDocument();
  });
});
