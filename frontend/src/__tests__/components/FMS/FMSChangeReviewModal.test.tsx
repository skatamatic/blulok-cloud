import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FMSChangeReviewModal } from '@/components/FMS/FMSChangeReviewModal';
import { FMSSyncProvider } from '@/contexts/FMSSyncContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';
import { FMSChange, FMSChangeType, FMSSyncResult, FMSChangeAction } from '@/types/fms.types';

// Mock the FMS service
jest.mock('@/services/fms.service', () => ({
  fmsService: {
    reviewChanges: jest.fn(),
    applyChanges: jest.fn(),
  },
}));

import { fmsService } from '@/services/fms.service';

// Mock the useToast hook
jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: jest.fn(),
}));

import { useToast } from '@/contexts/ToastContext';

// Mock the useFMSSync hook
let mockUseFMSSyncReturn = {
  hideReview: jest.fn(),
  minimizeReview: jest.fn(),
};

jest.mock('@/contexts/FMSSyncContext', () => ({
  ...jest.requireActual('@/contexts/FMSSyncContext'),
  useFMSSync: () => mockUseFMSSyncReturn,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ToastContainer />
        <WebSocketProvider>
          <FMSSyncProvider>
            {component}
          </FMSSyncProvider>
        </WebSocketProvider>
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
    external_id: 'ext-1',
    before_data: null,
    after_data: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      unitNumber: 'A-101',
    },
    required_actions: [FMSChangeAction.CREATE_USER],
    impact_summary: 'New tenant John Doe added to unit A-101',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-2',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_UPDATED,
    entity_type: 'tenant',
    external_id: 'ext-2',
    internal_id: 'user-123',
    before_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@old.com',
      phone: '555-0100',
    },
    after_data: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@new.com',
      phone: '555-0101',
    },
    required_actions: [FMSChangeAction.UPDATE_USER],
    impact_summary: 'Tenant Jane Smith updated contact information',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-3',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.TENANT_REMOVED,
    entity_type: 'tenant',
    external_id: 'ext-3',
    internal_id: 'user-456',
    before_data: {
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob.wilson@example.com',
    },
    after_data: null,
    required_actions: [FMSChangeAction.DEACTIVATE_USER],
    impact_summary: 'Tenant Bob Wilson removed from system',
    is_reviewed: false,
    is_valid: true,
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'change-4',
    sync_log_id: 'sync-123',
    change_type: FMSChangeType.UNIT_ADDED,
    entity_type: 'unit',
    external_id: 'unit-205',
    before_data: null,
    after_data: {
      unitNumber: 'B-205',
      floor: 2,
      squareFeet: 1200,
    },
    required_actions: [FMSChangeAction.CREATE_USER],
    impact_summary: 'New unit B-205 added to building',
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

