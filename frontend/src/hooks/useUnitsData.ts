import { useState, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api.service';
// import { widgetSubscriptionManager } from '@/services/widget-subscription-manager'; // Temporarily disabled

export interface UnlockedUnit {
  id: string;
  unit_number: string;
  facility_id: string;
  facility_name: string;
  tenant_id: string;
  tenant_name: string;
  tenant_email: string;
  unlocked_since: string;
  last_activity: string;
  lock_status: 'unlocked';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level: number | null;
  auto_lock_enabled: boolean;
}

export interface UnitsData {
  unlockedUnits: UnlockedUnit[];
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  maintenanceUnits: number;
  reservedUnits: number;
  unlockedCount: number;
  lockedCount: number;
  lastUpdated: string;
}

export interface UseUnitsDataReturn {
  data: UnitsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lockUnit: (unitId: string) => Promise<boolean>;
  onData: (data: UnitsData) => void;
  onError: (error: string) => void;
}

export const useUnitsData = (): UseUnitsDataReturn => {
  const [data, setData] = useState<UnitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnitsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all units first
      const allUnitsResponse = await apiService.get('/units');
      
      // Fetch unlocked units using the dedicated endpoint
      const unlockedUnitsResponse = await apiService.get('/units/unlocked');
      
      if (allUnitsResponse.success && unlockedUnitsResponse.success) {
        const allUnits = allUnitsResponse.units || [];
        const unlockedUnits = unlockedUnitsResponse.units || [];
        
        // Compute stats client-side
        const totalUnits = allUnits.length;
        const occupiedUnits = allUnits.filter((u: any) => u.status === 'occupied').length;
        const availableUnits = allUnits.filter((u: any) => u.status === 'available').length;
        const maintenanceUnits = allUnits.filter((u: any) => u.status === 'maintenance').length;
        const reservedUnits = allUnits.filter((u: any) => u.status === 'reserved').length;
        const unlockedCount = unlockedUnits.length;
        const lockedCount = totalUnits - unlockedCount;
        
        const unitsData: UnitsData = {
          unlockedUnits: unlockedUnits,
          totalUnits,
          occupiedUnits,
          availableUnits,
          maintenanceUnits,
          reservedUnits,
          unlockedCount,
          lockedCount,
          lastUpdated: new Date().toISOString()
        };
        
        setData(unitsData);
      } else {
        setError('Failed to fetch units data');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch units data';
      setError(errorMessage);
      console.error('Error fetching units data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const lockUnit = useCallback(async (unitId: string): Promise<boolean> => {
    try {
      const response = await apiService.post(`/units/${unitId}/lock`);
      
      if (response.success) {
        // Refresh data after successful lock
        await fetchUnitsData();
        return true;
      } else {
        setError(response.message || 'Failed to lock unit');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to lock unit';
      setError(errorMessage);
      console.error('Error locking unit:', err);
      return false;
    }
  }, [fetchUnitsData]);

  const onData = useCallback((newData: UnitsData) => {
    setData(newData);
    setError(null);
  }, []);

  const onError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  useEffect(() => {
    fetchUnitsData();
  }, [fetchUnitsData]);

  // Set up WebSocket subscription for real-time updates
  // TEMPORARILY DISABLED TO DEBUG COUNT ISSUE
  // useEffect(() => {
  //   widgetSubscriptionManager.subscribe('units', onData, onError);
  //   
  //   return () => {
  //     widgetSubscriptionManager.unsubscribe('units');
  //   };
  // }, [onData, onError]);

  return {
    data,
    loading,
    error,
    refetch: fetchUnitsData,
    lockUnit,
    onData,
    onError
  };
};
