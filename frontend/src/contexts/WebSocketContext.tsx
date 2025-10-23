import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { websocketService } from '@/services/websocket.service';

interface WebSocketContextType {
  subscribe: (type: string, onMessage: (data: any) => void, onError?: (error: string) => void) => string;
  unsubscribe: (subscriptionId: string) => void;
  isConnected: boolean;
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
      messageHandlerUnsubscribers.current.forEach(unsubscribe => unsubscribe());
      messageHandlerUnsubscribers.current.clear();
      serverSubscriptions.current.clear();
    };
  }, []); // Empty dependency array

  const subscribe = useCallback((type: string, onMessage: (data: any) => void, onError?: (error: string) => void) => {
    console.log('🔌 WebSocketContext subscribe:', { type, isConnected });

    // Generate unique subscription ID
    const subscriptionId = `${type}-${Date.now()}-${subscriptionCounter.current++}`;

    // Subscribe to the WebSocket service (server-side) if this is the first subscriber to this type
    if (!serverSubscriptions.current.has(type)) {
      websocketService.subscribe(type);
      serverSubscriptions.current.add(type);
    }

    // Set up message handler and store the unsubscribe function
    const unsubscribeHandler = websocketService.onMessage(type, (data: any) => {
      console.log('📨 WebSocketContext message received:', { type, data, subscriptionId });
      if (data.error && onError) {
        onError(data.error);
      } else {
        // For general_stats_update messages, the data is already the stats data
        // For other messages, it might be wrapped in a data property
        onMessage(data.data || data);
      }
    });

    // Store the unsubscribe function with the unique subscription ID
    messageHandlerUnsubscribers.current.set(subscriptionId, unsubscribeHandler);

    // Return the unique subscription ID
    return subscriptionId;
  }, [isConnected]);

  const unsubscribe = useCallback((subscriptionId: string) => {
    // Extract the type from subscription ID (format: "type-timestamp-counter")
    const type = subscriptionId.split('-').slice(0, -2).join('-');

    // Remove and call local message handler unsubscribe
    const handlerUnsubscribe = messageHandlerUnsubscribers.current.get(subscriptionId);
    if (handlerUnsubscribe) {
      handlerUnsubscribe();
      messageHandlerUnsubscribers.current.delete(subscriptionId);
    }

    // Check if there are any remaining subscribers for this type
    const remainingSubscriptions = Array.from(messageHandlerUnsubscribers.current.keys())
      .filter(id => id.startsWith(`${type}-`));

    // If no more subscribers for this type, unsubscribe from server-side
    if (remainingSubscriptions.length === 0 && serverSubscriptions.current.has(type)) {
      websocketService.unsubscribe(type);
      serverSubscriptions.current.delete(type);
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
