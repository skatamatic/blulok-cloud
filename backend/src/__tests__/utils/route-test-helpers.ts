import { UnitsService } from '@/services/units.service';
import { UnitModel } from '@/models/unit.model';
import { WebSocketService } from '@/services/websocket.service';
import { MockTestData } from './mock-test-helpers';

// Mock all the services and models
jest.mock('@/services/units.service', () => ({
  UnitsService: {
    getInstance: jest.fn()
  }
}));
jest.mock('@/models/unit.model', () => ({
  UnitModel: jest.fn()
}));
jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn()
  }
}));

export interface MockedServices {
  mockUnitsService: jest.Mocked<UnitsService>;
  mockUnitModel: jest.Mocked<UnitModel>;
  mockWebSocketService: jest.Mocked<WebSocketService>;
}

export function setupRouteMocks(testData: MockTestData): MockedServices {
  // Create mock UnitsService
  const mockUnitsService = {
    getUnits: jest.fn(),
    getUnitDetails: jest.fn(),
    lockUnit: jest.fn(),
    unlockUnit: jest.fn(),
    hasUserAccessToUnit: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
    getInstance: jest.fn()
  } as any;

  // Create mock UnitModel
  const mockUnitModel = {
    getUnitsListForUser: jest.fn(),
    getUnitDetailsForUser: jest.fn(),
    lockUnit: jest.fn(),
    unlockUnit: jest.fn(),
    hasUserAccessToUnit: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
  } as any;

  // Create mock WebSocketService
  const mockWebSocketService = {
    broadcastUnitsUpdate: jest.fn(),
    broadcastBatteryStatusUpdate: jest.fn(),
    getInstance: jest.fn()
  } as any;

  // Mock the static methods
  (UnitsService.getInstance as jest.Mock).mockReturnValue(mockUnitsService);
  (UnitModel as jest.MockedClass<typeof UnitModel>).mockImplementation(() => mockUnitModel);
  (WebSocketService.getInstance as jest.Mock).mockReturnValue(mockWebSocketService);

  // Set up default mock implementations
  mockUnitsService.getUnits.mockImplementation(async (userId: string, userRole: string, filters: any) => {
    console.log('Mock getUnits called with:', { userId, userRole, filters });
    return {
      units: [testData.units.unit1, testData.units.unit2],
      total: 2
    };
  });

  mockUnitsService.getUnitDetails.mockResolvedValue(testData.units.unit1);
  mockUnitsService.lockUnit.mockResolvedValue(true);
  mockUnitsService.unlockUnit.mockResolvedValue(true);
  mockUnitsService.hasUserAccessToUnit.mockResolvedValue(true);
  mockUnitsService.createUnit.mockResolvedValue(testData.units.unit1);
  mockUnitsService.updateUnit.mockResolvedValue(testData.units.unit1);

  mockWebSocketService.broadcastUnitsUpdate.mockResolvedValue();
  mockWebSocketService.broadcastBatteryStatusUpdate.mockResolvedValue();

  return {
    mockUnitsService,
    mockUnitModel,
    mockWebSocketService
  };
}

export function resetMocks(mocks: MockedServices): void {
  Object.values(mocks).forEach(mock => {
    if (mock && typeof mock === 'object') {
      Object.values(mock).forEach(fn => {
        if (jest.isMockFunction(fn)) {
          fn.mockReset();
        }
      });
    }
  });
}
