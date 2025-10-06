import { DatabaseService } from '@/services/database.service';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export abstract class BaseModel {
  protected static get db(): Knex {
    return DatabaseService.getInstance().connection;
  }

  protected static get tableName(): string {
    throw new Error('tableName must be implemented by subclass');
  }

  public static query(): Knex.QueryBuilder {
    return this.db(this.tableName);
  }

  public static async findById(id: string): Promise<unknown> {
    return this.query().where('id', id).first();
  }

  public static async findAll(conditions: Record<string, string | number | boolean> = {}): Promise<unknown[]> {
    let query = this.query();
    
    Object.entries(conditions).forEach(([key, value]) => {
      query = query.where(key, value);
    });
    
    return query;
  }

  public static async create(data: Record<string, unknown>): Promise<unknown> {
    // Generate UUID in application code to ensure we can return the created record
    const id = uuidv4();
    
    await this.query().insert({
      id,
      ...data,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
    
    // Return the created record
    return this.findById(id);
  }

  public static async updateById(id: string, data: Record<string, unknown>): Promise<unknown> {
    // Filter out undefined and null values to prevent SQL syntax errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null)
    );
    
    await this.query()
      .where('id', id)
      .update({
        ...cleanData,
        updated_at: this.db.fn.now(),
      });
    
    return this.findById(id);
  }

  public static async deleteById(id: string): Promise<number> {
    return this.query().where('id', id).del();
  }

  public static async exists(id: string): Promise<boolean> {
    const result = await this.query().where('id', id).first();
    return !!result;
  }

  public static async count(conditions: Record<string, string | number | boolean> = {}): Promise<number> {
    let query = this.query();
    
    Object.entries(conditions).forEach(([key, value]) => {
      query = query.where(key, value);
    });
    
    const result = await query.count('id as count').first();
    return Number(result?.count) || 0;
  }
}
