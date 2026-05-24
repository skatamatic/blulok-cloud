import { randomUUID } from 'crypto';
import { BaseModel } from './base.model';
import { WidgetTypeHelper } from '@/types/widget.types';
import {
  UserDashboardPageModel,
  UserDashboardPage,
} from './user-dashboard-page.model';

export interface UserWidgetLayout {
  id: string;
  user_id: string;
  page_id: string;
  widget_id: string;
  widget_type: string;
  layout_config: {
    position: { x: number; y: number; w: number; h: number };
    size: string;
    [key: string]: unknown;
  };
  is_visible: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface DefaultWidgetTemplate {
  id: string;
  widget_id: string;
  widget_type: string;
  name: string;
  description?: string;
  default_config: {
    position: { x: number; y: number; w: number; h: number };
    size: string;
    [key: string]: unknown;
  };
  available_sizes: string[];
  required_permissions?: string[];
  is_active: boolean;
  default_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardWidgetPayload {
  widgetId: string;
  widgetType?: string;
  config?: Record<string, unknown>;
  layoutConfig: Record<string, unknown>;
  displayOrder: number;
  isVisible?: boolean;
}

export interface DashboardPagePayload {
  id?: string;
  name?: string;
  pageOrder: number;
  widgets: DashboardWidgetPayload[];
}

export class UserWidgetLayoutModel extends BaseModel {
  protected static override get tableName(): string {
    return 'user_widget_layouts';
  }

  public static async findByUserId(userId: string): Promise<UserWidgetLayout[]> {
    return this.query()
      .where('user_id', userId)
      .where('is_visible', true)
      .orderBy('display_order', 'asc') as Promise<UserWidgetLayout[]>;
  }

  public static async findByUserAndPage(
    userId: string,
    pageId: string
  ): Promise<UserWidgetLayout[]> {
    return this.query()
      .where('user_id', userId)
      .where('page_id', pageId)
      .where('is_visible', true)
      .orderBy('display_order', 'asc') as Promise<UserWidgetLayout[]>;
  }

  public static async resolvePageId(
    userId: string,
    pageId?: string
  ): Promise<string> {
    if (pageId) {
      const page = await UserDashboardPageModel.findByIdForUser(pageId, userId);
      if (page) return page.id;
    }
    const fallback = await UserDashboardPageModel.ensureDefaultPage(userId);
    return fallback.id;
  }

  public static async findPagesWithWidgets(userId: string): Promise<{
    pages: UserDashboardPage[];
    widgetsByPageId: Map<string, UserWidgetLayout[]>;
  }> {
    let pages = await UserDashboardPageModel.findByUserId(userId);
    if (pages.length === 0) {
      const defaultPage = await UserDashboardPageModel.ensureDefaultPage(userId);
      pages = [defaultPage];
    }

    const allWidgets = await this.query()
      .where('user_id', userId)
      .where('is_visible', true)
      .orderBy('display_order', 'asc') as UserWidgetLayout[];

    const widgetsByPageId = new Map<string, UserWidgetLayout[]>();
    for (const page of pages) {
      widgetsByPageId.set(page.id, []);
    }

    const fallbackPageId = pages[0]?.id;
    for (const widget of allWidgets) {
      let list = widgetsByPageId.get(widget.page_id);
      if (!list && fallbackPageId) {
        list = widgetsByPageId.get(fallbackPageId);
      }
      if (list) {
        list.push(widget);
      }
    }
    return { pages, widgetsByPageId };
  }

  public static async findByUserAndWidget(
    userId: string,
    widgetId: string,
    pageId?: string
  ): Promise<UserWidgetLayout | undefined> {
    const q = this.query()
      .where('user_id', userId)
      .where('widget_id', widgetId);
    if (pageId) {
      q.where('page_id', pageId);
    }
    return q.first() as Promise<UserWidgetLayout | undefined>;
  }

  public static async saveUserLayout(
    userId: string,
    pageId: string,
    widgetId: string,
    layoutConfig: Record<string, unknown>
  ): Promise<UserWidgetLayout> {
    const existing = await this.findByUserAndWidget(userId, widgetId, pageId);

    if (existing) {
      const updated = await this.updateById(existing.id, {
        layout_config: JSON.stringify(layoutConfig),
        updated_at: this.db.fn.now(),
      }) as UserWidgetLayout;
      return updated;
    }

    const created = await this.create({
      user_id: userId,
      page_id: pageId,
      widget_id: widgetId,
      widget_type: this.extractWidgetType(widgetId),
      layout_config: JSON.stringify(layoutConfig),
      is_visible: true,
      display_order: 0,
    }) as UserWidgetLayout;
    return created;
  }

  /** Legacy bulk save — assigns all widgets to the user's first page. */
  public static async saveUserLayouts(
    userId: string,
    layouts: Array<{
      widgetId: string;
      widgetType?: string;
      config?: Record<string, unknown>;
      layoutConfig: Record<string, unknown>;
      displayOrder: number;
      isVisible?: boolean;
    }>
  ): Promise<void> {
    const page = await UserDashboardPageModel.ensureDefaultPage(userId);
    await this.saveDashboardState(userId, [
      {
        id: page.id,
        name: page.name,
        pageOrder: page.page_order,
        widgets: layouts,
      },
    ]);
  }

  public static async saveDashboardState(
    userId: string,
    pages: DashboardPagePayload[]
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const existingPages = await trx('user_dashboard_pages')
        .where('user_id', userId)
        .orderBy('page_order', 'asc');

      const keepPageIds: string[] = [];
      const sortedPages = [...pages].sort(
        (a, b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0)
      );

      for (let i = 0; i < sortedPages.length; i++) {
        const pagePayload = sortedPages[i];
        const pageOrder = pagePayload.pageOrder ?? i;
        const name = pagePayload.name ?? `Page ${pageOrder + 1}`;

        let pageId = pagePayload.id;
        if (pageId) {
          const existing = existingPages.find((p) => p.id === pageId);
          if (existing) {
            await trx('user_dashboard_pages')
              .where('id', pageId)
              .update({
                name,
                page_order: pageOrder,
                updated_at: trx.fn.now(),
              });
          } else {
            pageId = undefined;
          }
        }

        if (!pageId) {
          pageId = randomUUID();
          await trx('user_dashboard_pages').insert({
            id: pageId,
            user_id: userId,
            name,
            page_order: pageOrder,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }

        keepPageIds.push(pageId);

        const widgetIdsInPayload = new Set(
          pagePayload.widgets.map((w) => w.widgetId)
        );

        await trx('user_widget_layouts')
          .where('user_id', userId)
          .where('page_id', pageId)
          .whereNotIn('widget_id', [...widgetIdsInPayload])
          .del();

        for (const layout of pagePayload.widgets) {
          const fullLayoutConfig = {
            ...layout.layoutConfig,
            config: layout.config,
          };
          const layoutConfigJson = JSON.stringify(fullLayoutConfig);
          const widgetType =
            layout.widgetType || this.extractWidgetType(layout.widgetId);

          const existing = await trx('user_widget_layouts')
            .where('user_id', userId)
            .where('page_id', pageId)
            .where('widget_id', layout.widgetId)
            .first();

          if (existing) {
            await trx('user_widget_layouts')
              .where('id', existing.id)
              .update({
                widget_type: widgetType,
                layout_config: layoutConfigJson,
                display_order: layout.displayOrder,
                is_visible:
                  layout.isVisible !== undefined ? layout.isVisible : true,
                updated_at: trx.fn.now(),
              });
          } else {
            try {
              await trx('user_widget_layouts').insert({
                user_id: userId,
                page_id: pageId,
                widget_id: layout.widgetId,
                widget_type: widgetType,
                layout_config: layoutConfigJson,
                is_visible:
                  layout.isVisible !== undefined ? layout.isVisible : true,
                display_order: layout.displayOrder,
                created_at: trx.fn.now(),
                updated_at: trx.fn.now(),
              });
            } catch (insertError: unknown) {
              const err = insertError as { code?: string };
              if (err.code === 'ER_DUP_ENTRY') {
                await trx('user_widget_layouts')
                  .where('user_id', userId)
                  .where('page_id', pageId)
                  .where('widget_id', layout.widgetId)
                  .update({
                    widget_type: widgetType,
                    layout_config: layoutConfigJson,
                    display_order: layout.displayOrder,
                    is_visible:
                      layout.isVisible !== undefined ? layout.isVisible : true,
                    updated_at: trx.fn.now(),
                  });
              } else {
                throw insertError;
              }
            }
          }
        }
      }

      if (keepPageIds.length > 0) {
        await trx('user_dashboard_pages')
          .where('user_id', userId)
          .whereNotIn('id', keepPageIds)
          .del();
      }
    });
  }

  public static async hideWidget(
    userId: string,
    widgetId: string,
    pageId?: string
  ): Promise<void> {
    const resolvedPageId = await this.resolvePageId(userId, pageId);
    await this.query()
      .where('user_id', userId)
      .where('page_id', resolvedPageId)
      .where('widget_id', widgetId)
      .update({
        is_visible: false,
        updated_at: this.db.fn.now(),
      });
  }

  public static async showWidget(
    userId: string,
    widgetId: string,
    pageId?: string
  ): Promise<void> {
    const resolvedPageId = await this.resolvePageId(userId, pageId);
    await this.query()
      .where('user_id', userId)
      .where('page_id', resolvedPageId)
      .where('widget_id', widgetId)
      .update({
        is_visible: true,
        updated_at: this.db.fn.now(),
      });
  }

  public static async resetToDefaults(userId: string): Promise<void> {
    await this.clearUserDashboard(userId);
  }

  /** Remove all personal dashboard pages/widgets (revert to assigned or system default). */
  public static async clearUserDashboard(userId: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('user_widget_layouts').where('user_id', userId).del();
      await trx('user_dashboard_pages').where('user_id', userId).del();
    });
  }

