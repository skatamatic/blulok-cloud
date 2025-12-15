/**
 * Load Dialog
 * 
 * Professional modal dialog for loading facilities with search, sorting, and rich metadata.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  MagnifyingGlassIcon, 
  TrashIcon, 
  XMarkIcon, 
  FolderOpenIcon,
  ClockIcon,
  CalendarIcon,
  CubeIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';
import { FacilitySummary } from '@/components/bludesign/core/types';
import { getFacilities, deleteFacility } from '@/api/bludesign';

export interface LoadDialogProps {
  isOpen: boolean;
  onLoad: (id: string) => Promise<void>;
  onCancel: () => void;
}

type SortOption = 'recent' | 'name' | 'created';

export const LoadDialog: React.FC<LoadDialogProps> = ({
  isOpen,
  onLoad,
  onCancel,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFacilityId, setLoadingFacilityId] = useState<string | null>(null);
  const [deletingFacilityId, setDeletingFacilityId] = useState<string | null>(null);

  // Reset loading states when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLoadingFacilityId(null);
      setDeletingFacilityId(null);
      setError(null);
      loadFacilities();
    }
  }, [isOpen]);

  // Filter and sort facilities
  const filteredFacilities = useMemo(() => {
    let result = [...facilities];
    
    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(query));
    }
    
    // Sort
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => {
          const aTime = a.lastOpened?.getTime() || a.updatedAt.getTime();
          const bTime = b.lastOpened?.getTime() || b.updatedAt.getTime();
          return bTime - aTime;
        });
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
    }
    
    return result;
  }, [facilities, searchQuery, sortBy]);

  const loadFacilities = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getFacilities();
      setFacilities(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load facilities');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = useCallback(async (id: string) => {
    try {
      setLoadingFacilityId(id);
      setError(null);
      await onLoad(id);
      // Reset loading state after successful load (dialog will be closed by parent)
      setLoadingFacilityId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load facility');
      setLoadingFacilityId(null);
    }
  }, [onLoad]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingFacilityId(id);
      setError(null);
      await deleteFacility(id);
      setFacilities(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete facility');
    } finally {
      setDeletingFacilityId(null);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (!loadingFacilityId) {
      onCancel();
    }
  }, [loadingFacilityId, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      
      {/* Dialog */}
      <div
        className={`
          relative rounded-2xl shadow-2xl border max-w-5xl w-full max-h-[85vh] flex flex-col
          ${isDark 
            ? 'bg-gray-900 border-gray-700/50' 
            : 'bg-white border-gray-200'
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`
          px-6 py-4 border-b flex items-center justify-between flex-shrink-0
          ${isDark ? 'border-gray-800' : 'border-gray-100'}
        `}>
          <div className="flex items-center gap-3">
            <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center
              ${isDark ? 'bg-primary-500/20' : 'bg-primary-50'}
            `}>
              <FolderOpenIcon className={`w-5 h-5 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Open Facility
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {facilities.length} {facilities.length === 1 ? 'facility' : 'facilities'} saved
              </p>
            </div>
          </div>
          <button
            className={`
              p-2 rounded-lg transition-all duration-200
              ${isDark 
                ? 'hover:bg-gray-800 text-gray-400 hover:text-white' 
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            onClick={handleClose}
            disabled={!!loadingFacilityId}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className={`
          px-6 py-3 border-b flex items-center gap-4 flex-shrink-0
          ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50/50'}
        `}>
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className={`
              absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
              ${isDark ? 'text-gray-500' : 'text-gray-400'}
            `} />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`
                w-full pl-9 pr-4 py-2 rounded-lg text-sm
                border focus:outline-none focus:ring-2 focus:ring-primary-500/50
                transition-all duration-200
                ${isDark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-primary-500'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-primary-500'
                }
              `}
            />
          </div>
          
          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowsUpDownIcon className={`w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={`
                px-3 py-2 rounded-lg text-sm border cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-primary-500/50
                ${isDark
                  ? 'bg-gray-800 border-gray-700 text-gray-300'
                  : 'bg-white border-gray-200 text-gray-700'
                }
              `}
            >
              <option value="recent">Recently Opened</option>
              <option value="name">Name (A-Z)</option>
              <option value="created">Date Created</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error message */}
          {error && (
            <div className={`
              mb-4 p-4 rounded-xl border flex items-start gap-3
              ${isDark 
                ? 'bg-red-500/10 border-red-500/30' 
                : 'bg-red-50 border-red-200'
              }
            `}>
              <XMarkIcon className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-red-400' : 'text-red-700'}`}>Error</p>
                <p className={`text-sm ${isDark ? 'text-red-400/80' : 'text-red-600'}`}>{error}</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className={`
                w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mb-4
                ${isDark ? 'border-primary-400' : 'border-primary-600'}
              `} />
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading facilities...</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredFacilities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className={`
                w-20 h-20 rounded-2xl flex items-center justify-center mb-4
                ${isDark ? 'bg-gray-800' : 'bg-gray-100'}
              `}>
                <FolderOpenIcon className={`w-10 h-10 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
              </div>
              <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {searchQuery ? 'No facilities found' : 'No saved facilities'}
              </h3>
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Create your first facility design to get started'
                }
              </p>
            </div>
          )}

          {/* Facility grid */}
          {!isLoading && filteredFacilities.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFacilities.map((facility) => (
                <FacilityCard
                  key={facility.id}
                  facility={facility}
                  isLoading={loadingFacilityId === facility.id}
                  isDeleting={deletingFacilityId === facility.id}
                  isDisabled={!!loadingFacilityId && loadingFacilityId !== facility.id}
                  onLoad={() => handleLoad(facility.id)}
                  onDelete={(e) => handleDelete(e, facility.id, facility.name)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Facility Card Component
interface FacilityCardProps {
  facility: FacilitySummary;
  isLoading: boolean;
  isDeleting: boolean;
  isDisabled: boolean;
  onLoad: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDark: boolean;
}

const FacilityCard: React.FC<FacilityCardProps> = ({
  facility,
  isLoading,
  isDeleting,
  isDisabled,
  onLoad,
  onDelete,
  isDark,
}) => {
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }).format(date);
  };

  const formatFullDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const lastActivity = facility.lastOpened || facility.updatedAt;

  return (
    <button
      className={`
        group relative rounded-xl border overflow-hidden text-left transition-all duration-200
        ${isLoading 
          ? 'ring-2 ring-primary-500 scale-[0.98]'
          : isDisabled
            ? 'opacity-50 cursor-not-allowed'
            : isDark
              ? 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600 hover:shadow-xl hover:shadow-black/20'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg'
        }
      `}
      onClick={onLoad}
      disabled={isLoading || isDeleting || isDisabled}
    >
      {/* Thumbnail */}
      <div className={`
        aspect-[16/10] flex items-center justify-center relative overflow-hidden
        ${isDark ? 'bg-gray-900' : 'bg-gray-100'}
      `}>
        {facility.thumbnail ? (
          <img
            src={facility.thumbnail}
            alt={facility.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CubeIcon className={`w-12 h-12 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
            <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No preview</span>
          </div>
        )}
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-xs text-white/80">Opening...</span>
            </div>
          </div>
        )}

        {/* Hover overlay */}
        {!isLoading && !isDisabled && (
          <div className={`
            absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 
            transition-all duration-200 bg-black/40
          `}>
            <div className="px-4 py-2 bg-white/95 rounded-lg shadow-lg text-gray-900 text-sm font-medium">
              Click to Open
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className={`font-semibold truncate mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {facility.name}
        </h3>
        
        {/* Metadata */}
        <div className="space-y-1.5">
          {/* Last activity */}
          <div className="flex items-center gap-2" title={formatFullDate(lastActivity)}>
            <ClockIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {facility.lastOpened ? 'Opened' : 'Updated'} {formatDate(lastActivity)}
            </span>
          </div>
          
          {/* Created date */}
          <div className="flex items-center gap-2" title={formatFullDate(facility.createdAt)}>
            <CalendarIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Created {formatDate(facility.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Delete button */}
      <button
        className={`
          absolute top-3 right-3 p-2 rounded-lg transition-all duration-200
          opacity-0 group-hover:opacity-100 
          ${isDark
            ? 'bg-gray-900/90 hover:bg-red-600 text-gray-400 hover:text-white'
            : 'bg-white/90 hover:bg-red-600 text-gray-500 hover:text-white shadow-sm'
          }
        `}
        onClick={onDelete}
        disabled={isDeleting || isLoading}
        title="Delete facility"
      >
        {isDeleting ? (
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : (
          <TrashIcon className="w-4 h-4" />
        )}
      </button>
    </button>
  );
};

export default LoadDialog;
