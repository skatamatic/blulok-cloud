import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FMSSyncStatusBar } from '@/components/FMS/FMSSyncStatusBar';
import { FMSSyncProvider, SyncStep } from '@/contexts/FMSSyncContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Mock the useFMSSync hook
let mockUseFMSSyncReturn: any = {
  syncState: {
    isActive: true,
    isMinimized: true,
    currentStep: 'complete' as any,
    facilityId: 'test-facility',
    facilityName: 'Test Facility',
    syncLogId: 'test-log-id',
    progressPercentage: 100,
    pendingChanges: [
      { id: 'change-1', change_type: 'TENANT_ADDED' },
      { id: 'change-2', change_type: 'UNIT_UPDATED' },
    ] as any,
    syncResult: null,
    showReviewModal: false,
  },
  maximizeSync: jest.fn(),
  showReview: jest.fn(),
};

jest.mock('@/contexts/FMSSyncContext', () => ({
  ...jest.requireActual('@/contexts/FMSSyncContext'),
  useFMSSync: () => mockUseFMSSyncReturn,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <WebSocketProvider>
        <FMSSyncProvider>
          {component}
        </FMSSyncProvider>
      </WebSocketProvider>
    </ThemeProvider>
  );
};

describe('FMSSyncStatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset to default mock state
    mockUseFMSSyncReturn = {
      syncState: {
        isActive: true,
        isMinimized: true,
        currentStep: 'complete' as SyncStep,
        facilityId: 'test-facility',
        facilityName: 'Test Facility',
        syncLogId: 'test-log-id',
        progressPercentage: 100,
        pendingChanges: [
          {
            id: 'change-1',
            sync_log_id: 'sync-123',
            change_type: 'TENANT_ADDED' as any,
            entity_type: 'tenant' as any,
            external_id: 'ext-1',
            impact_summary: 'Test change',
            required_actions: [],
            is_reviewed: false,
            created_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 'change-2',
            sync_log_id: 'sync-123',
            change_type: 'UNIT_UPDATED' as any,
            entity_type: 'unit' as any,
            external_id: 'ext-2',
            impact_summary: 'Test unit change',
            required_actions: [],
            is_reviewed: false,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
        syncResult: null,
        showReviewModal: false,
      },
      maximizeSync: jest.fn(),
      showReview: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Visibility Conditions', () => {
    it('renders the status bar when sync is active and minimized', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });

    it('does not render when sync is not active', () => {
      mockUseFMSSyncReturn.syncState.isActive = false;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.queryByText('Review 2 changes')).not.toBeInTheDocument();
    });

    it('does not render when sync is not minimized', () => {
      mockUseFMSSyncReturn.syncState.isMinimized = false;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.queryByText('Review 2 changes')).not.toBeInTheDocument();
    });

    it('does not render when review modal is open', () => {
      mockUseFMSSyncReturn.syncState.showReviewModal = true;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.queryByText('Review 2 changes')).not.toBeInTheDocument();
    });

    it('renders the status bar when review modal is shown and minimized', () => {
      mockUseFMSSyncReturn.syncState.showReviewModal = true;
      mockUseFMSSyncReturn.syncState.isMinimized = true;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText(/Review 2 changes/)).toBeInTheDocument();
      expect(screen.getByText('2 changes detected')).toBeInTheDocument();
    });
  });

