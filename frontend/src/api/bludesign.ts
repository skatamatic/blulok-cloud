/**
 * BluDesign API Client
 * 
 * API client for BluDesign facility and asset operations.
 * Uses the centralized apiService for authentication.
 */

import { apiService } from '@/services/api.service';
import { FacilityData, FacilitySummary } from '@/components/bludesign/core/types';

const API_BASE = '/bludesign';

export interface SaveFacilityRequest {
  name: string;
  data: FacilityData;
  thumbnail?: string;
}

export interface UpdateFacilityRequest {
  data: FacilityData;
  thumbnail?: string;
}

export interface FacilityResponse {
  id: string;
  user_id: string;
  name: string;
  data: FacilityData;
  thumbnail: string | null;
  last_opened: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all facilities for the current user
 */
export async function getFacilities(): Promise<FacilitySummary[]> {
  const data = await apiService.get(`${API_BASE}/facilities`);
  return data.map((f: any) => ({
    ...f,
    lastOpened: f.lastOpened ? new Date(f.lastOpened) : null,
    createdAt: new Date(f.createdAt),
    updatedAt: new Date(f.updatedAt),
  }));
}

// Alias for backward compatibility
export const listFacilities = getFacilities;

/**
 * Get a specific facility by ID
 */
export async function getFacility(id: string): Promise<FacilityResponse> {
  return await apiService.get(`${API_BASE}/facilities/${id}`);
}

/**
 * Save a new facility
 */
export async function saveFacility(
  name: string,
  data: FacilityData,
  thumbnail?: string
): Promise<FacilityResponse> {
  return await apiService.post(`${API_BASE}/facilities`, { name, data, thumbnail });
}

/**
 * Update an existing facility
 */
export async function updateFacility(
  id: string,
  data: FacilityData,
  thumbnail?: string
): Promise<void> {
  await apiService.put(`${API_BASE}/facilities/${id}`, { data, thumbnail });
}

/**
 * Delete a facility
 */
export async function deleteFacility(id: string): Promise<void> {
  await apiService.delete(`${API_BASE}/facilities/${id}`);
}

/**
 * Get the last opened facility for the current user
 */
export async function getLastOpened(): Promise<FacilityResponse | null> {
  try {
    return await apiService.get(`${API_BASE}/facilities/last`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// ==========================================================================
// Asset Definition API
// ==========================================================================

export interface AssetDefinition {
  id: string;
  name: string;
  category: string;
  description?: string;
  dimensions: { width: number; height: number; depth: number };
  gridUnits: { x: number; z: number };
  isSmart: boolean;
  canRotate: boolean;
  canStack: boolean;
  modelUrl?: string;
  thumbnailUrl?: string;
  materials: MaterialConfig[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialConfig {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  textureUrl?: string;
}

export interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  config: MaterialConfig;
}

/**
 * List all asset definitions
 */
export async function listAssetDefinitions(): Promise<AssetDefinition[]> {
  return await apiService.get(`${API_BASE}/assets`);
}

/**
 * Get a specific asset definition
 */
export async function getAssetDefinition(id: string): Promise<AssetDefinition> {
  return await apiService.get(`${API_BASE}/assets/${id}`);
}

/**
 * Create a new asset definition
 */
export async function createAssetDefinition(data: Partial<AssetDefinition>): Promise<AssetDefinition> {
  return await apiService.post(`${API_BASE}/assets`, data);
}

/**
 * Update an asset definition
 */
export async function updateAssetDefinition(id: string, data: Partial<AssetDefinition>): Promise<AssetDefinition> {
  return await apiService.put(`${API_BASE}/assets/${id}`, data);
}

/**
 * Delete an asset definition
 */
export async function deleteAssetDefinition(id: string): Promise<void> {
  await apiService.delete(`${API_BASE}/assets/${id}`);
}

/**
 * Upload a 3D model file for an asset
 */
export async function uploadAssetModel(assetId: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('model', file);
  return await apiService.post(`${API_BASE}/assets/${assetId}/model`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

/**
 * Upload a texture file for an asset material
 */
export async function uploadAssetTexture(assetId: string, materialId: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('texture', file);
  return await apiService.post(`${API_BASE}/assets/${assetId}/materials/${materialId}/texture`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
}

// ==========================================================================
// Material Presets API
// ==========================================================================

/**
 * List all material presets
 */
export async function listMaterialPresets(): Promise<MaterialPreset[]> {
  return await apiService.get(`${API_BASE}/material-presets`);
}

/**
 * Create a material preset
 */
export async function createMaterialPreset(data: Partial<MaterialPreset>): Promise<MaterialPreset> {
  return await apiService.post(`${API_BASE}/material-presets`, data);
}

/**
 * Update a material preset
 */
export async function updateMaterialPreset(id: string, data: Partial<MaterialPreset>): Promise<MaterialPreset> {
  return await apiService.put(`${API_BASE}/material-presets/${id}`, data);
}

/**
 * Delete a material preset
 */
export async function deleteMaterialPreset(id: string): Promise<void> {
  await apiService.delete(`${API_BASE}/material-presets/${id}`);
}

// ==========================================================================
// BluLok Data Source API (for binding to live data)
// ==========================================================================

/**
 * BluLok Facility (from main system)
 */
export interface BluLokFacility {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

/**
 * BluLok Unit (storage unit)
 */
export interface BluLokUnit {
  id: string;
  facility_id: string;
  unit_number: string;
  unit_type: string | null;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  description?: string;
  // Device info if available
  device?: {
    id: string;
    device_serial: string;
    lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
    device_status: 'online' | 'offline' | 'low_battery' | 'error';
    battery_level?: number;
  };
  // Tenant info if available
  tenant?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * BluLok Access Control Device (gates, elevators, doors)
 */
export interface BluLokAccessControlDevice {
  id: string;
  gateway_id: string;
  name: string;
  device_type: 'gate' | 'elevator' | 'door';
  location_description?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  is_locked: boolean;
}

/**
 * Get all BluLok facilities the user has access to
 */
export async function getBluLokFacilities(): Promise<BluLokFacility[]> {
  try {
    const data = await apiService.get('/facilities');
    // Handle both array response and { facilities: [...] } response
    const facilities = Array.isArray(data) ? data : (data?.facilities || data?.data || []);
    if (!Array.isArray(facilities)) {
      console.warn('Unexpected facilities response format:', data);
      return [];
    }
    return facilities.map((f: any) => ({
      id: f.id,
      name: f.name,
      address: f.address,
      city: f.city,
      state: f.state,
    }));
  } catch (error) {
    console.warn('Failed to fetch BluLok facilities:', error);
    return [];
  }
}

/**
 * Get units for a specific facility
 */
export async function getBluLokUnits(facilityId: string): Promise<BluLokUnit[]> {
  try {
    const data = await apiService.get(`/units?facility_id=${facilityId}`);
    return (data.units || []).map((u: any) => ({
      id: u.id,
      facility_id: u.facility_id,
      unit_number: u.unit_number,
      unit_type: u.unit_type,
      status: u.status,
      description: u.description,
      device: u.blulok_device ? {
        id: u.blulok_device.id,
        device_serial: u.blulok_device.device_serial,
        lock_status: u.blulok_device.lock_status,
        device_status: u.blulok_device.device_status,
        battery_level: u.blulok_device.battery_level,
      } : undefined,
      tenant: u.primary_tenant ? {
        id: u.primary_tenant.id,
        name: `${u.primary_tenant.first_name || ''} ${u.primary_tenant.last_name || ''}`.trim(),
        email: u.primary_tenant.email,
      } : undefined,
    }));
  } catch (error) {
    console.warn('Failed to fetch BluLok units:', error);
    return [];
  }
}

/**
 * Get access control devices for a facility
 */
export async function getBluLokDevices(facilityId: string): Promise<BluLokAccessControlDevice[]> {
  try {
    const data = await apiService.get(`/devices?facility_id=${facilityId}&device_type=access_control`);
    return (data.devices || data || []).map((d: any) => ({
      id: d.id,
      gateway_id: d.gateway_id,
      name: d.name,
      device_type: d.device_type,
      location_description: d.location_description,
      status: d.status,
      is_locked: d.is_locked,
    }));
  } catch (error) {
    console.warn('Failed to fetch BluLok devices:', error);
    return [];
  }
}

// ==========================================================================
// Facility Linking API (BluDesign <-> BluLok)
// ==========================================================================

export interface FacilityLink {
  /** BluLok facility ID */
  blulokFacilityId: string;
  /** BluLok facility name */
  blulokFacilityName: string;
  /** Linked BluDesign facility ID (null if not linked) */
  bluDesignFacilityId: string | null;
  /** Linked BluDesign facility name (null if not linked) */
  bluDesignFacilityName: string | null;
}

/**
 * Get all BluLok facilities with their BluDesign links
 */
export async function getFacilityLinks(): Promise<FacilityLink[]> {
  try {
    // Get all BluLok facilities
    const bluLokFacilities = await getBluLokFacilities();
    
    // Get all BluDesign facilities to check for links
    const bluDesignFacilities = await getFacilities();
    
    // Map BluLok facilities and check for links
    return bluLokFacilities.map(blulok => {
      // Look for a BluDesign facility linked to this BluLok facility
      // The link is stored in the BluDesign facility's dataSource.facilityId
      const linkedBluDesign = bluDesignFacilities.find(() => {
        // We need to fetch the full facility data to check the dataSource
        // For now, we'll return null and let the UI handle loading the full data
        return false;
      });
      
      return {
        blulokFacilityId: blulok.id,
        blulokFacilityName: blulok.name,
        bluDesignFacilityId: linkedBluDesign?.id || null,
        bluDesignFacilityName: linkedBluDesign?.name || null,
      };
    });
  } catch (error) {
    console.error('Failed to get facility links:', error);
    return [];
  }
}

/**
 * Link a BluDesign facility to a BluLok facility
 * Updates the BluDesign facility's dataSource configuration
 */
export async function linkBluDesignToBluLok(
  bluDesignFacilityId: string,
  blulokFacilityId: string,
  blulokFacilityName: string
): Promise<void> {
  try {
    // Get the current facility data
    const facility = await getFacility(bluDesignFacilityId);
    
    // Update the dataSource config
    const updatedData: FacilityData = {
      ...facility.data,
      dataSource: {
        type: 'blulok',
        facilityId: blulokFacilityId,
        facilityName: blulokFacilityName,
        autoConnect: true,
        lastSync: new Date(),
      }
    };
    
    // Save the updated facility
    await updateFacility(bluDesignFacilityId, updatedData);
    console.log(`[API] Linked BluDesign ${bluDesignFacilityId} to BluLok ${blulokFacilityId}`);
  } catch (error) {
    console.error('Failed to link facilities:', error);
    throw error;
  }
}

/**
 * Unlink a BluDesign facility from any BluLok facility
 */
export async function unlinkBluDesign(bluDesignFacilityId: string): Promise<void> {
  try {
    // Get the current facility data
    const facility = await getFacility(bluDesignFacilityId);
    
    // Clear the dataSource config
    const updatedData: FacilityData = {
      ...facility.data,
      dataSource: { type: 'none' }
    };
    
    // Save the updated facility
    await updateFacility(bluDesignFacilityId, updatedData);
    console.log(`[API] Unlinked BluDesign ${bluDesignFacilityId}`);
  } catch (error) {
    console.error('Failed to unlink facility:', error);
    throw error;
  }
}

/**
 * Get all BluDesign facilities with their linked BluLok facility info
 */
export async function getBluDesignFacilitiesWithLinks(): Promise<Array<{
  id: string;
  name: string;
  linkedBlulokId: string | null;
  linkedBlulokName: string | null;
}>> {
  try {
    const facilities = await getFacilities();
    
    // We need full facility data to get the dataSource
    const results = await Promise.all(
      facilities.map(async (f) => {
        try {
          const full = await getFacility(f.id);
          const dataSource = full.data?.dataSource;
          return {
            id: f.id,
            name: f.name,
            linkedBlulokId: dataSource?.type === 'blulok' ? dataSource.facilityId || null : null,
            linkedBlulokName: dataSource?.type === 'blulok' ? dataSource.facilityName || null : null,
          };
        } catch {
          return {
            id: f.id,
            name: f.name,
            linkedBlulokId: null,
            linkedBlulokName: null,
          };
        }
      })
    );
    
    return results;
  } catch (error) {
    console.error('Failed to get BluDesign facilities with links:', error);
    return [];
  }
}

// ==========================================================================
// Themes API
// ==========================================================================

export interface ThemeApiData {
  id: string;
  name: string;
  description?: string;
  categorySkins: Record<string, string | null>;
  buildingSkin: string;
  buildingSkinId?: string;
  environment?: {
    grass: Record<string, unknown>;
    pavement: Record<string, unknown>;
    gravel: Record<string, unknown>;
  };
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all custom themes for the current user
 */
export async function getThemes(): Promise<ThemeApiData[]> {
  const response = await apiService.get(`${API_BASE}/themes`);
  return response.themes.map((t: any) => ({
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  }));
}

/**
 * Get a specific theme by ID
 */
export async function getTheme(id: string): Promise<ThemeApiData> {
  const response = await apiService.get(`${API_BASE}/themes/${id}`);
  return {
    ...response.theme,
    createdAt: new Date(response.theme.createdAt),
    updatedAt: new Date(response.theme.updatedAt),
  };
}

/**
 * Create a new custom theme
 */
export async function createTheme(theme: Omit<ThemeApiData, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): Promise<ThemeApiData> {
  const response = await apiService.post(`${API_BASE}/themes`, theme);
  return {
    ...response.theme,
    createdAt: new Date(response.theme.createdAt),
    updatedAt: new Date(response.theme.updatedAt),
  };
}

/**
 * Update an existing custom theme
 */
export async function updateThemeApi(id: string, updates: Partial<ThemeApiData>): Promise<ThemeApiData> {
  const response = await apiService.put(`${API_BASE}/themes/${id}`, updates);
  return {
    ...response.theme,
    createdAt: new Date(response.theme.createdAt),
    updatedAt: new Date(response.theme.updatedAt),
  };
}

/**
 * Delete a custom theme
 */
export async function deleteThemeApi(id: string): Promise<void> {
  await apiService.delete(`${API_BASE}/themes/${id}`);
}

// ==========================================================================
// Skins API
// ==========================================================================

export interface SkinApiData {
  id: string;
  name: string;
  description?: string;
  category: string;
  partMaterials: Record<string, Record<string, unknown>>;
  thumbnail?: string;
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get all custom skins for the current user
 */
export async function getSkins(category?: string): Promise<SkinApiData[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const response = await apiService.get(`${API_BASE}/skins${params}`);
  return response.skins.map((s: any) => ({
    ...s,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  }));
}

/**
 * Get a specific skin by ID
 */
export async function getSkin(id: string): Promise<SkinApiData> {
  const response = await apiService.get(`${API_BASE}/skins/${id}`);
  return {
    ...response.skin,
    createdAt: new Date(response.skin.createdAt),
    updatedAt: new Date(response.skin.updatedAt),
  };
}

/**
 * Create a new custom skin
 */
export async function createSkinApi(skin: Omit<SkinApiData, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>): Promise<SkinApiData> {
  const response = await apiService.post(`${API_BASE}/skins`, skin);
  return {
    ...response.skin,
    createdAt: new Date(response.skin.createdAt),
    updatedAt: new Date(response.skin.updatedAt),
  };
}

/**
 * Update an existing custom skin
 */
export async function updateSkinApi(id: string, updates: Partial<SkinApiData>): Promise<SkinApiData> {
  const response = await apiService.put(`${API_BASE}/skins/${id}`, updates);
  return {
    ...response.skin,
    createdAt: new Date(response.skin.createdAt),
    updatedAt: new Date(response.skin.updatedAt),
  };
}

/**
 * Delete a custom skin
 */
export async function deleteSkinApi(id: string): Promise<void> {
  await apiService.delete(`${API_BASE}/skins/${id}`);
}
