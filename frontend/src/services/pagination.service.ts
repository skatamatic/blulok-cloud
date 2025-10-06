import { apiService } from './api.service';

export interface PaginationInfo {
  page: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

export interface PaginationTarget {
  id: string;
  type: 'user' | 'facility' | 'unit' | 'device';
  filters?: Record<string, any>;
}

/**
 * Service to handle pagination calculations for highlighting
 * This service can determine the correct page for any item across different views
 */
export class PaginationService {
  private static instance: PaginationService;
  private cache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds

  public static getInstance(): PaginationService {
    if (!PaginationService.instance) {
      PaginationService.instance = new PaginationService();
    }
    return PaginationService.instance;
  }

  /**
   * Get the correct page for a specific item
   * @param target - The target item to find
   * @param itemsPerPage - Number of items per page
   * @returns Promise with pagination info
   */
  public async getPageForItem(
    target: PaginationTarget,
    itemsPerPage: number = 20
  ): Promise<PaginationInfo> {
    try {
      // Get the full dataset for the target type
      const allData = await this.getFullDataset(target.type, target.filters);
      
      // Find the item in the dataset
      const itemIndex = allData.findIndex(item => item.id === target.id);
      
      if (itemIndex === -1) {
        // Item not found, return page 1
        return {
          page: 1,
          totalPages: Math.ceil(allData.length / itemsPerPage),
          totalItems: allData.length,
          itemsPerPage
        };
      }

      // Calculate the page (1-based)
      const page = Math.floor(itemIndex / itemsPerPage) + 1;
      const totalPages = Math.ceil(allData.length / itemsPerPage);

      return {
        page,
        totalPages,
        totalItems: allData.length,
        itemsPerPage
      };
    } catch (error) {
      console.error('Error calculating page for item:', error);
      // Fallback to page 1
      return {
        page: 1,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage
      };
    }
  }

  /**
   * Get the full dataset for a specific type
   * @param type - The type of data to fetch
   * @param filters - Optional filters to apply
   * @returns Promise with the full dataset
   */
  private async getFullDataset(type: string, filters?: Record<string, any>): Promise<any[]> {
    const cacheKey = `${type}-${JSON.stringify(filters || {})}`;
    const cached = this.cache.get(cacheKey);
    
    // Check if we have valid cached data
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      let data: any[] = [];
      
      switch (type) {
        case 'unit':
          const unitsResponse = await apiService.getUnits({ 
            ...filters, 
            offset: undefined, 
            limit: undefined 
          });
          data = unitsResponse.units || [];
          break;
          
        case 'device':
          const devicesResponse = await apiService.getDevices({ 
            ...filters, 
            offset: undefined, 
            limit: undefined 
          });
          data = devicesResponse.devices || [];
          break;
          
        case 'facility':
          const facilitiesResponse = await apiService.getFacilities({ 
            ...filters, 
            offset: undefined, 
            limit: undefined 
          });
          data = facilitiesResponse.facilities || [];
          break;
          
        case 'user':
          const usersResponse = await apiService.getUsers({ 
            ...filters
          });
          data = usersResponse.users || [];
          break;
          
        default:
          console.warn(`Unknown data type for pagination: ${type}`);
          return [];
      }

      // Cache the data
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (error) {
      console.error(`Error fetching ${type} data:`, error);
      return [];
    }
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific type
   * @param type - The type to clear cache for
   */
  public clearCacheForType(type: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(`${type}-`));
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

export const paginationService = PaginationService.getInstance();
