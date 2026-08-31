import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FacilityProvisioningDataTab } from '@/components/Facility/FacilityProvisioningDataTab';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    listFacilityProvisioningFiles: jest.fn(),
    prepareFacilityProvisioningUpload: jest.fn(),
    completeFacilityProvisioningUpload: jest.fn(),
    deleteFacilityProvisioningFile: jest.fn(),
    getFacilityProvisioningDownloadPath: jest.fn(
      (facilityId: string, fileId: string) =>
        `/facilities/${facilityId}/provisioning-data/${fileId}/download`,
    ),
  },
}));

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { role: 'facility_admin' } },
  }),
}));

const mockList = apiService.listFacilityProvisioningFiles as jest.Mock;
const mockPrepare = apiService.prepareFacilityProvisioningUpload as jest.Mock;
const mockComplete = apiService.completeFacilityProvisioningUpload as jest.Mock;

describe('FacilityProvisioningDataTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({
      data: {
        files: [
          {
            id: 'file-1',
            facility_id: 'fac-1',
            filename: 'site-backup.tar.gz',
            content_type: 'application/gzip',
            size_bytes: 2048,
            sha256_hash: 'abc',
            upload_source: 'dashboard',
            created_by: 'user-1',
            uploaded_at: '2026-06-01T12:00:00.000Z',
            created_at: '2026-06-01T12:00:00.000Z',
            updated_at: '2026-06-01T12:00:00.000Z',
          },
        ],
        total: 1,
      },
    });
    global.fetch = jest.fn();
  });

  it('loads and renders provisioning files', async () => {
    render(<FacilityProvisioningDataTab facilityId="fac-1" facilityName="Test Site" />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('fac-1', 20, 0);
      expect(screen.getByText('site-backup.tar.gz')).toBeInTheDocument();
      expect(screen.getByText('Stored files')).toBeInTheDocument();
    });
  });

  it('uploads a file via prepare, PUT, and complete', async () => {
    mockPrepare.mockResolvedValue({
      data: {
        upload_id: 'upload-1',
        upload_url: 'https://upload.example/direct',
        upload_headers: { 'Content-Type': 'application/octet-stream' },
        storage_path: 'facility-provisioning/fac-1/upload-1/backup.bin',
        expires_in_seconds: 3600,
        facility_id: 'fac-1',
      },
    });
    mockComplete.mockResolvedValue({ success: true, data: { file: { id: 'file-2' } } });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    render(<FacilityProvisioningDataTab facilityId="fac-1" />);

    await waitFor(() => {
      expect(screen.getByText('Upload file')).toBeInTheDocument();
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'backup.bin', { type: 'application/octet-stream' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockPrepare).toHaveBeenCalledWith('fac-1', {
        filename: 'backup.bin',
        size_bytes: file.size,
        content_type: 'application/octet-stream',
      });
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://upload.example/direct',
        expect.objectContaining({ method: 'PUT', body: file }),
      );
      expect(mockComplete).toHaveBeenCalledWith('fac-1', {
        upload_id: 'upload-1',
        filename: 'backup.bin',
        size_bytes: file.size,
        content_type: 'application/octet-stream',
      });
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Upload complete' }),
    );
  });
});
