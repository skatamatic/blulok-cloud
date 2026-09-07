import request from 'supertest';
import express from 'express';
import { bluDesignAssetDefinitionsRouter } from '../../bludesign/routes/asset-definitions.routes';
import { AssetService } from '../../bludesign/services/asset.service';
import { AssetCategory } from '../../bludesign/types/bludesign.types';

// Mock AssetService
jest.mock('../../bludesign/services/asset.service');

// Mock authentication middleware
jest.mock('../../middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { userId: 'test-user-123', role: 'admin' };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/v1/bludesign/assets', bluDesignAssetDefinitionsRouter);

describe('Assets Routes - Locker Spec Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/bludesign/assets/definitions', () => {
    it('should create asset with valid locker spec', async () => {
      const lockerSpec = {
        doorSide: 'front',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.1524,
      };

      const requestBody = {
        name: 'Custom Storage Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive',
        dimensions: { width: 1.524, height: 2.4384, depth: 1.524 },
        gridUnits: { x: 3, z: 3 },
        isSmart: true,
        canRotate: true,
        canStack: false,
        lockerSpec,
      };

      const mockCreatedAsset = {
        id: 'asset-123',
        ...requestBody,
        isBuiltin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (AssetService.createAssetDefinition as jest.Mock).mockResolvedValue(mockCreatedAsset);

      const response = await request(app)
        .post('/api/v1/bludesign/assets/definitions')
        .send(requestBody)
        .expect(201);

      expect(response.body.data).toHaveProperty('id', 'asset-123');
      expect(response.body.data.lockerSpec).toEqual(lockerSpec);
      expect(AssetService.createAssetDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Storage Locker',
          lockerSpec,
        })
      );
    });

    it('should reject locker spec with invalid door side', async () => {
      const requestBody = {
        name: 'Invalid Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive',
        dimensions: { width: 1.5, height: 2.5, depth: 1.5 },
        gridUnits: { x: 3, z: 3 },
        lockerSpec: {
          doorSide: 'top', // Invalid
          doorWidth: 1.0,
          doorHeight: 2.0,
          doorPositionX: 0,
          doorPositionY: 0.5,
        },
      };

      const response = await request(app)
        .post('/api/v1/bludesign/assets/definitions')
        .send(requestBody)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('doorSide');
    });

    it('should reject locker spec with negative door width', async () => {
      const requestBody = {
        name: 'Invalid Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive',
        dimensions: { width: 1.5, height: 2.5, depth: 1.5 },
        gridUnits: { x: 3, z: 3 },
        lockerSpec: {
          doorSide: 'front',
          doorWidth: -1.0, // Invalid
          doorHeight: 2.0,
          doorPositionX: 0,
          doorPositionY: 0.5,
        },
      };

      const response = await request(app)
        .post('/api/v1/bludesign/assets/definitions')
        .send(requestBody)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('doorWidth');
    });
  });

  describe('PUT /api/v1/bludesign/assets/definitions/:id', () => {
    it('should update locker spec', async () => {
      const updatedLockerSpec = {
        doorSide: 'right',
        doorWidth: 1.2192,
        doorHeight: 2.1336,
        doorPositionX: 0.3048,
        doorPositionY: 0.3048,
      };

      const requestBody = {
        lockerSpec: updatedLockerSpec,
      };

      const mockUpdatedAsset = {
        id: 'asset-123',
        name: 'Updated Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive',
        dimensions: { width: 2, height: 3, depth: 2 },
        gridUnits: { x: 4, z: 4 },
        lockerSpec: updatedLockerSpec,
        isBuiltin: false,
        isSmart: true,
        canRotate: true,
        canStack: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (AssetService.updateAssetDefinition as jest.Mock).mockResolvedValue(mockUpdatedAsset);

      const response = await request(app)
        .put('/api/v1/bludesign/assets/definitions/asset-123')
        .send(requestBody)
        .expect(200);

      expect(response.body.data.lockerSpec).toEqual(updatedLockerSpec);
      expect(AssetService.updateAssetDefinition).toHaveBeenCalledWith(
        'asset-123',
        expect.objectContaining({
          lockerSpec: updatedLockerSpec,
        })
      );
    });
  });

  describe('GET /api/v1/bludesign/assets/definitions/:id', () => {
    it('should retrieve asset with locker spec', async () => {
      const lockerSpec = {
        doorSide: 'back',
        doorWidth: 1.524,
        doorHeight: 2.1336,
        doorPositionX: -0.1524,
        doorPositionY: 0.3048,
      };

      const mockAsset = {
        id: 'asset-789',
        name: 'Test Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive',
        dimensions: { width: 1.5, height: 2.5, depth: 1.5 },
        gridUnits: { x: 3, z: 3 },
        lockerSpec,
        isBuiltin: false,
        isSmart: true,
        canRotate: true,
        canStack: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (AssetService.getAssetDefinition as jest.Mock).mockResolvedValue(mockAsset);

      const response = await request(app)
        .get('/api/v1/bludesign/assets/definitions/asset-789')
        .expect(200);

      expect(response.body.data.lockerSpec).toEqual(lockerSpec);
      expect(response.body.data.lockerSpec.doorSide).toBe('back');
    });
  });
});
