import { UserRole } from '@/types/auth.types';

/** Mirrors backend GeneralStatsData / ScopedGeneralStatsData */
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
  alerts: {
    open: number;
  };
  lastUpdated: string;
}

export interface ScopedGeneralStatsData extends GeneralStatsData {
  scope: {
    type: 'all' | 'facility_limited';
    facilityIds?: string[];
  };
}
