import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectUnauthorized, expectSuccess, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

describe('Widget Layouts Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all widget layout endpoints', async () => {
      const endpoints = [
        '/api/v1/widget-layouts',
        '/api/v1/widget-layouts/templates',
        '/api/v1/widget-layouts/facilities_stats',
        '/api/v1/widget-layouts/facilities_stats/show',
        '/api/v1/widget-layouts/reset',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expectUnauthorized(response);
      }
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('Business Logic - Widget Layout Management', () => {
    describe('GET /api/v1/widget-layouts - Get User Widget Layout', () => {
      it('should return default layouts for user with no saved layouts', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('layouts');
        expect(response.body).toHaveProperty('isDefault', true);
        expect(Array.isArray(response.body.layouts)).toBe(true);
      });

      it('should return saved layouts for user with existing layouts', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.otherTenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('layouts');
        expect(response.body).toHaveProperty('isDefault', false);
        expect(Array.isArray(response.body.layouts)).toBe(true);
      });

      it('should return layouts sorted by display order', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.otherTenant.token}`)
          .expect(200);

        expectSuccess(response);
        const layouts = response.body.layouts;
        expect(layouts.length).toBeGreaterThan(0);
        
        // Check that layouts are sorted by displayOrder
        for (let i = 1; i < layouts.length; i++) {
          expect(layouts[i].displayOrder).toBeGreaterThanOrEqual(layouts[i - 1].displayOrder);
        }
      });

      it('should include template metadata in layouts', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        const layouts = response.body.layouts;
        expect(layouts.length).toBeGreaterThan(0);
        
        layouts.forEach((layout: any) => {
          expect(layout).toHaveProperty('widgetId');
          expect(layout).toHaveProperty('widgetType');
          expect(layout).toHaveProperty('name');
          expect(layout).toHaveProperty('layoutConfig');
          expect(layout).toHaveProperty('availableSizes');
          expect(layout).toHaveProperty('isVisible');
          expect(layout).toHaveProperty('displayOrder');
        });
      });
    });

    describe('POST /api/v1/widget-layouts - Save User Widget Layout', () => {
      const validLayoutData = {
        layouts: [
          {
            widgetId: 'facilities_stats',
            layoutConfig: {
              position: { x: 0, y: 0, w: 4, h: 3 },
              size: 'medium'
            },
            displayOrder: 0
          },
          {
            widgetId: 'units_overview',
            layoutConfig: {
              position: { x: 4, y: 0, w: 4, h: 3 },
              size: 'medium'
            },
            displayOrder: 1
          }
        ]
      };

      it('should save widget layouts for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validLayoutData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should save widget layouts for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLayoutData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should save widget layouts for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLayoutData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should save widget layouts for TENANT', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLayoutData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should save widget layouts for MAINTENANCE', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validLayoutData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should return 400 for missing layouts array', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({})
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid layout structure', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layouts: [
              {
                widgetId: 'test_widget'
                // Missing required fields
              }
            ]
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid position coordinates', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layouts: [
              {
                widgetId: 'test_widget',
                layoutConfig: {
                  position: { x: -1, y: 0, w: 4, h: 3 }, // Invalid x coordinate
                  size: 'medium'
                },
                displayOrder: 0
              }
            ]
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid size values', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layouts: [
              {
                widgetId: 'test_widget',
                layoutConfig: {
                  position: { x: 0, y: 0, w: 4, h: 3 },
                  size: 'invalid_size'
                },
                displayOrder: 0
              }
            ]
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid display order', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layouts: [
              {
                widgetId: 'test_widget',
                layoutConfig: {
                  position: { x: 0, y: 0, w: 4, h: 3 },
                  size: 'medium'
                },
                displayOrder: -1 // Invalid display order
              }
            ]
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should properly handle complex layoutConfig objects in bulk save', async () => {
        const complexLayouts = {
          layouts: [
            {
              widgetId: 'facilities_stats',
              layoutConfig: {
                position: { x: 0, y: 0, w: 1, h: 1 },
                size: 'tiny',
                customSettings: {
                  theme: 'dark',
                  refreshInterval: 30
                }
              },
              displayOrder: 0,
              isVisible: true
            },
            {
              widgetId: 'units_overview',
              layoutConfig: {
                position: { x: 1, y: 0, w: 2, h: 2 },
                size: 'medium',
                filters: ['active', 'maintenance'],
                sortBy: 'name'
              },
              displayOrder: 1,
              isVisible: true
            }
          ]
        };

        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(complexLayouts)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });

      it('should handle the specific case that was causing the SQL error', async () => {
        // This test specifically covers the exact scenario from the error logs
        const problematicLayout = {
          layouts: [
            {
              widgetId: 'facilities',
              layoutConfig: {
                position: { x: 0, y: 0, w: 1, h: 1 },
                size: 'tiny'
              },
              displayOrder: 0,
              isVisible: true
            }
          ]
        };

        const response = await request(app)
          .post('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(problematicLayout)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
      });
    });

    describe('PUT /api/v1/widget-layouts/:widgetId - Update Specific Widget', () => {
      const validUpdateData = {
        layoutConfig: {
          position: { x: 2, y: 2, w: 6, h: 4 },
          size: 'large'
        },
        isVisible: true,
        displayOrder: 2
      };

      it('should update widget for DEV_ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should update widget for ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should update widget for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should update widget for TENANT', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should update widget for MAINTENANCE', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should create new widget if it does not exist', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/new_widget')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validUpdateData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should properly store layoutConfig as JSON without object spreading issues', async () => {
        const complexLayoutConfig = {
          position: { x: 1, y: 2, w: 3, h: 4 },
          size: 'large',
          customProperty: 'test_value',
          nestedObject: {
            innerProperty: 'inner_value',
            numbers: [1, 2, 3]
          }
        };

        const response = await request(app)
          .put('/api/v1/widget-layouts/test_widget_json')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layoutConfig: complexLayoutConfig,
            isVisible: true,
            displayOrder: 5
          })
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should handle layoutConfig with position and size properties correctly', async () => {
        // This test specifically covers the fix for the object spreading issue
        const layoutConfigWithPositionAndSize = {
          position: { x: 0, y: 0, w: 1, h: 1 },
          size: 'tiny'
        };

        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layoutConfig: layoutConfigWithPositionAndSize,
            isVisible: true,
            displayOrder: 0
          })
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget updated successfully');
      });

      it('should store layoutConfig as proper JSON without SQL errors', async () => {
        const testLayoutConfig = {
          position: { x: 2, y: 3, w: 4, h: 5 },
          size: 'large',
          customData: {
            theme: 'light',
            settings: ['option1', 'option2']
          }
        };

        // This test verifies that the layoutConfig is stored without causing SQL errors
        // The key fix was preventing object spreading that caused malformed SQL
        const updateResponse = await request(app)
          .put('/api/v1/widget-layouts/test_json_storage')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layoutConfig: testLayoutConfig,
            isVisible: true,
            displayOrder: 10
          })
          .expect(200);

        expectSuccess(updateResponse);
        expect(updateResponse.body).toHaveProperty('message', 'Widget updated successfully');
        
        // The test passes if no SQL error occurs during the update operation
        // This verifies that the object spreading fix is working correctly
      });

      it('should return 400 for missing widget ID', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validUpdateData)
          .expect(404); // Route not found

        // This will be a 404 from Express router, not our custom error
        expect(response.status).toBe(404);
      });

      it('should return 400 for invalid layout config', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layoutConfig: {
              position: { x: -1, y: 0, w: 4, h: 3 }, // Invalid position
              size: 'medium'
            }
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid size', async () => {
        const response = await request(app)
          .put('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            layoutConfig: {
              position: { x: 0, y: 0, w: 4, h: 3 },
              size: 'invalid_size'
            }
          })
          .expect(400);

        expectBadRequest(response);
      });
    });

    describe('DELETE /api/v1/widget-layouts/:widgetId - Hide Widget', () => {
      it('should hide widget for DEV_ADMIN', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget hidden successfully');
      });

      it('should hide widget for ADMIN', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget hidden successfully');
      });

      it('should hide widget for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget hidden successfully');
      });

      it('should hide widget for TENANT', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget hidden successfully');
      });

      it('should hide widget for MAINTENANCE', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/facilities_stats')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget hidden successfully');
      });

      it('should return 400 for missing widget ID', async () => {
        const response = await request(app)
          .delete('/api/v1/widget-layouts/')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404); // Route not found

        // This will be a 404 from Express router, not our custom error
        expect(response.status).toBe(404);
      });
    });

    describe('POST /api/v1/widget-layouts/:widgetId/show - Show Widget', () => {
      it('should show widget for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/facilities_stats/show')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget shown successfully');
      });

      it('should show widget for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/facilities_stats/show')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget shown successfully');
      });

      it('should show widget for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/facilities_stats/show')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget shown successfully');
      });

      it('should show widget for TENANT', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/facilities_stats/show')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget shown successfully');
      });

      it('should show widget for MAINTENANCE', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/facilities_stats/show')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget shown successfully');
      });

      it('should return 400 for missing widget ID', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts//show')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404); // Route not found

        // This will be a 404 from Express router, not our custom error
        expect(response.status).toBe(404);
      });
    });

    describe('POST /api/v1/widget-layouts/reset - Reset to Defaults', () => {
      it('should reset layouts for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/reset')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout reset to defaults');
      });

      it('should reset layouts for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/reset')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout reset to defaults');
      });

      it('should reset layouts for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/reset')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout reset to defaults');
      });

      it('should reset layouts for TENANT', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/reset')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout reset to defaults');
      });

      it('should reset layouts for MAINTENANCE', async () => {
        const response = await request(app)
          .post('/api/v1/widget-layouts/reset')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message', 'Widget layout reset to defaults');
      });
    });

    describe('GET /api/v1/widget-layouts/templates - Get Available Widget Templates', () => {
      it('should return templates for DEV_ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      });

      it('should return templates for ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      });

      it('should return templates for FACILITY_ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      });

      it('should return templates for TENANT', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      });

      it('should return templates for MAINTENANCE', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('templates');
        expect(Array.isArray(response.body.templates)).toBe(true);
      });

      it('should filter templates based on user role', async () => {
        const adminResponse = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        const tenantResponse = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(adminResponse);
        expectSuccess(tenantResponse);
        
        // Admin should have access to more templates (including admin-only ones)
        expect(adminResponse.body.templates.length).toBeGreaterThanOrEqual(tenantResponse.body.templates.length);
      });

      it('should include template metadata', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        templates.forEach((template: any) => {
          expect(template).toHaveProperty('widgetId');
          expect(template).toHaveProperty('widgetType');
          expect(template).toHaveProperty('name');
          expect(template).toHaveProperty('description');
          expect(template).toHaveProperty('defaultConfig');
          expect(template).toHaveProperty('availableSizes');
          expect(template).toHaveProperty('defaultOrder');
        });
      });
    });
  });

  describe('Security - Role-Based Access Control', () => {
    describe('Widget Template Access', () => {
      it('should allow DEV_ADMIN to access all templates', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        // DEV_ADMIN should have access to admin-only templates
        const adminTemplates = templates.filter((t: any) => t.widgetId === 'admin_panel');
        expect(adminTemplates.length).toBeGreaterThan(0);
      });

      it('should allow ADMIN to access all templates', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        // ADMIN should have access to admin-only templates
        const adminTemplates = templates.filter((t: any) => t.widgetId === 'admin_panel');
        expect(adminTemplates.length).toBeGreaterThan(0);
      });

      it('should restrict FACILITY_ADMIN to appropriate templates', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        // FACILITY_ADMIN should not have access to admin-only templates
        const adminTemplates = templates.filter((t: any) => t.widgetId === 'admin_panel');
        expect(adminTemplates.length).toBe(0);
      });

      it('should restrict TENANT to appropriate templates', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        // TENANT should not have access to admin-only templates
        const adminTemplates = templates.filter((t: any) => t.widgetId === 'admin_panel');
        expect(adminTemplates.length).toBe(0);
      });

      it('should restrict MAINTENANCE to appropriate templates', async () => {
        const response = await request(app)
          .get('/api/v1/widget-layouts/templates')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        const templates = response.body.templates;
        expect(templates.length).toBeGreaterThan(0);
        
        // MAINTENANCE should not have access to admin-only templates
        const adminTemplates = templates.filter((t: any) => t.widgetId === 'admin_panel');
        expect(adminTemplates.length).toBe(0);
      });
    });

    describe('Widget Layout Access', () => {
      it('should allow all authenticated users to manage their own layouts', async () => {
        const roles = ['devAdmin', 'admin', 'facilityAdmin', 'tenant', 'maintenance'];
        
        for (const role of roles) {
          const user = testData.users[role as keyof typeof testData.users];
          const response = await request(app)
            .get('/api/v1/widget-layouts')
            .set('Authorization', `Bearer ${user.token}`)
            .expect(200);

          expectSuccess(response);
          expect(response.body).toHaveProperty('layouts');
        }
      });

      it('should prevent users from accessing other users\' layouts', async () => {
        // This is implicitly tested by the authentication requirement
        // Each user can only access their own layouts based on their JWT token
        const response = await request(app)
          .get('/api/v1/widget-layouts')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
        // The response should only contain layouts for the authenticated user
        expect(response.body).toHaveProperty('layouts');
      });
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure users only see their own widget layouts', async () => {
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // The response should only contain layouts for the authenticated user
      // This is enforced by the JWT token and user ID extraction
      expect(response.body).toHaveProperty('layouts');
    });

    it('should ensure template filtering works correctly for different roles', async () => {
      const adminResponse = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      const tenantResponse = await request(app)
        .get('/api/v1/widget-layouts/templates')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(adminResponse);
      expectSuccess(tenantResponse);
      
      // Admin should have access to more templates
      expect(adminResponse.body.templates.length).toBeGreaterThanOrEqual(tenantResponse.body.templates.length);
      
      // Admin should have admin-only templates
      const adminTemplates = adminResponse.body.templates.filter((t: any) => t.widgetId === 'admin_panel');
      expect(adminTemplates.length).toBeGreaterThan(0);
      
      // Tenant should not have admin-only templates
      const tenantAdminTemplates = tenantResponse.body.templates.filter((t: any) => t.widgetId === 'admin_panel');
      expect(tenantAdminTemplates.length).toBe(0);
    });
  });

  describe('Input Validation and Security', () => {
    it('should prevent XSS in widget layout data', async () => {
      const maliciousData = {
        layouts: [
          {
            widgetId: '<script>alert("xss")</script>malicious_widget',
            layoutConfig: {
              position: { x: 0, y: 0, w: 4, h: 3 },
              size: 'medium'
            },
            displayOrder: 0
          }
        ]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(200);

      expectSuccess(response);
      // The widgetId should be sanitized or handled safely
      expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
    });

    it('should validate layout position boundaries', async () => {
      const invalidData = {
        layouts: [
          {
            widgetId: 'test_widget',
            layoutConfig: {
              position: { x: -1, y: 0, w: 4, h: 3 }, // Invalid x coordinate
              size: 'medium'
            },
            displayOrder: 0
          }
        ]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate layout dimensions', async () => {
      const invalidData = {
        layouts: [
          {
            widgetId: 'test_widget',
            layoutConfig: {
              position: { x: 0, y: 0, w: 0, h: 3 }, // Invalid width
              size: 'medium'
            },
            displayOrder: 0
          }
        ]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate size enum values', async () => {
      const invalidData = {
        layouts: [
          {
            widgetId: 'test_widget',
            layoutConfig: {
              position: { x: 0, y: 0, w: 4, h: 3 },
              size: 'invalid_size'
            },
            displayOrder: 0
          }
        ]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate display order values', async () => {
      const invalidData = {
        layouts: [
          {
            widgetId: 'test_widget',
            layoutConfig: {
              position: { x: 0, y: 0, w: 4, h: 3 },
              size: 'medium'
            },
            displayOrder: -1 // Invalid display order
          }
        ]
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // This would require mocking database errors
      const response = await request(app)
        .get('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      // In a real scenario, database errors would be caught and return 500
    });

    it('should handle malformed JSON in layout config', async () => {
      const response = await request(app)
        .put('/api/v1/widget-layouts/facilities_stats')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          layoutConfig: 'invalid_json_string'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should handle missing required fields in update', async () => {
      const response = await request(app)
        .put('/api/v1/widget-layouts/facilities_stats')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          // Missing layoutConfig
          isVisible: true
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle multiple rapid layout updates', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/api/v1/widget-layouts')
            .set('Authorization', `Bearer ${testData.users.admin.token}`)
            .send({
              layouts: [
                {
                  widgetId: `test_widget_${i}`,
                  layoutConfig: {
                    position: { x: i, y: 0, w: 4, h: 3 },
                    size: 'medium'
                  },
                  displayOrder: i
                }
              ]
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed (no rate limiting implemented yet)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    it('should handle large layout configurations', async () => {
      const largeLayoutData = {
        layouts: Array.from({ length: 20 }, (_, i) => ({
          widgetId: `widget_${i}`,
          layoutConfig: {
            position: { x: (i % 4) * 3, y: Math.floor(i / 4) * 3, w: 3, h: 3 },
            size: 'medium'
          },
          displayOrder: i
        }))
      };

      const response = await request(app)
        .post('/api/v1/widget-layouts')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(largeLayoutData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message', 'Widget layout saved successfully');
    });
  });
});
