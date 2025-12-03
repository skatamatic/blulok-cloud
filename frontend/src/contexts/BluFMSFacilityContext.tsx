import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '@/services/api.service';
import { Facility } from '@/types/facility.types';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';

interface BluFMSFacilityContextType {
  facilities: Facility[];
  selectedFacilityId: string | null;
  selectedFacility: Facility | null;
  setSelectedFacilityId: (facilityId: string | null) => void;
  isLoading: boolean;
  hasMultipleFacilities: boolean;
  refresh: () => Promise<void>;
}

const BluFMSFacilityContext = createContext<BluFMSFacilityContextType | undefined>(undefined);

export const useBluFMSFacility = () => {
  const context = useContext(BluFMSFacilityContext);
  if (context === undefined) {
    // Return safe defaults instead of throwing - allows conditional usage
    return {
      facilities: [],
      selectedFacilityId: null,
      selectedFacility: null,
      setSelectedFacilityId: () => {},
      isLoading: true,
      hasMultipleFacilities: false,
      refresh: async () => {}
    };
  }
  return context;
};

interface BluFMSFacilityProviderProps {
  children: ReactNode;
}

export const BluFMSFacilityProvider: React.FC<BluFMSFacilityProviderProps> = ({ children }) => {
  const { authState } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasAccess = authState.user?.role === UserRole.ADMIN || 
                   authState.user?.role === UserRole.DEV_ADMIN || 
                   authState.user?.role === UserRole.FACILITY_ADMIN;

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId) || null;
  const hasMultipleFacilities = facilities.length > 1;

  const refresh = async () => {
    // Don't make API calls if not authenticated or still loading auth
    if (!authState.isAuthenticated || authState.isLoading || !hasAccess) {
      setIsLoading(false);
      if (!authState.isAuthenticated) {
        // Clear facilities when logged out
        setFacilities([]);
        setSelectedFacilityId(null);
      }
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiService.getFacilities();
      if (response.success) {
        const userFacilities = response.facilities || [];
        setFacilities(userFacilities);
        
        // Auto-select first facility if available and none selected
        if (userFacilities.length > 0 && !selectedFacilityId) {
          setSelectedFacilityId(userFacilities[0].id);
        } else if (userFacilities.length === 1) {
          // If only one facility, auto-select it
          setSelectedFacilityId(userFacilities[0].id);
        } else if (selectedFacilityId && !userFacilities.find(f => f.id === selectedFacilityId)) {
          // If selected facility is no longer available, select first
          setSelectedFacilityId(userFacilities.length > 0 ? userFacilities[0].id : null);
        }
      }
    } catch (error) {
      console.error('Failed to load facilities:', error);
      // Clear facilities on error
      setFacilities([]);
      setSelectedFacilityId(null);
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
  }, [authState.isAuthenticated, authState.isLoading, hasAccess]);

  // Auto-select first facility when facilities load and none is selected
  useEffect(() => {
    if (facilities.length === 1 && !selectedFacilityId) {
      setSelectedFacilityId(facilities[0].id);
    } else if (facilities.length === 0) {
      setSelectedFacilityId(null);
    }
  }, [facilities, selectedFacilityId]);

  return (
    <BluFMSFacilityContext.Provider value={{
      facilities,
      selectedFacilityId,
      selectedFacility,
      setSelectedFacilityId,
      isLoading,
      hasMultipleFacilities,
      refresh
    }}>
      {children}
    </BluFMSFacilityContext.Provider>
  );
};

