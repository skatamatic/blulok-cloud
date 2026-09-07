import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MyAccessCodes } from '@/components/AccessCodes/MyAccessCodes';

const mockGetAppAccessCodes = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAppAccessCodes: (...args: unknown[]) => mockGetAppAccessCodes(...args),
  },
}));

describe('MyAccessCodes', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders user access code entries', async () => {
    mockGetAppAccessCodes.mockResolvedValue({
      data: [
        {
          device_id: 'dev-1',
          device_name: 'Front Gate',
          device_type: 'gate',
          location_description: 'North entrance',
          code: '456123',
          valid_until: new Date(Date.now() + 3600_000).toISOString(),
        },
      ],
    });

    render(<MyAccessCodes facilityId="facility-1" />);

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledWith('facility-1');
      expect(screen.getByText('Front Gate')).toBeInTheDocument();
      expect(screen.getByText('456123')).toBeInTheDocument();
    });
  });

  it('shows retry flow on API failure', async () => {
    mockGetAppAccessCodes
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: [] });

    render(<MyAccessCodes facilityId="facility-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load access codes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(mockGetAppAccessCodes).toHaveBeenCalledTimes(2);
    });
  });
});

