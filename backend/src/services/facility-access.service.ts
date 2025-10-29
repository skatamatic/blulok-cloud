import { UserRole } from '@/types/auth.types';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { logger } from '@/utils/logger';

/**
 * Facility Access Service
 *
 * Centralized service for managing facility-scoped access control across the entire BluLok system.
 * Provides consistent role-based access control (RBAC) for multi-tenant facility operations.
 *
 * Key Features:
 * - Role-based facility access determination
 * - Facility association management
 * - Access validation and authorization
 * - Comprehensive audit logging
 * - Graceful error handling with secure defaults
 *
 * Access Control Model:
 * - DEV_ADMIN, ADMIN: Global access to all facilities
 * - FACILITY_ADMIN: Limited to explicitly assigned facilities
 * - TENANT, MAINTENANCE: Facility-scoped based on assignments
 *
 * Security Considerations:
 * - All access decisions logged for audit trails
 * - Secure defaults (deny access on database errors)
 * - Facility scoping prevents cross-tenant data leakage
 * - Role hierarchy enforcement
 */
export class FacilityAccessService {
  /**
   * Get facility IDs that a user has access to based on their role
   * @param userId - User ID
   * @param userRole - User role
   * @returns Array of facility IDs (empty array means all facilities for global admins)
   */
  static async getUserFacilityIds(userId: string, userRole: UserRole): Promise<string[]> {
    try {
      // Global admins can access all facilities
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return []; // Empty array indicates access to all facilities
      }

      // Facility-scoped users get their assigned facilities
      const facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
      
      if (facilityIds.length === 0) {
        logger.warn(`User ${userId} with role ${userRole} has no facility associations`);
      }

      return facilityIds;
    } catch (error) {
      logger.error(`Error getting facility IDs for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a user has access to a specific facility
   * @param userId - User ID
   * @param userRole - User role
   * @param facilityId - Facility ID to check
   * @returns True if user has access, false otherwise
   */
  static async hasAccessToFacility(userId: string, userRole: UserRole, facilityId: string): Promise<boolean> {
    try {
      // Global admins can access any facility
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return true;
      }

      // Check facility association for facility-scoped users
      return await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
    } catch (error) {
      logger.error(`Error checking facility access for user ${userId} to facility ${facilityId}:`, error);
      return false;
    }
  }

  /**
   * Get user scope information for RBAC decisions
   * @param userId - User ID
   * @param userRole - User role
   * @returns Scope information with type and facility IDs
   */
  static async getUserScope(userId: string, userRole: UserRole): Promise<{ 
    type: 'all' | 'facility_limited'; 
    facilityIds?: string[] 
  }> {
    try {
      // Global admins see all facilities
      if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
        return { type: 'all' };
      }

      // Get user's facility associations
      const facilityIds = await this.getUserFacilityIds(userId, userRole);

      if (facilityIds.length === 0) {
        logger.warn(`User ${userId} with role ${userRole} has no facility associations`);
        return { type: 'facility_limited', facilityIds: [] };
      }

      return { type: 'facility_limited', facilityIds };
    } catch (error) {
      logger.error(`Error getting user scope for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Validate that a user can access a specific facility for an operation
   * @param userId - User ID
   * @param userRole - User role
   * @param facilityId - Facility ID
   * @param operation - Operation being performed (for logging)
   * @returns True if access is allowed, false otherwise
   */
  static async validateFacilityAccess(
    userId: string, 
    userRole: UserRole, 
    facilityId: string, 
    operation: string = 'access'
  ): Promise<boolean> {
    try {
      const hasAccess = await this.hasAccessToFacility(userId, userRole, facilityId);
      
      if (!hasAccess) {
        logger.warn(`Access denied: User ${userId} (${userRole}) attempted to ${operation} facility ${facilityId}`);
      } else {
        logger.debug(`Access granted: User ${userId} (${userRole}) ${operation} facility ${facilityId}`);
      }

      return hasAccess;
    } catch (error) {
      logger.error(`Error validating facility access for user ${userId} to facility ${facilityId}:`, error);
      return false;
    }
  }

  /**
   * Get facility access information for logging and debugging
   * @param userId - User ID
   * @param userRole - User role
   * @returns Access information for logging
   */
  static async getAccessInfo(userId: string, userRole: UserRole): Promise<{
    role: UserRole;
    scope: 'all' | 'facility_limited';
    facilityIds: string[];
    facilityCount: number;
  }> {
    try {
      const scope = await this.getUserScope(userId, userRole);
      const facilityIds = scope.type === 'all' ? [] : (scope.facilityIds || []);

      return {
        role: userRole,
        scope: scope.type,
        facilityIds,
        facilityCount: facilityIds.length
      };
    } catch (error) {
      logger.error(`Error getting access info for user ${userId}:`, error);
      return {
        role: userRole,
        scope: 'facility_limited',
        facilityIds: [],
        facilityCount: 0
      };
    }
  }
}
