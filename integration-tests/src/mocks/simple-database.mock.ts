/**
 * Simple Database Mock for Integration Tests
 * 
 * This provides a simplified mock that focuses on the specific methods
 * needed for the widget layout tests.
 */

export class SimpleMockDatabaseService {
  private static instance: SimpleMockDatabaseService;
  private _tables: Map<string, any[]> = new Map();
  private _nextId: number = 1;

  private constructor() {
    this.initializeTables();
  }

  public static getInstance(): SimpleMockDatabaseService {
    if (!SimpleMockDatabaseService.instance) {
      SimpleMockDatabaseService.instance = new SimpleMockDatabaseService();
    }
    return SimpleMockDatabaseService.instance;
  }

  private initializeTables(): void {
    const tables = [
      'user_widget_layouts', 'default_widget_templates',
      'users', 'facilities', 'units', 'devices', 'gateways', 
      'key_sharing', 'access_history', 'user_facilities'
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
    
    const query = {
      where: (column: string, value: any) => {
        whereConditions.push({ column, operator: '=', value });
        return query;
      },
      
      whereIn: (column: string, values: any[]) => {
        whereConditions.push({ column, operator: 'in', value: values });
        return query;
      },
      
      whereNot: (column: string, value: any) => {
        whereConditions.push({ column, operator: '!=', value });
        return query;
      },
      
      whereNull: (column: string) => {
        whereConditions.push({ column, operator: 'null', value: null });
        return query;
      },
      
      whereNotNull: (column: string) => {
        whereConditions.push({ column, operator: 'not_null', value: null });
        return query;
      },
      
      whereExists: (callback: (query: any) => void) => {
        // Mock whereExists - for now just return the query as-is
        return query;
      },
      
      leftJoin: (tableName: string, firstColOrCallback: string | ((join: any) => void), operator?: string, secondCol?: string) => {
        // Mock left join - for now just return the query as-is
        return query;
      },
      
      join: (tableName: string, firstCol: string, operator: string, secondCol: string) => {
        // Mock inner join - for now just return the query as-is
        return query;
      },
      
      groupBy: (...columns: string[]) => {
        // Mock group by - for now just return the query as-is
        return query;
      },
      
      having: (column: string, operator: string, value: any) => {
        // Mock having clause - for now just return the query as-is
        return query;
      },
      
      from: (tableName: string) => {
        // Mock from clause - for now just return the query as-is
        return query;
      },
      
      raw: (sql: string) => {
        // Mock raw SQL - return a mock object that can be used in select
        return { toString: () => sql };
      },
      
      orderBy: (column: string, direction: 'asc' | 'desc' = 'asc') => {
        return query;
      },
      
      limit: (count: number) => {
        return query;
      },
      
      offset: (count: number) => {
        return query;
      },
      
      select: (...columns: string[]) => {
        return query;
      },
      
      first: async () => {
        // For individual user lookups, return mock user data
        if (tableName === 'users' && whereConditions.length === 1 && whereConditions[0].column === 'id') {
          const userId = whereConditions[0].value;
          
          // Return null for non-existent users to test 404 cases
          if (userId === 'non-existent') {
            return null;
          }
          
          const mockUser = {
            id: userId,
            email: `${userId}@example.com`,
            first_name: 'Test',
            last_name: 'User',
            role: 'admin',
            is_active: true,
            last_login: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            password: '$2b$10$hashedpassword'
          };
          return mockUser;
        }
        
        // For individual unit lookups, return mock unit data
        if (tableName === 'units' && whereConditions.length === 1 && whereConditions[0].column === 'id') {
          const unitId = whereConditions[0].value;
          
          // Return null for non-existent units to test 404 cases
          if (unitId === 'non-existent') {
            return null;
          }
          
          // Return the actual unit data from the seeded data
          const table = SimpleMockDatabaseService.getInstance().getTableData(tableName);
          console.log('Looking for unit:', unitId, 'in table:', table);
          const unit = table.find(u => u.id === unitId);
          console.log('Found unit:', unit);
          return unit || null;
        }
        
        const table = SimpleMockDatabaseService.getInstance().getTableData(tableName);
        const filtered = this.applyWhereConditions(table, whereConditions);
        return filtered[0] || null;
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
        
        // Return array of IDs to match Knex behavior for destructuring
        return newRecords.map(record => record.id);
      },
      
      update: async (data: any) => {
        const table = this._tables.get(tableName) || [];
        let updatedCount = 0;
        
        const updated = table.map(record => {
          const matches = this.checkWhereConditions(record, whereConditions);
          
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
        let deletedCount = 0;
        
        const remaining = table.filter(record => {
          const matches = this.checkWhereConditions(record, whereConditions);
          if (matches) {
            deletedCount++;
            return false;
          }
          return true;
        });
        
        this._tables.set(tableName, remaining);
        return deletedCount;
      },
      
      count: (column: string = 'id') => {
        const table = this._tables.get(tableName) || [];
        const filtered = this.applyWhereConditions(table, whereConditions);
        const result = [{ count: filtered.length }];
        
        // Return a query builder with first() method to match Knex behavior
        return {
          first: async () => result[0]
        };
      },
      
      // Promise methods
      then: (resolve: any, reject?: any) => {
        // For complex queries like getUsersWithFacilities, return mock data
        if (tableName === 'users' && whereConditions.length === 0) {
          const mockUsers = [
            {
              id: 'user-1',
              email: 'admin@example.com',
              first_name: 'Admin',
              last_name: 'User',
              role: 'admin',
              is_active: true,
              last_login: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
              facility_names: 'Main Storage Facility',
              facility_ids: 'facility-1'
            },
            {
              id: 'user-2',
              email: 'user@example.com',
              first_name: 'Regular',
              last_name: 'User',
              role: 'user',
              is_active: true,
              last_login: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
              facility_names: 'Main Storage Facility',
              facility_ids: 'facility-1'
            }
          ];
          return Promise.resolve(mockUsers).then(resolve, reject);
        }
        
        // For individual user lookups (where id = specific value)
        if (tableName === 'users' && whereConditions.length === 1 && whereConditions[0].column === 'id') {
          const userId = whereConditions[0].value;
          
          // Return null for non-existent users to test 404 cases
          if (userId === 'non-existent') {
            return Promise.resolve([]).then(resolve, reject);
          }
          
          const mockUser = {
            id: userId,
            email: `${userId}@example.com`,
            first_name: 'Test',
            last_name: 'User',
            role: 'admin',
            is_active: true,
            last_login: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            password: '$2b$10$hashedpassword'
          };
          return Promise.resolve([mockUser]).then(resolve, reject);
        }
        
        // For unit queries, return mock unit data with joins
        if (tableName === 'units') {
          const table = SimpleMockDatabaseService.getInstance().getTableData(tableName);
          console.log('Unit query - table data:', table);
          const mockUnits = table.map(unit => ({
            ...unit,
            facility_name: 'Main Storage Facility',
            primary_tenant_id: null,
            primary_tenant_firstName: null,
            primary_tenant_lastName: null,
            primary_tenant_email: null,
            blulok_device_id: null,
            device_serial: null,
            lock_status: null,
            device_status: null,
            battery_level: null
          }));
          console.log('Unit query - mock units:', mockUnits);
          return Promise.resolve(mockUnits).then(resolve, reject);
        }
        
        const table = this._tables.get(tableName) || [];
        const filtered = this.applyWhereConditions(table, whereConditions);
        return Promise.resolve(filtered).then(resolve, reject);
      },
      
      catch: (reject: any) => {
        const table = this._tables.get(tableName) || [];
        const filtered = this.applyWhereConditions(table, whereConditions);
        return Promise.resolve(filtered).catch(reject);
      },
      
      finally: (callback: any) => {
        const table = this._tables.get(tableName) || [];
        const filtered = this.applyWhereConditions(table, whereConditions);
        return Promise.resolve(filtered).finally(callback);
      }
    };
    
    return query;
  }

  private applyWhereConditions(records: any[], conditions: Array<{column: string, operator: string, value: any}>): any[] {
    if (conditions.length === 0) {
      return records;
    }
    
    return records.filter(record => this.checkWhereConditions(record, conditions));
  }

  private checkWhereConditions(record: any, conditions: Array<{column: string, operator: string, value: any}>): boolean {
    return conditions.every(condition => {
      switch (condition.operator) {
        case '=':
          return record[condition.column] === condition.value;
        case '!=':
          return record[condition.column] !== condition.value;
        case 'in':
          return condition.value.includes(record[condition.column]);
        case 'null':
          return record[condition.column] === null || record[condition.column] === undefined;
        case 'not_null':
          return record[condition.column] !== null && record[condition.column] !== undefined;
        default:
          return true;
      }
    });
  }

  private generateId(): string {
    return `mock-${this._nextId++}`;
  }

  // Helper methods for test setup
  public seedTable(tableName: string, data: any[]): void {
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

  public getTableData(tableName: string): any[] {
    return this._tables.get(tableName) || [];
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  public async close(): Promise<void> {
    this.clearAllTables();
  }
}
