import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, WebSocketMessage, SubscriptionClient } from './base-subscription-manager';
import { WidgetTypeHelper, WidgetSize } from '@/types/widget.types';
import { sizeToGrid } from '@/utils/widget-size.utils';

/**
 * Dashboard Layout Subscription Manager
 *
 * Manages real-time subscriptions to user dashboard configurations and widget layouts.
 * Provides personalized dashboard state synchronization across multiple client sessions.
 *
 * Subscription Type: 'dashboard_layout'
 *
 * Key Features:
 * - User-specific layout management (not facility-scoped)
 * - Real-time layout synchronization across browser tabs/sessions
 * - Automatic widget type resolution and size calculation
 * - Backward compatibility with old layout formats
 * - Responsive grid layout support (lg, md, sm breakpoints)
 *
 * Data Provided:
 * - Widget positions and dimensions on dashboard grid
 * - Widget types and configurations
 * - Responsive layouts for different screen sizes
 * - Widget titles and metadata
 *
 * Access Control:
 * - All authenticated users can access their own dashboard layouts
 * - No role restrictions (personalized data)
 */
export class DashboardLayoutSubscriptionManager extends BaseSubscriptionManager {
  // User-based watcher organization for efficient broadcasting
  // Maps userId to set of WebSocket connections watching that user's layout
  private userWatchers: Map<string, Set<WebSocket>> = new Map();

  getSubscriptionType(): string {
    return 'dashboard_layout';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All authenticated users can subscribe to their own dashboard layout
    return true;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const { UserWidgetLayoutModel } = await import('@/models/user-widget-layout.model') as any;
      const savedLayouts = await UserWidgetLayoutModel.findByUserId(client.userId);
      
      // Convert backend layout format to frontend format
      const frontendLayouts: { [key: string]: any[] } = {
        lg: [],
        md: [],
        sm: []
      };
      
      const frontendWidgetInstances: any[] = [];
      
      for (const widget of savedLayouts) {
        
        // Parse the layout_config JSON string
        const layoutConfig = typeof widget.layout_config === 'string' 
          ? JSON.parse(widget.layout_config) 
          : widget.layout_config;
        
        
        // Validate layout config structure
        if (!layoutConfig || typeof layoutConfig !== 'object') {
          console.error('📊 Dashboard Layout: Invalid layout config for widget', widget.widget_id, ':', layoutConfig);
          continue;
        }
        
        // Handle both old and new data formats
        let x, y, w, h;
        let widgetSize: WidgetSize = 'medium'; // Default size
        
        if (layoutConfig.position && typeof layoutConfig.position === 'object') {
          // New format: position has x, y and we derive w, h from size
          if (layoutConfig.position.x !== undefined && layoutConfig.position.y !== undefined) {
            x = layoutConfig.position.x;
            y = layoutConfig.position.y;
            
            // Derive dimensions from size enum
            widgetSize = (layoutConfig.size as WidgetSize) || 'medium';
            const dimensions = sizeToGrid(widgetSize);
            w = dimensions.w;
            h = dimensions.h;
          } else if (layoutConfig.position.w !== undefined && layoutConfig.position.h !== undefined) {
            // Old format: position has w, h directly
            x = layoutConfig.position.x || 0;
            y = layoutConfig.position.y || 0;
            w = layoutConfig.position.w;
            h = layoutConfig.position.h;
            // Extract size from old format if available
            widgetSize = (layoutConfig.size as WidgetSize) || 'medium';
          } else {
            console.error('📊 Dashboard Layout: Invalid position structure for widget', widget.widget_id, ':', layoutConfig.position);
            continue;
          }
        } else {
          console.error('📊 Dashboard Layout: Missing position for widget', widget.widget_id, ':', layoutConfig);
          continue;
        }
        
        const layoutItem = {
          i: widget.widget_id,
          x,
          y,
          w,
          h,
        };
        
        frontendLayouts.lg!.push(layoutItem);
        
        // Use shared widget type helper for consistent type mapping
        const frontendWidgetType = WidgetTypeHelper.extractWidgetTypeFromId(widget.widget_id);
        
        // Get proper widget name from registry
        const widgetDefinition = WidgetTypeHelper.getWidgetType(frontendWidgetType);
        const widgetTitle = widgetDefinition?.name || 'Widget';
        
        // Create widget instance
        frontendWidgetInstances.push({
          id: widget.widget_id,
          type: frontendWidgetType,
          title: widgetTitle,
          size: widgetSize // Use the size enum directly
        });
      }
      
      this.sendMessage(ws, {
        type: 'dashboard_layout_update',
        subscriptionId,
        data: { 
          layouts: frontendLayouts, 
          widgetInstances: frontendWidgetInstances 
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error loading initial dashboard layout:', error);
      // Send empty data as fallback
      this.sendMessage(ws, {
        type: 'dashboard_layout_update',
        subscriptionId,
        data: { layouts: { lg: [], md: [], sm: [] }, widgetInstances: [] },
        timestamp: new Date().toISOString()
      });
    }
  }

  protected override addWatcher(subscriptionId: string, ws: WebSocket, client: SubscriptionClient): void {
    // For dashboard layouts, we organize by userId
    if (!this.userWatchers.has(client.userId)) {
      this.userWatchers.set(client.userId, new Set());
    }
    this.userWatchers.get(client.userId)!.add(ws);
    
    // Also add to the base watchers for cleanup
    super.addWatcher(subscriptionId, ws, client);
  }

  protected override removeWatcher(subscriptionId: string, ws: WebSocket, client: SubscriptionClient): void {
    // Remove from user watchers
    const userWatchers = this.userWatchers.get(client.userId);
    if (userWatchers) {
      userWatchers.delete(ws);
      if (userWatchers.size === 0) {
        this.userWatchers.delete(client.userId);
      }
    }
    
    // Also remove from base watchers
    super.removeWatcher(subscriptionId, ws, client);
  }

  public broadcastLayoutUpdate(userId: string, layouts: any, widgetInstances: any[]): void {
    
    try {
      const watchers = this.userWatchers.get(userId);
      
      if (watchers && watchers.size > 0) {
        const message: WebSocketMessage = {
          type: 'dashboard_layout_update',
          data: {
            layouts,
            widgetInstances,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };

        let sentCount = 0;
        watchers.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendMessage(ws, message);
            sentCount++;
          }
        });

        this.logger.info(`📊 Dashboard layout update broadcasted to ${sentCount}/${watchers.size} watchers for user ${userId}`);
      } else {
      }
    } catch (error) {
      this.logger.error('Error broadcasting dashboard layout update:', error);
    }
  }
}
