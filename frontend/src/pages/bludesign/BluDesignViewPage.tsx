import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CubeIcon,
  EyeIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  TrashIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { FacilityViewer3D } from '@/components/bludesign/viewer';
import { useTheme } from '@/contexts/ThemeContext';
import * as bludesignApi from '@/api/bludesign';
import { FacilitySummary } from '@/components/bludesign/core/types';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { formatDate } from '@/utils/datetime.utils';

interface ViewFacility extends FacilitySummary {
  linkedBlulokId: string | null;
  linkedBlulokName: string | null;
}

export default function BluDesignViewPage() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [facilities, setFacilities] = useState<ViewFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<ViewFacility | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteFacility, setPendingDeleteFacility] = useState<ViewFacility | null>(null);

  // Load saved facilities with BluLok link info
  const loadFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, links] = await Promise.all([
        bludesignApi.getFacilities(),
        bludesignApi.getBluDesignFacilitiesWithLinks(),
      ]);
      const linkById = new Map(links.map((l) => [l.id, l]));
      setFacilities(
        summaries.map((f) => ({
          ...f,
          linkedBlulokId: linkById.get(f.id)?.linkedBlulokId ?? null,
          linkedBlulokName: linkById.get(f.id)?.linkedBlulokName ?? null,
        }))
      );
    } catch (err) {
      console.error('Failed to load facilities:', err);
      setError('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  const handleSelectFacility = useCallback((facility: ViewFacility) => {
    setSelectedFacility(facility);
  }, []);

  const handleBackToCatalog = useCallback(() => {
    setSelectedFacility(null);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, facility: ViewFacility) => {
    e.stopPropagation();

    if (facility.linkedBlulokId) {
      return;
    }

    setPendingDeleteFacility(facility);
  }, []);

  const confirmDeleteFacility = useCallback(async () => {
    const facility = pendingDeleteFacility;
    if (!facility) return;
    setPendingDeleteFacility(null);

    try {
      setDeletingId(facility.id);
      setError(null);
      await bludesignApi.deleteFacility(facility.id);
      setFacilities((prev) => prev.filter((f) => f.id !== facility.id));
    } catch (err) {
      console.error('Failed to delete facility:', err);
      setError('Failed to delete facility');
    } finally {
      setDeletingId(null);
    }
  }, [pendingDeleteFacility]);

  // Viewing a specific facility
  if (selectedFacility) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full overflow-hidden flex flex-col">
        {/* Compact Header */}
        <div className={`
          flex-shrink-0 border-b px-4 py-2 flex items-center justify-between
          ${isDark ? 'bg-gray-900/95 border-gray-700/50' : 'bg-white/95 border-gray-200/80'}
          backdrop-blur-sm
        `}>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToCatalog}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200
                ${isDark
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200'
                }
                hover:scale-[1.02] active:scale-[0.98]
              `}
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </button>
            <div className={`w-px h-5 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
            <div className="flex items-center gap-2">
              <CubeIcon className={`w-5 h-5 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
              <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {selectedFacility.name}
              </span>
            </div>
          </div>
          <div className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            ${isDark ? 'bg-primary-500/20 text-primary-300' : 'bg-primary-50 text-primary-700'}
          `}>
            <EyeIcon className="w-3.5 h-3.5" />
            View Mode
          </div>
        </div>
        
        {/* 3D Viewer - using the same component as widgets and FMS */}
        <div className="flex-1 relative">
          <FacilityViewer3D
            bluDesignFacilityId={selectedFacility.id}
            bluLokFacilityId={selectedFacility.linkedBlulokId ?? undefined}
            className="w-full h-full"
            onReady={() => console.log('Viewer ready')}
            onError={(err) => console.error('Viewer error:', err)}
          />
        </div>
      </div>
    );
  }

  // Facility catalog view
  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <CubeIcon className={`h-8 w-8 ${isDark ? 'text-primary-400' : 'text-primary-600'}`} />
              <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                BluDesign Viewer
              </h1>
            </div>
            <button
              onClick={loadFacilities}
              disabled={loading}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200
                ${isDark
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm'
                }
                hover:scale-[1.02] active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              `}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
            Browse and interact with saved 3D facility designs
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className={`
            mb-6 p-4 rounded-xl border
            ${isDark ? 'bg-red-900/20 border-red-800/50 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}
          `}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className={`
              w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mb-4
              ${isDark ? 'border-primary-400' : 'border-primary-600'}
            `} />
            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              Loading facilities...
            </p>
          </div>
        )}

        {/* Facility Catalog */}
        {!loading && facilities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.map((facility) => {
              const isLinked = !!facility.linkedBlulokId;
              const isDeleting = deletingId === facility.id;

              return (
                <div
                  key={facility.id}
                  className={`
                    group relative rounded-xl shadow-sm border overflow-hidden transition-all duration-300
                    hover:shadow-lg
                    ${isDark
                      ? 'bg-gray-800 border-gray-700 hover:border-primary-500/50'
                      : 'bg-white border-gray-200 hover:border-primary-300'
                    }
                  `}
                >
                  {/* Thumbnail */}
                  <div
                    className={`
                      aspect-video flex items-center justify-center relative overflow-hidden
                      ${isDark ? 'bg-gray-700' : 'bg-gray-100'}
                    `}
                  >
                    {facility.thumbnail ? (
                      <img
                        src={facility.thumbnail}
                        alt={facility.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <CubeIcon className={`w-16 h-16 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, facility)}
                      disabled={isDeleting || isLinked}
                      title={
                        isLinked
                          ? `Cannot delete — linked to ${facility.linkedBlulokName}. Change associations in Config.`
                          : 'Delete facility'
                      }
                      className={`
                        absolute top-3 right-3 p-2 rounded-lg transition-all duration-200
                        ${isLinked
                          ? isDark
                            ? 'opacity-100 bg-gray-900/90 text-gray-500 cursor-not-allowed'
                            : 'opacity-100 bg-white/90 text-gray-400 cursor-not-allowed shadow-sm'
                          : `opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                              isDark
                                ? 'bg-gray-900/90 hover:bg-red-600 text-gray-400 hover:text-white'
                                : 'bg-white/90 hover:bg-red-600 text-gray-500 hover:text-white shadow-sm'
                            }`
                        }
                        disabled:opacity-60
                      `}
                    >
                      {isDeleting ? (
                        <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      ) : (
                        <TrashIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {facility.name}
                    </h3>
                    <div className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Last updated {formatDate(facility.updatedAt)}
                    </div>

                    {isLinked && (
                      <div
                        className={`
                          mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs
                          ${isDark ? 'bg-primary-500/10 text-primary-300' : 'bg-primary-50 text-primary-800'}
                        `}
                      >
                        <LinkIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">Linked to {facility.linkedBlulokName}</span>
                          <Link
                            to="/bludesign/config?tab=links"
                            className={`
                              block mt-1 underline underline-offset-2 transition-colors
                              ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-700 hover:text-primary-900'}
                            `}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Change association in Config
                          </Link>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSelectFacility(facility)}
                      className={`
                        w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                        bg-primary-600 hover:bg-primary-700 text-white font-medium
                        transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                      `}
                    >
                      <EyeIcon className="w-5 h-5" />
                      View Facility
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && facilities.length === 0 && (
          <div className={`
            rounded-xl shadow-sm border p-12
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
          `}>
            <div className="text-center">
              <CubeIcon className={`mx-auto h-16 w-16 mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
              <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                No Facilities Yet
              </h3>
              <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                Create your first facility design in the Build section.
              </p>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDeleteFacility != null}
        title="Delete facility?"
        message={
          pendingDeleteFacility
            ? `Delete "${pendingDeleteFacility.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmTone="danger"
        onConfirm={() => void confirmDeleteFacility()}
        onCancel={() => setPendingDeleteFacility(null)}
      />
    </div>
  );
}
