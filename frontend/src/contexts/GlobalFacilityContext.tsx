import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '@/services/api.service';
import { Facility } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';

// Special constant for "All Facilities" option
export const ALL_FACILITIES_ID = '__ALL_FACILITIES__';

interface GlobalFacilityContextType {
  facilities: Facility[];
  selectedFacilityId: string | null;
  selectedFacility: Facility | null;
  setSelectedFacilityId: (facilityId: string | null) => void;
  isLoading: boolean;
  hasMultipleFacilities: boolean;
  isAllFacilitiesSelected: boolean;
  refresh: () => Promise<void>;
}

const GlobalFacilityContext = createContext<GlobalFacilityContextType | undefined>(undefined);

export const useGlobalFacility = () => {
  const context = useContext(GlobalFacilityContext);
  if (context === undefined) {
    throw new Error('useGlobalFacility must be used within a GlobalFacilityProvider');
  }
  return context;
};

interface GlobalFacilityProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'selectedFacilityId';

export const GlobalFacilityProvider: React.FC<GlobalFacilityProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedFacility = selectedFacilityId && selectedFacilityId !== ALL_FACILITIES_ID
    ? facilities.find(f => f.id === selectedFacilityId) || null
    : null;
  const hasMultipleFacilities = facilities.length > 1;
  const isAllFacilitiesSelected = selectedFacilityId === ALL_FACILITIES_ID;

  // Wrapper to persist to localStorage
  const setSelectedFacilityId = (facilityId: string | null) => {
    setSelectedFacilityIdState(facilityId);
    if (facilityId === ALL_FACILITIES_ID) {
      localStorage.setItem(STORAGE_KEY, ALL_FACILITIES_ID);
    } else if (facilityId) {
      localStorage.setItem(STORAGE_KEY, facilityId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const refresh = async () => {
    // Don't make API calls if not authenticated or still loading auth
    if (!authState.isAuthenticated || authState.isLoading) {
      setIsLoading(false);
      if (!authState.isAuthenticated) {
        // Clear facilities when logged out
        setFacilities([]);
        setSelectedFacilityIdState(null);
        localStorage.removeItem(STORAGE_KEY);
      }
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiService.getFacilities();
      if (response.success) {
        const userFacilities = response.facilities || [];
        setFacilities(userFacilities);
        
        // Load persisted selection from localStorage
        const persistedId = localStorage.getItem(STORAGE_KEY);
        
        if (userFacilities.length === 0) {
          // No facilities available
          setSelectedFacilityIdState(null);
          localStorage.removeItem(STORAGE_KEY);
        } else if (userFacilities.length === 1) {
          // Preserve explicit "All Facilities" selection even in single-facility environments.
          if (persistedId === ALL_FACILITIES_ID) {
            setSelectedFacilityIdState(ALL_FACILITIES_ID);
          } else {
            setSelectedFacilityIdState(userFacilities[0].id);
            localStorage.setItem(STORAGE_KEY, userFacilities[0].id);
          }
        } else {
          // Multiple facilities
          if (persistedId === ALL_FACILITIES_ID) {
            // "All Facilities" was selected
            setSelectedFacilityIdState(ALL_FACILITIES_ID);
          } else if (persistedId && userFacilities.find((f: { id: string }) => f.id === persistedId)) {
            // Persisted facility is still available
            setSelectedFacilityIdState(persistedId);
          } else {
            // No valid persisted selection - default to first facility
            setSelectedFacilityIdState(userFacilities[0].id);
            localStorage.setItem(STORAGE_KEY, userFacilities[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load facilities:', error);
      // Clear facilities on error
      setFacilities([]);
      setSelectedFacilityIdState(null);
      localStorage.removeItem(STORAGE_KEY);
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
    <GlobalFacilityContext.Provider value={{
      facilities,
      selectedFacilityId,
      selectedFacility,
      setSelectedFacilityId,
      isLoading,
      hasMultipleFacilities,
      isAllFacilitiesSelected,
      refresh
    }}>
      {children}
    </GlobalFacilityContext.Provider>
  );
};


