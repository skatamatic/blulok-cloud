/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddFacilityPage from '@/pages/AddFacilityPage';
import { apiService } from '@/services/api.service';

const mockNavigate = jest.fn();
const mockOpenCreated = jest.fn();
const mockGoBack = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/hooks/useBackNavigation', () => ({
  useDetailsBackNavigation: () => ({
    goBack: mockGoBack,
    showBack: true,
    backLabel: 'Back',
  }),
}));

jest.mock('@/hooks/useOpenCreatedFacility', () => ({
  useOpenCreatedFacility: () => mockOpenCreated,
}));

jest.mock('@/components/GoogleMaps/AddressAutocomplete', () => ({
  AddressAutocomplete: ({
    value,
    onChange,
    error,
  }: {
    value: string;
    onChange: (address: string, lat?: number, lng?: number) => void;
    error?: string;
  }) => (
    <div>
      <input
        aria-label="Address"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="address-input"
      />
      <button
        type="button"
        data-testid="pick-address"
        onClick={() => onChange('123 Test Rd', 40.1, -74.2)}
      >
        pick
      </button>
      {error && <span>{error}</span>}
    </div>
  ),
}));

jest.mock('@/components/GoogleMaps/MapCard', () => ({
  MapCard: () => <div data-testid="map-card" />,
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    createFacility: jest.fn(),
  },
}));

const mockCreate = apiService.createFacility as jest.Mock;

function renderPage() {
  return render(
    <MemoryRouter>
      <AddFacilityPage />
    </MemoryRouter>
  );
}

describe('AddFacilityPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenCreated.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue({ facility: { id: 'fac-1' } });
  });

  it('shows validation errors for required fields', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));

    expect(await screen.findByText(/Facility name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Address is required/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('validates contact email format', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter facility name'), {
      target: { value: 'North Yard' },
    });
    fireEvent.click(screen.getByTestId('pick-address'));
    fireEvent.change(screen.getByPlaceholderText('contact@facility.com'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));

    expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates facility and opens it on success', async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter facility name'), {
      target: { value: 'North Yard' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter facility description'), {
      target: { value: 'Main site' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'inactive' },
    });
    fireEvent.click(screen.getByTestId('pick-address'));

    expect(screen.getByTestId('map-card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'North Yard',
          address: '123 Test Rd',
          latitude: 40.1,
          longitude: -74.2,
          status: 'inactive',
        })
      );
    });
    expect(mockOpenCreated).toHaveBeenCalledWith('fac-1');
  });

  it('shows submit error when create fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('server'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Enter facility name'), {
      target: { value: 'North Yard' },
    });
    fireEvent.click(screen.getByTestId('pick-address'));
    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));

    expect(
      await screen.findByText(/Failed to create facility. Please try again./i)
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows submit error when response lacks facility id', async () => {
    mockCreate.mockResolvedValueOnce({ facility: {} });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Enter facility name'), {
      target: { value: 'North Yard' },
    });
    fireEvent.click(screen.getByTestId('pick-address'));
    fireEvent.click(screen.getByRole('button', { name: /Create Facility/i }));

    expect(
      await screen.findByText(/Invalid response from server/i)
    ).toBeInTheDocument();
  });

  it('cancels back to facilities list', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/facilities');
  });

  it('rejects oversized branding images', async () => {
    renderPage();

    const file = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Image must be smaller than 5MB/i)).toBeInTheDocument();
  });
});
