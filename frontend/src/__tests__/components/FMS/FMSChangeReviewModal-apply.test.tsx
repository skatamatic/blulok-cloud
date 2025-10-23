/**
 * FMS Change Review Modal - Apply Changes Tests
 * 
 * Tests for the "Accept & Apply" functionality including:
 * - Success cases with toast notifications
 * - Error handling and modal behavior
 * - Partial failure scenarios
 * - Toast summary generation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import { FMSSyncProvider } from '@/contexts/FMSSyncContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { FMSChange, FMSChangeType, FMSSyncResult, FMSChangeApplicationResult, FMSChangeAction } from '@/types/fms.types';

// Mock the FMS service
jest.mock('@/services/fms.service', () => ({
  fmsService: {
    reviewChanges: jest.fn(),
    applyChanges: jest.fn(),
  },
}));

// Mock the WebSocket context
jest.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-id'),
    unsubscribe: jest.fn(),
    isConnected: false,
  }),
}));

import { fmsService } from '@/services/fms.service';
import ToastContainer from '@/components/Toast/ToastContainer';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ToastContainer />
        <FMSSyncProvider>
          {ui}
        </FMSSyncProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

const mockChanges: FMSChange[] = [
  {
    id: 'change-1',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_ADDED,
    entity_type: 'tenant',
    external_id: 'EXT-001',
    impact_summary: 'New tenant John Doe added to unit A-101',
    before_data: null,
    after_data: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      unitNumber: 'A-101',
    },
    required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ADD_ACCESS],
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-2',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_UPDATED,
    entity_type: 'tenant',
    external_id: 'EXT-002',
    internal_id: 'user-123',
    impact_summary: 'Tenant Jane Smith updated contact information',
    before_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@old.com',
    },
    after_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@new.com',
    },
    required_actions: [FMSChangeAction.UPDATE_USER],
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-3',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.UNIT_ADDED,
    entity_type: 'unit',
    external_id: 'UNIT-205',
    impact_summary: 'New unit B-205 added',
    before_data: null,
    after_data: {
      unitNumber: 'B-205',
      floor: 2,
    },
    required_actions: [FMSChangeAction.CREATE_USER],
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
];

const mockSyncResult: FMSSyncResult = {
  success: true,
  syncLogId: 'sync-123',
  changesDetected: mockChanges,
  summary: {
    tenantsAdded: 1,
    tenantsRemoved: 0,
    tenantsUpdated: 1,
    unitsAdded: 1,
    unitsRemoved: 0,
    unitsUpdated: 0,
    errors: [],
    warnings: [],
  },
  requiresReview: true,
};

describe('FMSChangeReviewModal - Apply Changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Apply', () => {
    it('should apply changes, show success toast, and close modal', async () => {
      const mockOnClose = jest.fn();
      const mockOnApply = jest.fn();

      const successResult: FMSChangeApplicationResult = {
        success: true,
        changesApplied: 3,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: ['user-1'],
          usersDeactivated: [],
          accessGranted: [{ userId: 'user-1', unitId: 'unit-1' }],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(successResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
          facilityName="Test Facility"
        />
      );

      const applyButton = screen.getByText(/Accept & Apply \(3\)/);
      fireEvent.click(applyButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Applying...')).toBeInTheDocument();
      });

      // Should call review and apply APIs
      await waitFor(() => {
        expect(fmsService.reviewChanges).toHaveBeenCalledWith(
          'sync-123',
          ['change-1', 'change-2', 'change-3'],
          true
        );
        expect(fmsService.applyChanges).toHaveBeenCalledWith(
          'sync-123',
          ['change-1', 'change-2', 'change-3']
        );
      });

      // Should close modal after success
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });

      // Should call onApply callback
      expect(mockOnApply).toHaveBeenCalledWith(['change-1', 'change-2', 'change-3']);

      // Should show success toast (check for toast in DOM)
      await waitFor(() => {
        expect(screen.getByText('Changes Applied Successfully')).toBeInTheDocument();
      });
    });

    it('should generate correct summary message with multiple access changes', async () => {
      const successResult: FMSChangeApplicationResult = {
        success: true,
        changesApplied: 5,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: ['user-1', 'user-2'],
          usersDeactivated: ['user-3'],
          accessGranted: [
            { userId: 'user-1', unitId: 'unit-1' },
            { userId: 'user-2', unitId: 'unit-2' },
            { userId: 'user-2', unitId: 'unit-3' },
          ],
          accessRevoked: [{ userId: 'user-3', unitId: 'unit-1' }],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(successResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      // Should show detailed summary in toast
      await waitFor(() => {
        expect(screen.getByText('Changes Applied Successfully')).toBeInTheDocument();
        // Check for the detailed summary
        const toastMessage = screen.getByText(/2 users created/);
        expect(toastMessage).toBeInTheDocument();
        expect(toastMessage.textContent).toContain('1 user deactivated');
        expect(toastMessage.textContent).toContain('3 unit access granted');
        expect(toastMessage.textContent).toContain('1 unit access revoked');
      });
    });

    it('should handle singular/plural correctly in summary', async () => {
      const successResult: FMSChangeApplicationResult = {
        success: true,
        changesApplied: 1,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: ['user-1'],
          usersDeactivated: [],
          accessGranted: [{ userId: 'user-1', unitId: 'unit-1' }],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(successResult);

      const singleChange = [mockChanges[0]];

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={singleChange}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: singleChange }}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply \(1\)/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        const toastMessage = screen.getByText(/1 user created/);
        expect(toastMessage.textContent).not.toContain('users created'); // Should be singular
        expect(toastMessage.textContent).toContain('1 unit access granted');
        expect(toastMessage.textContent).not.toContain('unit accesses'); // Grammar check
      });
    });
  });

  describe('Partial Failure', () => {
    it('should show error toast and keep modal open when some changes fail', async () => {
      const mockOnClose = jest.fn();

      const partialFailureResult: FMSChangeApplicationResult = {
        success: false,
        changesApplied: 2,
        changesFailed: 1,
        errors: ['Failed to apply tenant_added for EXT-001: Email already exists'],
        accessChanges: {
          usersCreated: ['user-2'],
          usersDeactivated: [],
          accessGranted: [{ userId: 'user-2', unitId: 'unit-2' }],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(partialFailureResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      // Should show error toast
      await waitFor(() => {
        expect(screen.getByText('Some Changes Failed')).toBeInTheDocument();
        expect(screen.getByText(/Email already exists/)).toBeInTheDocument();
      });

      // Modal should NOT close
      expect(mockOnClose).not.toHaveBeenCalled();

      // Modal should still be visible
      expect(screen.getByText(/Review FMS Changes/)).toBeInTheDocument();
    });

    it('should show generic error when no specific error message provided', async () => {
      const partialFailureResult: FMSChangeApplicationResult = {
        success: false,
        changesApplied: 1,
        changesFailed: 2,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(partialFailureResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText('Some Changes Failed')).toBeInTheDocument();
        expect(screen.getByText(/2 changes failed to apply/)).toBeInTheDocument();
      });
    });
  });

  describe('API Errors', () => {
    it('should show error toast and keep modal open on reviewChanges API error', async () => {
      const mockOnClose = jest.fn();

      (fmsService.reviewChanges as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to Apply Changes')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      // Modal should stay open
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should show error toast and keep modal open on applyChanges API error', async () => {
      const mockOnClose = jest.fn();

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to Apply Changes')).toBeInTheDocument();
        expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle unknown error gracefully', async () => {
      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockRejectedValue('String error'); // Non-Error object

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to Apply Changes')).toBeInTheDocument();
        expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
      });
    });
  });

  describe('Rejection Flow', () => {
    it('should close modal and show info toast when changes are rejected', async () => {
      const mockOnClose = jest.fn();

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Close the modal (which triggers rejection in the current implementation via the X button)
      const closeButton = screen.getByTitle('Cancel and close');
      fireEvent.click(closeButton);

      // Modal should close immediately
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Selected Changes', () => {
    it('should only apply selected changes, not all changes', async () => {
      const mockOnApply = jest.fn();

      const successResult: FMSChangeApplicationResult = {
        success: true,
        changesApplied: 2,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(successResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      // Deselect one change
      const firstChange = screen.getByText('New tenant John Doe added to unit A-101').closest('div[class*="border-2"]');
      if (firstChange) {
        fireEvent.click(firstChange);
      }

      const applyButton = screen.getByText(/Accept & Apply \(2\)/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(fmsService.applyChanges).toHaveBeenCalledWith(
          'sync-123',
          expect.arrayContaining(['change-2', 'change-3'])
        );
        expect(fmsService.applyChanges).toHaveBeenCalledWith(
          'sync-123',
          expect.not.arrayContaining(['change-1'])
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('should not call API when syncResult is null', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={null}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      // Should not make API calls
      expect(fmsService.reviewChanges).not.toHaveBeenCalled();
      expect(fmsService.applyChanges).not.toHaveBeenCalled();
    });

    it('should show fallback message when no access changes details', async () => {
      const successResult: FMSChangeApplicationResult = {
        success: true,
        changesApplied: 1,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      };

      (fmsService.reviewChanges as jest.Mock).mockResolvedValue(undefined);
      (fmsService.applyChanges as jest.Mock).mockResolvedValue(successResult);

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[mockChanges[0]]}
          onApply={jest.fn()}
          syncResult={{ ...mockSyncResult, changesDetected: [mockChanges[0]] }}
        />
      );

      const applyButton = screen.getByText(/Accept & Apply/);
      fireEvent.click(applyButton);

      await waitFor(() => {
        // The summary should show "Applied 1 of 1 change" when changesApplied > 0
        expect(screen.getByText(/Applied 1 of 1 change/)).toBeInTheDocument();
      });
    });
  });
});

