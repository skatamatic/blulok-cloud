import { WidgetSize } from '@/types/widget.types';
import { WidgetLayout } from '@/components/Widget/WidgetGrid';

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  size: WidgetSize;
  config?: Record<string, unknown>;
}

export interface WidgetInstance {
  id: string;
  type: string;
  title: string;
  size: WidgetSize;
  config?: Record<string, unknown>;
}

export interface DashboardPageState {
  id: string;
  name: string;
  pageOrder: number;
  widgetInstances: WidgetInstance[];
  layouts: { lg: WidgetLayout[]; md: WidgetLayout[]; sm: WidgetLayout[] };
}

export interface DashboardState {
  pages: DashboardPageState[];
  activePageId: string;
}

export const DASHBOARD_STORAGE_KEY = 'blulok-dashboard-v2';
export const MAX_DASHBOARD_PAGES = 5;
export const ALL_FACILITIES_ID = '__ALL_FACILITIES__';

export type DashboardLayoutSource = 'assigned' | 'personal' | 'default';

/** Response shape from GET/POST widget-layouts and load saved-dashboard */
export interface DashboardLayoutApiResponse {
  pages?: Array<{
    id?: string;
    name: string;
    pageOrder: number;
    widgets: Array<{
      id?: string;
      widgetType: string;
      title?: string;
      size?: WidgetSize;
      layoutConfig?: Record<string, unknown>;
      widgetConfig?: Record<string, unknown>;
    }>;
  }>;
  layouts?: unknown;
  layoutSource?: DashboardLayoutSource;
  assignedDashboardId?: string;
  assignedDashboardName?: string;
  hasAssignedOverride?: boolean;
  canEditLayout?: boolean;
  /** True when admin/dev_admin may add/rename/remove dashboard pages (not tied to current page count). */
  allowMultiplePages?: boolean;
  isDefault?: boolean;
}
