import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { KeyIcon, UserGroupIcon, ClockIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { KeySharing } from '@/types/access-history.types';
import { useAuth } from '@/contexts/AuthContext';

interface SharedKeysWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
}

export const SharedKeysWidget: React.FC<SharedKeysWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
}) => {
  const { authState } = useAuth();
  const [sharedKeys, setSharedKeys] = useState<KeySharing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];

  useEffect(() => {
    const fetchSharedKeys = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get key sharing data based on user role
        const response = await apiService.getKeySharing({
          limit: 20, // Get more than we need for filtering
        });
        
        setSharedKeys(response.sharings || []);
      } catch (err) {
        console.error('Error fetching shared keys:', err);
        setError('Failed to load shared keys');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedKeys();
  }, [authState.user]);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 2;
      case 'medium': return 3;
      case 'medium-tall': return 4;
      case 'large': return 5;
      default: return 3;
    }
  };

  const formatExpiration = (dateString: string | null): string => {
    if (!dateString) return 'No expiration';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires in ${diffDays} days`;
  };

  const getExpirationColor = (dateString: string | null): string => {
    if (!dateString) return 'text-gray-500';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'text-red-600';
    if (diffDays <= 3) return 'text-orange-600';
    return 'text-green-600';
  };

  const getUnitDisplayName = (sharing: KeySharing): string => {
    if (sharing.unit) {
      return sharing.unit.unit_number;
    }
    return 'Unknown Unit';
  };

  const getPrimaryTenantName = (sharing: KeySharing): string => {
    if (sharing.primary_tenant) {
      return `${sharing.primary_tenant.first_name} ${sharing.primary_tenant.last_name}`;
    }
    return 'Unknown User';
  };

  const getSharedWithUserName = (sharing: KeySharing): string => {
    if (sharing.shared_with_user) {
      return `${sharing.shared_with_user.first_name} ${sharing.shared_with_user.last_name}`;
    }
    return 'Unknown User';
  };

  const maxItems = getMaxItems(currentSize);
  const displayKeys = sharedKeys.slice(0, maxItems);

  if (loading) {
    return (
      <Widget
        id="shared-keys-widget-loading"
        title="Shared Keys Overview"
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
        id="shared-keys-widget-error"
        title="Shared Keys Overview"
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
      id="shared-keys-widget"
      title="Shared Keys Overview"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
    >
      <div className="space-y-2 h-full flex flex-col">
        {sharedKeys.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <KeyIcon className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm">No shared keys found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          // Compact view for small size
          <div className="space-y-1">
            {displayKeys.map((sharing) => (
              <div key={sharing.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1">
                  <KeyIcon className="h-3 w-3 text-blue-600" />
                  <span className="truncate">{getUnitDisplayName(sharing)}</span>
                </div>
                <span className="text-gray-500">
                  {sharing.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          // Full view for larger sizes
          <div className="space-y-3 flex-1 overflow-y-auto">
            {displayKeys.map((sharing) => (
              <div key={sharing.id} className="p-3 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <KeyIcon className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {getUnitDisplayName(sharing)}
                    </span>
                  </div>
                  <span className={`text-xs ${sharing.is_active ? 'text-green-600' : 'text-red-600'}`}>
                    {sharing.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                  Primary: {getPrimaryTenantName(sharing)}
                </div>
                
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Shared with:
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <UserGroupIcon className="h-3 w-3 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-300">{getSharedWithUserName(sharing)}</span>
                    {sharing.is_active ? (
                      <CheckCircleIcon className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircleIcon className="h-3 w-3 text-red-600" />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <ClockIcon className="h-3 w-3 text-gray-500" />
                  <span className={`text-xs ${getExpirationColor(sharing.expires_at || null)}`}>
                    {formatExpiration(sharing.expires_at || null)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {sharedKeys.length > maxItems && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Showing {maxItems} of {sharedKeys.length} units
          </div>
        )}
      </div>
    </Widget>
  );
};
