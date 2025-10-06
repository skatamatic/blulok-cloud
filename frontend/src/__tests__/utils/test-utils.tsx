import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { DropdownProvider } from '@/contexts/DropdownContext';

// Mock API service
export const mockApiService = {
  // Auth methods
  login: jest.fn(),
  logout: jest.fn(),
  changePassword: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),

  // User management
  getUsers: jest.fn(),
  getUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  activateUser: jest.fn(),
  getUserFacilities: jest.fn(),
  setUserFacilities: jest.fn(),
  addUserToFacility: jest.fn(),
  removeUserFromFacility: jest.fn(),

  // Facilities
  getFacilities: jest.fn(),
  getFacility: jest.fn(),
  createFacility: jest.fn(),
  updateFacility: jest.fn(),
  deleteFacility: jest.fn(),

  // Units
  getUnits: jest.fn(),
  getUnit: jest.fn(),
  getMyUnits: jest.fn(),
  createUnit: jest.fn(),
  updateUnit: jest.fn(),
  deleteUnit: jest.fn(),
  assignTenant: jest.fn(),
  removeTenant: jest.fn(),

  // Devices
  getDevices: jest.fn(),
  getFacilityDeviceHierarchy: jest.fn(),
  createAccessControlDevice: jest.fn(),
  createBluLokDevice: jest.fn(),
  updateDeviceStatus: jest.fn(),
  updateLockStatus: jest.fn(),
  getDevice: jest.fn(),
  createDevice: jest.fn(),

  // Access History
  getAccessHistory: jest.fn(),
  getAccessLog: jest.fn(),
  exportAccessHistory: jest.fn(),

  // Key Sharing
  getKeySharing: jest.fn(),
  getUserKeySharing: jest.fn(),
  getUnitKeySharing: jest.fn(),
  getExpiredKeySharing: jest.fn(),
  createKeySharing: jest.fn(),
  updateKeySharing: jest.fn(),
  revokeKeySharing: jest.fn(),

  // Widget Layouts
  getWidgetLayouts: jest.fn(),
  saveWidgetLayouts: jest.fn(),
  updateWidget: jest.fn(),
  hideWidget: jest.fn(),
  showWidget: jest.fn(),
  resetWidgetLayout: jest.fn(),
  getWidgetTemplates: jest.fn(),

  // Gateways
  getGateways: jest.fn(),
  getGateway: jest.fn(),
  createGateway: jest.fn(),
  updateGateway: jest.fn(),
  updateGatewayStatus: jest.fn(),
};

// Mock the API service module
jest.mock('@/services/api.service', () => ({
  apiService: mockApiService,
}));

// Mock the WebSocket service module
jest.mock('@/services/websocket.service', () => ({
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

// Mock localStorage
export const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock window.location
export const mockLocation = {
  href: 'http://localhost:3000',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Test wrapper component
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>
              <DropdownProvider>
                {children}
              </DropdownProvider>
            </SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Custom render function
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Helper functions for common test scenarios
export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'TENANT',
  facilityIds: ['facility-1'],
  isActive: true,
  ...overrides,
});

export const createMockFacility = (overrides = {}) => ({
  id: 'facility-1',
  name: 'Test Facility',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zipCode: '12345',
  contactEmail: 'facility@test.com',
  contactPhone: '123-456-7890',
  status: 'active',
  ...overrides,
});

export const createMockUnit = (overrides = {}) => ({
  id: 'unit-1',
  unitNumber: 'A-101',
  unitType: 'storage',
  facilityId: 'facility-1',
  status: 'occupied',
  sizeSqft: 100,
  ...overrides,
});

export const createMockDevice = (overrides = {}) => ({
  id: 'device-1',
  name: 'Test Device',
  deviceType: 'blulok',
  facilityId: 'facility-1',
  unitId: 'unit-1',
  status: 'online',
  ...overrides,
});

export const createMockAccessLog = (overrides = {}) => ({
  id: 'log-1',
  deviceId: 'device-1',
  deviceType: 'blulok',
  facilityId: 'facility-1',
  unitId: 'unit-1',
  userId: 'user-1',
  action: 'unlock',
  method: 'mobile_app',
  success: true,
  timestamp: new Date().toISOString(),
  ...overrides,
});

// Mock API responses
export const mockApiResponses = {
  success: (data: any) => ({ success: true, ...data }),
  error: (message: string, status = 400) => ({ 
    success: false, 
    message,
    status 
  }),
  unauthorized: () => ({ 
    success: false, 
    message: 'Unauthorized',
    status: 401 
  }),
  forbidden: () => ({ 
    success: false, 
    message: 'Forbidden',
    status: 403 
  }),
  notFound: () => ({ 
    success: false, 
    message: 'Not Found',
    status: 404 
  }),
};

// Helper to setup API mocks
export const setupApiMocks = () => {
  // Reset all mocks
  Object.values(mockApiService).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockReset();
    }
  });
  
  mockLocalStorage.getItem.mockReturnValue(null);
  mockLocalStorage.setItem.mockImplementation(() => {});
  mockLocalStorage.removeItem.mockImplementation(() => {});
  mockLocalStorage.clear.mockImplementation(() => {});
};

// Helper to simulate API errors
export const simulateApiError = (apiMethod: any, error: any) => {
  if (jest.isMockFunction(apiMethod)) {
    apiMethod.mockRejectedValueOnce(error);
  } else {
    // For non-mock functions, we need to mock them
    jest.mocked(apiMethod).mockRejectedValueOnce(error);
  }
};

// Helper to simulate API success
export const simulateApiSuccess = (apiMethod: any, data: any) => {
  if (jest.isMockFunction(apiMethod)) {
    apiMethod.mockResolvedValueOnce({ data });
  } else {
    // For non-mock functions, we need to mock them
    jest.mocked(apiMethod).mockResolvedValueOnce({ data });
  }
};

// Simple test to make this a valid test file
describe('Test Utils', () => {
  it('should export helper functions', () => {
    expect(mockApiService).toBeDefined();
    expect(setupApiMocks).toBeDefined();
    expect(createMockUser).toBeDefined();
    expect(createMockFacility).toBeDefined();
    expect(createMockUnit).toBeDefined();
    expect(createMockDevice).toBeDefined();
    expect(createMockAccessLog).toBeDefined();
  });
});
