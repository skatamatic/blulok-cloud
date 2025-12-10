import { websocketService } from './websocket.service';

export interface WidgetSubscription {
  type: string;
  handler: (data: any) => void;
  errorHandler?: (error: string) => void;
}

export class WidgetSubscriptionManager {
  private activeSubscriptions = new Map<string, WidgetSubscription>();
  private messageHandlers = new Map<string, Set<(data: any) => void>>();
  private wsMessageUnsubscribers = new Map<string, () => void>(); // Store WebSocket message handler cleanup functions

  /**
   * Subscribe to a widget data type
   */
  public subscribe(type: string, handler: (data: any) => void, errorHandler?: (error: string) => void): void {
    // Set up message handlers first
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    // Check if already subscribed to WebSocket
    if (this.activeSubscriptions.has(type)) {
      return;
    }

    // Create new subscription
    const subscription: WidgetSubscription = {
      type,
      handler,
      errorHandler
    };

    this.activeSubscriptions.set(type, subscription);

    // Subscribe to WebSocket only once
    websocketService.subscribe(type);
    
    // Set up WebSocket message handler only once per type
    if (!this.wsMessageUnsubscribers.has(type)) {
      const unsubscribeHandler = websocketService.onMessage(type, (data: any) => {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          handlers.forEach(h => h(data));
        }
      });
      this.wsMessageUnsubscribers.set(type, unsubscribeHandler);
    }
  }

  /**
   * Unsubscribe from a widget data type
   */
  public unsubscribe(type: string, handler?: (data: any) => void): void {
    if (!this.activeSubscriptions.has(type)) {
      return;
    }

    // Remove specific handler if provided
    if (handler) {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        // If no more handlers, unsubscribe completely
        if (handlers.size === 0) {
          this.unsubscribe(type);
        }
        return;
      }
    }

    // Remove all handlers and subscription
    this.messageHandlers.delete(type);
    this.activeSubscriptions.delete(type);
    
    // Clean up WebSocket message handler
    const wsUnsubscribe = this.wsMessageUnsubscribers.get(type);
    if (wsUnsubscribe) {
      wsUnsubscribe();
      this.wsMessageUnsubscribers.delete(type);
    }
    
    // Unsubscribe from WebSocket
    websocketService.unsubscribe(type);
  }

  /**
   * Get all active subscription types
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscriptions.keys());
  }

  /**
   * Check if subscribed to a type
   */
  public isSubscribed(type: string): boolean {
    return this.activeSubscriptions.has(type);
  }

  /**
   * Unsubscribe from all active subscriptions
   */
  public unsubscribeAll(): void {
    const types = Array.from(this.activeSubscriptions.keys());
    types.forEach(type => this.unsubscribe(type));
  }

  /**
   * Update subscriptions based on widget types
   */
  public updateSubscriptions(
    widgetTypes: string[],
    subscriptionMap: Record<string, { handler: (data: any) => void; errorHandler?: (error: string) => void }>
  ): void {
    // Get currently active subscription types
    const activeTypes = this.getActiveSubscriptions();
    
    // Find types to unsubscribe (active but not needed)
    const typesToUnsubscribe = activeTypes.filter(type => !widgetTypes.includes(type));
    
    // Unsubscribe from unneeded types
    typesToUnsubscribe.forEach(type => {
      this.unsubscribe(type);
    });
    
    // Subscribe to needed types or update handlers for existing types
    widgetTypes.forEach(type => {
      const subscription = subscriptionMap[type];
      if (subscription) {
        if (activeTypes.includes(type)) {
          // Update the handler for existing subscription without creating new WebSocket subscription
          const existingSubscription = this.activeSubscriptions.get(type);
          if (existingSubscription) {
            existingSubscription.handler = subscription.handler;
            existingSubscription.errorHandler = subscription.errorHandler;
          }
          // Add handler to message handlers
          if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
          }
          this.messageHandlers.get(type)!.add(subscription.handler);
        } else {
          this.subscribe(type, subscription.handler, subscription.errorHandler);
        }
      }
    });
  }
}

// Export singleton instance
export const widgetSubscriptionManager = new WidgetSubscriptionManager();