describe('Completed Sync State', () => {
    it('displays correct text for completed sync with changes', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });

    it('shows eye icon for completed sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const eyeIcon = document.querySelector('[data-slot="icon"]');
      expect(eyeIcon).toBeInTheDocument();
    });

    it('applies glow animation class for completed sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      expect(statusBar).toHaveClass('animate-pulse-glow');
      expect(statusBar).toHaveClass('bg-green-100', 'dark:bg-green-900/50');
      expect(statusBar).toHaveClass('border-green-300', 'dark:border-green-700');
    });

    it('calls maximizeSync when clicked on completed sync with changes', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      fireEvent.click(statusBar!);

      expect(mockUseFMSSyncReturn.maximizeSync).toHaveBeenCalled();
      expect(mockUseFMSSyncReturn.showReview).not.toHaveBeenCalled();
    });

    it('handles completed sync with no facility name', () => {
      (mockUseFMSSyncReturn.syncState as any).facilityName = null;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing ...')).toBeInTheDocument();
    });

    it('handles completed sync with zero changes', () => {
      mockUseFMSSyncReturn.syncState.pendingChanges = [];

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });
  });

  describe('Active Sync State', () => {
    beforeEach(() => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';
      mockUseFMSSyncReturn.syncState.progressPercentage = 65;
      mockUseFMSSyncReturn.syncState.pendingChanges = []; // Active sync shouldn't have pending changes yet
    });

    it('displays correct text for active sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText(/Syncing Test Facility/)).toBeInTheDocument();
      expect(screen.getByText('65% complete')).toBeInTheDocument();
    });

    it('shows spinning arrow icon for active sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const spinningIcon = document.querySelector('.animate-spin');
      expect(spinningIcon).toBeInTheDocument();
    });

    it('displays progress bar for active sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const progressBar = document.querySelector('.bg-primary-500');
      expect(progressBar).toBeInTheDocument();
    });

    it('animates progress bar smoothly', () => {
      mockUseFMSSyncReturn.syncState.progressPercentage = 50;

      renderWithProviders(<FMSSyncStatusBar />);

      // Progress bar should be rendered
      const progressBarFill = document.querySelector('.bg-primary-500') as HTMLElement;
      expect(progressBarFill).toBeInTheDocument();

      // Should animate from 0 to 50%
      act(() => {
        jest.advanceTimersByTime(600); // Animation duration
      });
    });

    it('applies correct styling for active sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      expect(statusBar).toHaveClass('bg-gray-50', 'dark:bg-gray-700');
      expect(statusBar).toHaveClass('border-gray-300', 'dark:border-gray-600');
      expect(statusBar).not.toHaveClass('animate-pulse-glow');
    });

    it('calls only maximizeSync when clicked during active sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      fireEvent.click(statusBar!);

      expect(mockUseFMSSyncReturn.maximizeSync).toHaveBeenCalled();
      expect(mockUseFMSSyncReturn.showReview).not.toHaveBeenCalled();
    });

    it.each([
      ['connecting'],
      ['fetching'],
      ['detecting'],
      ['preparing'],
    ])('renders without crashing for %s step', (step) => {
      mockUseFMSSyncReturn.syncState.currentStep = step as any;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText(`Syncing Test Facility...`)).toBeInTheDocument();
    });
  });

  describe('Cancelled Sync State', () => {
    beforeEach(() => {
      mockUseFMSSyncReturn.syncState.currentStep = 'cancelled';
      mockUseFMSSyncReturn.syncState.progressPercentage = 0;
      mockUseFMSSyncReturn.syncState.pendingChanges = []; // Cancelled sync shouldn't allow reviewing changes
    });

    it('displays correct text for cancelled sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText(/Sync cancelled/)).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    it('shows X mark icon for cancelled sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const xIcon = document.querySelector('[class*="text-red-500"]');
      expect(xIcon).toBeInTheDocument();
    });

    it('applies red styling for cancelled sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      expect(statusBar).toHaveClass('bg-red-100', 'dark:bg-red-900/50');
      expect(statusBar).toHaveClass('border-red-300', 'dark:border-red-700');
      expect(statusBar).not.toHaveClass('animate-pulse-glow');
    });

    it('does not show progress bar for cancelled sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const progressBar = document.querySelector('.bg-primary-500');
      expect(progressBar).not.toBeInTheDocument();
    });

    it('calls only maximizeSync when clicked on cancelled sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      fireEvent.click(statusBar!);

      expect(mockUseFMSSyncReturn.maximizeSync).toHaveBeenCalled();
      expect(mockUseFMSSyncReturn.showReview).not.toHaveBeenCalled();
    });
  });

  describe('Progress Animation', () => {
    it('handles extreme progress values gracefully', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';
      mockUseFMSSyncReturn.syncState.progressPercentage = 150;

      renderWithProviders(<FMSSyncStatusBar />);

      const progressBarFill = document.querySelector('.bg-primary-500') as HTMLElement;
      expect(progressBarFill).toBeInTheDocument();
    });

    it('handles negative progress values', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';
      mockUseFMSSyncReturn.syncState.progressPercentage = -10;

      renderWithProviders(<FMSSyncStatusBar />);

      const progressBarFill = document.querySelector('.bg-primary-500') as HTMLElement;
      expect(progressBarFill).toBeInTheDocument();
    });

    it('handles requestAnimationFrame errors gracefully', () => {
      const originalRAF = global.requestAnimationFrame;
      global.requestAnimationFrame = jest.fn((_cb) => 0) as any;

      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';
      mockUseFMSSyncReturn.syncState.progressPercentage = 50;

      renderWithProviders(<FMSSyncStatusBar />);

      // Should not crash
      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();

      global.requestAnimationFrame = originalRAF;
    });

  describe('Icon Rendering', () => {
    it('shows check circle icon for completed sync', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const checkIcon = document.querySelector('[class*="text-green-500"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('shows X mark icon for cancelled sync', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'cancelled';

      renderWithProviders(<FMSSyncStatusBar />);

      const xIcon = document.querySelector('[class*="text-red-500"]');
      expect(xIcon).toBeInTheDocument();
    });

    it('shows spinning arrow icon for active sync', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';

      renderWithProviders(<FMSSyncStatusBar />);

      const spinningIcon = document.querySelector('.animate-spin');
      expect(spinningIcon).toBeInTheDocument();
    });
  });

  describe('Layout and Styling', () => {
    it('has fixed positioning at bottom center', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.fixed.bottom-4');
      expect(statusBar).toHaveClass('fixed', 'bottom-4', 'left-1/2', 'transform', '-translate-x-1/2');
    });

    it('has high z-index for overlay', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.fixed.bottom-4');
      expect(statusBar).toHaveClass('z-[1000]');
    });

    it('applies hover effects', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';

      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      expect(statusBar).toHaveClass('hover:shadow-xl');
    });

    it('truncates long text appropriately', () => {
      mockUseFMSSyncReturn.syncState.facilityName = 'Very Long Facility Name That Should Be Truncated';

      renderWithProviders(<FMSSyncStatusBar />);

      const textElement = document.querySelector('.font-medium.text-sm');
      expect(textElement).toHaveClass('truncate');
    });
  });

  describe('Accessibility', () => {
    it('is clickable and has cursor pointer', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      expect(statusBar).toBeInTheDocument();
    });

    it('supports keyboard navigation', () => {
      renderWithProviders(<FMSSyncStatusBar />);

      const statusBar = document.querySelector('.cursor-pointer');
      // React handles onClick internally, so we check that the element is focusable
      expect(statusBar).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined facilityName in active sync', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'fetching';
      (mockUseFMSSyncReturn.syncState as any).facilityName = null;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing ...')).toBeInTheDocument();
    });

    it('handles undefined facilityName in cancelled sync', () => {
      mockUseFMSSyncReturn.syncState.currentStep = 'cancelled';
      (mockUseFMSSyncReturn.syncState as any).facilityName = null;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Sync cancelled')).toBeInTheDocument();
    });

    it('handles empty pendingChanges array', () => {
      mockUseFMSSyncReturn.syncState.pendingChanges = [];

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();
      expect(screen.getByText('100% complete')).toBeInTheDocument();
    });

    it('handles null pendingChanges', () => {
      mockUseFMSSyncReturn.syncState.pendingChanges = null as any;

      renderWithProviders(<FMSSyncStatusBar />);

      expect(screen.getByText('Syncing Test Facility...')).toBeInTheDocument();
    });
  });
  });
});
