import { useMemo, useState } from 'react';
import { CalendarDaysIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { FacilitySchedulesTab } from '@/components/Schedules/FacilitySchedulesTab';
import { UserSchedulesTab } from '@/components/Schedules/UserSchedulesTab';

interface SchedulesHubTabProps {
  facilityId: string;
  userId?: string;
  canManageUserSchedules: boolean;
}

type SchedulesSubTab = 'facility' | 'users';

export function SchedulesHubTab({ facilityId, userId, canManageUserSchedules }: SchedulesHubTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SchedulesSubTab>('facility');

  const tabs = useMemo(
    () => [
      { key: 'facility' as const, label: 'Facility Schedules', icon: CalendarDaysIcon, visible: true },
      { key: 'users' as const, label: 'User Schedules', icon: UserGroupIcon, visible: canManageUserSchedules },
    ].filter((tab) => tab.visible),
    [canManageUserSchedules],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSubTab(key)}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeSubTab === key
                  ? 'bg-primary-600 text-white'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'facility' && (
        <FacilitySchedulesTab facilityId={facilityId} userId={userId} />
      )}
      {activeSubTab === 'users' && canManageUserSchedules && (
        <UserSchedulesTab facilityId={facilityId} />
      )}
    </div>
  );
}
