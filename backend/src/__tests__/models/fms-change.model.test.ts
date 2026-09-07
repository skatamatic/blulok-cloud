jest.unmock('@/models/fms-change.model');

import { FMSChangeModel } from '@/models/fms-change.model';
import { DatabaseService } from '@/services/database.service';
import { mockDatabaseService, createMockKnex } from '@/__tests__/mocks/database.mock';
import { FMSChangeAction, FMSChangeType } from '@/types/fms.types';

function baseRow(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    sync_log_id: 'sync-1',
    change_type: FMSChangeType.TENANT_REMOVED,
    entity_type: 'tenant',
    external_id: 'ext-1',
    internal_id: 'user-1',
    before_data: JSON.stringify({ email: 'a@b.com' }),
    after_data: null,
    required_actions: JSON.stringify([]),
    impact_summary: 'removed',
    is_reviewed: false,
    is_accepted: null,
    applied_at: null,
    created_at: new Date(),
    is_valid: null,
    validation_errors: null,
    ...overrides,
  };
}

describe('FMSChangeModel', () => {
  let model: FMSChangeModel;
  let mockKnex: jest.Mock;
  let capturedInsertBatches: unknown[][];
  let prevGetInstance: ReturnType<jest.Mock['getMockImplementation']>;

  beforeEach(() => {
    capturedInsertBatches = [];

    mockKnex = jest.fn((table: string) => {
      if (table !== 'fms_changes') {
        return { where: jest.fn().mockReturnThis(), first: jest.fn() };
      }
      return {
        insert: jest.fn().mockImplementation(async (rows: unknown[]) => {
          capturedInsertBatches.push(rows);
          return [1];
        }),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        first: jest.fn(),
        update: jest.fn().mockResolvedValue(2),
        orderByRaw: jest.fn(),
      };
    });

    (mockKnex as any).fn = { now: () => new Date() };

    expect(DatabaseService).toBe(mockDatabaseService);
    const gi = mockDatabaseService.getInstance as jest.Mock;
    prevGetInstance = gi.getMockImplementation();
    gi.mockImplementation(() => ({
      connection: mockKnex,
    }));

    model = new FMSChangeModel();
  });

  afterEach(() => {
    const gi = mockDatabaseService.getInstance as jest.Mock;
    if (prevGetInstance) {
      gi.mockImplementation(prevGetInstance as any);
    } else {
      gi.mockImplementation(() => ({
        connection: createMockKnex(),
      }));
    }
  });

  describe('create — null after_data', () => {
    it('persists SQL NULL for after_data when null (tenant_removed shape)', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      const firstMock = jest.fn().mockResolvedValue(
        baseRow('id-1', { after_data: null }),
      );

      let fmsCalls = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table !== 'fms_changes') return {};
        fmsCalls += 1;
        if (fmsCalls === 1) {
          return { insert: insertMock };
        }
        const selectAfterInsert: any = {};
        selectAfterInsert.where = jest.fn().mockReturnValue(selectAfterInsert);
        selectAfterInsert.first = firstMock;
        return selectAfterInsert;
      });

      await model.create({
        sync_log_id: 'sync-1',
        change_type: FMSChangeType.TENANT_REMOVED,
        entity_type: 'tenant',
        external_id: 'ext-1',
        internal_id: 'user-1',
        before_data: { email: 'a@b.com' },
        after_data: null as any,
        required_actions: [],
        impact_summary: 'removed',
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(row.after_data).toBeNull();
    });
  });

  describe('findById — legacy is_valid', () => {
    it('treats null is_valid as valid (tenant_removed rows before explicit flag)', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table !== 'fms_changes') return {};
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(baseRow('id-legacy', { is_valid: null })),
        };
      });

      const change = await model.findById('id-legacy');
      expect(change).not.toBeNull();
      expect(change?.is_valid).toBe(true);
    });
  });

  describe('bulkCreate', () => {
    it('uses null after_data in insert rows when after_data is null', async () => {
      const orderByRawMock = jest.fn().mockImplementation((_sql: string, bindings: string[]) =>
        Promise.resolve(bindings.map((id) => baseRow(id, { after_data: null }))),
      );

      let fmsCalls = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table !== 'fms_changes') return {};
        fmsCalls += 1;
        if (fmsCalls === 1) {
          return {
            insert: jest.fn().mockImplementation(async (rows: any[]) => {
              capturedInsertBatches.push(rows);
              return [1];
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            orderByRaw: orderByRawMock,
          }),
        };
      });

      const out = await model.bulkCreate([
        {
          sync_log_id: 'sync-1',
          change_type: FMSChangeType.TENANT_REMOVED,
          entity_type: 'tenant',
          external_id: 'e1',
          internal_id: 'u1',
          before_data: { x: 1 },
          after_data: null as any,
          required_actions: [FMSChangeAction.DEACTIVATE_USER],
          impact_summary: 'r1',
        },
      ]);

      expect(capturedInsertBatches).toHaveLength(1);
      expect((capturedInsertBatches[0][0] as any).after_data).toBeNull();
      expect(out).toHaveLength(1);
      expect(out[0].after_data).toBeNull();
      expect(orderByRawMock).toHaveBeenCalledTimes(1);
      const rawArg = orderByRawMock.mock.calls[0][0] as string;
      expect(rawArg).toMatch(/^FIELD\(id,/);
      const bindings = orderByRawMock.mock.calls[0][1] as string[];
      expect(bindings).toHaveLength(1);
    });

    it('chunks inserts when more than 500 rows', async () => {
      const orderByRawMock = jest.fn().mockImplementation((_sql: string, bindings: string[]) =>
        Promise.resolve(bindings.map((id) => baseRow(id))),
      );

      let fmsCalls = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table !== 'fms_changes') return {};
        fmsCalls += 1;
        if (fmsCalls <= 2) {
          return {
            insert: jest.fn().mockImplementation(async (rows: any[]) => {
              capturedInsertBatches.push(rows);
              return [1];
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            orderByRaw: orderByRawMock,
          }),
        };
      });

      const items = Array.from({ length: 501 }, (_, i) => ({
        sync_log_id: 'sync-1',
        change_type: FMSChangeType.UNIT_ADDED,
        entity_type: 'unit' as const,
        external_id: `ext-${i}`,
        after_data: { unitNumber: String(i) },
        required_actions: [] as FMSChangeAction[],
        impact_summary: `u${i}`,
      }));

      await model.bulkCreate(items);

      expect(capturedInsertBatches).toHaveLength(2);
      expect(capturedInsertBatches[0]).toHaveLength(500);
      expect(capturedInsertBatches[1]).toHaveLength(1);
    });
  });

  describe('bulkMarkApplied', () => {
    it('returns 0 without querying when ids is empty', async () => {
      const n = await model.bulkMarkApplied([]);
      expect(n).toBe(0);
      expect(mockKnex).not.toHaveBeenCalled();
    });

    it('updates applied_at for the given ids in one statement', async () => {
      const whereInMock = jest.fn().mockReturnValue({
        update: jest.fn().mockResolvedValue(3),
      });
      mockKnex.mockImplementation((table: string) => {
        if (table !== 'fms_changes') return {};
        return {
          whereIn: whereInMock,
        };
      });

      const n = await model.bulkMarkApplied(['a', 'b', 'c']);
      expect(n).toBe(3);
      expect(whereInMock).toHaveBeenCalledWith('id', ['a', 'b', 'c']);
      const updateMock = whereInMock.mock.results[0].value.update as jest.Mock;
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ applied_at: expect.anything() }),
      );
    });
  });
});
