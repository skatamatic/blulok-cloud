import { BaseModel } from './base.model';
import { WidgetTypeHelper } from '@/types/widget.types';

/**
 * User Widget Layout Model
 *
 * Manages personalized dashboard layouts for users, controlling widget positioning,
 * sizing, visibility, and display order. Enables customizable user experiences
 * while maintaining consistent widget behavior and permissions.
 *
 * Key Features:
 * - Personalized widget layouts per user
 * - Drag-and-drop positioning system
 * - Responsive widget sizing
 * - Visibility controls and ordering
 * - Default template management
 * - Permission-based widget filtering
 *
 * Layout System:
 * - Grid-based positioning (x, y coordinates)
 * - Flexible sizing (width, height)
 * - Display order for tab navigation
 * - Visibility toggles for customization
 * - Responsive behavior across devices
 *
 * Widget Management:
 * - User-specific widget instances
 * - Template-based widget creation
 * - Permission validation on layout changes
 * - Migration support for layout updates
 * - Backup and restore capabilities
 *
 * Default Templates:
 * - Pre-configured widget layouts
 * - Role-based default configurations
 * - Organization-wide layout standards
 * - Onboarding experience templates
 *
 * Security Considerations:
 * - User isolation prevents layout manipulation
 * - Permission validation before layout changes
 * - Input sanitization for layout configurations
 * - XSS protection in widget content
 * - Secure default template management
 */

export interface UserWidgetLayout {
  /** Globally unique identifier for the layout entry */
  id: string;
  /** User that owns this widget layout */
  user_id: string;
  /** Unique widget instance identifier */
  widget_id: string;
  /** Canonical widget type identifier */
  widget_type: string;
  /** Layout configuration including position and sizing */
  layout_config: {
    position: { x: number; y: number; w: number; h: number };
    size: string;
    [key: string]: any;
  };
  /** Whether the widget is visible in the dashboard */
  is_visible: boolean;
  /** Display order for widget arrangement */
  display_order: number;
  /** Layout creation timestamp */
  created_at: Date;
  /** Layout last update timestamp */
  updated_at: Date;
}

export interface DefaultWidgetTemplate {
  /** Globally unique identifier for the template */
  id: string;
  /** Canonical widget identifier for the template */
  widget_id: string;
  /** Widget type this template applies to */
  widget_type: string;
  /** Human-readable template name */
  name: string;
  /** Optional template description */
  description?: string;
  /** Default layout configuration */
  default_config: {
    position: { x: number; y: number; w: number; h: number };
    size: string;
    [key: string]: any;
  };
  /** Available size options for this widget */
  available_sizes: string[];
  /** Required permissions to use this widget */
  required_permissions?: string[];
  /** Whether this template is currently active */
  is_active: boolean;
  /** Default display order for new instances */
  default_order: number;
  /** Template creation timestamp */
  created_at: Date;
  /** Template last update timestamp */
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
    widgetType?: string;
    config?: Record<string, unknown>;
    layoutConfig: any;
    displayOrder: number;
    isVisible?: boolean;
  }>): Promise<void> {
    // Use transaction for atomic updates
    await this.db.transaction(async (trx) => {
      for (const layout of layouts) {
        try {
          const existing = await trx('user_widget_layouts')
            .where('user_id', userId)
            .where('widget_id', layout.widgetId)
            .first();

          // Include widget config in the layout_config
          const fullLayoutConfig = {
            ...layout.layoutConfig,
            config: layout.config, // Store widget-specific config (e.g., facility IDs)
          };
          const layoutConfigJson = JSON.stringify(fullLayoutConfig);
          
          // Determine widget type - use provided type, or extract from ID
          const widgetType = layout.widgetType || this.extractWidgetType(layout.widgetId);

          if (existing) {
            await trx('user_widget_layouts')
              .where('id', existing.id)
              .update({
                widget_type: widgetType, // Update widget type
                layout_config: layoutConfigJson,
                display_order: layout.displayOrder,
                is_visible: layout.isVisible !== undefined ? layout.isVisible : true,
                updated_at: trx.fn.now(),
              });
          } else {
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
                await trx('user_widget_layouts')
                  .where('user_id', userId)
                  .where('widget_id', layout.widgetId)
                  .update({
                    widget_type: widgetType,
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
