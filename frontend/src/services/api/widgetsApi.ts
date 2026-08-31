import { get, post, put, del, patch } from './httpClient';

export async function getWidgetLayouts(activeFacilityId?: string | null) {
  return get('/widget-layouts', {
    params: activeFacilityId ? { activeFacilityId } : undefined,
  });
}

export async function saveWidgetLayouts(layouts: Array<{
  widgetId: string;
  widgetType?: string;
  config?: Record<string, unknown>;
  layoutConfig: unknown;
  displayOrder: number;
  isVisible?: boolean;
}>) {
  return post('/widget-layouts', { layouts });
}

export async function saveDashboard(pages: Array<{
  id?: string;
  name?: string;
  pageOrder: number;
  widgets: Array<{
    widgetId: string;
    widgetType?: string;
    config?: Record<string, unknown>;
    layoutConfig: unknown;
    displayOrder: number;
    isVisible?: boolean;
  }>;
}>, activePageId?: string) {
  return post('/widget-layouts', { pages, activePageId });
}

export async function updateWidget(
  widgetId: string,
  data: {
    layoutConfig?: unknown;
    isVisible?: boolean;
    displayOrder?: number;
  },
  pageId?: string
) {
  return put(`/widget-layouts/${widgetId}`, data, {
    params: pageId ? { pageId } : undefined,
  });
}

export async function hideWidget(widgetId: string, pageId?: string) {
  return del(`/widget-layouts/${widgetId}`, {
    params: pageId ? { pageId } : undefined,
  });
}

export async function showWidget(widgetId: string) {
  return post(`/widget-layouts/${widgetId}/show`);
}

export async function resetWidgetLayout(activeFacilityId?: string | null) {
  return post('/widget-layouts/reset', {
    activeFacilityId: activeFacilityId ?? undefined,
  });
}

export async function resetWidgetLayoutDefaults() {
  return post('/widget-layouts/reset-defaults');
}

export async function getWidgetTemplates() {
  return get('/widget-layouts/templates');
}

export async function listSavedDashboards() {
  return get('/saved-dashboards');
}

export async function createSavedDashboard(payload: { name: string; description?: string }) {
  return post('/saved-dashboards', payload);
}

export async function updateSavedDashboardSnapshot(id: string) {
  return put(`/saved-dashboards/${id}/snapshot`);
}

export async function renameSavedDashboard(
  id: string,
  payload: { name?: string; description?: string | null }
) {
  return patch(`/saved-dashboards/${id}`, payload);
}

export async function deleteSavedDashboard(id: string) {
  return del(`/saved-dashboards/${id}`);
}

export async function loadSavedDashboard(id: string, activeFacilityId?: string | null) {
  return post(`/saved-dashboards/${id}/load`, {
    activeFacilityId: activeFacilityId ?? undefined,
  });
}

export async function listDashboardAssignments() {
  return get('/dashboard-assignments');
}

export async function createDashboardAssignment(payload: {
  savedDashboardId: string;
  scope: 'global' | 'facility' | 'user';
  facilityId?: string | null;
  userId?: string | null;
  targetRole: string;
  priority?: number;
}) {
  return post('/dashboard-assignments', payload);
}

export async function updateDashboardAssignment(
  id: string,
  payload: { savedDashboardId?: string; priority?: number }
) {
  return patch(`/dashboard-assignments/${id}`, payload);
}

export async function deleteDashboardAssignment(id: string) {
  return del(`/dashboard-assignments/${id}`);
}
