import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessControlDevice, AccessMethod, DeviceGroup, EffectiveAccessCode } from '@/types/facility.types';
import { useToast } from '@/contexts/ToastContext';
import { SearchableSelect } from '@/components/Common/SearchableSelect';
import { DeviceTypeIcon } from '@/components/Common/DeviceTypeIcon';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { getDeviceIconMeta } from '@/utils/device-icon.utils';
import { Modal } from '@/components/Modal/Modal';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { AccessGroupSelector } from '@/components/AccessCodes/AccessGroupSelector';
import { AccessGroupDetailTabs } from '@/components/AccessCodes/AccessGroupDetailTabs';
import { AccessCodeGroupPanel } from '@/components/AccessCodes/AccessCodeGroupPanel';
import {
  buildGroupSummary,
  DEFAULT_GROUP_CONFIG,
  describeGroupAccess,
  filterKeypadDevices,
  GroupCardSummary,
  GroupMemberRef,
  pushStatusClasses,
  pushStatusLabel,
  sortAccessGroups,
} from '@/components/AccessCodes/access-groups.utils';

interface GroupableDevice {
  id: string;
  name: string;
  device_category?: 'access_control' | 'blulok';
  access_methods?: AccessMethod[];
  device_type?: 'gate' | 'elevator' | 'door';
  location_description?: string;
  unit_id?: string;
  unit_number?: string;
  device_serial?: string;
  relay_channel?: number;
  device_status?: string;
}

interface MemberSection {
  key: 'unit_locks' | 'access_control';
  title: string;
  members: GroupMemberRef[];
}

interface DeviceGroupManagerProps {
  facilityId: string;
  devices: GroupableDevice[];
  accessControlDevices?: AccessControlDevice[];
  groups: DeviceGroup[];
  onGroupsChanged: () => Promise<void>;
  createDialogOpen?: boolean;
  onCreateDialogChange?: (open: boolean) => void;
  hideInlineAddButton?: boolean;
  initialGroupId?: string | null;
  onGroupChange?: (groupId: string) => void;
}

