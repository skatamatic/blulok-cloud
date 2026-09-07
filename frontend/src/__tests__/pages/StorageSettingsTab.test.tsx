/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import StorageSettingsTab from '@/pages/settings/StorageSettingsTab';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('StorageSettingsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      success: true,
      config: {
        providerType: 'local',
        providerConfig: { basePath: './storage/firmware' },
        source: 'database',
      },
    });
  });

  it('loads config and shows database source badge', async () => {
    render(<StorageSettingsTab />);

    await waitFor(() => {
      expect(screen.getByText(/Saved in database/i)).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('/admin/storage-config');
    expect(screen.getByText('Storage Provider')).toBeInTheDocument();
    expect(screen.getByDisplayValue('./storage/firmware')).toBeInTheDocument();
  });

  it('shows environment fallback badge when source is not database', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      config: {
        providerType: 'gcs',
        providerConfig: { projectId: 'p', bucketName: 'b' },
        source: 'environment',
      },
    });

    render(<StorageSettingsTab />);

    await waitFor(() => {
      expect(screen.getByText(/Using environment fallback/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('p')).toBeInTheDocument();
    expect(screen.getByDisplayValue('b')).toBeInTheDocument();
  });

  it('switches provider and marks unsaved changes', async () => {
    render(<StorageSettingsTab />);
    await waitFor(() => screen.getByText('Storage Provider'));

    fireEvent.click(screen.getByText('Google Cloud Storage'));
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('my-gcp-project')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Google Drive'));
    expect(screen.getByPlaceholderText(/apps.googleusercontent.com/i)).toBeInTheDocument();
  });

  it('saves configuration successfully', async () => {
    mockPut.mockResolvedValue({ success: true });
    render(<StorageSettingsTab />);
    await waitFor(() => screen.getByText('Save Configuration'));

    fireEvent.change(screen.getByPlaceholderText('./storage/firmware'), {
      target: { value: './custom/fw' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save Configuration'));
    });

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/admin/storage-config', {
        providerType: 'local',
        providerConfig: { basePath: './custom/fw' },
      });
      expect(screen.getByText(/Configuration saved successfully/i)).toBeInTheDocument();
    });
  });

  it('shows save error from API failure', async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: 'Not allowed' } },
      message: 'fail',
    });
    render(<StorageSettingsTab />);
    await waitFor(() => screen.getByText('Save Configuration'));

    await act(async () => {
      fireEvent.click(screen.getByText('Save Configuration'));
    });

    await waitFor(() => {
      expect(screen.getByText('Not allowed')).toBeInTheDocument();
    });
  });

  it('runs connection test and renders step results', async () => {
    mockPost.mockResolvedValue({
      success: true,
      steps: [
        { step: 'initialize', status: 'passed', durationMs: 5 },
        { step: 'write', status: 'passed', durationMs: 8 },
      ],
    });
    render(<StorageSettingsTab />);
    await waitFor(() => screen.getByText('Test Connection'));

    await act(async () => {
      fireEvent.click(screen.getByText('Test Connection'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/admin/storage-config/test',
        expect.objectContaining({ providerType: 'local' }),
      );
      expect(screen.getByText(/All tests passed/i)).toBeInTheDocument();
      expect(screen.getByText('Initialize')).toBeInTheDocument();
      expect(screen.getByText('Write File')).toBeInTheDocument();
    });
  });

  it('shows test failure message from thrown response', async () => {
    mockPost.mockRejectedValue({
      response: {
        data: {
          success: false,
          message: 'Bucket missing',
          steps: [{ step: 'initialize', status: 'failed', detail: 'no bucket' }],
        },
      },
      message: 'Request failed',
    });
    render(<StorageSettingsTab />);
    await waitFor(() => screen.getByText('Test Connection'));

    await act(async () => {
      fireEvent.click(screen.getByText('Test Connection'));
    });

    await waitFor(() => {
      expect(screen.getByText('Bucket missing')).toBeInTheDocument();
      expect(screen.getByText(/no bucket/i)).toBeInTheDocument();
    });
  });

  it('survives load failure without crashing', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));
    render(<StorageSettingsTab />);
    await waitFor(() => {
      expect(screen.getByText('Storage Provider')).toBeInTheDocument();
    });
  });
});
