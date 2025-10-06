import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Toast, ToastContextType } from '@/types/toast.types';

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toastData: Omit<Toast, 'id' | 'timestamp'>): string => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    
    const toast: Toast = {
      ...toastData,
      id,
      timestamp,
      duration: toastData.duration ?? (toastData.persistent ? 0 : 5000),
    };

    setToasts(prev => {
      // Limit to 4 toasts maximum
      const newToasts = [...prev, toast];
      return newToasts.slice(-4);
    });

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextType = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};


