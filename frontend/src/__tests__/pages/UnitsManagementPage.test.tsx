import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import UnitsManagementPage from '@/pages/UnitsManagementPage';
import { createMockUnit, createMockFacility } from '@/__tests__/utils/test-utils';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock API service
jest.mock('@/services/api.service', () => ({
  apiService: {
    getUnits: jest.fn(),
    getFacilities: jest.fn(),
    getUsers: jest.fn(),
  },
}));

// Mock auth context
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin' as const,
        facilities: []
      },
      isAuthenticated: true,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import after mocking
import { apiService } from '@/services/api.service';

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
          <SidebarProvider>
            <DropdownProvider>
              {component}
            </DropdownProvider>
          </SidebarProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('UnitsManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock API responses to prevent network errors
    (apiService.getUnits as jest.Mock).mockResolvedValue({
      units: [],
      total: 0
    });

    (apiService.getFacilities as jest.Mock).mockResolvedValue({
      facilities: [],
      total: 0
    });

    (apiService.getUsers as jest.Mock).mockResolvedValue({
      users: [],
      total: 0
    });
  });

  describe('Rendering', () => {
    it('should render the page title and description', () => {
      renderWithProviders(<UnitsManagementPage />);
      expect(screen.getByText('Storage Units')).toBeInTheDocument();
      expect(screen.getByText('Manage storage units, tenants, and facility operations')).toBeInTheDocument();
    });

    it('should render view controls', () => {
      renderWithProviders(<UnitsManagementPage />);
      // Check that there are at least 3 buttons (Grid, List, Cards, Filters, Add Unit)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(5);
    });

    it('should render search controls', () => {
      renderWithProviders(<UnitsManagementPage />);
      expect(screen.getByPlaceholderText('Search units...')).toBeInTheDocument();
    });

    it('should render filter controls', () => {
      renderWithProviders(<UnitsManagementPage />);
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should load facilities on mount', async () => {
      renderWithProviders(<UnitsManagementPage />);

      await waitFor(() => {
        expect(apiService.getFacilities).toHaveBeenCalled();
      });
    });

    it('should load units on mount', async () => {
      renderWithProviders(<UnitsManagementPage />);

      await waitFor(() => {
        expect(apiService.getUnits).toHaveBeenCalled();
      });
    });
  });
});
