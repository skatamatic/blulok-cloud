import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { websocketService } from '@/services/websocket.service';
import { websocketDebugService } from '@/services/websocket-debug.service';
import { makeWebSocketSubscriptionKey } from '@/utils/websocket-subscription.utils';
import { useAuth } from '@/contexts/AuthContext';

interface WebSocketContextType {
  subscribe: (type: string, onMessage: (data: any) => void, onError?: (error: string) => void, filters?: Record<string, any>) => string;
  unsubscribe: (subscriptionId: string) => void;
  isConnected: boolean;
  isReconnecting: boolean;
}

// Metadata stored for each subscription to enable proper cleanup
interface SubscriptionMeta {
  type: string;
  serverSubKey: string;
  filters?: Record<string, any>;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const [isConnected, setIsConnected] = useState(websocketService.isWebSocketConnected());
  const [isReconnecting, setIsReconnecting] = useState(websocketService.isWebSocketReconnecting());
  const messageHandlerUnsubscribers = useRef<Map<string, () => void>>(new Map());
  const subscriptionMeta = useRef<Map<string, SubscriptionMeta>>(new Map());
  const serverSubscriptions = useRef<Set<string>>(new Set());
  const subscriptionCounter = useRef(0);

  useEffect(() => {
    // Set up connection status tracking
    const handleConnectionChange = (connected: boolean) => {
      setIsConnected(connected);

      if (connected) {
        // After transport reconnect, re-assert server subscriptions for active local subscribers.
        const seen = new Set<string>();
        for (const meta of subscriptionMeta.current.values()) {
          if (seen.has(meta.serverSubKey)) continue;
          seen.add(meta.serverSubKey);
          websocketService.reassertSubscription(meta.type, meta.filters);
          serverSubscriptions.current.add(meta.serverSubKey);
        }
      }
    };

    // Add connection handler
    const removeConnectionHandler = websocketService.onConnectionChange(handleConnectionChange);
    const removeReconnectingHandler = websocketService.onReconnectingChange(setIsReconnecting);

    // Immediately check current status in case WebSocket connected before this effect ran
    const currentStatus = websocketService.isWebSocketConnected();
    if (currentStatus !== isConnected) {
      setIsConnected(currentStatus);
    }

    // Cleanup
    return () => {
      removeConnectionHandler();
      removeReconnectingHandler();
      // Clean up all message handler unsubscribers
      messageHandlerUnsubscribers.current.forEach(unsub => unsub());
      messageHandlerUnsubscribers.current.clear();
      subscriptionMeta.current.clear();
      serverSubscriptions.current.clear();
    };
  }, []); // Empty dependency array

  // Ensure dashboard WS connects after auth bootstrap (module singleton may have skipped connect without token).
  useEffect(() => {
    if (!authState.isAuthenticated || authState.isLoading) return;
    websocketService.retryConnectionIfNeeded();
  }, [authState.isAuthenticated, authState.isLoading]);

  const subscribe = useCallback((type: string, onMessage: (data: any) => void, onError?: (error: string) => void, filters?: Record<string, any>) => {
    console.log('🔌 WebSocketContext subscribe:', {
      type,
      isConnected: websocketService.isWebSocketConnected(),
      filters,
    });

    // Generate unique subscription ID using a format that's easy to parse
    const subscriptionId = `sub_${type}_${Date.now()}_${subscriptionCounter.current++}`;

    // For subscriptions with filters (like device_status with device_id),
    // we create a unique server subscription key to avoid conflicts
    const serverSubKey = filters ? makeWebSocketSubscriptionKey(type, filters) : type;

    // Store subscription metadata for proper cleanup
    subscriptionMeta.current.set(subscriptionId, { type, serverSubKey, filters });

    // Subscribe to the WebSocket service (server-side) if this is the first subscriber to this type+filters
    if (!serverSubscriptions.current.has(serverSubKey)) {
      serverSubscriptions.current.add(serverSubKey);
      console.log('🔌 WebSocketContext: Created server subscription for:', serverSubKey);
    } else {
      // Already have a server subscription, just register the local handler
      websocketDebugService.showDebugToast('info', 'WebSocket Sub (reuse)', `Reusing: ${serverSubKey}`);
      console.log('🔌 WebSocketContext: Reusing existing server subscription for:', serverSubKey);
    }
    websocketService.reassertSubscription(type, filters);

    // Set up message handler and store the unsubscribe function
    const unsubscribeHandler = websocketService.onMessage(type, (data: any) => {
      console.log('📨 WebSocketContext message received:', { type, subscriptionId });
      if (data?.error) {
        console.error(`WebSocket error for ${type}:`, data.error);
        if (onError) onError(data.error);
      } else {
        // For general_stats_update messages, the data is already the stats data
        // For other messages, it might be wrapped in a data property
        onMessage(data?.data ?? data);
      }
    });

    // Store the unsubscribe function with the unique subscription ID
    messageHandlerUnsubscribers.current.set(subscriptionId, unsubscribeHandler);

    // Return the unique subscription ID
    return subscriptionId;
  }, []);

  const unsubscribe = useCallback((subscriptionId: string) => {
    // Get stored metadata for this subscription
    const meta = subscriptionMeta.current.get(subscriptionId);
    if (!meta) {
      // Idempotent unsubscribe: route transitions and strict-mode effects can call cleanup twice.
      console.debug('🔌 WebSocketContext: Ignoring unknown subscription ID:', subscriptionId);
      return;
    }

    const { type, serverSubKey } = meta;

    // Remove and call local message handler unsubscribe
    const handlerUnsubscribe = messageHandlerUnsubscribers.current.get(subscriptionId);
    if (handlerUnsubscribe) {
      handlerUnsubscribe();
      messageHandlerUnsubscribers.current.delete(subscriptionId);
    }

    // Remove the metadata
    subscriptionMeta.current.delete(subscriptionId);

    // Check if there are any remaining subscribers for this serverSubKey (type + filters)
    const remainingForKey = Array.from(subscriptionMeta.current.values())
      .filter(m => m.serverSubKey === serverSubKey);

    // If no more subscribers for this serverSubKey, unsubscribe from server-side
    if (remainingForKey.length === 0 && serverSubscriptions.current.has(serverSubKey)) {
      websocketService.unsubscribe(type, meta.filters);
      serverSubscriptions.current.delete(serverSubKey);
      console.log('🔌 WebSocketContext: Removed server subscription for:', serverSubKey);
    }
  }, []);

  const value: WebSocketContextType = useMemo(() => ({
    subscribe,
    unsubscribe,
    isConnected,
    isReconnecting,
  }), [subscribe, unsubscribe, isConnected, isReconnecting]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