export function DeviceGroupManager({
  facilityId,
  devices,
  accessControlDevices = [],
  groups,
  onGroupsChanged,
  createDialogOpen,
  onCreateDialogChange,
  hideInlineAddButton = false,
  initialGroupId = null,
  onGroupChange,
}: DeviceGroupManagerProps) {
  const { addToast } = useToast();
  const location = useLocation();
  const [groupName, setGroupName] = useState('');
  const [copyFromGroupId, setCopyFromGroupId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [detailTab, setDetailTab] = useState<'members' | 'codes'>('members');
  const [groupSummaries, setGroupSummaries] = useState<Record<string, GroupCardSummary>>({});
  const [pushState, setPushState] = useState<{
    status: string;
    last_error: string | null;
  } | null>(null);
  const [effectiveCodes, setEffectiveCodes] = useState<EffectiveAccessCode[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMemberRef[]>([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<string, number>>({});
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [internalCreateDialogOpen, setInternalCreateDialogOpen] = useState(false);
  const isCreateDialogControlled = createDialogOpen !== undefined;
  const showCreateDialog = isCreateDialogControlled ? createDialogOpen : internalCreateDialogOpen;
  const setShowCreateDialog = (open: boolean) => {
    if (isCreateDialogControlled) {
      onCreateDialogChange?.(open);
      return;
    }
    setInternalCreateDialogOpen(open);
  };
  const normalizedGroupName = groupName.trim();
  const groupNamePattern = /^[A-Za-z0-9\s\-_.(),+&:'/#!;]+$/;
  const membersRequestIdRef = useRef(0);

  const sortedGroups = useMemo(() => sortAccessGroups(groups), [groups]);
  const defaultGroup = useMemo(() => groups.find((group) => group.is_default) || null, [groups]);

  const duplicateGroupName = groups.some(
    (group) => !group.is_default && group.name.trim().toLowerCase() === normalizedGroupName.toLowerCase(),
  );
  const hasInvalidGroupNameChars = normalizedGroupName.length > 0 && !groupNamePattern.test(normalizedGroupName);
  const copyGroupOptions = useMemo(
    () => sortedGroups.map((group) => ({
      value: group.id,
      label: group.name,
      description: group.is_default
        ? 'Default group — all tenants'
        : `${groupMemberCounts[group.id] ?? 0} member${groupMemberCounts[group.id] === 1 ? '' : 's'}`,
      keywords: [group.id, group.name, group.is_default ? 'default' : 'specific'],
    })),
    [sortedGroups, groupMemberCounts],
  );
  const copyFromGroup = groups.find((group) => group.id === copyFromGroupId) || null;
  const showAccessCodes = accessControlDevices.length > 0;
  const keypadDeviceById = useMemo(
    () => new Map(filterKeypadDevices(accessControlDevices).map((device) => [device.id, device])),
    [accessControlDevices],
  );
  const knownPushStatus = pushState?.status === 'pending'
    || pushState?.status === 'active'
    || pushState?.status === 'error';
  const facilityPushStatus = knownPushStatus ? pushState?.status : 'unknown';

  const resetCreateDialogForm = () => {
    setGroupName('');
    setCopyFromGroupId('');
  };

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const memberSections = useMemo<MemberSection[]>(() => {
    const unitLocks = selectedGroupMembers.filter((member) => member.device_type === 'blulok');
    const accessControl = selectedGroupMembers.filter((member) => member.device_type === 'access_control');
    const sections: MemberSection[] = [
      { key: 'unit_locks', title: 'Unit locks', members: unitLocks },
      { key: 'access_control', title: 'Access control', members: accessControl },
    ];
    return sections.filter((section) => section.members.length > 0);
  }, [selectedGroupMembers]);
  const selectedMemberKeys = useMemo(
    () => new Set(selectedGroupMembers.flatMap((member) => {
      const keys = [`${member.device_type}:${member.device_id}`];
      if (member.device_type === 'blulok' && member.source_unit_id) {
        keys.push(`unit:${member.source_unit_id}`);
      }
      return keys;
    })),
    [selectedGroupMembers],
  );
  const groupableDeviceOptions = useMemo(
    () => devices
      .filter((device) => {
        const deviceType = device.device_category === 'blulok' ? 'blulok' : 'access_control';
        if (selectedMemberKeys.has(`${deviceType}:${device.id}`)) return false;
        if (deviceType === 'blulok' && device.unit_id && selectedMemberKeys.has(`unit:${device.unit_id}`)) return false;
        return true;
      })
      .map((device) => ({
        value: device.id,
        label:
          (typeof device.name === 'string' && device.name.trim()) ||
          (device.unit_number ? `Unit ${device.unit_number}` : '') ||
          (typeof device.device_serial === 'string' && device.device_serial.trim()) ||
          device.id,
        description: [
          device.device_category === 'blulok' ? 'Unit lock' : 'Access control device',
          device.device_category === 'blulok' && device.unit_number ? `Unit ${device.unit_number}` : '',
          device.device_category === 'blulok' && device.device_serial ? `Serial ${device.device_serial}` : '',
          device.device_category === 'access_control' && device.device_serial ? `Serial ${device.device_serial}` : '',
          device.device_category === 'access_control' && device.relay_channel != null ? `Relay ${device.relay_channel}` : '',
          device.device_category === 'access_control' && device.device_type ? device.device_type : '',
          device.device_category === 'access_control' ? (device.location_description || '') : '',
          device.device_category === 'access_control' && device.access_methods?.includes('keypad') ? 'keypad-enabled' : '',
        ].filter(Boolean).join(' • '),
        keywords: [
          device.id,
          device.name,
          device.device_category || '',
          device.device_category === 'blulok' ? (device.unit_number || '') : '',
          device.device_category === 'blulok' ? (device.device_serial || '') : '',
          device.device_category === 'access_control' ? (device.device_serial || '') : '',
          device.device_category === 'access_control' && device.relay_channel != null ? `relay ${device.relay_channel}` : '',
          device.device_category === 'access_control' ? (device.location_description || '') : '',
          device.device_category === 'access_control' ? (device.device_type || '') : '',
        ].filter(Boolean) as string[],
      })),
    [devices, selectedMemberKeys],
  );

  const loadSelectedGroupMembers = async (groupId: string) => {
    if (!groupId) {
      setSelectedGroupMembers([]);
      setGroupLoadError(null);
      return;
    }
    const requestId = membersRequestIdRef.current + 1;
    membersRequestIdRef.current = requestId;
    setLoadingMembers(true);
    try {
      const response = await apiService.getDeviceGroup(groupId);
      if (membersRequestIdRef.current !== requestId) return;
      setSelectedGroupMembers(
        (response.data?.members || []).map((member) => ({
          device_id: member.device_id,
          device_type: member.device_type || 'access_control',
          source_unit_id: member.source_unit_id || null,
        })),
      );
      setGroupLoadError(null);
    } catch (error) {
      if (membersRequestIdRef.current !== requestId) return;
      console.error(error);
      setSelectedGroupMembers([]);
      setGroupLoadError('Failed to load group members');
      addToast({ type: 'error', title: 'Failed to load group members' });
    } finally {
      if (membersRequestIdRef.current === requestId) {
        setLoadingMembers(false);
      }
    }
  };

  const loadGroupCounts = async (nextGroups: DeviceGroup[]) => {
    if (nextGroups.length === 0) {
      setGroupMemberCounts({});
      setGroupSummaries({});
      return;
    }
    try {
      const detailResponses = await Promise.all(
        nextGroups.map((group) => apiService.getDeviceGroup(group.id)),
      );
      const counts: Record<string, number> = {};
      const membersByGroup: Record<string, GroupMemberRef[]> = {};
      nextGroups.forEach((group, index) => {
        const members = (detailResponses[index].data?.members || []).map((member) => ({
          device_id: member.device_id,
          device_type: member.device_type || 'access_control',
          source_unit_id: member.source_unit_id ?? null,
        })) as GroupMemberRef[];
        counts[group.id] = members.length;
        membersByGroup[group.id] = members;
      });
      setGroupMemberCounts(counts);

      const configByGroup: Record<string, typeof DEFAULT_GROUP_CONFIG> = {};
      if (showAccessCodes) {
        const configResponses = await Promise.all(
          nextGroups.map((group) => apiService.getAccessCodeGroupConfig(group.id)),
        );
        nextGroups.forEach((group, index) => {
          configByGroup[group.id] = configResponses[index].data || DEFAULT_GROUP_CONFIG;
        });
      }

      const summaries = nextGroups.reduce<Record<string, GroupCardSummary>>((acc, group) => {
        const members = membersByGroup[group.id] || [];
        acc[group.id] = buildGroupSummary(
          group,
          members,
          configByGroup[group.id] || DEFAULT_GROUP_CONFIG,
          showAccessCodes ? effectiveCodes : [],
          keypadDeviceById,
        );
        return acc;
      }, {});
      setGroupSummaries(summaries);
    } catch (error) {
      console.error(error);
      setGroupMemberCounts({});
      setGroupSummaries({});
    }
  };

  const refreshAccessCodeMetadata = async () => {
    if (!showAccessCodes) return;
    try {
      const [effectiveList, pushStateResp] = await Promise.all([
        apiService.getEffectiveAccessCodes(facilityId),
        apiService.getAccessCodePushState(facilityId),
      ]);
      setEffectiveCodes(effectiveList.data || []);
      setPushState(pushStateResp.data || null);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    refreshAccessCodeMetadata().catch(() => undefined);
    const timer = window.setInterval(() => {
      refreshAccessCodeMetadata().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [facilityId, showAccessCodes]);

  useEffect(() => {
    loadGroupCounts(groups).catch(() => undefined);
  }, [groups, effectiveCodes, showAccessCodes, keypadDeviceById]);

  useEffect(() => {
    const fallbackGroupId = defaultGroup?.id || sortedGroups[0]?.id || '';
    const urlGroupId =
      initialGroupId && groups.some((group) => group.id === initialGroupId)
        ? initialGroupId
        : null;

    if (urlGroupId && selectedGroupId !== urlGroupId) {
      setSelectedGroupId(urlGroupId);
      loadSelectedGroupMembers(urlGroupId).catch(() => undefined);
      return;
    }

    if (!selectedGroupId && fallbackGroupId) {
      setSelectedGroupId(fallbackGroupId);
      loadSelectedGroupMembers(fallbackGroupId).catch(() => undefined);
      return;
    }

    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(fallbackGroupId);
      loadSelectedGroupMembers(fallbackGroupId).catch(() => undefined);
    }
  }, [groups, selectedGroupId, defaultGroup?.id, sortedGroups, initialGroupId]);

  const selectGroup = (groupId: string) => {
    setIsRenamingGroup(false);
    setRenameDraft('');
    setSelectedGroupId(groupId);
    loadSelectedGroupMembers(groupId).catch(() => undefined);
    onGroupChange?.(groupId);
  };

  const selectedSummary = selectedGroup ? groupSummaries[selectedGroup.id] : null;
  const detailTabs = [
    { key: 'members', label: 'Members', count: selectedGroupMembers.length },
    ...(showAccessCodes ? [{ key: 'codes', label: 'Access Codes' as const }] : []),
  ];

  const handleAccessCodesChanged = async () => {
    await refreshAccessCodeMetadata();
    await loadGroupCounts(groups);
    await onGroupsChanged();
  };

  useEffect(() => {
    if (!copyFromGroupId || normalizedGroupName) return;
    const source = groups.find((group) => group.id === copyFromGroupId);
    if (source) {
      setGroupName(`${source.name} Copy`);
    }
  }, [copyFromGroupId, groups, normalizedGroupName]);

  const copyMembersFromGroup = async (sourceGroupId: string, targetGroupId: string): Promise<{ copied: number; failed: number }> => {
    const sourceDetails = await apiService.getDeviceGroup(sourceGroupId);
    const members = (sourceDetails.data?.members || []) as GroupMemberRef[];
    let copied = 0;
    let failed = 0;

    for (const member of members) {
      const deviceType = member.device_type || 'access_control';
      const isUnitLinked = deviceType === 'blulok' && Boolean(member.source_unit_id);
      const linkedDevice = devices.find((device) => device.id === member.device_id);
      try {
        await apiService.addDeviceGroupMember(targetGroupId, {
          deviceId: isUnitLinked ? undefined : member.device_id,
          unitId: isUnitLinked
            ? member.source_unit_id || undefined
            : (deviceType === 'blulok' ? linkedDevice?.unit_id : undefined),
          deviceType,
        });
        copied += 1;
      } catch (error) {
        console.error(error);
        failed += 1;
      }
    }

    return { copied, failed };
  };

  const createGroup = async () => {
    if (!normalizedGroupName) return;
    if (hasInvalidGroupNameChars) {
      addToast({
        type: 'error',
        title: 'Group name contains invalid characters',
      });
      return;
    }
    if (duplicateGroupName) {
      addToast({ type: 'error', title: 'An access group with that name already exists' });
      return;
    }
    setSaving(true);
    try {
      const created = await apiService.createDeviceGroup({
        facility_id: facilityId,
        name: normalizedGroupName,
      });
      const newGroupId = created.data?.id;
      let copiedMembers = 0;
      let failedMembers = 0;

      if (newGroupId && copyFromGroupId) {
        try {
          const sourceConfig = await apiService.getAccessCodeGroupConfig(copyFromGroupId);
          if (sourceConfig.data) {
            await apiService.updateAccessCodeGroupConfig(newGroupId, sourceConfig.data);
          }
        } catch (error) {
          console.error(error);
          addToast({
            type: 'warning',
            title: 'Group created but access-code settings could not be copied',
          });
        }

        const copyResult = await copyMembersFromGroup(copyFromGroupId, newGroupId);
        copiedMembers = copyResult.copied;
        failedMembers = copyResult.failed;
      }

      resetCreateDialogForm();
      await onGroupsChanged();
      if (newGroupId) {
        setSelectedGroupId(newGroupId);
        await loadSelectedGroupMembers(newGroupId);
      }
      setShowCreateDialog(false);

      if (copyFromGroupId && failedMembers > 0) {
        addToast({
          type: 'warning',
          title: 'Access group created with partial copy',
          message: `${copiedMembers} member(s) copied, ${failedMembers} could not be added.`,
        });
      } else if (copyFromGroupId) {
        addToast({
          type: 'success',
          title: 'Access group created from copy',
          message: `${copiedMembers} member(s) and access-code settings copied from ${copyFromGroup?.name || 'source group'}.`,
        });
      } else {
        addToast({ type: 'success', title: 'Access group created' });
      }
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to create access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    if (!selectedGroupId || !selectedGroup) return;
    const targetDeviceId = selectedDeviceId;
    if (!targetDeviceId) return;
    if (selectedGroupMembers.some((member) => member.device_id === targetDeviceId)) {
      addToast({ type: 'error', title: 'Device is already a member of this group' });
      return;
    }
    setSaving(true);
    try {
      const selectedDevice = devices.find((device) => device.id === targetDeviceId);
      const deviceType = selectedDevice?.device_category === 'blulok' ? 'blulok' : 'access_control';
      await apiService.addDeviceGroupMember(selectedGroupId, {
        deviceId: targetDeviceId,
        unitId: deviceType === 'blulok' ? selectedDevice?.unit_id : undefined,
        deviceType,
      });
      setSelectedDeviceId('');
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      addToast({ type: 'success', title: 'Device added to access group' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to add device to access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: GroupMemberRef) => {
    if (!selectedGroupId || !selectedGroup) return;
    if (selectedGroup.is_default) {
      addToast({
        type: 'info',
        title: 'Add the device to a specific access group to move it out of the default group',
      });
      return;
    }
    setSaving(true);
    try {
      await apiService.removeDeviceGroupMember(selectedGroupId, member.device_id, member.device_type);
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      addToast({ type: 'success', title: 'Device removed from access group' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to remove device from access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedGroup = async () => {
    if (!selectedGroupId || !selectedGroup || selectedGroup.is_default) return;

    setSaving(true);
    try {
      await apiService.deleteDeviceGroup(selectedGroupId);
      setSelectedGroupId(defaultGroup?.id || '');
      setSelectedGroupMembers([]);
      await onGroupsChanged();
      addToast({ type: 'success', title: 'Access group deleted' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to delete access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const startRenameGroup = () => {
    if (!selectedGroup || selectedGroup.is_default) return;
    setRenameDraft(selectedGroup.name);
    setIsRenamingGroup(true);
  };

  const cancelRenameGroup = () => {
    setIsRenamingGroup(false);
    setRenameDraft('');
  };

  const saveRenameGroup = async () => {
    if (!selectedGroupId || !selectedGroup || selectedGroup.is_default) return;
    const nextName = renameDraft.trim();
    if (!nextName) {
      addToast({ type: 'error', title: 'Group name is required' });
      return;
    }
    if (!groupNamePattern.test(nextName)) {
      addToast({ type: 'error', title: 'Group name contains invalid characters' });
      return;
    }
    if (groups.some((group) => group.id !== selectedGroupId && group.name.trim().toLowerCase() === nextName.toLowerCase())) {
      addToast({ type: 'error', title: 'An access group with that name already exists' });
      return;
    }
    if (nextName === selectedGroup.name) {
      cancelRenameGroup();
      return;
    }

    setSaving(true);
    try {
      await apiService.updateDeviceGroup(selectedGroupId, { name: nextName });
      cancelRenameGroup();
      await onGroupsChanged();
      addToast({ type: 'success', title: 'Access group renamed' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to rename access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-700 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Access Groups</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Organize devices into access scopes and manage keypad codes from one workspace. New devices join the default group automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showAccessCodes && (
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium ${pushStatusClasses(facilityPushStatus || 'unknown')}`}>
                  Gateway push: {pushStatusLabel(facilityPushStatus)}
                </span>
              )}
              {!hideInlineAddButton && (
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 active:scale-[0.98]"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden />
                  Add Group
                </button>
              )}
            </div>
          </div>
          {pushState?.status === 'error' && pushState.last_error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              Latest push error: {pushState.last_error}
            </p>
          )}
        </div>

        <div className="flex min-h-[32rem] flex-col lg:flex-row">
          <aside className="border-b border-gray-200 bg-gray-50/60 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/40 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r">
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Groups ({sortedGroups.length})
            </p>
            <AccessGroupSelector
              groups={groups}
              groupSummaries={groupSummaries}
              selectedGroupId={selectedGroupId}
              facilityPushStatus={facilityPushStatus || 'unknown'}
              onSelect={selectGroup}
              layout="sidebar"
            />
          </aside>

          <main className="min-w-0 flex-1">
            {selectedGroup ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-700 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {isRenamingGroup ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            disabled={saving}
                            className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-base font-semibold text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                            aria-label="Access group name"
                          />
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void saveRenameGroup()}
                              disabled={saving || !renameDraft.trim()}
                              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelRenameGroup}
                              disabled={saving}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                            {selectedGroup.name}
                          </h4>
                          {selectedGroup.is_default && (
                            <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Protected default
                            </span>
                          )}
                          {!selectedGroup.is_default && (
                            <button
                              type="button"
                              onClick={startRenameGroup}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                              aria-label={`Rename ${selectedGroup.name}`}
                            >
                              <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden />
                              Rename
                            </button>
                          )}
                        </div>
                      )}
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {describeGroupAccess(selectedGroup)}
                      </p>
                      {selectedGroup.is_default && (
                        <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          Devices are added here automatically. Move a device into a specific group to restrict access to a wing or section.
                        </p>
                      )}
                    </div>
                    {!selectedGroup.is_default && !isRenamingGroup && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={saving}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                        Delete group
                      </button>
                    )}
                  </div>

                  {showAccessCodes && selectedSummary && (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: 'Members', value: String(selectedGroupMembers.length) },
                        {
                          label: 'Keypads synced',
                          value: selectedSummary.hasKeypadDevices
                            ? `${selectedSummary.effectiveCodeCount}/${selectedSummary.keypadDeviceCount}`
                            : '—',
                        },
                        {
                          label: 'Rotation',
                          value: selectedSummary.config.is_enabled ? 'Enabled' : 'Off',
                        },
                        {
                          label: 'Current code',
                          value: selectedGroup.access_code_current_code || 'Not set',
                          mono: true,
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-lg border border-gray-200/80 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {stat.label}
                          </p>
                          <p className={`mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-white ${stat.mono ? 'font-mono tracking-wider' : ''}`}>
                            {stat.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5">
                    <AccessGroupDetailTabs
                      tabs={detailTabs}
                      activeTab={detailTab}
                      onChange={(key) => setDetailTab(key as 'members' | 'codes')}
                    />
                  </div>
                </div>

                <div className="flex-1 px-5 py-5 sm:px-6">
                  {detailTab === 'members' ? (
                    <>
                      {!selectedGroup.is_default && (
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                          <div className="flex-1">
                            <SearchableSelect
                              value={selectedDeviceId}
                              onChange={setSelectedDeviceId}
                              options={groupableDeviceOptions}
                              placeholder="Search by unit, device, serial, location, or ID..."
                              emptyMessage="No eligible devices found"
                              className="w-full"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={addMember}
                            disabled={saving || !selectedDeviceId || groupableDeviceOptions.length === 0}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                          >
                            <PlusIcon className="h-4 w-4" aria-hidden />
                            Add device
                          </button>
                        </div>
                      )}

                      {groupLoadError && (
                        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                          {groupLoadError}
                        </p>
                      )}

                      {loadingMembers ? (
                        <div className="space-y-2">
                          {[0, 1].map((row) => (
                            <div key={row} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                          ))}
                        </div>
                      ) : selectedGroupMembers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-600">
                          <UsersIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
                          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">No members yet</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {selectedGroup.is_default
                              ? 'Devices will appear here as they are provisioned.'
                              : 'Search above to add unit locks or access-control devices.'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {memberSections.map((section) => (
                            <section key={section.key}>
                              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {section.title}
                                </h5>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                  {section.members.length}
                                </span>
                              </div>
                              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                                {section.members.map((member, index) => {
                                  const device = devices.find((item) => item.id === member.device_id);
                                  const isBlulok = member.device_type === 'blulok';
                                  const unitLabel = isBlulok && device?.unit_number ? `Unit ${device.unit_number}` : null;
                                  const showRemove = !selectedGroup.is_default;
                                  const iconDevice = isBlulok
                                    ? ({ device_category: 'blulok' } as const)
                                    : ({
                                        device_category: 'access_control' as const,
                                        device_type: device?.device_type,
                                      } as const);
                                  const iconMeta = getDeviceIconMeta(iconDevice);
                                  return (
                                    <div
                                      key={`${member.device_type}:${member.device_id}`}
                                      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                        index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''
                                      }`}
                                    >
                                      <DeviceTypeIcon
                                        device={iconDevice}
                                        size="md"
                                        meta={iconMeta}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="truncate font-medium text-gray-900 dark:text-white">
                                            {device?.name || member.device_id}
                                          </span>
                                          {selectedGroup.is_default && (
                                            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                              Auto-assigned
                                            </span>
                                          )}
                                        </div>
                                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                          {isBlulok ? 'Unit lock' : 'Access control'}
                                          {unitLabel ? ` · ${unitLabel}` : ''}
                                          {device?.device_serial ? ` · ${device.device_serial}` : ''}
                                          {!isBlulok && device?.device_type ? ` · ${device.device_type}` : ''}
                                          {!isBlulok && device?.location_description ? ` · ${device.location_description}` : ''}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                          <Link
                                            to={`/devices/${member.device_id}`}
                                            state={withReturnPath(location)}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                          >
                                            View device
                                            <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden />
                                          </Link>
                                          {isBlulok && device?.unit_id && (
                                            <Link
                                              to={`/units/${device.unit_id}`}
                                              state={withReturnPath(location)}
                                              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                                            >
                                              View unit
                                              <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden />
                                            </Link>
                                          )}
                                        </div>
                                      </div>
                                      {showRemove && (
                                        <button
                                          type="button"
                                          onClick={() => removeMember(member)}
                                          disabled={saving}
                                          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <AccessCodeGroupPanel
                      facilityId={facilityId}
                      group={selectedGroup}
                      members={selectedGroupMembers}
                      accessControlDevices={accessControlDevices}
                      onDataChanged={handleAccessCodesChanged}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[20rem] items-center justify-center px-6 py-12 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Select an access group to manage members and codes.</p>
              </div>
            )}
          </main>
        </div>
      </div>
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Access Group"
        message={`Delete access group "${selectedGroup?.name || ''}" with ${selectedGroupMembers.length} member(s)? Devices will return to the default group when applicable.`}
        confirmLabel="Delete Group"
        confirmTone="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteSelectedGroup().catch(() => undefined);
        }}
      />
      <Modal
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          resetCreateDialogForm();
        }}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Add Access Group</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create a specific access group, optionally starting from an existing group&apos;s members and access-code settings.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Copy From Existing Group
            </label>
            <SearchableSelect
              value={copyFromGroupId}
              onChange={setCopyFromGroupId}
              options={copyGroupOptions}
              placeholder="Start blank..."
              emptyMessage="No groups available to copy"
              className="w-full"
            />
            {copyFromGroup && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Copies {groupMemberCounts[copyFromGroup.id] ?? 0} member
                {groupMemberCounts[copyFromGroup.id] === 1 ? '' : 's'} and access-code rotation settings from
                {' '}
                <span className="font-medium text-gray-700 dark:text-gray-200">{copyFromGroup.name}</span>.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Group Name
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="New access group name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
            {duplicateGroupName && groupName.trim() && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">An access group with that name already exists.</p>
            )}
            {hasInvalidGroupNameChars && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Use letters, numbers, spaces, and basic punctuation (for example: - _ ( ) + . , &amp; ' / # ! : ;).
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateDialog(false);
                resetCreateDialogForm();
              }}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createGroup}
              disabled={saving || !normalizedGroupName || duplicateGroupName || hasInvalidGroupNameChars}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary-700 transition-colors"
            >
              {copyFromGroupId ? 'Create Copy' : 'Create Access Group'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
