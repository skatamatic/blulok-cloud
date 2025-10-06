import { WidgetTypeDefinition } from '@/types/widget.types';
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CpuChipIcon,
  BuildingStorefrontIcon,
  UsersIcon,
  DocumentTextIcon,
  ChartPieIcon,
  BellIcon,
  BoltIcon,
  LockOpenIcon,
  ServerIcon,
  ArrowPathIcon,
  KeyIcon
} from '@heroicons/react/24/outline';

// Import the shared widget registry and add icons
import { WIDGET_REGISTRY as SHARED_WIDGET_REGISTRY } from '@/types/widget.types';

// Create the frontend widget registry by adding icons to the shared definitions
export const WIDGET_REGISTRY: Record<string, WidgetTypeDefinition & { icon: React.ComponentType<{ className?: string }> }> = {
  'stats-facilities': {
    ...SHARED_WIDGET_REGISTRY['stats-facilities'],
    icon: BuildingStorefrontIcon
  },
  'stats-devices': {
    ...SHARED_WIDGET_REGISTRY['stats-devices'],
    icon: CpuChipIcon
  },
  'stats-users': {
    ...SHARED_WIDGET_REGISTRY['stats-users'],
    icon: UsersIcon
  },
  'stats-alerts': {
    ...SHARED_WIDGET_REGISTRY['stats-alerts'],
    icon: ExclamationTriangleIcon
  },
  'activity-monitor': {
    ...SHARED_WIDGET_REGISTRY['activity-monitor'],
    icon: ClockIcon
  },
  'activity-feed': {
    ...SHARED_WIDGET_REGISTRY['activity-feed'],
    icon: ClockIcon
  },
  'access-history': {
    ...SHARED_WIDGET_REGISTRY['access-history'],
    icon: ClockIcon
  },
  'notifications': {
    ...SHARED_WIDGET_REGISTRY['notifications'],
    icon: BellIcon
  },
  'battery-status': {
    ...SHARED_WIDGET_REGISTRY['battery-status'],
    icon: BoltIcon
  },
  'unlocked-units': {
    ...SHARED_WIDGET_REGISTRY['unlocked-units'],
    icon: LockOpenIcon
  },
  'lock-status': {
    ...SHARED_WIDGET_REGISTRY['lock-status'],
    icon: LockOpenIcon
  },
  'shared-keys': {
    ...SHARED_WIDGET_REGISTRY['shared-keys'],
    icon: KeyIcon
  },
  'system-status': {
    ...SHARED_WIDGET_REGISTRY['system-status'],
    icon: CpuChipIcon
  },
  'remote-gate': {
    ...SHARED_WIDGET_REGISTRY['remote-gate'],
    icon: ServerIcon
  },
  'sync-fms': {
    ...SHARED_WIDGET_REGISTRY['sync-fms'],
    icon: ArrowPathIcon
  },
  'performance-stats': {
    ...SHARED_WIDGET_REGISTRY['performance-stats'],
    icon: ChartBarIcon
  },
  'test-scroll': {
    ...SHARED_WIDGET_REGISTRY['test-scroll'],
    icon: DocumentTextIcon
  },
  'histogram': {
    ...SHARED_WIDGET_REGISTRY['histogram'],
    icon: ChartPieIcon
  }
};

export const getWidgetType = (type: string): (WidgetTypeDefinition & { icon: React.ComponentType<{ className?: string }> }) | undefined => {
  return WIDGET_REGISTRY[type];
};

export const getAvailableWidgets = (): (WidgetTypeDefinition & { icon: React.ComponentType<{ className?: string }> })[] => {
  return Object.values(WIDGET_REGISTRY);
};

export const getWidgetsByCategory = (category: string): (WidgetTypeDefinition & { icon: React.ComponentType<{ className?: string }> })[] => {
  return Object.values(WIDGET_REGISTRY).filter(widget => widget.category === category);
};
