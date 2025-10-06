import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { Layout } from 'react-grid-layout';
import { WidgetGrid, WidgetLayout } from '@/components/Widget/WidgetGrid';
import { apiService } from '@/services/api.service';
import { StatsWidget } from '@/components/Widget/StatsWidget';
import { ActivityWidget } from '@/components/Widget/ActivityWidget';
import { StatusWidget } from '@/components/Widget/StatusWidget';
import { TestScrollWidget } from '@/components/Widget/TestScrollWidget';
import { HistogramWidget } from '@/components/Widget/HistogramWidget';
import { AddWidgetModal } from '@/components/Widget/AddWidgetModal';
import { AddUserModal } from '@/components/UserManagement/AddUserModal';
import { ActivityMonitorWidget } from '@/components/Widget/ActivityMonitorWidget';
import { RemoteGateWidget } from '@/components/Widget/RemoteGateWidget';
import { NotificationsWidget } from '@/components/Widget/NotificationsWidget';
import { BatteryStatusWidget } from '@/components/Widget/BatteryStatusWidget';
import { UnlockedUnitsWidget } from '@/components/Widget/UnlockedUnitsWidget';
import { SyncFMSWidget } from '@/components/Widget/SyncFMSWidget';
import { AccessHistoryWidget } from '@/components/Widget/AccessHistoryWidget';
import { SharedKeysWidget } from '@/components/Widget/SharedKeysWidget';
import { LockStatusWidget } from '@/components/Widget/LockStatusWidget';
import { WidgetSize } from '@/components/Widget/WidgetSizeDropdown';
import { WidgetInstance } from '@/types/widget-management.types';
import { getWidgetType } from '@/config/widgetRegistry';
import { useGeneralStatsData } from '@/hooks/useGeneralStatsData';
import { widgetSubscriptionManager } from '@/services/widget-subscription-manager';
import { sizeToGrid, gridToSize } from '@/utils/widget-size.utils';
import { 
  BuildingStorefrontIcon, 
  CubeIcon, 
  UsersIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  UserPlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function DashboardPage() {
  const { authState } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const { stats: generalStats, loading: statsLoading, error: statsError, canAccess, getHandlers } = useGeneralStatsData();

  // Check if user is a tenant
  const isTenant = authState.user?.role === UserRole.TENANT;

  // Widget instances management - Different layouts for tenants vs admins
  const [widgetInstances, setWidgetInstances] = useState<WidgetInstance[]>(() => {
    if (isTenant) {
      // Tenant-specific widgets
      return [
        { id: 'access-history', type: 'access-history', title: 'Access History', size: 'medium' },
        { id: 'notifications', type: 'notifications', title: 'Notifications', size: 'medium' },
        { id: 'lock-status', type: 'lock-status', title: 'Lock Status', size: 'large' },
        { id: 'shared-keys', type: 'shared-keys', title: 'Shared Keys Overview', size: 'medium' },
      ];
    } else {
      // Admin/Staff widgets
      return [
        { id: 'facilities', type: 'stats-facilities', title: 'Total Facilities', size: 'medium' },
        { id: 'devices', type: 'stats-devices', title: 'Active Devices', size: 'medium' },
        { id: 'users', type: 'stats-users', title: 'Registered Users', size: 'medium' },
        { id: 'alerts', type: 'stats-alerts', title: 'Active Alerts', size: 'medium' },
        { id: 'notifications', type: 'notifications', title: 'Notifications', size: 'medium-tall' },
        { id: 'activity-monitor', type: 'activity-monitor', title: 'Activity Monitor', size: 'large' },
        { id: 'unlocked-units', type: 'unlocked-units', title: 'Unlocked Units', size: 'medium' },
        { id: 'battery-status', type: 'battery-status', title: 'Battery Status', size: 'medium' },
      ];
    }
  });

  // Flag to prevent layout sync loops
  // const [isLocalChange, setIsLocalChange] = useState(false);
  // Flag to prevent WebSocket sync during widget modifications
  // const [isModifyingWidgets, setIsModifyingWidgets] = useState(false);

  // Helper function to determine widget size from grid dimensions
  const getWidgetSizeFromGrid = (w: number, h: number): WidgetSize => {
    return gridToSize(w, h);
  };

  // DISABLED: Widget subscriptions temporarily disabled
  // Handle dashboard layout sync from other tabs/devices
  // const handleLayoutSync = useCallback((data: any) => {
  //   console.log('📊 Dashboard: Received layout sync:', data);
  //   console.log('📊 Dashboard: Current state - isLocalChange:', isLocalChange, 'isModifyingWidgets:', isModifyingWidgets);
  //   console.log('📊 Dashboard: Current widget instances count:', widgetInstances.length);
  //   console.log('📊 Dashboard: Current layouts count:', layouts.lg?.length || 0);
    
  //   // Don't apply sync if we're in the middle of a local change or modifying widgets
  //   if (isLocalChange || isModifyingWidgets) {
  //     console.log('📊 Dashboard: Ignoring layout sync - local change or widget modification in progress');
  //     return;
  //   }
    
  //   if (data.layouts && data.widgetInstances) {
  //     // Check if we have meaningful data (not just empty arrays)
  //     const hasLayoutData = Object.values(data.layouts).some((layout: any) => Array.isArray(layout) && layout.length > 0);
  //     const hasWidgetData = Array.isArray(data.widgetInstances) && data.widgetInstances.length > 0;
      
  //     if (hasLayoutData || hasWidgetData) {
  //       console.log('📊 Dashboard: Applying layout sync with data');
        
  //       // Ensure widget instances have correct sizes based on layout dimensions
  //       const syncedWidgetInstances = data.widgetInstances.map((widget: WidgetInstance) => {
  //         // Find the corresponding layout item
  //         const layoutItem = data.layouts.lg?.find((item: any) => item.i === widget.id);
  //         if (layoutItem) {
  //           // Derive the correct size from grid dimensions
  //           const correctSize = getWidgetSizeFromGrid(layoutItem.w, layoutItem.h);
  //           if (widget.size !== correctSize) {
  //             console.log(`📊 Dashboard: Syncing widget ${widget.id} size from ${widget.size} to ${correctSize}`);
  //             return { ...widget, size: correctSize };
  //           }
  //         }
  //         return widget;
  //       });
        
  //       console.log('📊 Dashboard: Synced widget instances:', syncedWidgetInstances.map((w: WidgetInstance) => ({ id: w.id, size: w.size })));
        
  //       setLayouts(data.layouts);
  //       setWidgetInstances(syncedWidgetInstances);
  //     } else {
  //       console.log('📊 Dashboard: Ignoring empty layout sync data');
  //     }
  //   } else {
  //     console.log('📊 Dashboard: Invalid layout sync data format');
  //   }
  // }, [isLocalChange, isModifyingWidgets, getWidgetSizeFromGrid]);

  // Broadcast layout changes to other tabs/devices
  const broadcastLayoutChange = useCallback(async (layouts: { [key: string]: WidgetLayout[] }, _instances: WidgetInstance[]) => {
    if (authState.user?.id) {
      console.log('📊 Dashboard: Broadcasting layout change to other tabs');
      console.log('📊 Dashboard: Layouts to broadcast:', layouts);
      console.log('📊 Dashboard: Widget instances to broadcast:', _instances.length);
      
      try {
        // Convert grid layouts to API format
        const layoutsToSave = layouts.lg?.map((item, index) => {
          // Find the widget instance to get the correct size enum
          const widgetInstance = _instances.find(w => w.id === item.i);
          const widgetSize = widgetInstance?.size || getWidgetSizeFromGrid(item.w, item.h);
          
          return {
            widgetId: item.i,
            layoutConfig: {
              position: { x: item.x, y: item.y },
              size: widgetSize, // Only save the size enum, not dimensions
            },
            displayOrder: index,
            isVisible: true, // All widgets in layout are visible
          };
        }) || [];
        
        // Save to backend - this will trigger WebSocket broadcast
        await apiService.saveWidgetLayouts(layoutsToSave);
        console.log('📊 Dashboard: Layout saved and broadcasted');
      } catch (error) {
        console.error('📊 Dashboard: Failed to save layout:', error);
      }
    }
  }, [authState.user?.id, getWidgetSizeFromGrid]);

  // Manage widget subscriptions based on visible widgets (stats only, layout sync disabled)
  useEffect(() => {
    console.log('📊 Dashboard: Managing subscriptions for', widgetInstances.length, 'widgets');
    console.log('📊 Dashboard: Widget instances:', widgetInstances.map(w => ({ id: w.id, type: w.type, title: w.title })));
    
    if (!canAccess) {
      console.log('📊 Dashboard: User cannot access general stats, skipping subscriptions');
      // Ensure we unsubscribe if access is revoked while the component is mounted
      widgetSubscriptionManager.unsubscribe('general_stats');
      widgetSubscriptionManager.unsubscribe('units');
      return;
    }

    const statsWidgetTypes = ['stats-facilities', 'stats-devices', 'stats-users'];
    const unitsWidgetTypes = ['unlocked-units'];
    
    const visibleStatsWidgets = widgetInstances.filter(widget => 
      statsWidgetTypes.includes(widget.type)
    );
    const visibleUnitsWidgets = widgetInstances.filter(widget => 
      unitsWidgetTypes.includes(widget.type)
    );

    // Set up subscriptions (stats and units, no layout sync)
    const subscriptions: string[] = [];
    const subscriptionMap: Record<string, { handler: (data: any) => void; errorHandler?: (error: string) => void }> = {};

    if (visibleStatsWidgets.length > 0) {
      console.log('📊 Dashboard: Managing subscriptions for', visibleStatsWidgets.length, 'stats widgets');
      subscriptions.push('general_stats');
      const { onData, onError } = getHandlers();
      subscriptionMap['general_stats'] = {
        handler: onData,
        errorHandler: onError
      };
    } else {
      console.log('📊 Dashboard: No stats widgets visible, unsubscribing from general_stats');
      widgetSubscriptionManager.unsubscribe('general_stats');
    }

    if (visibleUnitsWidgets.length > 0) {
      console.log('📊 Dashboard: Managing subscriptions for', visibleUnitsWidgets.length, 'units widgets');
      subscriptions.push('units');
      subscriptionMap['units'] = {
        handler: (data: any) => {
          console.log('📊 Dashboard: Received units update:', data);
          // Units data will be handled by individual widget hooks
        },
        errorHandler: (error: string) => console.error('Units subscription error:', error)
      };
    } else {
      console.log('📊 Dashboard: No units widgets visible, unsubscribing from units');
      widgetSubscriptionManager.unsubscribe('units');
    }

    // DISABLED: Layout sync subscriptions disabled
    // subscriptions.push('dashboard_layout');
    // subscriptionMap['dashboard_layout'] = {
    //   handler: handleLayoutSync,
    //   errorHandler: (error: string) => console.error('Dashboard layout sync error:', error)
    // };

    if (subscriptions.length > 0) {
      widgetSubscriptionManager.updateSubscriptions(subscriptions, subscriptionMap);
    }

    // Cleanup function - unsubscribe when component unmounts
    return () => {
      console.log('📊 Dashboard: Component unmounting, cleaning up subscriptions');
      widgetSubscriptionManager.unsubscribeAll();
    };
  }, [widgetInstances.length, canAccess, getHandlers]); // Only depend on widget count, not the full instances array

  const MAX_WIDGETS = 20;
  const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  // Widget layouts - Will be set by createDefaultLayout or loaded from API
  const [layouts, setLayouts] = useState<{ [key: string]: WidgetLayout[] }>({
    lg: [],
    md: [],
    sm: []
  });

  // Sample data
  const recentActivities = [
    {
      id: '1',
      type: 'success' as const,
      message: 'Device BL-001 came online',
      timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      user: 'System'
    },
    {
      id: '2',
      type: 'info' as const,
      message: 'New user registered: john.doe@example.com',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      user: 'Admin'
    },
    {
      id: '3',
      type: 'warning' as const,
      message: 'Maintenance scheduled for Facility A',
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      user: 'Maintenance Team'
    },
    {
      id: '4',
      type: 'error' as const,
      message: 'Device BL-045 connection timeout',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      user: 'System'
    },
  ];

  const systemStatus = [
    { label: 'API Services', status: 'online' as const, details: 'All endpoints responding' },
    { label: 'Database', status: 'online' as const, details: 'Connection stable' },
    { label: 'Device Network', status: 'online' as const, details: '247/248 devices connected' },
    { label: 'Backup System', status: 'online' as const, details: 'Last backup: 2 hours ago' },
  ];

  // Create default layout - fixed professional layout
  const createDefaultLayout = () => {
    const defaultLayouts = {
      lg: [
        { i: 'facilities', x: 0, y: 0, w: 3, h: 2 },
        { i: 'devices', x: 3, y: 0, w: 3, h: 2 },
        { i: 'users', x: 6, y: 0, w: 3, h: 2 },
        { i: 'alerts', x: 9, y: 0, w: 3, h: 2 },
        { i: 'notifications', x: 0, y: 2, w: 3, h: 5 },
        { i: 'activity-monitor', x: 3, y: 2, w: 6, h: 3 },
        { i: 'unlocked-units', x: 9, y: 2, w: 3, h: 2 },
        { i: 'battery-status', x: 9, y: 4, w: 3, h: 3 },
      ],
      md: [
        { i: 'facilities', x: 0, y: 0, w: 5, h: 2 },
        { i: 'devices', x: 5, y: 0, w: 5, h: 2 },
        { i: 'users', x: 0, y: 2, w: 5, h: 2 },
        { i: 'alerts', x: 5, y: 2, w: 5, h: 2 },
        { i: 'notifications', x: 0, y: 4, w: 5, h: 4 },
        { i: 'activity-monitor', x: 5, y: 4, w: 5, h: 4 },
        { i: 'unlocked-units', x: 0, y: 8, w: 5, h: 2 },
        { i: 'battery-status', x: 5, y: 8, w: 5, h: 2 },
      ],
      sm: [
        { i: 'facilities', x: 0, y: 0, w: 6, h: 2 },
        { i: 'devices', x: 0, y: 2, w: 6, h: 2 },
        { i: 'users', x: 0, y: 4, w: 6, h: 2 },
        { i: 'alerts', x: 0, y: 6, w: 6, h: 2 },
        { i: 'notifications', x: 0, y: 8, w: 6, h: 4 },
        { i: 'activity-monitor', x: 0, y: 12, w: 6, h: 3 },
        { i: 'unlocked-units', x: 0, y: 15, w: 6, h: 2 },
        { i: 'battery-status', x: 0, y: 17, w: 6, h: 2 },
      ]
    };
    
    return defaultLayouts;
  };

  // Initialize with default layout only if no saved data exists
  useEffect(() => {
    // Check if we have any saved data in localStorage first
    const hasSavedData = (() => {
      try {
        const stored = window.localStorage.getItem('blulok-widget-layouts');
        return stored && JSON.parse(stored);
      } catch {
        return false;
      }
    })();
    
    if (!hasSavedData) {
      const defaultLayouts = createDefaultLayout();
      setLayouts(defaultLayouts);
    }
  }, []); // Run once on mount

  // Load user's widget layout on component mount
  useEffect(() => {
    const loadWidgetLayout = async () => {
      try {
        // First, try to load from window storage for instant display
        const windowLayouts = (() => {
          try {
            const stored = window.localStorage.getItem('blulok-widget-layouts');
            if (stored) {
              return JSON.parse(stored);
            }
          } catch (error) {
            console.warn('Failed to load layouts from window storage:', error);
          }
          return null;
        })();
        
        const windowWidgetInstances = (() => {
          try {
            const stored = window.localStorage.getItem('blulok-widget-instances');
            if (stored) {
              return JSON.parse(stored);
            }
          } catch (error) {
            console.warn('Failed to load widget instances from window storage:', error);
          }
          return null;
        })();
        
        if (windowLayouts && windowWidgetInstances) {
          // Filter out widgets with unknown types to prevent errors
          const validWidgetInstances = windowWidgetInstances.filter((widget: any) => {
            const widgetTypeConfig = getWidgetType(widget.type);
            if (!widgetTypeConfig) {
              console.warn(`Skipping widget ${widget.id} with unknown type: ${widget.type}`);
              return false;
            }
            return true;
          });
          
          setLayouts(windowLayouts);
          setWidgetInstances(validWidgetInstances);
          // Sync widget sizes with the loaded layouts
          syncWidgetSizesFromLayouts(windowLayouts);
          setIsLoading(false);
        }
        
        const response = await apiService.getWidgetLayouts();
        
        // Check if we have actual saved layouts (not just empty response)
        if (response.layouts && response.layouts.length > 0 && !response.isDefault) {
          // Convert saved layouts to grid format
          const savedLayouts: { [key: string]: WidgetLayout[] } = {
            lg: [],
            md: [],
            sm: [],
          };

          const newWidgetInstances: WidgetInstance[] = [];
          
          for (const widget of response.layouts) {
            const layoutItem = {
              i: widget.widgetId,
              x: widget.layoutConfig.position.x,
              y: widget.layoutConfig.position.y,
              w: widget.layoutConfig.position.w,
              h: widget.layoutConfig.position.h,
            };
            
            // Determine widget size from grid dimensions
            const widgetSize = getWidgetSizeFromGrid(layoutItem.w, layoutItem.h);
            
            // Find the corresponding widget instance or create a new one
            let widgetInstance = widgetInstances.find(w => w.id === widget.widgetId);
            
            if (!widgetInstance) {
              // Create a new widget instance for widgets that don't exist in defaults
              // Map backend widget type to frontend widget type
              const backendWidgetType = widget.widgetType || 'facilities';
              let frontendWidgetType: string;
              
              // Handle special cases for widget type mapping
              if (backendWidgetType === 'syncfms') {
                frontendWidgetType = 'sync-fms';
              } else if (backendWidgetType === 'remotegate') {
                frontendWidgetType = 'remote-gate';
              } else if (backendWidgetType === 'lockstatus') {
                frontendWidgetType = 'lock-status';
              } else if (backendWidgetType === 'accesshistory') {
                frontendWidgetType = 'access-history';
              } else if (backendWidgetType === 'sharedkeys') {
                frontendWidgetType = 'shared-keys';
              } else if (backendWidgetType === 'unlockedunits') {
                frontendWidgetType = 'unlocked-units';
              } else if (backendWidgetType === 'batterystatus') {
                frontendWidgetType = 'battery-status';
              } else if (backendWidgetType === 'activitymonitor') {
                frontendWidgetType = 'activity-monitor';
              } else if (backendWidgetType === 'stats') {
                // For generic stats widgets, try to determine from widget_id
                if (widget.widgetId.includes('facilities')) {
                  frontendWidgetType = 'stats-facilities';
                } else if (widget.widgetId.includes('devices')) {
                  frontendWidgetType = 'stats-devices';
                } else if (widget.widgetId.includes('users')) {
                  frontendWidgetType = 'stats-users';
                } else if (widget.widgetId.includes('alerts')) {
                  frontendWidgetType = 'stats-alerts';
                } else {
                  frontendWidgetType = `stats-${backendWidgetType}`;
                }
              } else {
                // Try direct mapping first, then fall back to stats- prefix
                const directMapping = getWidgetType(backendWidgetType);
                if (directMapping) {
                  frontendWidgetType = backendWidgetType;
                } else {
                  frontendWidgetType = `stats-${backendWidgetType}`;
                }
              }
              
              const widgetTypeConfig = getWidgetType(frontendWidgetType);
              
              // Skip widgets with unknown types to prevent errors
              if (!widgetTypeConfig) {
                console.warn(`Skipping widget ${widget.widgetId} with unknown type: ${frontendWidgetType}`);
                continue;
              }
              
              widgetInstance = {
                id: widget.widgetId,
                type: frontendWidgetType,
                title: widget.name || widgetTypeConfig.name || 'Unknown Widget',
                size: widgetSize,
                config: {}
              };
              
            } else {
              // Update existing widget with correct size
              widgetInstance = {
                ...widgetInstance,
                size: widgetSize
              };
            }
            
            newWidgetInstances.push(widgetInstance);
            
            savedLayouts.lg.push(layoutItem);
            // Generate responsive layouts (simplified for now)
            savedLayouts.md.push({ ...layoutItem, w: Math.min(layoutItem.w, 10) });
            savedLayouts.sm.push({ ...layoutItem, w: 6, x: 0, y: widget.displayOrder * 2 });
          }

          // Only update if we don't have window storage or if API data is different
          if (!windowLayouts || JSON.stringify(savedLayouts) !== JSON.stringify(windowLayouts)) {
            setLayouts(savedLayouts);
            if (newWidgetInstances.length > 0) {
              setWidgetInstances(newWidgetInstances);
            }
            // Sync all widget sizes with the loaded layouts
            syncWidgetSizesFromLayouts(savedLayouts);
            // Also save to window storage for next time
            try {
              window.localStorage.setItem('blulok-widget-layouts', JSON.stringify(savedLayouts));
              window.localStorage.setItem('blulok-widget-instances', JSON.stringify(newWidgetInstances));
            } catch (error) {
              console.warn('Failed to save API layouts to window storage:', error);
            }
          } else {
            // Still sync sizes even if layouts match, in case widget instances are out of sync
            syncWidgetSizesFromLayouts(windowLayouts);
          }
        } else {
          // Apply the default layout explicitly
          const defaultLayouts = createDefaultLayout();
          setLayouts(defaultLayouts);
          // Sync widget sizes with default layouts
          syncWidgetSizesFromLayouts(defaultLayouts);
        }
      } catch (error) {
        console.warn('Failed to load widget layout, using defaults:', error);
        // Apply default layout on error too
        const defaultLayouts = createDefaultLayout();
        setLayouts(defaultLayouts);
        // Sync widget sizes with default layouts
        syncWidgetSizesFromLayouts(defaultLayouts);
      } finally {
        setIsLoading(false);
      }
    };

    if (authState.isAuthenticated) {
      loadWidgetLayout();
    }
  }, [authState.isAuthenticated]);

  const handleLayoutChange = useCallback(async (_layout: Layout[], layouts: { [key: string]: Layout[] }) => {
    console.log('📊 Dashboard: handleLayoutChange called with layouts:', layouts);
    console.log('📊 Dashboard: Current widget instances before update:', widgetInstances.length);
    
    // setIsLocalChange(true);
    setLayouts(layouts);
    
    // Update widget instances to match the new layout dimensions
    setWidgetInstances(prevInstances => {
      console.log('📊 Dashboard: Updating widget instances, prev count:', prevInstances.length);
      
      const updatedInstances = prevInstances.map(widget => {
        const layoutItem = layouts.lg?.find((item: any) => item.i === widget.id);
        if (layoutItem) {
          const correctSize = getWidgetSizeFromGrid(layoutItem.w, layoutItem.h);
          if (widget.size !== correctSize) {
            console.log(`📊 Dashboard: Updating widget ${widget.id} size from ${widget.size} to ${correctSize}`);
            return { ...widget, size: correctSize };
          }
        }
        return widget;
      });
      
      console.log('📊 Dashboard: Updated instances count:', updatedInstances.length);
      
      // Broadcast layout changes to other tabs/devices with updated instances
      console.log('📊 Dashboard: Broadcasting layout change...');
      broadcastLayoutChange(layouts, updatedInstances);
      
      return updatedInstances;
    });
    
    // Reset the flag after a short delay to allow for layout sync from other tabs
    setTimeout(() => {
      console.log('📊 Dashboard: Clearing isLocalChange flag');
      // setIsLocalChange(false);
    }, 1000);
  }, [broadcastLayoutChange, getWidgetSizeFromGrid, widgetInstances.length]);

  // Widget management functions
  const removeWidget = useCallback(async (widgetId: string) => {
    // Set flag to prevent WebSocket sync from interfering
    // setIsModifyingWidgets(true);

    try {
      // Hide widget in backend (set is_visible to false)
      await apiService.hideWidget(widgetId);

      setWidgetInstances(prev => {
        const newInstances = prev.filter(widget => widget.id !== widgetId);
        // Save to window storage
        try {
          window.localStorage.setItem('blulok-widget-instances', JSON.stringify(newInstances));
        } catch (error) {
          console.warn('Failed to save widget instances to window storage:', error);
        }
        return newInstances;
      });
      
      // Remove from layouts
      setLayouts(prevLayouts => {
        const newLayouts = { ...prevLayouts };
        Object.keys(newLayouts).forEach(breakpoint => {
          newLayouts[breakpoint] = newLayouts[breakpoint].filter(item => item.i !== widgetId);
        });
        return newLayouts;
      });
    } catch (error) {
      console.error('Failed to hide widget in backend:', error);
    } finally {
      // Clear the flag after a short delay to allow the backend save to complete
      setTimeout(() => {
        // setIsModifyingWidgets(false);
      }, 1000);
    }
  }, []);

  const updateWidgetSize = useCallback((widgetId: string, newSize: WidgetSize) => {
    setWidgetInstances(prev => {
      const newInstances = prev.map(widget => 
        widget.id === widgetId ? { ...widget, size: newSize } : widget
      );
      // Save to window storage
      try {
        window.localStorage.setItem('blulok-widget-instances', JSON.stringify(newInstances));
      } catch (error) {
        console.warn('Failed to save widget instances to window storage:', error);
      }
      return newInstances;
    });
  }, []);

  const addWidget = useCallback(async (widgetType: string) => {
    if (widgetInstances.length >= MAX_WIDGETS) return;
    
    const widgetTypeConfig = getWidgetType(widgetType);
    if (!widgetTypeConfig) return;

    // Set flag to prevent WebSocket sync from interfering
    // setIsModifyingWidgets(true);

    try {
      // Generate unique ID that matches backend expectations
      const baseId = widgetType.replace('stats-', '').replace('-', '') + '_stats';
      let newId = baseId;
      let counter = 1;
      
      while (widgetInstances.some(w => w.id === newId)) {
        newId = `${baseId}_${counter}`;
        counter++;
      }

      const newWidget: WidgetInstance = {
        id: newId,
        type: widgetType,
        title: widgetTypeConfig.name,
        size: widgetTypeConfig.defaultSize,
        config: {}
      };

      // Add to layout - find a good position
      const gridSize = sizeToGrid(newWidget.size);
      
      // Find next available position (simplified)
      const existingItems = layouts.lg || [];
      const nextY = existingItems.length > 0 ? Math.max(...existingItems.map(item => item.y + item.h)) : 0;
      
      const newLayoutItem = {
        i: newId,
        x: 0,
        y: nextY,
        w: gridSize.w,
        h: gridSize.h,
      };

      const newLayouts = {
        ...layouts,
        lg: [...(layouts.lg || []), newLayoutItem],
        md: [...(layouts.md || []), { ...newLayoutItem, w: Math.min(gridSize.w, 10) }],
        sm: [...(layouts.sm || []), { ...newLayoutItem, w: 6, x: 0 }]
      };

      const newInstances = [...widgetInstances, newWidget];

      // Update local state
      setWidgetInstances(newInstances);
      setLayouts(newLayouts);
      
      console.log('📊 Dashboard: Added new widget:', { id: newId, type: widgetType, title: widgetTypeConfig.name });

      // Save to window storage
      try {
        window.localStorage.setItem('blulok-widget-instances', JSON.stringify(newInstances));
      } catch (error) {
        console.warn('Failed to save widget instances to window storage:', error);
      }

      // Immediately save to backend to prevent WebSocket sync from overwriting
      try {
        const layoutsToSave = newLayouts.lg?.map((item, index) => {
          // Find the widget instance to get the correct size enum
          const widgetInstance = newInstances.find(w => w.id === item.i);
          const widgetSize = widgetInstance?.size || getWidgetSizeFromGrid(item.w, item.h);
          
          return {
            widgetId: item.i,
            layoutConfig: {
              position: { x: item.x, y: item.y },
              size: widgetSize, // Only save the size enum, not dimensions
            },
            displayOrder: index,
            isVisible: true,
          };
        }) || [];

        await apiService.saveWidgetLayouts(layoutsToSave);
        console.log('📊 Dashboard: New widget saved to backend');
      } catch (error) {
        console.error('📊 Dashboard: Failed to save new widget to backend:', error);
      }
    } finally {
      // Clear the flag after a short delay to allow the backend save to complete
      setTimeout(() => {
        // setIsModifyingWidgets(false);
      }, 1000);
    }
  }, [widgetInstances, layouts, MAX_WIDGETS, getWidgetSizeFromGrid]);

  const handleWidgetGridSizeChange = useCallback(async (widgetId: string, gridSize: { w: number; h: number }) => {
    // Update widget size state
    const newSize = getWidgetSizeFromGrid(gridSize.w, gridSize.h);
    updateWidgetSize(widgetId, newSize);

    // Update grid layouts and trigger broadcast
    setLayouts(prevLayouts => {
      const newLayouts = { ...prevLayouts };
      
      // Update the grid size for this widget across all breakpoints
      Object.keys(newLayouts).forEach(breakpoint => {
        const layoutArray = newLayouts[breakpoint];
        const widgetIndex = layoutArray.findIndex(item => item.i === widgetId);
        
        if (widgetIndex !== -1) {
          newLayouts[breakpoint] = [
            ...layoutArray.slice(0, widgetIndex),
            {
              ...layoutArray[widgetIndex],
              w: gridSize.w,
              h: gridSize.h,
            },
            ...layoutArray.slice(widgetIndex + 1)
          ];
        }
      });
      
      // Trigger layout change handler to broadcast changes
      handleLayoutChange([], newLayouts);
      
      return newLayouts;
    });
  }, [updateWidgetSize, handleLayoutChange, getWidgetSizeFromGrid]);

  // Helper function to sync widget instances with layouts
  const syncWidgetSizesFromLayouts = useCallback((layouts: { [key: string]: WidgetLayout[] }) => {
    const lgLayout = layouts.lg || [];
    
    setWidgetInstances(prevInstances => {
      return prevInstances.map(widget => {
        const layoutItem = lgLayout.find(item => item.i === widget.id);
        if (layoutItem) {
          const correctSize = getWidgetSizeFromGrid(layoutItem.w, layoutItem.h);
          if (widget.size !== correctSize) {
            return { ...widget, size: correctSize };
          }
        }
        return widget;
      });
    });
  }, [getWidgetSizeFromGrid]);


  const handleLayoutSave = useCallback(async (layouts: { [key: string]: Layout[] }) => {
    try {
      // Convert grid layouts to API format
      const layoutsToSave = layouts.lg?.map((item, index) => ({
        widgetId: item.i,
        layoutConfig: {
          position: { x: item.x, y: item.y, w: item.w, h: item.h },
          size: getWidgetSizeFromGrid(item.w, item.h), // Only save size enum, derive dimensions from it
        },
        displayOrder: index,
        isVisible: true, // All widgets in layout are visible
      })) || [];
      
      await apiService.saveWidgetLayouts(layoutsToSave);
    } catch (error) {
      console.error('Failed to save widget layout:', error);
    }
  }, []);


  // Widget rendering helper
  const renderWidget = (widget: WidgetInstance) => {
    const widgetType = getWidgetType(widget.type);
    if (!widgetType) {
      console.error('Widget type not found:', widget.type);
      return null;
    }

    const commonProps = {
      id: widget.id,
      title: widget.title,
      initialSize: widget.size,
      currentSize: widget.size, // Add currentSize for external size changes
      availableSizes: widgetType.availableSizes,
      onSizeChange: (size: WidgetSize) => updateWidgetSize(widget.id, size),
      onGridSizeChange: (gridSize: { w: number; h: number }) => handleWidgetGridSizeChange(widget.id, gridSize),
      onRemove: isTenant ? undefined : () => removeWidget(widget.id)
    };

    switch (widget.type) {
      case 'stats-facilities':
        return (
          <StatsWidget
            {...commonProps}
            value={generalStats?.facilities.total.toString() || '0'}
            change={undefined} // Remove historical comparison for now
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
            value={generalStats?.devices.total.toString() || '0'}
            change={undefined} // Remove historical comparison for now
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
            value={generalStats?.users.total.toString() || '0'}
            change={undefined} // Remove historical comparison for now
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
            value="3"
            change={{ value: 25.0, trend: 'down' }}
            icon={ExclamationTriangleIcon}
            color="red"
          />
        );
      case 'activity-feed':
        return (
          <ActivityWidget
            {...commonProps}
            activities={recentActivities}
          />
        );
      case 'system-status':
        return (
          <StatusWidget
            {...commonProps}
            items={systemStatus}
          />
        );
      case 'test-scroll':
        return (
          <TestScrollWidget
            {...commonProps}
          />
        );
      case 'performance-stats':
        return (
          <StatsWidget
            {...commonProps}
            value="99.8%"
            change={{ value: 0.2, trend: 'up' }}
            icon={ChartBarIcon}
            color="green"
          />
        );
      case 'histogram':
        return (
          <HistogramWidget
            {...commonProps}
            userFacilities={authState.user?.facilityNames?.map((name, index) => ({
              id: String(index + 1),
              name
            })) || []}
          />
        );

      // MVP Widgets
      case 'activity-monitor':
        return (
          <ActivityMonitorWidget
            {...commonProps}
          />
        );

      case 'remote-gate':
        return (
          <RemoteGateWidget
            {...commonProps}
          />
        );

      case 'notifications':
        return (
          <NotificationsWidget
            {...commonProps}
          />
        );

      case 'battery-status':
        return (
          <BatteryStatusWidget
            {...commonProps}
          />
        );

      case 'unlocked-units':
        return (
          <UnlockedUnitsWidget
            {...commonProps}
          />
        );


      case 'sync-fms':
        return (
          <SyncFMSWidget
            {...commonProps}
          />
        );
      case 'access-history':
        return (
          <AccessHistoryWidget
            currentSize={widget.size as WidgetSize}
            onSizeChange={(size) => handleWidgetGridSizeChange(widget.id, sizeToGrid(size))}
            onRemove={isTenant ? undefined : () => removeWidget(widget.id)}
          />
        );
      case 'shared-keys':
        return (
          <SharedKeysWidget
            currentSize={widget.size as WidgetSize}
            onSizeChange={(size) => handleWidgetGridSizeChange(widget.id, sizeToGrid(size))}
            onRemove={isTenant ? undefined : () => removeWidget(widget.id)}
          />
        );
      case 'lock-status':
        return (
          <LockStatusWidget
            currentSize={widget.size as WidgetSize}
            onSizeChange={(size) => handleWidgetGridSizeChange(widget.id, sizeToGrid(size))}
            onRemove={isTenant ? undefined : () => removeWidget(widget.id)}
          />
        );

      default:
        return null;
    }
  };

  const handleDashboardRefresh = () => {
    // Refresh all dashboard data - for now we'll do a full page refresh
    // In the future, this could trigger specific data fetches for each widget
    window.location.reload();
  };

  const getWelcomeMessage = (): string => {
    const role = authState.user?.role;
    switch (role) {
      case UserRole.DEV_ADMIN:
        return 'Welcome to the development admin dashboard. You have full system access.';
      case UserRole.ADMIN:
        return 'Welcome to the admin dashboard. Manage your facilities and users.';
      case UserRole.BLULOK_TECHNICIAN:
        return 'Welcome to the technician dashboard. Monitor and maintain BluLok devices.';
      case UserRole.MAINTENANCE:
        return 'Welcome to the maintenance dashboard. Track and schedule maintenance tasks.';
      case UserRole.TENANT:
        return 'Welcome to your tenant dashboard. Monitor your storage facilities.';
      default:
        return 'Welcome to BluLok Cloud.';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome back, {authState.user?.firstName}!
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {getWelcomeMessage()}
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            
            {/* Refresh Dashboard Button */}
            <button
              onClick={handleDashboardRefresh}
              className="group relative p-2.5 rounded-lg transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm"
              title="Refresh all dashboard data"
            >
              <ArrowPathIcon className="h-5 w-5 transition-transform duration-200 group-hover:rotate-180" />
            </button>
            
            {/* Add User Button - Only for non-tenants */}
            {!isTenant && (
              <button
                onClick={() => setShowAddUserModal(true)}
                className="group relative p-2.5 rounded-lg transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm"
                title="Add new user"
              >
                <UserPlusIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              </button>
            )}

            {/* Add Widget Button - Only for non-tenants */}
            {!isTenant && (
              <button
                onClick={() => setShowAddWidgetModal(true)}
                disabled={widgetInstances.length >= MAX_WIDGETS}
                className={`group relative p-2.5 rounded-lg transition-all duration-200 ${
                  widgetInstances.length >= MAX_WIDGETS
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 hover:shadow-sm'
                }`}
                title={widgetInstances.length >= MAX_WIDGETS ? 'Maximum widgets reached' : 'Add widget to dashboard'}
              >
                <Cog6ToothIcon className={`h-5 w-5 transition-transform duration-200 ${
                  widgetInstances.length >= MAX_WIDGETS ? '' : 'group-hover:rotate-90'
                }`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Widget Dashboard */}
      {!isLoading && layouts.lg && layouts.lg.length > 0 && (
        <WidgetGrid
          layouts={layouts}
          onLayoutChange={handleLayoutChange}
          onLayoutSave={handleLayoutSave}
          enableAutoScroll={true}
          isDraggable={!isTenant}
          isResizable={!isTenant}
        >
        {widgetInstances.map(widget => {
          return (
            <div key={widget.id}>
              {renderWidget(widget)}
            </div>
          );
        })}
        </WidgetGrid>
      )}

      {/* Debug info when layouts are not ready */}
      {(!layouts.lg || layouts.lg.length === 0) && (
        <div className="text-center py-12 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-2">
            Layout Debug Info
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4">
            Widget layout not ready. Check console for details.
          </p>
          <div className="text-xs text-yellow-600 dark:text-yellow-500 space-y-1">
            <div>Loading: {isLoading.toString()}</div>
            <div>Layouts LG length: {layouts.lg ? layouts.lg.length : 'undefined'}</div>
            <div>Widget instances: {widgetInstances.length}</div>
          </div>
          <button
            onClick={() => {
              const defaultLayouts = createDefaultLayout();
              setLayouts(defaultLayouts);
            }}
            className="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg"
          >
            Force Apply Default Layout
          </button>
        </div>
      )}

      {/* Add Widget Modal */}
      <AddWidgetModal
        isOpen={showAddWidgetModal}
        onClose={() => setShowAddWidgetModal(false)}
        onAddWidget={addWidget}
        existingWidgets={widgetInstances.map(w => w.type)}
        maxWidgets={MAX_WIDGETS}
      />

      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onSuccess={() => {
          setShowAddUserModal(false);
          // Optionally show a success notification or refresh any user-related widgets
        }}
      />
    </div>
  );
}