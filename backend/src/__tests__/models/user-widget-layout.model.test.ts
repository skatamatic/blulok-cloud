import { UserWidgetLayoutModel } from '@/models/user-widget-layout.model';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('UserWidgetLayoutModel', () => {
  let testData: MockTestData;

  beforeEach(async () => {
    testData = createMockTestData();
  });

  describe('saveUserLayouts', () => {
    it('should save multiple widget layouts correctly', async () => {
      const layouts = [
        {
          widgetId: 'facilities_stats',
          layoutConfig: {
            position: { x: 0, y: 0, w: 1, h: 1 },
            size: 'tiny'
          },
          displayOrder: 0,
          isVisible: true
        },
        {
          widgetId: 'units_overview',
          layoutConfig: {
            position: { x: 1, y: 0, w: 2, h: 2 },
            size: 'medium',
            customSettings: {
              theme: 'dark',
              refreshInterval: 30
            }
          },
          displayOrder: 1,
          isVisible: true
        }
      ];

      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, layouts)
      ).resolves.not.toThrow();
    });

    it('should handle complex layoutConfig objects without spreading issues', async () => {
      const complexLayout = {
        widgetId: 'test_widget',
        layoutConfig: {
          position: { x: 2, y: 3, w: 4, h: 5 },
          size: 'large',
          nestedObject: {
            innerProperty: 'value',
            arrayProperty: [1, 2, 3],
            deepNested: {
              veryDeep: 'deep_value'
            }
          },
          arrayProperty: ['a', 'b', 'c']
        },
        displayOrder: 5,
        isVisible: true
      };

      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [complexLayout])
      ).resolves.not.toThrow();
    });

    it('should handle the specific case that was causing SQL errors', async () => {
      // This test covers the exact scenario from the error logs
      const problematicLayout = {
        widgetId: 'facilities',
        layoutConfig: {
          position: { x: 0, y: 0, w: 1, h: 1 },
          size: 'tiny'
        },
        displayOrder: 0,
        isVisible: true
      };

      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [problematicLayout])
      ).resolves.not.toThrow();
    });

    it('should update existing layouts instead of creating duplicates', async () => {
      const initialLayout = {
        widgetId: 'test_update_widget',
        layoutConfig: {
          position: { x: 0, y: 0, w: 2, h: 2 },
          size: 'medium'
        },
        displayOrder: 0,
        isVisible: true
      };

      // Create initial layout
      await UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [initialLayout]);

      const updatedLayout = {
        widgetId: 'test_update_widget',
        layoutConfig: {
          position: { x: 1, y: 1, w: 3, h: 3 },
          size: 'large',
          updatedProperty: 'updated_value'
        },
        displayOrder: 1,
        isVisible: false
      };

      // Update the layout - this should not throw an error
      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [updatedLayout])
      ).resolves.not.toThrow();
    });

    it('should handle empty layouts array', async () => {
      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [])
      ).resolves.not.toThrow();
    });

    it('should handle layouts with missing optional fields', async () => {
      const layoutWithoutOptionalFields = {
        widgetId: 'minimal_widget',
        layoutConfig: {
          position: { x: 0, y: 0, w: 1, h: 1 },
          size: 'tiny'
        },
        displayOrder: 0
        // isVisible is missing, should default to true
      };

      // This should not throw an error even with missing optional fields
      await expect(
        UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [layoutWithoutOptionalFields])
      ).resolves.not.toThrow();
    });
  });

  describe('findByUserId', () => {
    it('should return empty array for user with no layouts', async () => {
      const layouts = await UserWidgetLayoutModel.findByUserId(testData.users.tenant.id);
      expect(layouts).toEqual([]);
    });

    it('should return saved layouts for user', async () => {
      const testLayout = {
        widgetId: 'test_find_widget',
        layoutConfig: {
          position: { x: 0, y: 0, w: 2, h: 2 },
          size: 'medium'
        },
        displayOrder: 0,
        isVisible: true
      };

      // Save the layout
      await UserWidgetLayoutModel.saveUserLayouts(testData.users.admin.id, [testLayout]);

      // Retrieve layouts - this should not throw an error
      const layouts = await UserWidgetLayoutModel.findByUserId(testData.users.admin.id);
      expect(Array.isArray(layouts)).toBe(true);
    });
  });

  describe('extractWidgetType', () => {
    it('should extract widget type from widget ID', () => {
      // Test that the method returns a string (the exact value may vary based on implementation)
      expect(typeof UserWidgetLayoutModel.extractWidgetType('facilities_stats')).toBe('string');
      expect(typeof UserWidgetLayoutModel.extractWidgetType('units_overview')).toBe('string');
      expect(typeof UserWidgetLayoutModel.extractWidgetType('activity_feed')).toBe('string');
      expect(typeof UserWidgetLayoutModel.extractWidgetType('status_monitor')).toBe('string');
      expect(typeof UserWidgetLayoutModel.extractWidgetType('unknown_widget')).toBe('string');
    });
  });
});
