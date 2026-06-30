import { useNavigateOnFacilityChange } from '@/hooks/useNavigateOnFacilityChange';

/** App-shell listener — must mount once (not inside per-route DashboardLayout). */
export function FacilityChangeNavigator(): null {
  useNavigateOnFacilityChange();
  return null;
}
