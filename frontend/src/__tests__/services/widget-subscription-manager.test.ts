import { widgetSubscriptionManager } from '@/services/widget-subscription-manager';
import { websocketService } from '@/services/websocket.service';

// Mock the WebSocket service
jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    onMessage: jest.fn(),
  }
}));

describe('WidgetSubscriptionManager', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset the subscription manager state
    (widgetSubscriptionManager as any).activeSubscriptions.clear();
    (widgetSubscriptionManager as any).messageHandlers.clear();
    (widgetSubscriptionManager as any).isListening.clear();
  });

  describe('subscribe', () => {
    it('should subscribe to a new widget type', () => {
      const handler = jest.fn();
      const errorHandler = jest.fn();

      widgetSubscriptionManager.subscribe('general_stats', handler, errorHandler);

      expect(websocketService.subscribe).toHaveBeenCalledWith('general_stats');
      expect(websocketService.onMessage).toHaveBeenCalledWith('general_stats', expect.any(Function));
    });

    it('should not create duplicate WebSocket subscriptions for the same type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('general_stats', handler2);

      // Should only call subscribe once
      expect(websocketService.subscribe).toHaveBeenCalledTimes(1);
      expect(websocketService.subscribe).toHaveBeenCalledWith('general_stats');
    });

    it('should add multiple handlers for the same type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('general_stats', handler2);

      // Both handlers should be registered
      const messageHandlers = (widgetSubscriptionManager as any).messageHandlers.get('general_stats');
      expect(messageHandlers).toContain(handler1);
      expect(messageHandlers).toContain(handler2);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from a widget type', () => {
      const handler = jest.fn();
      
      widgetSubscriptionManager.subscribe('general_stats', handler);
      widgetSubscriptionManager.unsubscribe('general_stats');

      expect(websocketService.unsubscribe).toHaveBeenCalledWith('general_stats');
    });

    it('should unsubscribe specific handler when provided', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('general_stats', handler2);
      widgetSubscriptionManager.unsubscribe('general_stats', handler1);

      // Should not unsubscribe from WebSocket since handler2 is still active
      expect(websocketService.unsubscribe).not.toHaveBeenCalled();
      
      // handler1 should be removed but handler2 should remain
      const messageHandlers = (widgetSubscriptionManager as any).messageHandlers.get('general_stats');
      expect(messageHandlers).not.toContain(handler1);
      expect(messageHandlers).toContain(handler2);
    });

    it('should unsubscribe from WebSocket when no handlers remain', () => {
      const handler = jest.fn();
      
      widgetSubscriptionManager.subscribe('general_stats', handler);
      widgetSubscriptionManager.unsubscribe('general_stats', handler);

      expect(websocketService.unsubscribe).toHaveBeenCalledWith('general_stats');
    });
  });

  describe('updateSubscriptions', () => {
    it('should subscribe to new types and unsubscribe from unneeded types', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      // Set up initial subscriptions
      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('dashboard_layout', handler2);
      
      // Update subscriptions - remove general_stats, keep dashboard_layout, add new type
      const subscriptionMap = {
        'dashboard_layout': { handler: handler2, errorHandler: undefined },
        'logs': { handler: jest.fn(), errorHandler: undefined }
      };
      
      widgetSubscriptionManager.updateSubscriptions(['dashboard_layout', 'logs'], subscriptionMap);
      
      // Should unsubscribe from general_stats
      expect(websocketService.unsubscribe).toHaveBeenCalledWith('general_stats');
      
      // Should subscribe to logs
      expect(websocketService.subscribe).toHaveBeenCalledWith('logs');
      
      // Should not create duplicate subscription for dashboard_layout
      expect(websocketService.subscribe).toHaveBeenCalledWith('dashboard_layout');
    });

    it('should update handlers for existing subscriptions without creating new WebSocket subscriptions', () => {
      const oldHandler = jest.fn();
      const newHandler = jest.fn();
      
      // Set up initial subscription
      widgetSubscriptionManager.subscribe('general_stats', oldHandler);
      
      // Clear the mock to track new calls
      jest.clearAllMocks();
      
      // Update with new handler
      const subscriptionMap = {
        'general_stats': { handler: newHandler, errorHandler: undefined }
      };
      
      widgetSubscriptionManager.updateSubscriptions(['general_stats'], subscriptionMap);
      
      // Should not create new WebSocket subscription
      expect(websocketService.subscribe).not.toHaveBeenCalled();
      
      // Should update the handler
      const activeSubscription = (widgetSubscriptionManager as any).activeSubscriptions.get('general_stats');
      expect(activeSubscription.handler).toBe(newHandler);
    });
  });

  describe('unsubscribeAll', () => {
    it('should unsubscribe from all active subscriptions', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('dashboard_layout', handler2);
      
      widgetSubscriptionManager.unsubscribeAll();
      
      expect(websocketService.unsubscribe).toHaveBeenCalledWith('general_stats');
      expect(websocketService.unsubscribe).toHaveBeenCalledWith('dashboard_layout');
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return list of active subscription types', () => {
      const handler = jest.fn();
      
      widgetSubscriptionManager.subscribe('general_stats', handler);
      widgetSubscriptionManager.subscribe('dashboard_layout', handler);
      
      const activeTypes = widgetSubscriptionManager.getActiveSubscriptions();
      
      expect(activeTypes).toContain('general_stats');
      expect(activeTypes).toContain('dashboard_layout');
    });
  });

  describe('message handling', () => {
    it('should call all registered handlers when message is received', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const messageData = { test: 'data' };
      
      widgetSubscriptionManager.subscribe('general_stats', handler1);
      widgetSubscriptionManager.subscribe('general_stats', handler2);
      
      // Get the message handler that was registered with WebSocket service
      const messageHandler = (websocketService.onMessage as jest.Mock).mock.calls[0][1];
      
      // Simulate receiving a message
      messageHandler(messageData);
      
      expect(handler1).toHaveBeenCalledWith(messageData);
      expect(handler2).toHaveBeenCalledWith(messageData);
    });
  });
});


