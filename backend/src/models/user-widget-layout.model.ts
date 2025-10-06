import { BaseModel } from './base.model';
import { WidgetTypeHelper } from '@/types/widget.types';

export interface UserWidgetLayout {
  id: string;
  user_id: string;
  widget_id: string;
  widget_type: string;
  layout_config: {
    position: { x: number; y: number; w: number; h: number };
    size: string;
    [key: string]: any;
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
    [key: string]: any;
  };
  available_sizes: string[];
  required_permissions?: string[];
  is_active: boolean;
  default_order: number;
  created_at: Date;
  updated_at: Date;
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

  public static async findByUserAndWidget(userId: string, widgetId: string): Promise<UserWidgetLayout | undefined> {
    return this.query()
      .where('user_id', userId)
      .where('widget_id', widgetId)
      .first() as Promise<UserWidgetLayout | undefined>;
  }

  public static async saveUserLayout(userId: string, widgetId: string, layoutConfig: any): Promise<UserWidgetLayout> {
    const existing = await this.findByUserAndWidget(userId, widgetId);
    
    if (existing) {
      // Update existing layout
      const updated = await this.updateById(existing.id, {
        layout_config: JSON.stringify(layoutConfig),
        updated_at: this.db.fn.now(),
      }) as UserWidgetLayout;
      return updated;
    } else {
      // Create new layout
      const created = await this.create({
        user_id: userId,
        widget_id: widgetId,
        widget_type: this.extractWidgetType(widgetId),
        layout_config: JSON.stringify(layoutConfig),
        is_visible: true,
        display_order: 0,
      }) as UserWidgetLayout;
      return created;
    }
  }

  public static async saveUserLayouts(userId: string, layouts: Array<{
    widgetId: string;
    layoutConfig: any;
    displayOrder: number;
    isVisible?: boolean;
  }>): Promise<void> {
        // saveUserLayouts called
    
    // Use transaction for atomic updates
    await this.db.transaction(async (trx) => {
      for (const layout of layouts) {
        try {
          // Processing layout
          
          const existing = await trx('user_widget_layouts')
            .where('user_id', userId)
            .where('widget_id', layout.widgetId)
            .first();

          if (existing) {
            // Updating existing layout for widget
            // Explicitly serialize the layoutConfig to JSON string
            const layoutConfigJson = JSON.stringify(layout.layoutConfig);
            
            await trx('user_widget_layouts')
              .where('id', existing.id)
              .update({
                layout_config: layoutConfigJson,
                display_order: layout.displayOrder,
                is_visible: layout.isVisible !== undefined ? layout.isVisible : true,
                updated_at: trx.fn.now(),
              });
          } else {
            // Creating new layout for widget
            const widgetType = this.extractWidgetType(layout.widgetId);
            
            // Explicitly serialize the layoutConfig to JSON string
            const layoutConfigJson = JSON.stringify(layout.layoutConfig);
            
            try {
              await trx('user_widget_layouts').insert({
                user_id: userId,
                widget_id: layout.widgetId,
                widget_type: widgetType,
                layout_config: layoutConfigJson,
                is_visible: layout.isVisible !== undefined ? layout.isVisible : true,
                display_order: layout.displayOrder,
                created_at: trx.fn.now(),
                updated_at: trx.fn.now(),
              });
            } catch (insertError: any) {
              // If duplicate entry error, try to update instead
              if (insertError.code === 'ER_DUP_ENTRY') {
                console.log(`Duplicate entry detected for widget ${layout.widgetId}, updating instead`);
                await trx('user_widget_layouts')
                  .where('user_id', userId)
                  .where('widget_id', layout.widgetId)
                  .update({
                    layout_config: layoutConfigJson,
                    display_order: layout.displayOrder,
                    is_visible: layout.isVisible !== undefined ? layout.isVisible : true,
                    updated_at: trx.fn.now(),
                  });
              } else {
                throw insertError;
              }
            }
          }
        } catch (error) {
          console.error('Error processing layout:', layout, error);
          throw error;
        }
      }
    });
    
    // saveUserLayouts completed successfully
  }

  public static async hideWidget(userId: string, widgetId: string): Promise<void> {
    await this.query()
      .where('user_id', userId)
      .where('widget_id', widgetId)
      .update({
        is_visible: false,
        updated_at: this.db.fn.now(),
      });
  }

  public static async showWidget(userId: string, widgetId: string): Promise<void> {
    await this.query()
      .where('user_id', userId)
      .where('widget_id', widgetId)
      .update({
        is_visible: true,
        updated_at: this.db.fn.now(),
      });
  }

  public static async resetToDefaults(userId: string): Promise<void> {
    // Delete all user layouts to fall back to defaults
    await this.query()
      .where('user_id', userId)
      .del();
  }

  public static extractWidgetType(widgetId: string): string {
    // Use the shared widget type helper for consistent type extraction
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

  public static async findByWidgetId(widgetId: string): Promise<DefaultWidgetTemplate | undefined> {
    return this.query()
      .where('widget_id', widgetId)
      .where('is_active', true)
      .first() as Promise<DefaultWidgetTemplate | undefined>;
  }

  public static async findByType(widgetType: string): Promise<DefaultWidgetTemplate[]> {
    return this.query()
      .where('widget_type', widgetType)
      .where('is_active', true)
      .orderBy('default_order', 'asc') as Promise<DefaultWidgetTemplate[]>;
  }

  public static async getAvailableForUser(userRole: string): Promise<DefaultWidgetTemplate[]> {
    const allTemplates = await this.findActive();
    
    return allTemplates.filter(template => {
      if (!template.required_permissions || template.required_permissions.length === 0) {
        return true; // No permissions required
      }
      
      return template.required_permissions.includes(userRole);
    });
  }
}
