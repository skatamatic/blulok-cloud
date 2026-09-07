/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StorageSettingsTab from '@/pages/settings/StorageSettingsTab';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ effectiveTheme: 'light', theme: 'light', setTheme: jest.fn() }),
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('StorageSettingsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      success: true,
      config: {
        providerType: 'local',
        providerConfig: { basePath: './storage/firmware' },
        source: 'environment',
      },
    });
  });

  it('loads config and shows environment fallback badge', async () => {
    render(<StorageSettingsTab />);

    expect(await screen.findByText('Storage Provider')).toBeInTheDocument();
    expect(screen.getByText(/Using environment fallback/i)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/storage-config');
    expect(screen.getByDisplayValue('./storage/firmware')).toBeInTheDocument();
  });

  it('handles load failure and still renders the form', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<StorageSettingsTab />);

    expect(await screen.findByText('Storage Provider')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('switches to GCS and Google Drive forms', async () => {
    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByText('Google Cloud Storage'));
    expect(screen.getByPlaceholderText('my-gcp-project')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('blulok-firmware')).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Google Drive'));
    expect(screen.getByPlaceholderText('xxxxx.apps.googleusercontent.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('GOCSPX-...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1AbC2dEf3GhI...')).toBeInTheDocument();
  });

  it('updates local path and marks unsaved changes', async () => {
    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    const input = screen.getByPlaceholderText('./storage/firmware');
    fireEvent.change(input, { target: { value: './custom/path' } });

    expect(screen.getByDisplayValue('./custom/path')).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
  });

  it('runs connection test and shows passed steps', async () => {
    mockPost.mockResolvedValueOnce({
      success: true,
      steps: [
        { step: 'initialize', status: 'passed', durationMs: 5 },
        { step: 'write', status: 'passed', durationMs: 10 },
        { step: 'read', status: 'passed', durationMs: 8 },
        { step: 'delete', status: 'passed', durationMs: 3 },
      ],
    });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/admin/storage-config/test', {
        providerType: 'local',
        providerConfig: { basePath: './storage/firmware' },
      });
    });

    expect(await screen.findByText(/All tests passed/i)).toBeInTheDocument();
    expect(screen.getByText('Initialize')).toBeInTheDocument();
    expect(screen.getByText('Write File')).toBeInTheDocument();
  });

  it('shows failed test steps from API error body', async () => {
    mockPost.mockRejectedValueOnce({
      message: 'boom',
      response: {
        data: {
          message: 'Write failed',
          steps: [{ step: 'write', status: 'failed', detail: 'permission denied' }],
        },
      },
    });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));

    expect(await screen.findByText('Write failed')).toBeInTheDocument();
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it('saves configuration successfully', async () => {
    mockPut.mockResolvedValueOnce({ success: true });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/admin/storage-config', {
        providerType: 'local',
        providerConfig: { basePath: './storage/firmware' },
      });
    });

    expect(await screen.findByText(/Configuration saved successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved in database/i)).toBeInTheDocument();
  });

  it('shows save error when API returns failure', async () => {
    mockPut.mockResolvedValueOnce({ success: false, message: 'Invalid bucket' });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/i }));

    expect(await screen.findByText('Invalid bucket')).toBeInTheDocument();
  });

  it('builds GCS payload including optional key fields when testing', async () => {
    mockPost.mockResolvedValueOnce({ success: true, steps: [] });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByText('Google Cloud Storage'));
    fireEvent.change(screen.getByPlaceholderText('my-gcp-project'), {
      target: { value: 'proj-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('blulok-firmware'), {
      target: { value: 'bucket-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('/path/to/service-account-key.json'), {
      target: { value: '/keys/sa.json' },
    });
    fireEvent.change(screen.getByPlaceholderText('{"type": "service_account", ...}'), {
      target: { value: '{"type":"service_account"}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/admin/storage-config/test', {
        providerType: 'gcs',
        providerConfig: {
          projectId: 'proj-1',
          bucketName: 'bucket-1',
          keyFilePath: '/keys/sa.json',
          keyFileContents: '{"type":"service_account"}',
        },
      });
    });
  });

  it('builds Google Drive payload when saving', async () => {
    mockPut.mockResolvedValueOnce({ success: true });

    render(<StorageSettingsTab />);
    await screen.findByText('Storage Provider');

    fireEvent.click(screen.getByText('Google Drive'));
    fireEvent.change(screen.getByPlaceholderText('xxxxx.apps.googleusercontent.com'), {
      target: { value: 'client-id' },
    });
    fireEvent.change(screen.getByPlaceholderText('GOCSPX-...'), {
      target: { value: 'secret' },
    });
    fireEvent.change(screen.getByPlaceholderText('1AbC2dEf3GhI...'), {
      target: { value: 'folder-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('ya29.a0...'), {
      target: { value: 'access' },
    });
    fireEvent.change(screen.getByPlaceholderText('1//0...'), {
      target: { value: 'refresh' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/i }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/admin/storage-config', {
        providerType: 'gdrive',
        providerConfig: {
          clientId: 'client-id',
          clientSecret: 'secret',
          rootFolderId: 'folder-1',
          accessToken: 'access',
          refreshToken: 'refresh',
        },
      });
    });
  });
});
