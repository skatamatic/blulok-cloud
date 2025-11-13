import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareKeyModal } from '@/components/Units/ShareKeyModal';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';

jest.mock('@/services/api.service');
jest.mock('@/contexts/ToastContext', () => ({ useToast: jest.fn() }));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const addToast = jest.fn();

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockUseToast.mockReturnValue({ addToast } as any);
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ShareKeyModal', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.inviteSharedKey.mockResolvedValue({ success: true, share_id: 'share-1' } as any);
  });

  it('disables submit button when phone is empty', async () => {
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const submit = screen.getByRole('button', { name: /send invite/i });
    expect(submit).toBeDisabled();
  });

  it('validates phone before submission', async () => {
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const phoneInput = screen.getByPlaceholderText('+15551234567');
    const submit = screen.getByRole('button', { name: /send invite/i });

    // Enter invalid phone
    fireEvent.change(phoneInput, { target: { value: 'invalid' } });
    expect(submit).not.toBeDisabled();

    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(addToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'Enter a valid phone number (E.164 preferred)'
    }));
  });

  it('sends invite and shows success toast', async () => {
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const phoneInput = screen.getByPlaceholderText('+15551234567');
    fireEvent.change(phoneInput, { target: { value: '+15551230000' } });
    const submit = screen.getByRole('button', { name: /send invite/i });
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(mockApi.inviteSharedKey).toHaveBeenCalledWith({ unit_id: 'unit-1', phone: '+15551230000', access_level: 'limited' }));
    expect(addToast).toHaveBeenCalledWith({ type: 'success', title: 'Invite sent successfully' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('supports permanent access level in invite', async () => {
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const phoneInput = screen.getByPlaceholderText('+15551234567');
    fireEvent.change(phoneInput, { target: { value: '+15551230001' } });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'permanent' } });
    const submit = screen.getByRole('button', { name: /send invite/i });
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(mockApi.inviteSharedKey).toHaveBeenCalledWith({ unit_id: 'unit-1', phone: '+15551230001', access_level: 'permanent' }));
  });

  it('handles API error gracefully', async () => {
    mockApi.inviteSharedKey.mockRejectedValueOnce({ response: { data: { message: 'Failed' } } });
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const phoneInput = screen.getByPlaceholderText('+15551234567');
    fireEvent.change(phoneInput, { target: { value: '+15551230000' } });
    const submit = screen.getByRole('button', { name: /send invite/i });
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(addToast).toHaveBeenCalledWith({ type: 'error', title: 'Failed' }));
  });

  it('prefers error field from API when present', async () => {
    mockApi.inviteSharedKey.mockRejectedValueOnce({ response: { data: { error: 'Invalid phone' } } });
    renderWithProviders(<ShareKeyModal isOpen unitId="unit-1" onClose={onClose} onSuccess={onSuccess} />);
    const phoneInput = screen.getByPlaceholderText('+15551234567');
    fireEvent.change(phoneInput, { target: { value: '+15551230000' } });
    const submit = screen.getByRole('button', { name: /send invite/i });
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(addToast).toHaveBeenCalledWith({ type: 'error', title: 'Invalid phone' }));
  });
});


