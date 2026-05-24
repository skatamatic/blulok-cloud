import { BaseModel } from './base.model';

export interface UserDashboardPage {
  id: string;
  user_id: string;
  name: string;
  page_order: number;
  created_at: Date;
  updated_at: Date;
}

export class UserDashboardPageModel extends BaseModel {
  protected static override get tableName(): string {
    return 'user_dashboard_pages';
  }

  public static async findByUserId(userId: string): Promise<UserDashboardPage[]> {
    return this.query()
      .where('user_id', userId)
      .orderBy('page_order', 'asc') as Promise<UserDashboardPage[]>;
  }

  public static async findByIdForUser(
    pageId: string,
    userId: string
  ): Promise<UserDashboardPage | undefined> {
    return this.query()
      .where('id', pageId)
      .where('user_id', userId)
      .first() as Promise<UserDashboardPage | undefined>;
  }

  public static async createPage(
    userId: string,
    name: string,
    pageOrder: number
  ): Promise<UserDashboardPage> {
    return this.create({
      user_id: userId,
      name,
      page_order: pageOrder,
    }) as Promise<UserDashboardPage>;
  }

  public static async ensureDefaultPage(userId: string): Promise<UserDashboardPage> {
    const existing = await this.findByUserId(userId);
    if (existing.length > 0) {
      return existing[0];
    }
    return this.createPage(userId, 'Main', 0);
  }

  public static async deletePagesNotIn(
    userId: string,
    keepPageIds: string[]
  ): Promise<void> {
    const q = this.query().where('user_id', userId);
    if (keepPageIds.length > 0) {
      q.whereNotIn('id', keepPageIds);
    }
    await q.del();
  }
}
