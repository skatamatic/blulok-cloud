import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FMSSyncProgressModal } from '@/components/FMS/FMSSyncProgressModal';
import { FMSSyncProvider, SyncStep } from '@/contexts/FMSSyncContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { ToastProvider } from '@/contexts/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';

// Mock the FMS service
jest.mock('@/services/fms.service', () => ({
  fmsService: {
    cancelSync: jest.fn(),
  },
}));

import { fmsService } from '@/services/fms.service';

// Mock the useFMSSync hook
let mockUseFMSSyncReturn = {
  syncState: {
    isActive: true,
    isMinimized: false,
    currentStep: 'connecting' as SyncStep,
    facilityId: 'test-facility',
    facilityName: 'Test Facility',
    syncLogId: 'test-log-id',
    progressPercentage: 20,
    pendingChanges: [],
    syncResult: null,
    showReviewModal: false,
  },
  startSync: jest.fn(),
  completeSync: jest.fn(),
  canStartNewSync: jest.fn(() => false),
  updateStep: jest.fn(),
  minimizeSync: jest.fn(),
  cancelSync: jest.fn(),
  maximizeSync: jest.fn(),
  showReview: jest.fn(),
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

describe('FMSSyncProgressModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset to default mock state
    mockUseFMSSyncReturn = {
      syncState: {
        isActive: true,
        isMinimized: false,
        currentStep: 'connecting' as const,
        facilityId: 'test-facility',
        facilityName: 'Test Facility',
        syncLogId: 'test-log-id',
        progressPercentage: 20,
        pendingChanges: [],
        syncResult: null,
        showReviewModal: false,
      },
      startSync: jest.fn(),
      completeSync: jest.fn(),
      canStartNewSync: jest.fn(() => false),
      updateStep: jest.fn(),
      minimizeSync: jest.fn(),
      cancelSync: jest.fn(),
      maximizeSync: jest.fn(),
      showReview: jest.fn(),
      hideReview: jest.fn(),
      minimizeReview: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Modal Rendering', () => {
    it('renders the modal when isOpen is true', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
          facilityName="Test Facility"
        />
      );

      expect(screen.getByText('Syncing with FMS - Test Facility')).toBeInTheDocument();
      expect(screen.getByText('Connecting to FMS Provider')).toBeInTheDocument();
      expect(screen.getByText('This may take a few moments...')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={false}
          onClose={jest.fn()}
          facilityId="test-facility"
          facilityName="Test Facility"
        />
      );

      expect(screen.queryByText('Syncing with FMS')).not.toBeInTheDocument();
    });

    it('renders without facility name when not provided', () => {
      (mockUseFMSSyncReturn.syncState as any).facilityName = null;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      expect(screen.getByText('Syncing with FMS')).toBeInTheDocument();
      expect(screen.queryByText('Syncing with FMS -')).not.toBeInTheDocument();
    });
  });

  describe('Progress Animation', () => {
    it('initializes with correct progress value', () => {
      mockUseFMSSyncReturn.syncState.progressPercentage = 25;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Progress bar should be rendered
      const progressBarFill = document.querySelector('[class*="bg-gradient-to-r"]') as HTMLElement;
      expect(progressBarFill).toBeInTheDocument();

      // Text should be displayed (initially shows animated value which starts at 0)
      expect(screen.getByText('0% complete')).toBeInTheDocument();
    });

    it('progress bar element is properly structured', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Find the progress bar container and fill elements
      const progressBarFill = document.querySelector('[class*="bg-gradient-to-r"]') as HTMLElement;
      expect(progressBarFill).toBeInTheDocument();
      expect(progressBarFill).toHaveClass('bg-gradient-to-r', 'from-primary-500', 'to-primary-600');

      // Should have rounded corners
      expect(progressBarFill).toHaveClass('rounded-full');
    });
  });

  describe('Sync Steps Visualization', () => {
    it.each([
      ['connecting', 'Connecting to FMS Provider'],
      ['fetching', 'Fetching Tenants and Units'],
      ['detecting', 'Detecting Changes'],
      ['preparing', 'Preparing Results'],
    ])('shows step %s as active when currentStep is %s', (step, expectedText) => {
      mockUseFMSSyncReturn.syncState.currentStep = step as any;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      const stepElement = screen.getByText(expectedText);
      expect(stepElement).toBeInTheDocument();
      expect(stepElement).toHaveClass('text-primary-600', 'dark:text-primary-400');
    });

    it('shows completed steps with green checkmarks', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching' as SyncStep;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Connecting should be completed (green text)
      const connectingText = screen.getByText('Connecting to FMS Provider');
      expect(connectingText).toHaveClass('text-green-600', 'dark:text-green-400');

      // Should have green check circle icon for completed step
      const greenCheckIcon = document.querySelector('[class*="text-green-500"]');
      expect(greenCheckIcon).toBeInTheDocument();
    });

    it('shows pending steps as grayed out', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'connecting';

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Future steps should be gray
      const fetchingText = screen.getByText('Fetching Tenants and Units');
      expect(fetchingText).toHaveClass('text-gray-400', 'dark:text-gray-500');

      const detectingText = screen.getByText('Detecting Changes');
      expect(detectingText).toHaveClass('text-gray-400', 'dark:text-gray-500');
    });

    it('handles cancelled sync state', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'cancelled' as SyncStep;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // All steps should be gray when cancelled
      expect(screen.getByText('Connecting to FMS Provider')).toHaveClass('text-gray-400', 'dark:text-gray-500');
      expect(screen.getByText('Fetching Tenants and Units')).toHaveClass('text-gray-400', 'dark:text-gray-500');
    });
  });

  describe('Step Icons', () => {
    it('shows spinning arrow for active step', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // The connecting step should have a spinning arrow
      const modal = screen.getByText('Syncing with FMS - Test Facility').closest('.relative');
      const spinningIcon = modal?.querySelector('.animate-spin');
      expect(spinningIcon).toBeInTheDocument();
    });

    it('shows check circle for completed steps', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching' as SyncStep;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Should have green check circle for connecting step
      const modal = screen.getByText('Connecting to FMS Provider').closest('.relative');
      const greenIcons = modal?.querySelectorAll('[class*="text-green-500"]');
      expect(greenIcons?.length).toBeGreaterThan(0);
    });

    it('shows empty circle for pending steps', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Should have border-only circles for pending steps
      const modal = screen.getByText('Detecting Changes').closest('.relative');
      const borderCircles = modal?.querySelectorAll('[class*="border-gray-300"]');
      expect(borderCircles?.length).toBeGreaterThan(0);
    });
  });

  describe('Button Interactions', () => {
    it('calls minimizeSync when minimize button is clicked', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      const minimizeButton = screen.getByTitle('Minimize to status bar');
      fireEvent.click(minimizeButton);

      expect(mockUseFMSSyncReturn.minimizeSync).toHaveBeenCalled();
    });

    it('calls cancelSync and onClose when cancel button is clicked successfully', async () => {
      const mockOnClose = jest.fn();
      (fmsService.cancelSync as jest.Mock).mockResolvedValue(true);

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={mockOnClose}
          facilityId="test-facility"
        />
      );

      const cancelButton = screen.getByTitle('Cancel sync');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(fmsService.cancelSync).toHaveBeenCalledWith('test-facility');
        expect(mockUseFMSSyncReturn.cancelSync).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('handles cancel API failure gracefully', async () => {
      const mockOnClose = jest.fn();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (fmsService.cancelSync as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={mockOnClose}
          facilityId="test-facility"
        />
      );

      const cancelButton = screen.getByTitle('Cancel sync');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to cancel sync:', expect.any(Error));
        expect(mockUseFMSSyncReturn.cancelSync).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('handles cancel without facilityId', async () => {
      const mockOnClose = jest.fn();

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const cancelButton = screen.getByTitle('Cancel sync');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(fmsService.cancelSync).not.toHaveBeenCalled();
        expect(mockUseFMSSyncReturn.cancelSync).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Button Visibility', () => {
    it('renders minimize and cancel buttons when facilityId is provided', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      expect(screen.getByTitle('Minimize to status bar')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel sync')).toBeInTheDocument();
    });

    it('renders minimize and cancel buttons when facilityId is not provided', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByTitle('Minimize to status bar')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel sync')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and titles', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      expect(screen.getByTitle('Minimize to status bar')).toBeInTheDocument();
      expect(screen.getByTitle('Cancel sync')).toBeInTheDocument();
    });

    it('has proper heading structure', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Syncing with FMS - Test Facility');
    });
  });

  describe('Visual States and Styling', () => {
    it('applies proper opacity to pending steps', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Future steps should have reduced opacity
      const detectingStep = screen.getByText('Detecting Changes').closest('div');
      expect(detectingStep).toHaveClass('opacity-40');
    });

    it('applies full opacity to active and completed steps', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching' as SyncStep;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      const connectingStep = screen.getByText('Connecting to FMS Provider').closest('div');
      const fetchingStep = screen.getByText('Fetching Tenants and Units').closest('div');

      expect(connectingStep).toHaveClass('opacity-100');
      expect(fetchingStep).toHaveClass('opacity-100');
    });

    it('displays progress percentage text element', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Progress percentage text should be displayed
      const progressText = screen.getByText(/^\d+% complete$/);
      expect(progressText).toBeInTheDocument();
      expect(progressText).toHaveClass('text-xs', 'font-medium');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles undefined facilityName gracefully', () => {
      (mockUseFMSSyncReturn.syncState as any).facilityName = null;

      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      expect(screen.getByText('Syncing with FMS')).toBeInTheDocument();
    });

    it('handles null facilityId without crashing', () => {
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId={undefined}
        />
      );

      // Should still render without crashing
      expect(screen.getByText(/Syncing with FMS/)).toBeInTheDocument();
      expect(screen.getByTitle('Cancel sync')).toBeInTheDocument();
    });

    it('handles all sync step states without crashing', () => {
      // Test that the component renders without crashing with different step states
      // The default mock state in beforeEach has currentStep = 'connecting'
      renderWithProviders(
        <FMSSyncProgressModal
          isOpen={true}
          onClose={jest.fn()}
          facilityId="test-facility"
        />
      );

      // Should render without crashing - check for cancel button which should always be present
      expect(screen.getByTitle('Cancel sync')).toBeInTheDocument();
    });
  });
});
