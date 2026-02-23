/**
 * FacilityService Unit Tests
 *
 * Tests that DB metadata and storage bucket data are correctly
 * coordinated for save, load, update, and delete operations.
 */

import { FacilityService, FacilityData } from '@/bludesign/services/facility.service';
import { FacilityStorageAdapter } from '@/bludesign/services/facility-storage.adapter';

jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

const sampleData: FacilityData = {
  name: 'My Facility',
  version: '1.0.0',
  camera: { mode: 'isometric' },
  placedObjects: [{ id: 'obj-1' }],
  gridSize: 10,
  showGrid: true,
};

function makeMockDb() {
  const rows: Record<string, unknown>[] = [];
  const query = {
    where: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockImplementation(() => Promise.resolve(rows)),
    first: jest.fn().mockImplementation(() => Promise.resolve(rows[0] ?? null)),
    insert: jest.fn().mockImplementation((record: Record<string, unknown>) => {
      rows.push(record);
      return Promise.resolve([1]);
    }),
    update: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue(1),
  };
  const db = jest.fn().mockReturnValue(query);
  return { db, query, rows };
}

function makeMockStorage(): jest.Mocked<FacilityStorageAdapter> {
  return {
    saveData: jest.fn().mockResolvedValue(undefined),
    loadData: jest.fn().mockResolvedValue(sampleData),
    deleteData: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<FacilityStorageAdapter>;
}

describe('FacilityService', () => {
  let service: FacilityService;
  let db: ReturnType<typeof makeMockDb>;
  let storage: jest.Mocked<FacilityStorageAdapter>;

  beforeEach(() => {
    db = makeMockDb();
    storage = makeMockStorage();
    service = new FacilityService(db.db as any, storage);
  });

  describe('saveFacility', () => {
    it('should insert metadata into DB and save data to storage', async () => {
      const result = await service.saveFacility('user-1', 'Test', sampleData, 'thumb');

      expect(db.db).toHaveBeenCalledWith('bludesign_user_facilities');
      expect(db.query.insert).toHaveBeenCalledTimes(1);

      const insertedRecord = db.query.insert.mock.calls[0][0];
      expect(insertedRecord.id).toBe('test-uuid-1234');
      expect(insertedRecord.user_id).toBe('user-1');
      expect(insertedRecord.name).toBe('Test');
      expect(insertedRecord.thumbnail).toBe('thumb');
      expect(insertedRecord).not.toHaveProperty('data');

      expect(storage.saveData).toHaveBeenCalledWith('user-1', 'test-uuid-1234', sampleData);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.data).toEqual(sampleData);
    });
  });

  describe('getFacility', () => {
    it('should query DB for metadata and load data from storage', async () => {
      const metaRow = {
        id: 'fac-1',
        user_id: 'user-1',
        name: 'Saved',
        thumbnail: null,
        last_opened: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      db.query.first.mockResolvedValue(metaRow);
      storage.loadData.mockResolvedValue(sampleData);

      const result = await service.getFacility('fac-1', 'user-1');

      expect(db.query.where).toHaveBeenCalledWith({ id: 'fac-1', user_id: 'user-1' });
      expect(storage.loadData).toHaveBeenCalledWith('user-1', 'fac-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Saved');
      expect(result!.data).toEqual(sampleData);
    });

    it('should return null when facility not found in DB', async () => {
      db.query.first.mockResolvedValue(null);

      const result = await service.getFacility('missing', 'user-1');

      expect(result).toBeNull();
      expect(storage.loadData).not.toHaveBeenCalled();
    });
  });

  describe('updateFacility', () => {
    it('should update DB timestamps and save new data to storage', async () => {
      await service.updateFacility('fac-1', 'user-1', sampleData, 'new-thumb');

      expect(db.query.update).toHaveBeenCalledTimes(1);
      const updates = db.query.update.mock.calls[0][0];
      expect(updates.thumbnail).toBe('new-thumb');
      expect(updates.updated_at).toBeInstanceOf(Date);
      expect(updates).not.toHaveProperty('data');

      expect(storage.saveData).toHaveBeenCalledWith('user-1', 'fac-1', sampleData);
    });

    it('should not set thumbnail when undefined', async () => {
      await service.updateFacility('fac-1', 'user-1', sampleData);

      const updates = db.query.update.mock.calls[0][0];
      expect(updates).not.toHaveProperty('thumbnail');
    });
  });

  describe('deleteFacility', () => {
    it('should delete DB row and storage directory', async () => {
      await service.deleteFacility('fac-1', 'user-1');

      expect(db.query.delete).toHaveBeenCalledTimes(1);
      expect(storage.deleteData).toHaveBeenCalledWith('user-1', 'fac-1');
    });
  });

  describe('getLastOpened', () => {
    it('should query DB and load data from storage', async () => {
      const metaRow = {
        id: 'fac-2',
        user_id: 'user-1',
        name: 'Last Opened',
        thumbnail: null,
        last_opened: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      db.query.first.mockResolvedValue(metaRow);

      const result = await service.getLastOpened('user-1');

      expect(db.query.whereNotNull).toHaveBeenCalledWith('last_opened');
      expect(db.query.orderBy).toHaveBeenCalledWith('last_opened', 'desc');
      expect(storage.loadData).toHaveBeenCalledWith('user-1', 'fac-2');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Last Opened');
      expect(result!.data).toEqual(sampleData);
    });

    it('should return null when no facilities exist', async () => {
      db.query.first.mockResolvedValue(null);

      const result = await service.getLastOpened('user-1');

      expect(result).toBeNull();
      expect(storage.loadData).not.toHaveBeenCalled();
    });
  });

  describe('getUserFacilities', () => {
    it('should return summaries without loading storage data', async () => {
      const metaRows = [
        {
          id: 'fac-1', name: 'A', thumbnail: null,
          last_opened: new Date(), created_at: new Date(), updated_at: new Date(),
        },
        {
          id: 'fac-2', name: 'B', thumbnail: 'thumb-b',
          last_opened: null, created_at: new Date(), updated_at: new Date(),
        },
      ];
      db.query.select.mockResolvedValue(metaRows);

      const result = await service.getUserFacilities('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
      expect(result[1].thumbnail).toBe('thumb-b');
      expect(storage.loadData).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate storage errors on save', async () => {
      storage.saveData.mockRejectedValue(new Error('bucket unreachable'));
      await expect(service.saveFacility('u', 'n', sampleData)).rejects.toThrow('bucket unreachable');
    });

    it('should propagate storage errors on load', async () => {
      db.query.first.mockResolvedValue({ id: 'f', user_id: 'u', name: 'x' });
      storage.loadData.mockRejectedValue(new Error('NOT_FOUND'));
      await expect(service.getFacility('f', 'u')).rejects.toThrow('NOT_FOUND');
    });
  });
});
