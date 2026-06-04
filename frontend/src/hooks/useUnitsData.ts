import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '@/services/api.service';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';

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

export const useUnitsData = (facilityId?: string | null): UseUnitsDataReturn => {
  const [data, setData] = useState<UnitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnitsData = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true);
        setError(null);
      }

      const params = facilityId ? { facility_id: facilityId } : undefined;

      const allUnitsResponse = await apiService.get('/units', params ? { params } : undefined);
      const unlockedUnitsResponse = await apiService.get('/units/unlocked', params ? { params } : undefined);

      if (allUnitsResponse.success && unlockedUnitsResponse.success) {
        const allUnits = allUnitsResponse.units || [];
        const unlockedUnits = unlockedUnitsResponse.units || [];

        const totalUnits = allUnits.length;
        const occupiedUnits = allUnits.filter((u: { status?: string }) => u.status === 'occupied').length;
        const availableUnits = allUnits.filter((u: { status?: string }) => u.status === 'available').length;
        const maintenanceUnits = allUnits.filter((u: { status?: string }) => u.status === 'maintenance').length;
        const reservedUnits = allUnits.filter((u: { status?: string }) => u.status === 'reserved').length;
        const unlockedCount = unlockedUnits.length;
        const lockedCount = totalUnits - unlockedCount;

        setData({
          unlockedUnits,
          totalUnits,
          occupiedUnits,
          availableUnits,
          maintenanceUnits,
          reservedUnits,
          unlockedCount,
          lockedCount,
          lastUpdated: new Date().toISOString(),
        });
      } else if (!options?.background) {
        setError('Failed to fetch units data');
      }
    } catch (err) {
      if (!options?.background) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch units data';
        setError(errorMessage);
        console.error('Error fetching units data:', err);
      }
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }, [facilityId]);

  const fetchUnitsDataRef = useRef(fetchUnitsData);
  fetchUnitsDataRef.current = fetchUnitsData;

  const lockUnit = useCallback(async (unitId: string): Promise<boolean> => {
    try {
      const response = await apiService.post(`/units/${unitId}/lock`);

      if (response.success) {
        await fetchUnitsData();
        return true;
      }
      setError(response.message || 'Failed to lock unit');
      return false;
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
    void fetchUnitsData();
  }, [fetchUnitsData]);

  useLockDeviceRealtime({
    facilityId: facilityId ?? undefined,
    debouncedRefresh: () => {
      void fetchUnitsDataRef.current({ background: true });
    },
    debounceMs: 500,
  });

  return {
    data,
    loading,
    error,
    refetch: fetchUnitsData,
    lockUnit,
    onData,
    onError,
  };
};
