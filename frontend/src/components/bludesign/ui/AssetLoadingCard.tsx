/**
 * Asset Loading Card
 * 
 * Individual asset loading indicator for inline display.
 */

import React from 'react';
import { 
  CubeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { LoadingProgress } from '../loading/LoadingManager';

interface AssetLoadingCardProps {
  assetName: string;
  assetId: string;
  progress?: LoadingProgress | null;
  status: 'pending' | 'loading' | 'complete' | 'error';
  error?: string;
  thumbnail?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export const AssetLoadingCard: React.FC<AssetLoadingCardProps> = ({
  assetName,
  assetId,
  progress,
  status,
  error,
  thumbnail,
  size = 'md',
  onClick,
}) => {
  const sizeClasses = {
    sm: 'p-2',
    md: 'p-3',
    lg: 'p-4',
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <CubeIcon className={`${iconSizes[size]} text-gray-400`} />;
      case 'loading':
        return (
          <ArrowPathIcon 
            className={`${iconSizes[size]} text-primary-400 animate-spin`} 
          />
        );
      case 'complete':
        return (
          <CheckCircleIcon className={`${iconSizes[size]} text-green-400`} />
        );
      case 'error':
        return (
          <ExclamationCircleIcon className={`${iconSizes[size]} text-red-400`} />
        );
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'border-gray-700 bg-gray-800/50';
      case 'loading':
        return 'border-primary-500/50 bg-primary-500/10';
      case 'complete':
        return 'border-green-500/50 bg-green-500/10';
      case 'error':
        return 'border-red-500/50 bg-red-500/10';
    }
  };

  const percentage = progress?.percentage ?? 0;

  return (
    <div
      className={`
        relative rounded-lg border transition-all duration-200
        ${sizeClasses[size]} ${getStatusColor()}
        ${onClick ? 'cursor-pointer hover:border-primary-400' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Thumbnail or Icon */}
        <div className="relative flex-shrink-0">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={assetName}
              className={`${iconSizes[size]} rounded object-cover`}
            />
          ) : (
            getStatusIcon()
          )}
          
          {/* Loading overlay on thumbnail */}
          {status === 'loading' && thumbnail && (
            <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
              <ArrowPathIcon className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">
            {assetName}
          </h4>
          
          {size !== 'sm' && (
            <p className="text-xs text-gray-500 font-mono truncate">
              {assetId.slice(0, 8)}...
            </p>
          )}

          {/* Progress bar for loading state */}
          {status === 'loading' && (
            <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          )}

          {/* Error message */}
          {status === 'error' && error && (
            <p className="mt-1 text-xs text-red-400 truncate">
              {error}
            </p>
          )}
        </div>

        {/* Status indicator */}
        {size !== 'sm' && (
          <div className="flex-shrink-0">
            {status === 'loading' && (
              <span className="text-xs font-medium text-primary-400">
                {percentage}%
              </span>
            )}
            {status === 'complete' && (
              <span className="text-xs font-medium text-green-400">
                Done
              </span>
            )}
            {status === 'error' && (
              <span className="text-xs font-medium text-red-400">
                Failed
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Asset Loading List
 * 
 * List of assets being loaded with progress.
 */
interface AssetLoadingListProps {
  items: Array<{
    assetName: string;
    assetId: string;
    status: 'pending' | 'loading' | 'complete' | 'error';
    progress?: LoadingProgress | null;
    error?: string;
    thumbnail?: string;
  }>;
  title?: string;
  maxVisible?: number;
  showAll?: boolean;
  onItemClick?: (assetId: string) => void;
}

export const AssetLoadingList: React.FC<AssetLoadingListProps> = ({
  items,
  title,
  maxVisible = 5,
  showAll = false,
  onItemClick,
}) => {
  const visibleItems = showAll ? items : items.slice(0, maxVisible);
  const hiddenCount = items.length - visibleItems.length;

  const completedCount = items.filter((i) => i.status === 'complete').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="space-y-3">
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-300">{title}</h3>
          <span className="text-xs text-gray-500">
            {completedCount}/{items.length}
            {errorCount > 0 && (
              <span className="text-red-400 ml-1">({errorCount} failed)</span>
            )}
          </span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {visibleItems.map((item) => (
          <AssetLoadingCard
            key={item.assetId}
            assetName={item.assetName}
            assetId={item.assetId}
            status={item.status}
            progress={item.progress}
            error={item.error}
            thumbnail={item.thumbnail}
            size="sm"
            onClick={onItemClick ? () => onItemClick(item.assetId) : undefined}
          />
        ))}
      </div>

      {/* Hidden count */}
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-500 text-center">
          +{hiddenCount} more items
        </p>
      )}
    </div>
  );
};

export default AssetLoadingCard;

