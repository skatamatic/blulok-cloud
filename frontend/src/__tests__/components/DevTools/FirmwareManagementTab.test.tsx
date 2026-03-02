/**
 * FirmwareManagementTab Component Tests
 *
 * Covers: loading skeleton, catalog display, target type badges,
 * upload form flow, delete confirmation, catalog filtering, and
 * error handling.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirmwareManagementTab from '@/components/DevTools/FirmwareManagementTab';
import { apiService } from '@/services/api.service';

// ─── Mocks ────────────────────────────────────────────────────────────────

jest.mock('@/services/api.service');
const mockApi = apiService as jest.Mocked<typeof apiService>;

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mkFirmware = (overrides: Partial<any> = {}) => ({
  id: 'fw-1',
  version: '2.0.0',
  target_type: 'gateway',
  filename: 'gateway-v2.bin',
  sha256_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
  size_bytes: 524288,
  description: 'Gateway update',
  release_notes: 'Bug fixes',
  compatible_models: ['BLK-100'],
  minimum_version: '1.0.0',
  is_active: true,
  uploaded_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function setupMocks(firmware: any[] = [mkFirmware()]) {
  mockApi.listFirmware.mockResolvedValue({ data: firmware });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('FirmwareManagementTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.confirm for delete tests
    window.confirm = jest.fn(() => true);
  });

  // ── Loading ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows skeleton loader while fetching', () => {
      setupMocks();
      render(<FirmwareManagementTab />);
      // Skeleton elements are animated pulse divs, not text content
      expect(screen.queryByText('v2.0.0')).not.toBeInTheDocument();
    });

    it('shows firmware catalog after loading', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      });
    });
  });

  // ── Catalog display ──────────────────────────────────────────────────

  describe('catalog display', () => {
    it('displays firmware with all fields', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
        expect(screen.getByText('gateway-v2.bin')).toBeInTheDocument();
        expect(screen.getByText('512.0 KB')).toBeInTheDocument();
        expect(screen.getByText('BLK-100')).toBeInTheDocument();
      });
    });

    it('shows target type badge with correct label', async () => {
      setupMocks([
        mkFirmware({ id: 'fw-1', target_type: 'gateway' }),
        mkFirmware({ id: 'fw-2', target_type: 'lock', version: '1.0.0' }),
        mkFirmware({ id: 'fw-3', target_type: 'friend_node', version: '0.5.0' }),
      ]);
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        // Each target type appears in filter bar + badge, so use getAllByText
        expect(screen.getAllByText('Gateway').length).toBeGreaterThanOrEqual(2); // filter + badge
        expect(screen.getAllByText('Lock').length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('Friend Node').length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows empty state when no firmware exists', async () => {
      setupMocks([]);
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText(/No firmware uploaded yet/i)).toBeInTheDocument();
      });
    });

    it('shows SHA-256 hash truncated with click-to-copy', async () => {
      Object.assign(navigator, {
        clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
      setupMocks();
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText('abc123def456...')).toBeInTheDocument();
      });
    });
  });

  // ── Catalog filtering ────────────────────────────────────────────────

  describe('catalog filtering', () => {
    it('filters by target type when filter button is clicked', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText('Firmware Catalog')).toBeInTheDocument();
      });

      // The filter bar has All, Gateway, Lock, Friend Node buttons
      // All is the first button in the filter group
      jest.clearAllMocks();
      setupMocks([mkFirmware({ target_type: 'lock' })]);

      // Find the filter button group — the "Lock" button in the filter bar
      // (distinct from the upload form button)
      const filterButtons = screen.getAllByText('Lock');
      fireEvent.click(filterButtons[0]); // first one is the filter

      await waitFor(() => {
        expect(mockApi.listFirmware).toHaveBeenCalledWith('lock');
      });
    });

    it('shows all firmware when "All" filter is selected', async () => {
      setupMocks([mkFirmware({ target_type: 'lock', version: '1.0.0' })]);
      render(<FirmwareManagementTab />);
      await waitFor(() => {
        expect(screen.getByText('Firmware Catalog')).toBeInTheDocument();
      });

      // Click Lock filter first
      jest.clearAllMocks();
      setupMocks([mkFirmware({ target_type: 'lock' })]);
      const lockButtons = screen.getAllByText('Lock');
      fireEvent.click(lockButtons[0]);

      await waitFor(() => {
        expect(mockApi.listFirmware).toHaveBeenCalledWith('lock');
      });

      // Then click All
      jest.clearAllMocks();
      setupMocks([mkFirmware(), mkFirmware({ id: 'fw-2', target_type: 'lock', version: '1.0.0' })]);
      fireEvent.click(screen.getByText('All'));

      await waitFor(() => {
        expect(mockApi.listFirmware).toHaveBeenCalledWith(undefined);
      });
    });
  });

  // ── Upload form ──────────────────────────────────────────────────────

  describe('upload form', () => {
    it('shows upload drop zone initially', () => {
      setupMocks();
      render(<FirmwareManagementTab />);
      expect(screen.getByText(/Drag and drop a firmware file/i)).toBeInTheDocument();
    });

    it('shows upload form after file selection', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['firmware-binary-data'], 'test.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(screen.getByText('test.bin')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. 2.1.0')).toBeInTheDocument();
    });

    it('accepts non-bin file extensions for upload metadata entry', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['data'], 'malware.exe', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(screen.getByText('malware.exe')).toBeInTheDocument();
      expect(mockAddToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });

    it('submits upload with target_type and version', async () => {
      setupMocks();
      mockApi.uploadFirmware.mockResolvedValue({ data: mkFirmware() });
      render(<FirmwareManagementTab />);

      // Select file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'gateway.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      // Fill version
      fireEvent.change(screen.getByPlaceholderText('e.g. 2.1.0'), { target: { value: '3.0.0' } });

      // Click the upload button (role=button with "Upload Firmware" text)
      const uploadButtons = screen.getAllByText('Upload Firmware');
      const uploadBtn = uploadButtons.find(el => el.tagName === 'BUTTON')!;
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(mockApi.uploadFirmware).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({ version: '3.0.0', target_type: 'gateway' }),
        );
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'success' }),
        );
      });
    });

    it('allows changing target type before upload', async () => {
      setupMocks();
      mockApi.uploadFirmware.mockResolvedValue({ data: mkFirmware({ target_type: 'lock' }) });
      render(<FirmwareManagementTab />);

      await waitFor(() => {
        expect(screen.getByText('Firmware Catalog')).toBeInTheDocument();
      });

      // Select file
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'lock.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      // The upload form target type selector has Lock buttons.
      // The upload section is the first card. Find by label context.
      expect(screen.getByText('Target Device *')).toBeInTheDocument();

      // Get all Lock buttons, pick the one near the upload form (inside the Target Device section)
      const lockButtons = screen.getAllByText('Lock');
      // The upload form target type button is the first Lock since catalog filter loads below
      fireEvent.click(lockButtons[0]);

      fireEvent.change(screen.getByPlaceholderText('e.g. 2.1.0'), { target: { value: '1.0.0' } });
      const uploadButtons = screen.getAllByText('Upload Firmware');
      const uploadBtn = uploadButtons.find(el => el.tagName === 'BUTTON')!;
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(mockApi.uploadFirmware).toHaveBeenCalledWith(
          expect.any(File),
          expect.objectContaining({ target_type: 'lock' }),
        );
      });
    });

    it('disables upload button when version is empty', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'test.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      const uploadButtons = screen.getAllByText('Upload Firmware');
      const uploadBtn = uploadButtons.find(el => el.tagName === 'BUTTON')!;
      expect(uploadBtn).toBeDisabled();
    });

    it('shows error toast on upload failure', async () => {
      setupMocks();
      mockApi.uploadFirmware.mockRejectedValue({
        response: { data: { message: 'Version already exists' } },
      });
      render(<FirmwareManagementTab />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'test.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      fireEvent.change(screen.getByPlaceholderText('e.g. 2.1.0'), { target: { value: '2.0.0' } });
      const uploadButtons = screen.getAllByText('Upload Firmware');
      const uploadBtn = uploadButtons.find(el => el.tagName === 'BUTTON')!;
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error', title: 'Version already exists' }),
        );
      });
    });

    it('resets form when Cancel is clicked', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['binary'], 'test.bin', { type: 'application/octet-stream' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(screen.getByText('test.bin')).toBeInTheDocument();

      // Click the Cancel button in the upload form
      const cancelButtons = screen.getAllByText('Cancel');
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      // Should return to drag-drop zone
      expect(screen.getByText(/Drag and drop a firmware file/i)).toBeInTheDocument();
    });
  });

  // ── Delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('calls deleteFirmware after confirmation', async () => {
      setupMocks();
      mockApi.deleteFirmware.mockResolvedValue({ success: true });
      render(<FirmwareManagementTab />);

      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      });

      // Find and click the delete button (trash icon button)
      const deleteBtn = screen.getByTitle('Deactivate');
      fireEvent.click(deleteBtn);

      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => {
        expect(mockApi.deleteFirmware).toHaveBeenCalledWith('fw-1');
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'success', title: expect.stringContaining('deactivated') }),
        );
      });
    });

    it('does not delete when confirmation is cancelled', async () => {
      (window.confirm as jest.Mock).mockReturnValue(false);
      setupMocks();
      render(<FirmwareManagementTab />);

      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Deactivate'));
      expect(mockApi.deleteFirmware).not.toHaveBeenCalled();
    });
  });

  // ── Details expansion ────────────────────────────────────────────────

  describe('details expansion', () => {
    it('expands firmware details when info button is clicked', async () => {
      setupMocks();
      render(<FirmwareManagementTab />);

      await waitFor(() => {
        expect(screen.getByText('v2.0.0')).toBeInTheDocument();
      });

      // Click the details button
      fireEvent.click(screen.getByTitle('View details'));

      expect(screen.getByText('v2.0.0 Details')).toBeInTheDocument();
      expect(screen.getByText('Gateway update')).toBeInTheDocument();
      expect(screen.getByText('Bug fixes')).toBeInTheDocument();
      expect(screen.getByText('Minimum version: 1.0.0')).toBeInTheDocument();
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows error toast when list API fails', async () => {
      mockApi.listFirmware.mockRejectedValue(new Error('Network'));
      render(<FirmwareManagementTab />);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error', title: 'Failed to load firmware list' }),
        );
      });
    });
  });
});
