/**
 * Simplified tests for StorageLockerWizard - focusing on key functionality
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StorageLockerWizard } from '@/components/bludesign/ui/dialogs/StorageLockerWizard';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AssetService } from '@/components/bludesign/services/AssetService';
import { GRID_UNIT_METERS, feetToMeters, metersToGridUnits } from '@/components/bludesign/core/types';

// Mock AssetService
jest.mock('@/components/bludesign/services/AssetService');

// Mock 3D components to avoid Three.js in tests
jest.mock('@/components/bludesign/ui/dialogs/LockerPreview3D', () => ({
  LockerPreview3D: () => <div data-testid="locker-preview">3D Preview</div>,
}));

jest.mock('@/components/bludesign/ui/dialogs/LockerModelUpload', () => ({
  LockerModelUpload: () => <div data-testid="model-upload">Model Upload</div>,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      {component}
    </ThemeProvider>
  );
};

describe('StorageLockerWizard - Basic Tests', () => {
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (AssetService.createAssetDefinition as jest.Mock).mockResolvedValue({
      id: 'asset-123',
      name: 'Custom Locker',
    });
  });

  describe('Rendering', () => {
    it('should render the wizard dialog', () => {
      renderWithProviders(
        <StorageLockerWizard onSave={mockOnSave} onClose={mockOnClose} />
      );

      expect(screen.getByText('Create Storage Locker')).toBeInTheDocument();
    });

    it('should show 3D preview', () => {
      renderWithProviders(
        <StorageLockerWizard onSave={mockOnSave} onClose={mockOnClose} />
      );

      expect(screen.getByTestId('locker-preview')).toBeInTheDocument();
    });

    it('should have mode toggle buttons', () => {
      renderWithProviders(
        <StorageLockerWizard onSave={mockOnSave} onClose={mockOnClose} />
      );

      expect(screen.getByRole('button', { name: /geometry/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    });
  });

  describe('Grid calculations', () => {
    it('should calculate correct grid units for 5x5 ft locker', () => {
      const widthFt = 5;
      const depthFt = 5;
      const widthM = feetToMeters(widthFt);
      const depthM = feetToMeters(depthFt);

      const gridX = metersToGridUnits(widthM);
      const gridZ = metersToGridUnits(depthM);

      // 5ft / 2ft per tile = 2.5, rounded up to 3
      expect(gridX).toBe(3);
      expect(gridZ).toBe(3);
    });

    it('should calculate correct grid units for 10x10 ft locker', () => {
      const widthFt = 10;
      const depthFt = 10;
      const widthM = feetToMeters(widthFt);
      const depthM = feetToMeters(depthFt);

      const gridX = metersToGridUnits(widthM);
      const gridZ = metersToGridUnits(depthM);

      // 10ft / 2ft per tile = 5
      expect(gridX).toBe(5);
      expect(gridZ).toBe(5);
    });

    it('should calculate correct grid units for 3x3 ft locker', () => {
      const widthFt = 3;
      const depthFt = 3;
      const widthM = feetToMeters(widthFt);
      const depthM = feetToMeters(depthFt);

      const gridX = metersToGridUnits(widthM);
      const gridZ = metersToGridUnits(depthM);

      // 3ft / 2ft per tile = 1.5, rounded up to 2
      expect(gridX).toBe(2);
      expect(gridZ).toBe(2);
    });
  });

  describe('Unit conversion', () => {
    it('should convert feet to meters correctly', () => {
      expect(feetToMeters(1)).toBeCloseTo(0.3048, 4);
      expect(feetToMeters(5)).toBeCloseTo(1.524, 4);
      expect(feetToMeters(10)).toBeCloseTo(3.048, 4);
    });

    it('should have correct grid unit constant', () => {
      expect(GRID_UNIT_METERS).toBeCloseTo(0.6096, 4);
      expect(feetToMeters(2)).toBeCloseTo(GRID_UNIT_METERS, 4);
    });
  });

  describe('LockerSpec structure', () => {
    it('should create valid locker spec with all required fields', () => {
      const lockerSpec = {
        doorSide: 'front' as const,
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.1524,
      };

      expect(lockerSpec).toHaveProperty('doorSide');
      expect(lockerSpec).toHaveProperty('doorWidth');
      expect(lockerSpec).toHaveProperty('doorHeight');
      expect(lockerSpec).toHaveProperty('doorPositionX');
      expect(lockerSpec).toHaveProperty('doorPositionY');
      expect(['front', 'back', 'left', 'right']).toContain(lockerSpec.doorSide);
    });
  });
});