  public static extractWidgetType(widgetId: string): string {
    return WidgetTypeHelper.extractWidgetTypeFromId(widgetId);
  }
}

export class DefaultWidgetTemplateModel extends BaseModel {
  protected static override get tableName(): string {
    return 'default_widget_templates';
  }

  public static async findActive(): Promise<DefaultWidgetTemplate[]> {
    return this.query()
      .where('is_active', true)
      .orderBy('default_order', 'asc') as Promise<DefaultWidgetTemplate[]>;
  }

  public static async findByWidgetId(
    widgetId: string
  ): Promise<DefaultWidgetTemplate | undefined> {
    return this.query()
      .where('widget_id', widgetId)
      .where('is_active', true)
      .first() as Promise<DefaultWidgetTemplate | undefined>;
  }

  public static async findByType(
    widgetType: string
  ): Promise<DefaultWidgetTemplate[]> {
    return this.query()
      .where('widget_type', widgetType)
      .where('is_active', true)
      .orderBy('default_order', 'asc') as Promise<DefaultWidgetTemplate[]>;
  }

  public static async getAvailableForUser(
    userRole: string
  ): Promise<DefaultWidgetTemplate[]> {
    const allTemplates = await this.findActive();

    return allTemplates.filter((template) => {
      if (
        !template.required_permissions ||
        template.required_permissions.length === 0
      ) {
        return true;
      }

      return template.required_permissions.includes(userRole);
    });
  }
}
