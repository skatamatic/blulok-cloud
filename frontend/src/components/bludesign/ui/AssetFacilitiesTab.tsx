import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetService, type AssetFacilityUsage } from '../services/AssetService';

interface AssetFacilitiesTabProps {
  assetId: string;
  facilityUsageCount?: number;
}

export const AssetFacilitiesTab: React.FC<AssetFacilitiesTabProps> = ({
  assetId,
  facilityUsageCount = 0,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [facilities, setFacilities] = useState<AssetFacilityUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    AssetService.getAssetFacilities(assetId)
      .then((rows) => {
        if (!cancelled) setFacilities(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load facilities');
          setFacilities([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const summary = useMemo(() => {
    if (loading) return 'Loading…';
    if (error) return error;
    if (facilities.length === 0) {
      return facilityUsageCount > 0
        ? 'Usage count is out of sync — re-save affected facilities to refresh references.'
        : 'Not used in any saved facilities.';
    }

    const totalPlacements = facilities.reduce((sum, f) => sum + (f.usageCount ?? 1), 0);
    const facilityLabel = facilities.length === 1 ? 'facility' : 'facilities';
    const placementLabel = totalPlacements === 1 ? 'placement' : 'placements';

    if (totalPlacements === facilities.length) {
      return `Used in ${facilities.length} saved ${facilityLabel}.`;
    }

    return `Used in ${facilities.length} saved ${facilityLabel} (${totalPlacements} ${placementLabel} total).`;
  }, [loading, error, facilities, facilityUsageCount]);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg p-4 ${
          isDark ? 'bg-gray-700/50' : 'bg-gray-50'
        }`}
      >
        <h4
          className={`text-sm font-medium mb-1 ${
            isDark ? 'text-gray-200' : 'text-gray-700'
          }`}
        >
          Facility usage
        </h4>
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {summary}
        </p>
      </div>

      {!loading && !error && facilities.length > 0 && (
        <ul className="space-y-2">
          {facilities.map((facility) => (
            <li
              key={facility.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                isDark
                  ? 'border-gray-700 bg-gray-800/60'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium truncate ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {facility.name}
                </p>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {(facility.usageCount ?? 1) === 1
                    ? '1 placement'
                    : `${facility.usageCount} placements`}
                  {' · '}
                  Updated {new Date(facility.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Link
                to={`/bludesign/build?facilityId=${encodeURIComponent(facility.id)}`}
                className={`flex-shrink-0 text-xs font-medium ${
                  isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'
                }`}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
