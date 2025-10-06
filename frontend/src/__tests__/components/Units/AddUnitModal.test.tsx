import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { AddUnitModal } from '@/components/Units/AddUnitModal';
import { mockApiService, createMockFacility } from '@/__tests__/utils/test-utils';

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>
              <DropdownProvider>
                {component}
              </DropdownProvider>
            </SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AddUnitModal', () => {
  const mockFacilities = [
    createMockFacility({
      id: 'facility-1',
      name: 'Test Facility 1'
    }),
    createMockFacility({
      id: 'facility-2',
      name: 'Test Facility 2'
    })
  ];

  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock getFacilities to return test data
    mockApiService.getFacilities.mockResolvedValue({
      facilities: mockFacilities,
      total: mockFacilities.length
    });
    
    // Mock getUsers to return empty array (for tenant selection)
    mockApiService.getUsers.mockResolvedValue({
      users: [],
      total: 0
    });
  });

  describe('Rendering', () => {
    it('should render the modal when open', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      // Wait for modal to render
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      expect(screen.getByText('Unit Details')).toBeInTheDocument();
      expect(screen.getByText('Facility *')).toBeInTheDocument();
      expect(screen.getByText('Unit Number *')).toBeInTheDocument();
      expect(screen.getByText('Unit Type *')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      expect(screen.queryByText('Add New Unit')).not.toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('should render all required form fields', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Facility *')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Unit Number *')).toBeInTheDocument();
      expect(screen.getByText('Unit Type *')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Size (sq ft) *')).toBeInTheDocument();
      expect(screen.getByText('Monthly Rate ($) *')).toBeInTheDocument();
    });

    it('should have a facility dropdown', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      // Check that facility select exists
      const selects = screen.getAllByRole('combobox');
      const facilitySelect = selects[0];
      expect(facilitySelect).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should have form fields for all required data', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      // Check that all form inputs are present
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(2); // Facility and Unit Type selects
      
      const textInputs = screen.getByPlaceholderText(/a101/i);
      expect(textInputs).toBeInTheDocument();
      
      const numberInputs = screen.getAllByRole('spinbutton');
      expect(numberInputs.length).toBeGreaterThanOrEqual(2); // Size and Rate
    });

    it('should have input fields for unit data', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      // Check that input fields exist
      const unitNumberInput = screen.getByPlaceholderText(/a101/i);
      expect(unitNumberInput).toBeInTheDocument();
      
      const sizeInput = screen.getByPlaceholderText(/50/i);
      expect(sizeInput).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should have action buttons', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      // Check that action buttons exist
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      // Should have a cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
    });
  });

  describe('Modal Actions', () => {
    it('should close modal when cancel is clicked', async () => {
      renderWithProviders(
        <AddUnitModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );
      
      await waitFor(() => {
        const titles = screen.getAllByText('Add New Unit');
        expect(titles.length).toBeGreaterThan(0);
      });
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
