import { useEffect, useMemo, useState } from 'react';
import { apiService } from '@/services/api.service';
import { AccessControlDevice, DeviceGroup, EffectiveAccessCode } from '@/types/facility.types';
import { AccessGroupSelector } from '@/components/AccessCodes/AccessGroupSelector';
import { AccessCodeGroupPanel } from '@/components/AccessCodes/AccessCodeGroupPanel';
import {
  buildGroupSummary,
  DEFAULT_GROUP_CONFIG,
  filterKeypadDevices,
  GroupCardSummary,
  GroupMemberRef,
  pushStatusClasses,
  pushStatusLabel,
  sortAccessGroups,
} from '@/components/AccessCodes/access-groups.utils';

interface AccessCodeManagementTabProps {
  facilityId: string;
  devices: AccessControlDevice[];
}

export function AccessCodeManagementTab({ facilityId, devices }: AccessCodeManagementTabProps) {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [groupSummaries, setGroupSummaries] = useState<Record<string, GroupCardSummary>>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMemberRef[]>([]);
  const [effectiveCodes, setEffectiveCodes] = useState<EffectiveAccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<{ status: string; last_error: string | null } | null>(null);

  const sortedGroups = useMemo(() => sortAccessGroups(groups), [groups]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const keypadDeviceById = useMemo(
    () => new Map(filterKeypadDevices(devices).map((device) => [device.id, device])),
    [devices],
  );
  const knownPushStatus = pushState?.status === 'pending'
    || pushState?.status === 'active'
    || pushState?.status === 'error';
  const facilityPushStatus = knownPushStatus ? pushState?.status : 'unknown';

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [effectiveList, groupList, pushStateResp] = await Promise.all([
        apiService.getEffectiveAccessCodes(facilityId),
        apiService.getDeviceGroups(facilityId),
        apiService.getAccessCodePushState(facilityId),
      ]);
      const loadedGroups = groupList.data || [];
      const preferredGroupId =
        loadedGroups.find((group) => group.is_default)?.id
        || loadedGroups[0]?.id
        || '';
      const nextSelectedGroupId = loadedGroups.some((group) => group.id === selectedGroupId)
        ? selectedGroupId
        : preferredGroupId;

      const detailResponses = await Promise.all(
        loadedGroups.map(async (group) => {
          const [groupDetails, cfg] = await Promise.all([
            apiService.getDeviceGroup(group.id),
            apiService.getAccessCodeGroupConfig(group.id),
          ]);
          const members = (groupDetails.data?.members || []) as GroupMemberRef[];
          return buildGroupSummary(
            group,
            members,
            cfg.data || DEFAULT_GROUP_CONFIG,
            effectiveList.data || [],
            keypadDeviceById,
          );
        }),
      );
      const summaries = detailResponses.reduce<Record<string, GroupCardSummary>>((acc, summary) => {
        acc[summary.groupId] = summary;
        return acc;
      }, {});

      setEffectiveCodes(effectiveList.data || []);
      setGroups(loadedGroups);
      setGroupSummaries(summaries);
      setPushState(pushStateResp.data || null);
      setSelectedGroupId(nextSelectedGroupId);
      setSelectedGroupMembers(summaries[nextSelectedGroupId]?.members || []);
    } catch (error) {
      console.error(error);
      setLoadError('Failed to load access code settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [facilityId]);

  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupMembers(groupSummaries[groupId]?.members || []);
  };

  if (loading) {
    return <div className="py-6 text-sm text-gray-500 dark:text-gray-400">Loading access-code groups...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-700 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Access Codes</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Select a group to manage rotation, schedules, and manual keypad codes.
            </p>
          </div>
          <span className={`inline-flex shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${pushStatusClasses(facilityPushStatus || 'unknown')}`}>
            Gateway push: {pushStatusLabel(facilityPushStatus)}
          </span>
        </div>
        {pushState?.status === 'error' && pushState.last_error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            Latest push error: {pushState.last_error}
          </p>
        )}
      </div>

      <div className="flex min-h-[28rem] flex-col lg:flex-row">
        <aside className="border-b border-gray-200 bg-gray-50/60 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/40 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r">
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Groups ({sortedGroups.length})
          </p>
          <AccessGroupSelector
            groups={sortedGroups}
            groupSummaries={groupSummaries}
            selectedGroupId={selectedGroupId}
            facilityPushStatus={facilityPushStatus || 'unknown'}
            onSelect={selectGroup}
            layout="sidebar"
          />
        </aside>

        <main className="min-w-0 flex-1 px-5 py-5 sm:px-6">
          {selectedGroup ? (
            <>
              <div className="mb-5 border-b border-gray-200 pb-4 dark:border-gray-700">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">{selectedGroup.name}</h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Manage rotation and schedule codes for this access group.
                </p>
              </div>
              <AccessCodeGroupPanel
                facilityId={facilityId}
                group={selectedGroup}
                members={selectedGroupMembers}
                accessControlDevices={devices}
                onDataChanged={load}
              />
            </>
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Select an access group to configure codes.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
