import { User, UserRole } from '@/types/auth.types';

/**
 * Presentation-only simplified Cloud UI preference.
 * Not an authorization boundary — APIs remain role-scoped.
 */
export function usesSimplifiedUi(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role !== UserRole.FACILITY_ADMIN) return false;
  return Boolean(user.simplifiedUi);
}
