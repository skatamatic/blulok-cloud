import { memo } from 'react';
import {
  BuildingStorefrontIcon,
  CubeIcon,
  UsersIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { StatsWidget } from '@/components/Widget/StatsWidget';
import { HistogramWidget } from '@/components/Widget/HistogramWidget';
import { ActivityMonitorWidget } from '@/components/Widget/ActivityMonitorWidget';
import { RemoteGateWidget } from '@/components/Widget/RemoteGateWidget';
import { NotificationsWidget } from '@/components/Widget/NotificationsWidget';
import { BatteryStatusWidget } from '@/components/Widget/BatteryStatusWidget';
import { UnlockedUnitsWidget } from '@/components/Widget/UnlockedUnitsWidget';
import { SyncFMSWidget } from '@/components/Widget/SyncFMSWidget';
import { AccessHistoryWidget } from '@/components/Widget/AccessHistoryWidget';
import { SharedKeysWidget } from '@/components/Widget/SharedKeysWidget';
import { LockStatusWidget } from '@/components/Widget/LockStatusWidget';
import { FacilityViewerWidget } from '@/components/Widget/FacilityViewerWidget';
import { DailyAccessCodesWidget } from '@/components/Widget/DailyAccessCodesWidget';
import { UnitsManagerWidget } from '@/components/Widget/UnitsManagerWidget';
import { WidgetSize } from '@/types/widget.types';
import { WidgetInstance } from '@/types/widget-management.types';
import { getWidgetType } from '@/config/widgetRegistry';
import { ScopedGeneralStatsData } from '@/types/dashboard.types';

export interface DashboardWidgetRendererProps {
  widget: WidgetInstance;
  /** Live resize preview tier; falls back to `widget.size` when unset. */
  displaySize?: WidgetSize;
  isTenant: boolean;
  canEditLayout?: boolean;
  effectiveFacilityId?: string;
  generalStats: ScopedGeneralStatsData | null;
  statsLoading: boolean;
  statsError: string | null;
  onSizeChange: (widgetId: string, size: WidgetSize) => void;
  onRemove?: (widgetId: string) => void;
  onFullscreenToggle?: (widgetId: string) => void;
  isFullscreen?: boolean;
  gridSize?: { w: number; h: number };
  /** Dashboard page strip: this widget's page is the visible page. */
  isPageActive?: boolean;
  /** Dashboard page strip is mid-slide — heavy widgets should pause rendering. */
  isPageTransitioning?: boolean;
}

export const DashboardWidgetRenderer = memo(function DashboardWidgetRenderer({
  widget,
  displaySize,
  isTenant,
  canEditLayout = false,
  effectiveFacilityId,
  generalStats,
  statsLoading,
  statsError,
  onSizeChange,
  onRemove,
  onFullscreenToggle,
  isFullscreen = false,
  gridSize,
  isPageActive = true,
  isPageTransitioning = false,
}: DashboardWidgetRendererProps) {
  const widgetType = getWidgetType(widget.type);
  if (!widgetType) {
    console.error('Widget type not found:', widget.type);
    return null;
  }

  const effectiveSize = displaySize ?? widget.size;

  const handleFullscreen =
    widgetType.supportsFullscreen && onFullscreenToggle
      ? () => onFullscreenToggle(widget.id)
      : undefined;

  const layoutEditable = canEditLayout && !isTenant;
  const handleSizeChange = (size: WidgetSize) => onSizeChange(widget.id, size);
  const facilityViewerRenderActive = isPageActive && !isPageTransitioning;

  const commonProps = {
    id: widget.id,
    title: widget.title,
    initialSize: effectiveSize,
    currentSize: effectiveSize,
    availableSizes: widgetType.availableSizes,
    readOnly: !layoutEditable,
    onSizeChange: layoutEditable ? handleSizeChange : undefined,
    onRemove: layoutEditable && onRemove ? () => onRemove(widget.id) : undefined,
    onFullscreenToggle: handleFullscreen,
    isFullscreen,
  };

  switch (widget.type) {
    case 'stats-facilities':
      return (
        <StatsWidget
          {...commonProps}
          value={String(generalStats?.facilities?.total ?? 0)}
          icon={BuildingStorefrontIcon}
          color="blue"
          loading={statsLoading}
          error={statsError}
        />
      );
    case 'stats-devices':
      return (
        <StatsWidget
          {...commonProps}
          value={String(generalStats?.devices?.total ?? 0)}
          icon={CubeIcon}
          color="green"
          loading={statsLoading}
          error={statsError}
        />
      );
    case 'stats-users':
      return (
        <StatsWidget
          {...commonProps}
          value={String(generalStats?.users?.total ?? 0)}
          icon={UsersIcon}
          color="purple"
          loading={statsLoading}
          error={statsError}
        />
      );
    case 'stats-alerts':
      return (
        <StatsWidget
          {...commonProps}
          title="Unread alert notifications"
          value={String(generalStats?.alerts?.open ?? 0)}
          icon={ExclamationTriangleIcon}
          color="red"
          loading={statsLoading}
          error={statsError}
        />
      );
    case 'histogram':
      return <HistogramWidget {...commonProps} facilityFilter={effectiveFacilityId} />;
    case 'activity-monitor':
      return (
        <ActivityMonitorWidget {...commonProps} facilityFilter={effectiveFacilityId} />
      );
    case 'remote-gate':
      return <RemoteGateWidget {...commonProps} facilityFilter={effectiveFacilityId} />;
    case 'notifications':
      return (
        <NotificationsWidget {...commonProps} facilityFilter={effectiveFacilityId} />
      );
    case 'battery-status':
      return (
        <BatteryStatusWidget
          {...commonProps}
          facilityFilter={effectiveFacilityId}
          onSizeChange={(size) => onSizeChange(widget.id, size)}
        />
      );
    case 'unlocked-units':
      return (
        <UnlockedUnitsWidget {...commonProps} facilityFilter={effectiveFacilityId} />
      );
    case 'sync-fms':
      return <SyncFMSWidget {...commonProps} />;
    case 'access-history':
      return (
        <AccessHistoryWidget
          currentSize={widget.size as WidgetSize}
          readOnly={!layoutEditable}
          onSizeChange={layoutEditable ? (size) => onSizeChange(widget.id, size) : undefined}
          onRemove={layoutEditable && onRemove ? () => onRemove(widget.id) : undefined}
        />
      );
    case 'shared-keys':
      return (
        <SharedKeysWidget
          currentSize={widget.size as WidgetSize}
          readOnly={!layoutEditable}
          onSizeChange={layoutEditable ? (size) => onSizeChange(widget.id, size) : undefined}
          onRemove={layoutEditable && onRemove ? () => onRemove(widget.id) : undefined}
        />
      );
    case 'lock-status':
      return (
        <LockStatusWidget
          currentSize={widget.size as WidgetSize}
          readOnly={!layoutEditable}
          onSizeChange={layoutEditable ? (size) => onSizeChange(widget.id, size) : undefined}
          onRemove={layoutEditable && onRemove ? () => onRemove(widget.id) : undefined}
        />
      );
    case 'daily-access-codes':
      return (
        <DailyAccessCodesWidget
          currentSize={widget.size as WidgetSize}
          readOnly={!layoutEditable}
          onSizeChange={layoutEditable ? (size) => onSizeChange(widget.id, size) : undefined}
          onRemove={layoutEditable && onRemove ? () => onRemove(widget.id) : undefined}
        />
      );
    case 'units-manager':
      return (
        <UnitsManagerWidget
          {...commonProps}
          facilityFilter={effectiveFacilityId}
          gridSize={gridSize}
        />
      );
    case 'facility-viewer': {
      const viewerConfig = (widget.config ?? {}) as {
        bluDesignFacilityId?: string;
        bluLokFacilityId?: string;
        facilityName?: string;
      };
      return (
        <FacilityViewerWidget
          {...commonProps}
          bluDesignFacilityId={viewerConfig.bluDesignFacilityId || ''}
          bluLokFacilityId={viewerConfig.bluLokFacilityId}
          facilityName={viewerConfig.facilityName}
          isRenderActive={facilityViewerRenderActive}
        />
      );
    }
    default:
      return null;
  }
});
