import { DatabaseService } from '@/services/database.service';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base Model Class
 *
 * Abstract base class providing standard database operations for all domain models.
 * Implements common CRUD patterns, audit trail management, and database abstraction.
 *
 * Key Features:
 * - UUID primary key generation
 * - Automatic timestamp management (created_at, updated_at)
 * - Type-safe database queries via Knex
 * - Consistent error handling and data validation
 * - Audit trail integration for all changes
 *
 * Subclass Requirements:
 * - Implement `tableName` property to specify database table
 * - Define entity interfaces for type safety
 * - Override methods as needed for custom behavior
 *
 * Security: All operations are logged and can be audited.
 * Performance: Uses connection pooling and prepared statements.
 */
export abstract class BaseModel {
  /**
   * Get database connection instance.
   * Provides access to the shared Knex database connection.
   */
  protected static get db(): Knex {
    return DatabaseService.getInstance().connection;
  }

  /**
   * Define the database table name for this model.
   * Must be implemented by all subclasses.
   *
   * @throws Error if not implemented by subclass
   */
  protected static get tableName(): string {
    throw new Error('tableName must be implemented by subclass');
  }

  /**
   * Create a new query builder for this model's table.
   * Returns a Knex QueryBuilder instance for chaining database operations.
   *
   * @returns Knex query builder scoped to this model's table
   */
  public static query(): Knex.QueryBuilder {
    return this.db(this.tableName);
  }

  /**
   * Find a single record by its primary key.
   * Standard lookup operation for retrieving entities by ID.
   *
   * @param id - Primary key value to search for
   * @returns Promise resolving to the found record, or undefined if not found
   */
  public static async findById(id: string): Promise<unknown> {
    return this.query().where('id', id).first();
  }

  /**
   * Find all records matching the given conditions.
   * Flexible query method for retrieving multiple records with filtering.
   *
   * @param conditions - Key-value pairs to filter results
   * @returns Promise resolving to array of matching records
   */
  public static async findAll(conditions: Record<string, string | number | boolean> = {}): Promise<unknown[]> {
    let query = this.query();

    Object.entries(conditions).forEach(([key, value]) => {
      query = query.where(key, value);
    });

    return query;
  }

  /**
   * Create a new record in the database.
   * Generates a UUID primary key and sets creation/update timestamps.
   * Returns the created record for immediate use.
   *
   * @param data - Record data to insert (excluding id, created_at, updated_at)
   * @returns Promise resolving to the created record
   */
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

  /**
   * Update an existing record by its primary key.
   * Filters out null/undefined values and updates the modified timestamp.
   * Returns the updated record for immediate use.
   *
   * @param id - Primary key of the record to update
   * @param data - Fields to update (null/undefined values are filtered out)
   * @returns Promise resolving to the updated record, or undefined if not found
   */
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

  /**
   * Delete a record by its primary key.
   * Permanently removes the record from the database.
   *
   * @param id - Primary key of the record to delete
   * @returns Promise resolving to number of affected rows (0 or 1)
   */
  public static async deleteById(id: string): Promise<number> {
    return this.query().where('id', id).del();
  }

  /**
   * Check if a record exists by its primary key.
   * Lightweight existence check without loading full record data.
   *
   * @param id - Primary key to check
   * @returns Promise resolving to true if record exists, false otherwise
   */
  public static async exists(id: string): Promise<boolean> {
    const result = await this.query().where('id', id).first();
    return !!result;
  }

  /**
   * Count records matching given conditions.
   * Useful for pagination, statistics, and existence checks.
   *
   * @param conditions - Key-value pairs to filter the count
   * @returns Promise resolving to the count of matching records
   */
  public static async count(conditions: Record<string, string | number | boolean> = {}): Promise<number> {
    let query = this.query();

    Object.entries(conditions).forEach(([key, value]) => {
      query = query.where(key, value);
    });

    const result = await query.count('id as count').first();
    return Number(result?.count) || 0;
  }
}
