import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { websocketService } from '@/services/websocket.service';
import { websocketDebugService } from '@/services/websocket-debug.service';

interface WebSocketContextType {
  subscribe: (type: string, onMessage: (data: any) => void, onError?: (error: string) => void, filters?: Record<string, any>) => string;
  unsubscribe: (subscriptionId: string) => void;
  isConnected: boolean;
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
  const [isConnected, setIsConnected] = useState(websocketService.isWebSocketConnected());
  const messageHandlerUnsubscribers = useRef<Map<string, () => void>>(new Map());
  const subscriptionMeta = useRef<Map<string, SubscriptionMeta>>(new Map());
  const serverSubscriptions = useRef<Set<string>>(new Set());
  const subscriptionCounter = useRef(0);

  useEffect(() => {
    // Set up connection status tracking
    const handleConnectionChange = (connected: boolean) => {
      console.log('🔌 WebSocketContext connection change:', connected);
      setIsConnected(connected);

      // When connection is lost, clear server subscriptions so they can be recreated on reconnect
      if (!connected) {
        serverSubscriptions.current.clear();
      }
    };

    // Add connection handler
    const removeConnectionHandler = websocketService.onConnectionChange(handleConnectionChange);

    // Immediately check current status in case WebSocket connected before this effect ran
    const currentStatus = websocketService.isWebSocketConnected();
    console.log('🔌 WebSocketContext initial status check:', currentStatus);
    if (currentStatus !== isConnected) {
      setIsConnected(currentStatus);
    }

    // Cleanup
    return () => {
      removeConnectionHandler();
      // Clean up all message handler unsubscribers
      messageHandlerUnsubscribers.current.forEach(unsub => unsub());
      messageHandlerUnsubscribers.current.clear();
      subscriptionMeta.current.clear();
      serverSubscriptions.current.clear();
    };
  }, []); // Empty dependency array

  const subscribe = useCallback((type: string, onMessage: (data: any) => void, onError?: (error: string) => void, filters?: Record<string, any>) => {
    console.log('🔌 WebSocketContext subscribe:', { type, isConnected, filters });

    // Generate unique subscription ID using a format that's easy to parse
    const subscriptionId = `sub_${type}_${Date.now()}_${subscriptionCounter.current++}`;

    // For subscriptions with filters (like device_status with device_id),
    // we create a unique server subscription key to avoid conflicts
    const serverSubKey = filters ? `${type}:${JSON.stringify(filters)}` : type;

    // Store subscription metadata for proper cleanup
    subscriptionMeta.current.set(subscriptionId, { type, serverSubKey, filters });

    // Subscribe to the WebSocket service (server-side) if this is the first subscriber to this type+filters
    if (!serverSubscriptions.current.has(serverSubKey)) {
      websocketService.subscribe(type, filters);
      serverSubscriptions.current.add(serverSubKey);
      console.log('🔌 WebSocketContext: Created server subscription for:', serverSubKey);
    } else {
      // Already have a server subscription, just register the local handler
      websocketDebugService.showDebugToast('info', 'WebSocket Sub (reuse)', `Reusing: ${serverSubKey}`);
      console.log('🔌 WebSocketContext: Reusing existing server subscription for:', serverSubKey);
    }

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
  }, [isConnected]);

  const unsubscribe = useCallback((subscriptionId: string) => {
    // Get stored metadata for this subscription
    const meta = subscriptionMeta.current.get(subscriptionId);
    if (!meta) {
      console.warn('🔌 WebSocketContext: Unknown subscription ID:', subscriptionId);
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

  const value: WebSocketContextType = {
    subscribe,
    unsubscribe,
    isConnected
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
