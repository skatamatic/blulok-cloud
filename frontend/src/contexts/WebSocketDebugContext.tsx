import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { websocketDebugService } from '@/services/websocket-debug.service';
import { useToast } from './ToastContext';

interface WebSocketDebugContextType {
  isDebugEnabled: boolean;
  toggleDebug: () => void;
}

const WebSocketDebugContext = createContext<WebSocketDebugContextType | undefined>(undefined);

interface WebSocketDebugProviderProps {
  children: ReactNode;
}

const DEBUG_STORAGE_KEY = 'websocket-debug-enabled';

export const WebSocketDebugProvider: React.FC<WebSocketDebugProviderProps> = ({ children }) => {
  const { addToast } = useToast();
  const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(() => {
    // Initialize from session storage
    const stored = sessionStorage.getItem(DEBUG_STORAGE_KEY);
    return stored === 'true';
  });

  const toggleDebug = () => {
    const newValue = !isDebugEnabled;
    setIsDebugEnabled(newValue);
    sessionStorage.setItem(DEBUG_STORAGE_KEY, newValue.toString());
  };

  // Update session storage when state changes
  useEffect(() => {
    sessionStorage.setItem(DEBUG_STORAGE_KEY, isDebugEnabled.toString());
  }, [isDebugEnabled]);

  // Connect debug service to toast system
  useEffect(() => {
    websocketDebugService.setToastCallback((toast) => {
      addToast({
        type: toast.type,
        title: toast.title,
        message: toast.message,
      });
    });
  }, [addToast]);

  // Update debug service when toggle changes
  useEffect(() => {
    websocketDebugService.setDebugEnabled(isDebugEnabled);
  }, [isDebugEnabled]);

  const value: WebSocketDebugContextType = {
    isDebugEnabled,
    toggleDebug,
  };

  return (
    <WebSocketDebugContext.Provider value={value}>
      {children}
    </WebSocketDebugContext.Provider>
  );
};

export const useWebSocketDebug = (): WebSocketDebugContextType => {
  const context = useContext(WebSocketDebugContext);
  if (context === undefined) {
    throw new Error('useWebSocketDebug must be used within a WebSocketDebugProvider');
  }
  return context;
};
