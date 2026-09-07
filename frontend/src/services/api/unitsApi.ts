import { get, post, put, del } from './httpClient';

export async function getUnits(filters?: object) {
  return get('/units', { params: filters });
}

export async function getUnitDetails(unitId: string) {
  return get(`/units/${unitId}`);
}

export async function getUnit(id: string) {
  return get(`/units/${id}`);
}

export async function createUnit(data: object) {
  return post('/units', data);
}

export async function updateUnit(id: string, data: object) {
  return put(`/units/${id}`, data);
}

export async function setUnitOverlock(unitId: string, isOverlocked: boolean) {
  return put(`/units/${unitId}/overlock`, { is_overlocked: isOverlocked });
}

export async function deleteUnit(id: string) {
  return del(`/units/${id}`);
}

export async function assignTenantToUnit(unitId: string, tenantId: string, isPrimary: boolean) {
  return post(`/units/${unitId}/assign`, {
    tenant_id: tenantId,
    is_primary: isPrimary
  });
}

export async function removeTenantFromUnit(unitId: string, tenantId: string) {
  return del(`/units/${unitId}/assign/${tenantId}`);
}

export async function getMyUnits() {
  return get('/units/my');
}
