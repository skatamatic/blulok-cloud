import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { ClockIcon, UserIcon, LockClosedIcon, LockOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { useAuth } from '@/contexts/AuthContext';

interface AccessHistoryWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
}

export const AccessHistoryWidget: React.FC<AccessHistoryWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
}) => {
  const { authState } = useAuth();
  const [accessHistory, setAccessHistory] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];

  useEffect(() => {
    const fetchAccessHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get access history based on user role
        const response = await apiService.getAccessHistory({
          limit: 20, // Get more than we need for filtering
        });
        
        setAccessHistory(response.logs || []);
      } catch (err) {
        console.error('Error fetching access history:', err);
        setError('Failed to load access history');
      } finally {
        setLoading(false);
      }
    };

    fetchAccessHistory();
  }, [authState.user]);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 3;
      case 'medium': return 5;
      case 'medium-tall': return 8;
      case 'large': return 10;
      default: return 5;
    }
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m ago`;
    } else {
      return 'Just now';
    }
  };

  const getActionIcon = (log: AccessLog) => {
    const { action, success } = log;
    
    if (!success) {
      return <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />;
    }
    
    if (action === 'unlock' || action === 'access_granted' || action === 'door_open' || action === 'gate_open') {
      return <LockOpenIcon className="h-4 w-4 text-green-600" />;
    } else if (action === 'lock' || action === 'door_close' || action === 'gate_close') {
      return <LockClosedIcon className="h-4 w-4 text-blue-600" />;
    } else {
      return <LockOpenIcon className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionText = (log: AccessLog): string => {
    const { action, success } = log;
    
    if (!success) {
      return `Access denied`;
    }
    
    switch (action) {
      case 'unlock':
      case 'access_granted':
        return 'Unlocked';
      case 'lock':
        return 'Locked';
      case 'door_open':
        return 'Door opened';
      case 'door_close':
        return 'Door closed';
      case 'gate_open':
        return 'Gate opened';
      case 'gate_close':
        return 'Gate closed';
      case 'elevator_call':
        return 'Elevator called';
      default:
        return 'Access granted';
    }
  };

  const getActionColor = (log: AccessLog): string => {
    const { action, success } = log;
    
    if (!success) return 'text-red-600';
    
    if (action === 'unlock' || action === 'access_granted' || action === 'door_open' || action === 'gate_open') {
      return 'text-green-600';
    } else if (action === 'lock' || action === 'door_close' || action === 'gate_close') {
      return 'text-blue-600';
    } else {
      return 'text-gray-600';
    }
  };

  const getUserDisplayName = (log: AccessLog): string => {
    if (log.user_name) {
      return log.user_name;
    }
    return 'Unknown User';
  };

  const getUnitDisplayName = (log: AccessLog): string => {
    if (log.unit_number) {
      return log.unit_number;
    }
    return 'Unknown Unit';
  };

  const maxItems = getMaxItems(currentSize);
  const displayHistory = accessHistory.slice(0, maxItems);

  if (loading) {
    return (
      <Widget
        id="access-history-widget-loading"
        title="Access History"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Widget>
    );
  }

  if (error) {
    return (
      <Widget
        id="access-history-widget-error"
        title="Access History"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500 text-center">
            <ExclamationTriangleIcon className="h-8 w-8 mx-auto mb-2" />
            <div className="text-sm">{error}</div>
          </div>
        </div>
      </Widget>
    );
  }

  return (
    <Widget
      id="access-history-widget"
      title="Access History"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
    >
      <div className="space-y-2 h-full flex flex-col">
        {accessHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <ClockIcon className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm">No access history found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          // Compact view for small size
          <div className="space-y-1">
            {displayHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1">
                  {getActionIcon(entry)}
                  <span className="truncate">{getUnitDisplayName(entry)}</span>
                </div>
                <span className="text-gray-500">{formatTime(entry.occurred_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          // Full view for larger sizes
          <div className="space-y-2 flex-1 overflow-y-auto">
            {displayHistory.map((entry) => (
              <div key={entry.id} className="flex items-center space-x-3 p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="flex-shrink-0">
                  {getActionIcon(entry)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {getUnitDisplayName(entry)}
                    </span>
                    <span className={`text-sm font-medium ${getActionColor(entry)}`}>
                      {getActionText(entry)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <UserIcon className="h-3 w-3" />
                    <span>{getUserDisplayName(entry)}</span>
                    <ClockIcon className="h-3 w-3 ml-2" />
                    <span>{formatTime(entry.occurred_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {accessHistory.length > maxItems && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Showing {maxItems} of {accessHistory.length} entries
          </div>
        )}
      </div>
    </Widget>
  );
};
