/**
 * Widget Layouts Routes
 *
 * Personalized dashboard layout management for users. Enables customizable
 * widget arrangements, visibility controls, and display preferences while
 * maintaining role-based access to available widgets.
 *
 * Key Features:
 * - User-specific widget layout persistence
 * - Drag-and-drop positioning and sizing
 * - Role-based widget availability filtering
 * - Default template management
 * - Real-time layout synchronization (temporarily disabled)
 * - Layout reset and restoration capabilities
 *
 * Layout System:
 * - Grid-based positioning with x/y coordinates
 * - Flexible widget sizing (tiny, small, medium, large, etc.)
 * - Display order management for tab navigation
 * - Visibility toggles for customization
 * - Template-based default configurations
 *
 * Widget Management:
 * - Individual widget positioning and configuration
 * - Bulk layout save and restore operations
 * - Widget visibility controls (show/hide)
 * - Template-based widget creation
 * - Layout migration support for updates
 *
 * Security Considerations:
 * - User isolation for layout data
 * - Input validation for layout configurations
 * - XSS protection for widget content
 * - Permission validation for widget access
 * - Secure layout serialization and storage
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { UserWidgetLayoutModel, DefaultWidgetTemplateModel } from '@/models/user-widget-layout.model';
import { AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
// DISABLED: Widget subscriptions temporarily disabled
// import { WebSocketService } from '@/services/websocket.service';
// import { WidgetTypeHelper } from '@/types/widget.types';

const router = Router();

// All routes require authentication
router.use(authenticateToken as any);

// DISABLED: Widget subscriptions temporarily disabled
// Helper function to broadcast layout changes
// const broadcastLayoutChange = async (userId: string): Promise<void> => {
//   try {
//     const wsService = WebSocketService.getInstance();
    
//     // Get the updated layouts
//     const userLayouts = await UserWidgetLayoutModel.findByUserId(userId);
    
//     // Convert to frontend format
//     const frontendLayouts: { [key: string]: any[] } = {
//       lg: [],
//       md: [],
//       sm: []
//     };
    
//     const frontendWidgetInstances: any[] = [];
    
//     for (const widget of userLayouts) {
//       // Parse the layout_config JSON string
//       const layoutConfig = typeof widget.layout_config === 'string' 
//         ? JSON.parse(widget.layout_config) 
//         : widget.layout_config;
      
//       // Handle both old and new data formats
//       let x, y, w, h;
      
//       if (layoutConfig.position && typeof layoutConfig.position === 'object') {
//         // New format: position has x, y and we derive w, h from size
//         if (layoutConfig.position.x !== undefined && layoutConfig.position.y !== undefined) {
//           x = layoutConfig.position.x;
//           y = layoutConfig.position.y;
          
//           // Derive dimensions from size enum
//           const widgetSize = layoutConfig.size || 'medium';
//           const { sizeToGrid } = require('@/utils/widget-size.utils');
//           const dimensions = sizeToGrid(widgetSize);
//           w = dimensions.w;
//           h = dimensions.h;
//         } else if (layoutConfig.position.w !== undefined && layoutConfig.position.h !== undefined) {
//           // Old format: position has w, h directly
//           x = layoutConfig.position.x || 0;
//           y = layoutConfig.position.y || 0;
//           w = layoutConfig.position.w;
//           h = layoutConfig.position.h;
//         } else {
//           console.error('📊 Widget Layouts: Invalid position structure for widget', widget.widget_id, ':', layoutConfig.position);
//           continue;
//         }
//       } else {
//         console.error('📊 Widget Layouts: Missing position for widget', widget.widget_id, ':', layoutConfig);
//         continue;
//       }
      
//       const layoutItem = {
//         i: widget.widget_id,
//         x,
//         y,
//         w,
//         h,
//       };
      
//       frontendLayouts.lg!.push(layoutItem);
      
//       // Use shared widget type helper for consistent type mapping
//       const frontendWidgetType = WidgetTypeHelper.extractWidgetTypeFromId(widget.widget_id);
      
//       // Create widget instance
//       frontendWidgetInstances.push({
//         id: widget.widget_id,
//         type: frontendWidgetType,
//         title: layoutConfig.title || 'Widget',
//         size: getWidgetSizeFromGrid(layoutItem.w, layoutItem.h)
//       });
//     }
    
//     // Broadcast the update
//     wsService.broadcastDashboardLayoutUpdate(userId, frontendLayouts, frontendWidgetInstances);
//   } catch (error) {
//     console.error('Error broadcasting layout change:', error);
//   }
// };

// DISABLED: Widget subscriptions temporarily disabled
// Helper function to convert grid dimensions to widget size
// const getWidgetSizeFromGrid = (w: number, h: number): string => {
//   // Use the centralized size mapping utility
//   const { gridToSize } = require('@/utils/widget-size.utils');
//   return gridToSize(w, h);
// };

// Validation schemas
const saveLayoutSchema = Joi.object({
  layouts: Joi.array().items(
    Joi.object({
      widgetId: Joi.string().required(),
      layoutConfig: Joi.object({
        position: Joi.object({
          x: Joi.number().min(0).required(),
          y: Joi.number().min(0).required(),
          w: Joi.number().min(1).required(),
          h: Joi.number().min(1).required(),
        }).required(),
        size: Joi.string().valid('tiny', 'small', 'medium', 'medium-tall', 'large', 'huge', 'large-wide', 'huge-wide').required(),
      }).unknown(true).required(),
      displayOrder: Joi.number().min(0).required(),
      isVisible: Joi.boolean().optional(),
    })
  ).required()
});

const updateWidgetSchema = Joi.object({
  layoutConfig: Joi.object({
    position: Joi.object({
      x: Joi.number().min(0).required(),
      y: Joi.number().min(0).required(),
      w: Joi.number().min(1).required(),
      h: Joi.number().min(1).required(),
    }).required(),
    size: Joi.string().valid('tiny', 'small', 'medium', 'large', 'huge').required(),
  }).unknown(true).required(),
  isVisible: Joi.boolean().optional(),
  displayOrder: Joi.number().min(0).optional(),
});

// GET /widget-layouts - Get user's widget layout
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  
  // Get user's saved layouts
  const userLayouts = await UserWidgetLayoutModel.findByUserId(userId);
  
  // Get available widget templates for user's role
  const availableTemplates = await DefaultWidgetTemplateModel.getAvailableForUser(req.user!.role);
  
  // If user has no saved layouts, return defaults
  if (userLayouts.length === 0) {
    const defaultLayouts = availableTemplates.map(template => ({
      widgetId: template.widget_id,
      widgetType: template.widget_type,
      name: template.name,
      description: template.description,
      layoutConfig: template.default_config,
      availableSizes: template.available_sizes,
      isVisible: true,
      displayOrder: template.default_order,
    }));

    res.json({
      success: true,
      layouts: defaultLayouts,
      isDefault: true,
    });
    return;
  }

  // Merge user layouts with template metadata
  const layouts = userLayouts.map(userLayout => {
    const template = availableTemplates.find(t => t.widget_id === userLayout.widget_id);
    
    return {
      widgetId: userLayout.widget_id,
      widgetType: userLayout.widget_type,
      name: template?.name || userLayout.widget_id, // Keep for backward compatibility, but frontend will use widget type name
      description: template?.description,
      layoutConfig: userLayout.layout_config, // Already a parsed object from Knex
      availableSizes: template?.available_sizes || ['medium'],
      isVisible: userLayout.is_visible,
      displayOrder: userLayout.display_order,
    };
  });

  res.json({
    success: true,
    layouts: layouts.sort((a, b) => a.displayOrder - b.displayOrder),
    isDefault: false,
  });
}));

// POST /widget-layouts - Save user's widget layout
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { error, value } = saveLayoutSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const { layouts } = value;
  const userId = req.user!.userId;

  try {
    // POST /widget-layouts called
    await UserWidgetLayoutModel.saveUserLayouts(userId, layouts);
    
    // DISABLED: Widget subscriptions temporarily disabled
    // Broadcast the layout change to all subscribers
    // await broadcastLayoutChange(userId);
    
    res.json({
      success: true,
      message: 'Widget layout saved successfully'
    });
  } catch (err) {
    console.error('Error in POST /widget-layouts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to save widget layout',
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}));

// PUT /widget-layouts/:widgetId - Update specific widget
router.put('/:widgetId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { widgetId } = req.params;
  const userId = req.user!.userId;

  if (!widgetId) {
    res.status(400).json({
      success: false,
      message: 'Widget ID is required'
    });
    return;
  }

  const { error, value } = updateWidgetSchema.validate(req.body);
  if (error) {
    res.status(400).json({
      success: false,
      message: error.details[0]?.message || 'Validation error'
    });
    return;
  }

  const { layoutConfig, isVisible, displayOrder } = value;

  try {
    const updateData: any = {
      layout_config: layoutConfig, // Let Knex handle JSON serialization
    };

    if (isVisible !== undefined) updateData.is_visible = isVisible;
    if (displayOrder !== undefined) updateData.display_order = displayOrder;

    const existing = await UserWidgetLayoutModel.findByUserAndWidget(userId, widgetId);
    
    if (existing) {
      await UserWidgetLayoutModel.updateById(existing.id, updateData);
    } else {
      await UserWidgetLayoutModel.create({
        user_id: userId,
        widget_id: widgetId,
        widget_type: UserWidgetLayoutModel.extractWidgetType(widgetId),
        layout_config: updateData.layout_config,
        is_visible: isVisible !== undefined ? isVisible : true,
        display_order: displayOrder || 0,
      });
    }

    // DISABLED: Widget subscriptions temporarily disabled
    // Broadcast the layout change to all subscribers
    // await broadcastLayoutChange(userId);

    res.json({
      success: true,
      message: 'Widget updated successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update widget'
    });
  }
}));

// DELETE /widget-layouts/:widgetId - Hide widget
router.delete('/:widgetId', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { widgetId } = req.params;
  const userId = req.user!.userId;

  if (!widgetId) {
    res.status(400).json({
      success: false,
      message: 'Widget ID is required'
    });
    return;
  }

  try {
    await UserWidgetLayoutModel.hideWidget(userId, widgetId);
    
    // DISABLED: Widget subscriptions temporarily disabled
    // Broadcast the layout change to all subscribers
    // await broadcastLayoutChange(userId);
    
    res.json({
      success: true,
      message: 'Widget hidden successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to hide widget'
    });
  }
}));

// POST /widget-layouts/:widgetId/show - Show widget
router.post('/:widgetId/show', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { widgetId } = req.params;
  const userId = req.user!.userId;

  if (!widgetId) {
    res.status(400).json({
      success: false,
      message: 'Widget ID is required'
    });
    return;
  }

  try {
    await UserWidgetLayoutModel.showWidget(userId, widgetId);
    
    // DISABLED: Widget subscriptions temporarily disabled
    // Broadcast the layout change to all subscribers
    // await broadcastLayoutChange(userId);
    
    res.json({
      success: true,
      message: 'Widget shown successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to show widget'
    });
  }
}));

// POST /widget-layouts/reset - Reset to defaults
router.post('/reset', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  try {
    await UserWidgetLayoutModel.resetToDefaults(userId);
    
    // DISABLED: Widget subscriptions temporarily disabled
    // Broadcast the layout change to all subscribers
    // await broadcastLayoutChange(userId);
    
    res.json({
      success: true,
      message: 'Widget layout reset to defaults'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to reset widget layout'
    });
  }
}));

// GET /widget-layouts/templates - Get available widget templates
router.get('/templates', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const templates = await DefaultWidgetTemplateModel.getAvailableForUser(req.user!.role);
    
    res.json({
      success: true,
      templates: templates.map(template => ({
        widgetId: template.widget_id,
        widgetType: template.widget_type,
        name: template.name,
        description: template.description,
        defaultConfig: template.default_config,
        availableSizes: template.available_sizes,
        defaultOrder: template.default_order,
      }))
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget templates'
    });
  }
}));

export { router as widgetLayoutsRouter };
