import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { websocketService } from '@/services/websocket.service';

interface WebSocketContextType {
  subscribe: (type: string, onMessage: (data: any) => void, onError?: (error: string) => void) => string | null;
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

  useEffect(() => {
    // Set up connection status tracking
    const handleConnectionChange = (connected: boolean) => {
      console.log('🔌 WebSocketContext connection change:', connected);
      setIsConnected(connected);
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
    };
  }, []); // Empty dependency array

  const subscribe = useCallback((type: string, onMessage: (data: any) => void, onError?: (error: string) => void) => {
    console.log('🔌 WebSocketContext subscribe:', { type, isConnected });
    
    // Subscribe to the WebSocket service
    websocketService.subscribe(type);
    
    // Set up message handler
    websocketService.onMessage(type, (data: any) => {
      console.log('📨 WebSocketContext message received:', { type, data });
      if (data.error && onError) {
        onError(data.error);
      } else {
        // For general_stats_update messages, the data is already the stats data
        // For other messages, it might be wrapped in a data property
        onMessage(data.data || data);
      }
    });

    // Return a subscription ID (we'll use the type as ID for now)
    return type;
  }, [isConnected]);

  const unsubscribe = useCallback((subscriptionId: string) => {
    websocketService.unsubscribe(subscriptionId);
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