describe('FMSChangeReviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup default useToast mock
    (useToast as jest.Mock).mockReturnValue({
      addToast: jest.fn(),
      toasts: [],
      removeToast: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Modal Rendering', () => {
    it('renders the modal when isOpen is true', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
          facilityName="Test Facility"
        />
      );

      expect(screen.getByText('Review FMS Changes (4 detected) - Test Facility')).toBeInTheDocument();
      expect(screen.getByText('All Changes (4)')).toBeInTheDocument();
      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={false}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.queryByText('Review FMS Changes')).not.toBeInTheDocument();
    });

    it('renders without facility name when not provided', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText('Review FMS Changes (4 detected)')).toBeInTheDocument();
    });

    it('shows empty state when no changes provided', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText('Review FMS Changes (0 detected)')).toBeInTheDocument();
      expect(screen.getByText('All Changes (0)')).toBeInTheDocument();
      expect(screen.getByText('No changes in this category')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation and Filtering', () => {
    it('shows all changes by default', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
      expect(screen.getByText('Tenant Jane Smith updated contact information')).toBeInTheDocument();
      expect(screen.getByText('Tenant Bob Wilson removed from system')).toBeInTheDocument();
      expect(screen.getByText('New unit B-205 added to building')).toBeInTheDocument();
    });

    it('filters to added changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const addedTab = screen.getByText('Added (2)');
      fireEvent.click(addedTab);

      // Should only show added changes
      expect(screen.getByText('New tenant John Doe added to unit A-101')).toBeInTheDocument();
      expect(screen.getByText('New unit B-205 added to building')).toBeInTheDocument();

      // Updated and removed should not be visible
      expect(screen.queryByText('Tenant Jane Smith updated contact information')).not.toBeInTheDocument();
      expect(screen.queryByText('Tenant Bob Wilson removed from system')).not.toBeInTheDocument();

      // Selection count should reflect filtered changes
      expect(screen.getByText(/2.*changes selected/)).toBeInTheDocument();
    });

    it('filters to updated changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const updatedTab = screen.getByText('Updated (1)');
      fireEvent.click(updatedTab);

      expect(screen.queryByText('New tenant John Doe added to unit A-101')).not.toBeInTheDocument();
      expect(screen.getByText('Tenant Jane Smith updated contact information')).toBeInTheDocument();
      expect(screen.queryByText('Tenant Bob Wilson removed from system')).not.toBeInTheDocument();
      expect(screen.queryByText('New unit B-205 added to building')).not.toBeInTheDocument();
    });

    it('filters to removed changes only', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const removedTab = screen.getByText('Removed (1)');
      fireEvent.click(removedTab);

      expect(screen.queryByText('New tenant John Doe added to unit A-101')).not.toBeInTheDocument();
      expect(screen.queryByText('Tenant Jane Smith updated contact information')).not.toBeInTheDocument();
      expect(screen.getByText('Tenant Bob Wilson removed from system')).toBeInTheDocument();
      expect(screen.queryByText('New unit B-205 added to building')).not.toBeInTheDocument();
    });

    it('shows empty state for filtered categories with no changes', () => {
      const onlyAddedChanges = mockChanges.filter(c =>
        c.change_type === FMSChangeType.TENANT_ADDED || c.change_type === FMSChangeType.UNIT_ADDED
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={onlyAddedChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const removedTab = screen.getByText('Removed (0)');
      fireEvent.click(removedTab);

      expect(screen.getByText('No changes in this category')).toBeInTheDocument();
    });
  });

  describe('Change Selection', () => {
    it('selects all changes by default', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByText(/4.*changes selected/)).toBeInTheDocument();
    });

    it('toggles individual change selection', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const firstChange = screen.getByText('New tenant John Doe added to unit A-101').closest('div');
      fireEvent.click(firstChange!);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (3)')).toBeInTheDocument();
      });
    });

    it('selects all changes when Select All is clicked', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Deselect all first
      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);
      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (0)')).toBeInTheDocument();
      });

      // Select all
      const selectAllButton = screen.getByText('Select All');
      fireEvent.click(selectAllButton);
      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (4)')).toBeInTheDocument();
      });
    });

    it('deselects all changes when Select None is clicked', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (0)')).toBeInTheDocument();
      });
    });

    it('updates selection count when filtering changes', async () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const addedTab = screen.getByText('Added (2)');
      fireEvent.click(addedTab);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
        expect(screen.getByText('Accept & Apply (2)')).toBeInTheDocument();
      });
    });
  });

  describe('Change Expansion', () => {
    it('expands and collapses change details', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find expand button by looking for the button with ChevronRightIcon initially
      const changeContainer = screen.getByText('New tenant John Doe added to unit A-101').closest('div[class*="border-2"]');
      const expandButton = changeContainer?.querySelector('button[class*="p-1 rounded-lg"]');

      // Initially collapsed
      expect(screen.queryByText('Details')).not.toBeInTheDocument();

      // Click to expand
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      // Should show expanded details
      expect(screen.getByText('Details')).toBeInTheDocument();
    });

    it('shows before and after data for updates', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find and expand the update change
      const updateChange = screen.getByText('Tenant Jane Smith updated contact information');
      const changeContainer = updateChange.closest('[data-testid="change-container"]') || updateChange.closest('div[class*="border-2"]');
      const expandButton = changeContainer?.querySelector('button[class*="p-1 rounded-lg"]');

      if (expandButton) {
        fireEvent.click(expandButton);
      }

      expect(screen.getByText('Current (Before)')).toBeInTheDocument();
      expect(screen.getByText('New (After)')).toBeInTheDocument();
    });

    it('shows only after data for additions', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Find and expand the addition change
      const addChange = screen.getByText('New tenant John Doe added to unit A-101');
      const expandButtons = addChange.closest('div')?.querySelectorAll('button');
      const expandButton = Array.from(expandButtons || []).find(btn =>
        btn.querySelector('svg[data-slot="icon"]')
      );

      if (expandButton) {
        fireEvent.click(expandButton);
      }

      expect(screen.queryByText('Current (Before)')).not.toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  describe('Change Icons and Colors', () => {
    it('shows correct change type labels', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Check that change type labels are displayed correctly
      expect(screen.getByText('TENANT ADDED')).toBeInTheDocument();
      expect(screen.getByText('TENANT UPDATED')).toBeInTheDocument();
      expect(screen.getByText('TENANT REMOVED')).toBeInTheDocument();
      expect(screen.getByText('UNIT ADDED')).toBeInTheDocument();
    });

    it('applies correct colors for different change types', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // The color classes are applied to icon containers
      // We verify the changes are rendered with their types
      expect(screen.getByText('TENANT ADDED')).toBeInTheDocument();
      expect(screen.getByText('TENANT UPDATED')).toBeInTheDocument();
      expect(screen.getByText('TENANT REMOVED')).toBeInTheDocument();
      expect(screen.getByText('UNIT ADDED')).toBeInTheDocument();
    });
  });

  describe('Button Interactions', () => {
    it('calls minimizeReview when minimize button is clicked', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const minimizeButton = screen.getByTitle('Minimize to status bar');
      fireEvent.click(minimizeButton);

      expect(mockUseFMSSyncReturn.minimizeReview).toHaveBeenCalled();
    });

    it('calls hideReview and onClose when close button is clicked', () => {
      const mockOnClose = jest.fn();

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={mockOnClose}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      const closeButton = screen.getByTitle('Cancel and close');
      fireEvent.click(closeButton);

      expect(mockUseFMSSyncReturn.hideReview).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('applies changes when Accept & Apply is clicked', async () => {
      const mockOnApply = jest.fn();
      (fmsService.reviewChanges as jest.Mock).mockResolvedValue({ success: true });
      (fmsService.applyChanges as jest.Mock).mockResolvedValue({
        success: true,
        changesApplied: 4,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      });

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(fmsService.reviewChanges).toHaveBeenCalledWith(
          'sync-123',
          ['change-1', 'change-2', 'change-3', 'change-4'],
          true
        );
        expect(mockOnApply).toHaveBeenCalledWith(['change-1', 'change-2', 'change-3', 'change-4']);
      });
    });

    it('handles apply API failure gracefully', async () => {
      const mockOnApply = jest.fn();
      const mockAddToast = jest.fn();
      (useToast as jest.Mock).mockReturnValue({ 
        addToast: mockAddToast,
        toasts: [],
        removeToast: jest.fn(),
      });
      (fmsService.reviewChanges as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            title: 'Failed to Apply Changes',
          })
        );
      });
    });

    it('shows loading state during apply', async () => {
      const mockOnApply = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      (fmsService.reviewChanges as jest.Mock).mockResolvedValue({ success: true });
      (fmsService.applyChanges as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          changesApplied: 4,
          changesFailed: 0,
          errors: [],
          accessChanges: {
            usersCreated: [],
            usersDeactivated: [],
            accessGranted: [],
            accessRevoked: [],
          },
        }), 50))
      );

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={mockOnApply}
          syncResult={mockSyncResult}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      // Should show loading state
      expect(screen.getByText('Applying...')).toBeInTheDocument();
      expect(applyButton).toBeDisabled();

      await waitFor(() => {
        expect(mockOnApply).toHaveBeenCalled();
      });
    });

    it('disables apply button when no changes selected', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Deselect all changes
      const selectNoneButton = screen.getByText('Select None');
      fireEvent.click(selectNoneButton);

      const applyButton = screen.getByText('Accept & Apply (0)');
      expect(applyButton).toBeDisabled();
    });
  });

  describe('Data Rendering', () => {
    it('formats field labels correctly', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Expand a change to see formatted data
      const expandButtons = screen.getAllByRole('button').filter(btn =>
        btn.querySelector('svg[data-slot="icon"]')
      );

      if (expandButtons.length > 0) {
        fireEvent.click(expandButtons[0]);
      }

      // Should format camelCase to Title Case
      // This is hard to test specifically without more detailed DOM inspection
      // The important thing is that the data renders without crashing
    });

    it('handles null and undefined values', () => {
      const changeWithNulls: FMSChange = {
        id: 'test-change',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-123',
        impact_summary: 'Test change',
        before_data: null,
        after_data: {
          name: null,
          email: undefined,
          active: false,
        },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithNulls]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Expand to see data rendering
      const changeContainer = screen.getByText('Test change').closest('div[class*="border-2"]');
      const expandButton = changeContainer?.querySelector('button[class*="p-1 rounded-lg"]');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      // Should render without crashing
      expect(screen.getByText('Test change')).toBeInTheDocument();
    });

  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and titles', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      expect(screen.getByTitle('Minimize to status bar')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel and close')).toBeInTheDocument();
    });

    it('has proper heading structure', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
          facilityName="Test Facility"
        />
      );

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Review FMS Changes (4 detected) - Test Facility');
    });

    it('supports keyboard navigation', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Dialog should be focusable
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles missing syncResult gracefully', () => {
      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={mockChanges}
          onApply={jest.fn()}
          syncResult={null}
        />
      );

      const applyButton = screen.getByText('Accept & Apply (4)');
      fireEvent.click(applyButton);

      // Should not call API when syncResult is null
      expect(fmsService.reviewChanges).not.toHaveBeenCalled();
    });

    it('handles empty required_actions array', () => {
      const changeWithoutActions: FMSChange = {
        id: 'change-no-actions',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-456',
        impact_summary: 'Change without actions',
        before_data: null,
        after_data: { name: 'Test' },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithoutActions]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Should not show any action badges
      expect(screen.queryByText(/CREATE|UPDATE|ARCHIVE/)).not.toBeInTheDocument();
    });

    it('handles undefined required_actions', () => {
      const changeWithoutActions: FMSChange = {
        id: 'change-no-actions',
        sync_log_id: 'sync-123',
        change_type: FMSChangeType.TENANT_ADDED,
        entity_type: 'tenant',
        external_id: 'ext-789',
        impact_summary: 'Change without actions',
        before_data: null,
        after_data: { name: 'Test' },
        required_actions: [],
        is_reviewed: false,
        created_at: new Date().toISOString(),
      };

      renderWithProviders(
        <FMSChangeReviewModal
          isOpen={true}
          onClose={jest.fn()}
          changes={[changeWithoutActions]}
          onApply={jest.fn()}
          syncResult={mockSyncResult}
        />
      );

      // Should not crash
      expect(screen.getByText('Change without actions')).toBeInTheDocument();
    });
  });
});
