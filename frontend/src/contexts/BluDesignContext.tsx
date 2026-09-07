import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';

interface BluDesignContextType {
  isBluDesignEnabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const BluDesignContext = createContext<BluDesignContextType | undefined>(undefined);

export const useBluDesign = () => {
  const context = useContext(BluDesignContext);
  if (context === undefined) {
    throw new Error('useBluDesign must be used within a BluDesignProvider');
  }
  return context;
};

interface BluDesignProviderProps {
  children: ReactNode;
}

export const BluDesignProvider: React.FC<BluDesignProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const [isBluDesignEnabled, setIsBluDesignEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    // Don't make API calls if not authenticated or still loading auth
    if (!authState.isAuthenticated || authState.isLoading) {
      setIsLoading(false);
      setIsBluDesignEnabled(false);
      return;
    }

    try {
      const response = await apiService.getSystemSettings();
      if (response.success && response.settings['dev.bludesign_enabled'] !== undefined) {
        setIsBluDesignEnabled(response.settings['dev.bludesign_enabled']);
      } else {
        setIsBluDesignEnabled(false);
      }
    } catch (error) {
      console.error('Failed to load BluDesign setting:', error);
      setIsBluDesignEnabled(false);
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
    <BluDesignContext.Provider value={{ isBluDesignEnabled, isLoading, refresh }}>
      {children}
    </BluDesignContext.Provider>
  );
};

