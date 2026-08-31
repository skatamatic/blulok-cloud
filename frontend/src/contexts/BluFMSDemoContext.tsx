import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';

interface BluFMSDemoContextType {
  isBluFMSDemoEnabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const BluFMSDemoContext = createContext<BluFMSDemoContextType | undefined>(undefined);

export const useBluFMSDemo = () => {
  const context = useContext(BluFMSDemoContext);
  if (context === undefined) {
    throw new Error('useBluFMSDemo must be used within a BluFMSDemoProvider');
  }
  return context;
};

interface BluFMSDemoProviderProps {
  children: ReactNode;
}

export const BluFMSDemoProvider: React.FC<BluFMSDemoProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const [isBluFMSDemoEnabled, setIsBluFMSDemoEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    // Don't make API calls if not authenticated or still loading auth
    if (!authState.isAuthenticated || authState.isLoading) {
      setIsLoading(false);
      setIsBluFMSDemoEnabled(false);
      return;
    }

    try {
      const response = await apiService.getSystemSettings();
      if (response.success && response.settings['dev.blufms_demo_enabled'] !== undefined) {
        setIsBluFMSDemoEnabled(response.settings['dev.blufms_demo_enabled']);
      } else {
        setIsBluFMSDemoEnabled(false);
      }
    } catch (error) {
      console.error('Failed to load BluFMS demo setting:', error);
      setIsBluFMSDemoEnabled(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Wait for auth to finish loading before making any API calls
    if (authState.isLoading) {
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated, authState.isLoading]);

  return (
    <BluFMSDemoContext.Provider value={{ isBluFMSDemoEnabled, isLoading, refresh }}>
      {children}
    </BluFMSDemoContext.Provider>
  );
};

