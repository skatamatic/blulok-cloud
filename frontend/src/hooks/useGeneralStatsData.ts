import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';

export interface GeneralStatsData {
  facilities: {
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    error: number;
    maintenance: number;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  lastUpdated: string;
}

export interface ScopedGeneralStatsData extends GeneralStatsData {
  scope: {
    type: 'all' | 'facility_limited';
    facilityIds?: string[];
  };
}

/**
 * Hook that provides general stats data without managing subscriptions
 * Subscriptions should be managed by the parent component
 */
export const useGeneralStatsData = () => {
  const { authState } = useAuth();
  const [stats, setStats] = useState<ScopedGeneralStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user can access general stats
  const canAccess = authState.user?.role === UserRole.ADMIN || 
                   authState.user?.role === UserRole.DEV_ADMIN || 
                   authState.user?.role === UserRole.FACILITY_ADMIN;

  const handleStatsUpdate = useCallback((data: ScopedGeneralStatsData) => {
    console.log('📊 useGeneralStatsData: Received stats update:', data);
    setStats(data);
    setLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback((error: string) => {
    console.error('📊 useGeneralStatsData: Error:', error);
    setError(error);
    setLoading(false);
  }, []);

  // Expose handlers for external subscription management
  const getHandlers = useCallback(() => ({
    onData: handleStatsUpdate,
    onError: handleError
  }), [handleStatsUpdate, handleError]);

  return {
    stats,
    loading,
    error,
    canAccess,
    getHandlers
  }
};