import { useEffect, useState } from 'react';
import { apiService } from '@/services/api.service';
import { UserAccessCode } from '@/types/facility.types';
import { formatDateTime } from '@/utils/datetime.utils';

interface MyAccessCodesProps {
  facilityId?: string;
}

export function MyAccessCodes({ facilityId }: MyAccessCodesProps) {
  const [codes, setCodes] = useState<UserAccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getAppAccessCodes(facilityId);
      setCodes(response.data || []);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load access codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [facilityId]);

  if (loading) {
    return <div className="py-8 text-sm text-gray-500 dark:text-gray-400">Loading access codes...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => load().catch(() => undefined)}
          className="mt-2 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {codes.map((entry) => (
        <div key={`${entry.device_id}:${entry.schedule_id || 'default'}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{entry.device_name}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {entry.device_type}{entry.location_description ? ` • ${entry.location_description}` : ''}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Schedule: {entry.schedule_name || 'Always-on'}
              </p>
            </div>
            <span className="font-mono text-lg tracking-widest text-primary-700 dark:text-primary-300">{entry.code}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Valid until: {formatDateTime(entry.valid_until)}</p>
        </div>
      ))}
      {codes.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
          No keypad access codes are currently available for your device list.
        </div>
      )}
    </div>
  );
}

