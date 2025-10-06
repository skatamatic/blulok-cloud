import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

// Mock the services that use import.meta
jest.mock('../services/api.service', () => ({
  apiService: {
    login: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
    changePassword: jest.fn(),
    verifyToken: jest.fn(),
  }
}));

jest.mock('../services/websocket.service', () => ({
  websocketService: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    onMessage: jest.fn().mockReturnValue(() => {}),
    onConnectionChange: jest.fn().mockReturnValue(() => {}),
    requestDiagnostics: jest.fn(),
    getSubscriptionStatus: jest.fn().mockReturnValue({}),
    unsubscribeAll: jest.fn(),
    retryConnectionIfNeeded: jest.fn(),
    isConnected: false,
    isWebSocketConnected: jest.fn().mockReturnValue(false),
  }
}));

// Mock all pages that use import.meta.env
jest.mock('../pages/LandingPage', () => {
  return function MockLandingPage() {
    return <div data-testid="landing-page">Landing Page</div>;
  };
});

jest.mock('../pages/LoginPage', () => {
  return function MockLoginPage() {
    return <div data-testid="login-page">Login Page</div>;
  };
});

jest.mock('../pages/DashboardPage', () => {
  return function MockDashboardPage() {
    return <div data-testid="dashboard-page">Dashboard Page</div>;
  };
});

jest.mock('../pages/UserManagementPage', () => {
  return function MockUserManagementPage() {
    return <div data-testid="user-management-page">User Management Page</div>;
  };
});

jest.mock('../pages/SettingsPage', () => {
  return function MockSettingsPage() {
    return <div data-testid="settings-page">Settings Page</div>;
  };
});

jest.mock('../pages/FacilitiesPage', () => {
  return function MockFacilitiesPage() {
    return <div data-testid="facilities-page">Facilities Page</div>;
  };
});

jest.mock('../pages/FacilityDetailsPage', () => {
  return function MockFacilityDetailsPage() {
    return <div data-testid="facility-details-page">Facility Details Page</div>;
  };
});

jest.mock('../pages/EditFacilityPage', () => {
  return function MockEditFacilityPage() {
    return <div data-testid="edit-facility-page">Edit Facility Page</div>;
  };
});

jest.mock('../pages/DevicesPage', () => {
  return function MockDevicesPage() {
    return <div data-testid="devices-page">Devices Page</div>;
  };
});

jest.mock('../pages/UnitsManagementPage', () => {
  return function MockUnitsManagementPage() {
    return <div data-testid="units-management-page">Units Management Page</div>;
  };
});

jest.mock('../pages/AccessHistoryPage', () => {
  return function MockAccessHistoryPage() {
    return <div data-testid="access-history-page">Access History Page</div>;
  };
});

jest.mock('../pages/DeveloperToolsPage', () => {
  return function MockDeveloperToolsPage() {
    return <div data-testid="developer-tools-page">Developer Tools Page</div>;
  };
});

// Mock the GoogleMaps components that use import.meta
jest.mock('../components/GoogleMaps/AddressAutocomplete', () => {
  return function MockAddressAutocomplete() {
    return <div data-testid="address-autocomplete">Address Autocomplete</div>;
  };
});

jest.mock('../components/GoogleMaps/MapCard', () => {
  return function MockMapCard() {
    return <div data-testid="map-card">Map Card</div>;
  };
});

const renderWithProviders = (ui: React.ReactElement) => {
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
        {ui}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('App', () => {
  it('renders landing page by default', () => {
    renderWithProviders(<App />);
    
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('has proper container styling', () => {
    const { container } = renderWithProviders(<App />);
    
    expect(container.firstChild).toHaveClass('min-h-screen', 'bg-gray-50');
  });
});
