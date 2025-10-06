/**
 * Mock Database Service for Integration Tests
 * 
 * This provides a complete mock implementation of the database layer
 * that allows us to test the full API without requiring a real database.
 */

import { Knex } from 'knex';

export interface MockRecord {
  id: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}

export class MockDatabaseService {
  private static instance: MockDatabaseService;
  private _tables: Map<string, MockRecord[]> = new Map();
  private _nextId: number = 1;

  private constructor() {
    this.initializeTables();
  }

  public static getInstance(): MockDatabaseService {
    if (!MockDatabaseService.instance) {
      MockDatabaseService.instance = new MockDatabaseService();
    }
    return MockDatabaseService.instance;
  }

  private initializeTables(): void {
    // Initialize all tables with empty arrays
    const tables = [
      'users', 'facilities', 'units', 'devices', 'gateways', 
      'key_sharing', 'access_history', 'user_facilities', 'widget_layouts'
    ];
    
    tables.forEach(table => {
      this._tables.set(table, []);
    });
  }

  public get connection(): any {
    return this.createMockKnex();
  }

  private createMockKnex(): any {
    const knexInstance = (tableName: string) => {
      return this.createMockQueryBuilder(tableName);
    };
    
    // Add transaction support
    knexInstance.transaction = async (callback: (trx: any) => Promise<any>) => {
      // Create a transaction-like object that behaves like the main knex instance
      const trx = (tableName: string) => {
        return this.createMockQueryBuilder(tableName);
      };
      
      // Copy all methods from the main instance
      Object.assign(trx, knexInstance);
      
      return callback(trx);
    };
    
    // Add raw method
    knexInstance.raw = async (sql: string) => {
      if (sql.includes('SELECT 1')) {
        return [{ '1': 1 }];
      }
      return [];
    };
    
    // Add fn helper
    knexInstance.fn = {
      now: () => new Date().toISOString()
    };
    
    return knexInstance;
  }

  private createMockQueryBuilder(tableName: string): any {
    const whereConditions: Array<{column: string, operator: string, value: any}> = [];
    
    let query = {
      where: (column: string, value: any) => {
        whereConditions.push({ column, operator: '=', value });
        return this.createMockQueryBuilder(tableName);
      },
      
      whereIn: (column: string, values: any[]) => {
        const table = this._tables.get(tableName) || [];
        const filtered = table.filter(record => values.includes(record[column]));
        return this.createMockQueryBuilder(tableName).setData(filtered);
      },
      
      whereNot: (column: string, value: any) => {
        const table = this._tables.get(tableName) || [];
        const filtered = table.filter(record => record[column] !== value);
        return this.createMockQueryBuilder(tableName).setData(filtered);
      },
      
      whereNull: (column: string) => {
        const table = this._tables.get(tableName) || [];
        const filtered = table.filter(record => record[column] === null || record[column] === undefined);
        return this.createMockQueryBuilder(tableName).setData(filtered);
      },
      
      whereNotNull: (column: string) => {
        const table = this._tables.get(tableName) || [];
        const filtered = table.filter(record => record[column] !== null && record[column] !== undefined);
        return this.createMockQueryBuilder(tableName).setData(filtered);
      },
      
      orderBy: (column: string, direction: 'asc' | 'desc' = 'asc') => {
        const table = this._tables.get(tableName) || [];
        const sorted = [...table].sort((a, b) => {
          if (direction === 'desc') {
            return a[column] > b[column] ? -1 : 1;
          }
          return a[column] < b[column] ? -1 : 1;
        });
        return this.createMockQueryBuilder(tableName).setData(sorted);
      },
      
      limit: (count: number) => {
        const table = this._tables.get(tableName) || [];
        const limited = table.slice(0, count);
        return this.createMockQueryBuilder(tableName).setData(limited);
      },
      
      offset: (count: number) => {
        const table = this._tables.get(tableName) || [];
        const offset = table.slice(count);
        return this.createMockQueryBuilder(tableName).setData(offset);
      },
      
      select: (...columns: string[]) => {
        // For simplicity, we'll return all columns
        return this.createMockQueryBuilder(tableName);
      },
      
      first: async () => {
        const table = this._tables.get(tableName) || [];
        return table[0] || null;
      },
      
      insert: async (data: any | any[]) => {
        const table = this._tables.get(tableName) || [];
        const records = Array.isArray(data) ? data : [data];
        
        const newRecords = records.map(record => ({
          id: this.generateId(),
          created_at: new Date(),
          updated_at: new Date(),
          ...record
        }));
        
        table.push(...newRecords);
        this._tables.set(tableName, table);
        return newRecords;
      },
      
      update: async (data: any) => {
        const table = this._tables.get(tableName) || [];
        let updatedCount = 0;
        
        // Apply updates to matching records
        const updated = table.map(record => {
          // Check if this record matches the where conditions
          const matches = whereConditions.every(condition => {
            if (condition.operator === '=') {
              return record[condition.column] === condition.value;
            } else if (condition.operator === '!=') {
              return record[condition.column] !== condition.value;
            }
            return false;
          });
          
          if (matches) {
            updatedCount++;
            return {
              ...record,
              ...data,
              updated_at: new Date()
            };
          }
          return record;
        });
        
        this._tables.set(tableName, updated);
        return updatedCount;
      },
      
      del: async () => {
        const table = this._tables.get(tableName) || [];
        const deleted = table.length;
        this._tables.set(tableName, []);
        return deleted;
      },
      
      count: async (column: string = 'id') => {
        const table = this._tables.get(tableName) || [];
        return [{ count: table.length }];
      },
      
      raw: async (sql: string) => {
        // Mock raw SQL execution
        if (sql.includes('SELECT 1')) {
          return [{ '1': 1 }];
        }
        return [];
      },
      
      // Promise methods
      then: (resolve: any, reject?: any) => {
        const table = this._tables.get(tableName) || [];
        return Promise.resolve(table).then(resolve, reject);
      },
      
      catch: (reject: any) => {
        const table = this._tables.get(tableName) || [];
        return Promise.resolve(table).catch(reject);
      },
      
      finally: (callback: any) => {
        const table = this._tables.get(tableName) || [];
        return Promise.resolve(table).finally(callback);
      },
      
      setData: (data: MockRecord[]) => {
        return this.createMockQueryBuilder(tableName).setData(data);
      }
    };
    
    return query;
  }

  private generateId(): string {
    return `mock-${this._nextId++}`;
  }

  // Helper methods for test setup
  public seedTable(tableName: string, data: Partial<MockRecord>[]): void {
    const table = this._tables.get(tableName) || [];
    const records = data.map(record => ({
      id: this.generateId(),
      created_at: new Date(),
      updated_at: new Date(),
      ...record
    }));
    table.push(...records);
    this._tables.set(tableName, table);
  }

  public clearTable(tableName: string): void {
    this._tables.set(tableName, []);
  }

  public clearAllTables(): void {
    this.initializeTables();
  }

  public getTableData(tableName: string): MockRecord[] {
    return this._tables.get(tableName) || [];
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async close(): Promise<void> {
    this.clearAllTables();
  }
}

// Mock Knex instance
export const mockKnex = {
  raw: async (sql: string) => {
    if (sql.includes('SELECT 1')) {
      return [{ '1': 1 }];
    }
    return [];
  }
};
