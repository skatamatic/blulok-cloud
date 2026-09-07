import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessControlDevice, AccessMethod, DeviceGroup, EffectiveAccessCode } from '@/types/facility.types';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { SearchableSelect } from '@/components/Common/SearchableSelect';
import { DeviceTypeIcon } from '@/components/Common/DeviceTypeIcon';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { getDeviceIconMeta } from '@/utils/device-icon.utils';
import { Modal } from '@/components/Modal/Modal';
import { AccessGroupSelector } from '@/components/AccessCodes/AccessGroupSelector';
import { AccessGroupDetailTabs } from '@/components/AccessCodes/AccessGroupDetailTabs';
import { AccessCodeGroupPanel } from '@/components/AccessCodes/AccessCodeGroupPanel';
import { AccessGroupUsersPanel } from '@/components/AccessCodes/AccessGroupUsersPanel';
import { AccessGroupRowDetailLinks } from '@/components/AccessCodes/AccessGroupRowDetailLinks';
import {
  buildGroupSummary,
  buildGroupableAccessControlSearchKeywords,
  buildGroupableUnitSearchKeywords,
  DEFAULT_GROUP_CONFIG,
  describeGroupAccess,
  filterKeypadDevices,
  filterBlulokMembersByLockAssignment,
  filterGroupableUnitsByLockAssignment,
  GroupCardSummary,
  groupableUnitHasAssignedLock,
  GroupableUnitFields,
  GroupMemberRef,
  GroupUserAccess,
  pushStatusClasses,
  pushStatusLabel,
  resolveAccessGroupMemberSubtitle,
  resolveAccessGroupMemberTitle,
  resolveGroupMemberKey,
  resolveGroupableUnitLabel,
  resolveLockDeviceForUnitMember,
  resolveUnitForMember,
  sortAccessGroups,
  unitMemberHasAssignedLock,
  ACCESS_GROUP_LIST_SCROLL_CLASS,
} from '@/components/AccessCodes/access-groups.utils';
import { Unit } from '@/types/facility.types';

interface GroupableDevice {
  id: string;
  name?: string;
  device_category?: 'access_control' | 'blulok';
  access_methods?: AccessMethod[];
  device_type?: 'gate' | 'elevator' | 'door';
  location_description?: string;
  unit_id?: string;
  unit_number?: string;
  device_serial?: string;
  device_settings?: Record<string, unknown> | null;
  relay_channel?: number;
  device_status?: string;
}

interface MemberSection {
  key: 'units' | 'access_control';
  title: string;
  members: GroupMemberRef[];
}

interface DeviceGroupManagerProps {
  facilityId: string;
  devices: GroupableDevice[];
  units?: Unit[];
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
  units = [],
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
  const [groupName, setGroupName] = useState('');
  const [copyFromGroupId, setCopyFromGroupId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [detailTab, setDetailTab] = useState<'members' | 'users' | 'codes'>('members');
  const [groupSummaries, setGroupSummaries] = useState<Record<string, GroupCardSummary>>({});
  const [pushState, setPushState] = useState<{
    status: string;
    last_error: string | null;
    updated_at?: string;
  } | null>(null);
  const [effectiveCodes, setEffectiveCodes] = useState<EffectiveAccessCode[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMemberRef[]>([]);
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<GroupUserAccess[]>([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<string, number>>({});
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [usersLoadedForGroupId, setUsersLoadedForGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRenamingGroup, setIsRenamingGroup] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedMemberKey, setExpandedMemberKey] = useState<string | null>(null);
  const [includeUnitsWithoutLock, setIncludeUnitsWithoutLock] = useState(true);
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
  const usersRequestIdRef = useRef(0);
  const groupCountsRequestIdRef = useRef(0);
  const groupsRef = useRef(groups);
  const pendingDeletedGroupIdRef = useRef<string | null>(null);
  groupsRef.current = groups;

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

  const groupableUnits = useMemo<GroupableUnitFields[]>(
    () => units.map((unit) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      status: unit.status,
      unit_type: unit.unit_type,
      blulok_device: unit.blulok_device,
    })),
    [units],
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const visibleGroupableUnits = useMemo(
    () => filterGroupableUnitsByLockAssignment(groupableUnits, includeUnitsWithoutLock, devices),
    [groupableUnits, includeUnitsWithoutLock, devices],
  );
  const hiddenUnitsWithoutLockCount = useMemo(
    () => groupableUnits.filter((unit) => !groupableUnitHasAssignedLock(unit, devices)).length,
    [groupableUnits, devices],
  );
  const vacantUnitMemberCount = useMemo(
    () => selectedGroupMembers.filter((member) => {
      if (member.device_type !== 'blulok') return false;
      const unit = resolveUnitForMember(member, groupableUnits);
      return !unitMemberHasAssignedLock(member, devices, unit);
    }).length,
    [selectedGroupMembers, groupableUnits, devices],
  );
  const showUnitLockFilter = hiddenUnitsWithoutLockCount > 0 || vacantUnitMemberCount > 0;
  const memberSections = useMemo<MemberSection[]>(() => {
    const unitMembers = filterBlulokMembersByLockAssignment(
      selectedGroupMembers.filter((member) => member.device_type === 'blulok'),
      includeUnitsWithoutLock,
      groupableUnits,
      devices,
    );
    const accessControl = selectedGroupMembers.filter((member) => member.device_type === 'access_control');
    const sections: MemberSection[] = [
      { key: 'units', title: 'Units', members: unitMembers },
      { key: 'access_control', title: 'Access control', members: accessControl },
    ];
    return sections.filter((section) => section.members.length > 0);
  }, [selectedGroupMembers, includeUnitsWithoutLock, groupableUnits, devices]);
  const selectedMemberKeys = useMemo(
    () => new Set(selectedGroupMembers.flatMap((member) => {
      const keys = [resolveGroupMemberKey(member)];
      if (member.device_type === 'blulok' && member.source_unit_id) {
        keys.push(`unit:${member.source_unit_id}`);
      }
      if (member.device_type === 'blulok') {
        keys.push(`blulok:${member.device_id}`);
      }
      return keys;
    })),
    [selectedGroupMembers],
  );
  const groupableUnitOptions = useMemo(
    () => visibleGroupableUnits
      .filter((unit) => !selectedMemberKeys.has(`unit:${unit.id}`))
      .map((unit) => {
        const lockSerial = unit.blulok_device?.device_serial || unit.blulok_device?.serial;
        return {
          value: unit.id,
          label: resolveGroupableUnitLabel(unit),
          description: lockSerial
            ? `Lock assigned · ${lockSerial}`
            : 'No lock assigned',
          keywords: buildGroupableUnitSearchKeywords(unit),
        };
      }),
    [visibleGroupableUnits, selectedMemberKeys],
  );
  const groupableAccessControlOptions = useMemo(
    () => devices
      .filter((device) => device.device_category === 'access_control')
      .filter((device) => !selectedMemberKeys.has(`access_control:${device.id}`))
      .map((device) => ({
        value: device.id,
        label: device.name?.trim() || device.device_serial || device.id,
        description: [
          'Access control device',
          device.device_serial ? `Serial ${device.device_serial}` : '',
          device.relay_channel != null ? `Relay ${device.relay_channel}` : '',
          device.device_type || '',
          device.location_description || '',
          device.access_methods?.includes('keypad') ? 'keypad-enabled' : '',
        ].filter(Boolean).join(' · '),
        keywords: buildGroupableAccessControlSearchKeywords(device),
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
      if (
        pendingDeletedGroupIdRef.current === groupId
        || !groupsRef.current.some((group) => group.id === groupId)
      ) {
        setSelectedGroupMembers([]);
        setGroupLoadError(null);
        return;
      }
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

  const loadSelectedGroupUsers = async (groupId: string) => {
    if (!groupId) {
      setSelectedGroupUsers([]);
      setUsersLoadError(null);
      setUsersLoadedForGroupId(null);
      return;
    }
    const requestId = usersRequestIdRef.current + 1;
    usersRequestIdRef.current = requestId;
    setLoadingUsers(true);
    try {
      const response = await apiService.getDeviceGroupUsers(groupId);
      if (usersRequestIdRef.current !== requestId) return;
      setSelectedGroupUsers(response.data || []);
      setUsersLoadError(null);
      setUsersLoadedForGroupId(groupId);
    } catch (error) {
      if (usersRequestIdRef.current !== requestId) return;
      if (
        pendingDeletedGroupIdRef.current === groupId
        || !groupsRef.current.some((group) => group.id === groupId)
      ) {
        setSelectedGroupUsers([]);
        setUsersLoadError(null);
        setUsersLoadedForGroupId(null);
        return;
      }
      console.error(error);
      setSelectedGroupUsers([]);
      setUsersLoadError('Failed to load group users');
      setUsersLoadedForGroupId(null);
      addToast({ type: 'error', title: 'Failed to load group users' });
    } finally {
      if (usersRequestIdRef.current === requestId) {
        setLoadingUsers(false);
      }
    }
  };

  const refreshGroupUsersAfterMemberChange = async (groupId: string) => {
    if (detailTab === 'users') {
      await loadSelectedGroupUsers(groupId);
      return;
    }
    setUsersLoadedForGroupId(null);
  };

  const loadGroupCounts = async (nextGroups: DeviceGroup[]) => {
    if (nextGroups.length === 0) {
      setGroupMemberCounts({});
      setGroupSummaries({});
      return;
    }
    const requestId = groupCountsRequestIdRef.current + 1;
    groupCountsRequestIdRef.current = requestId;
    try {
      const detailResponses = await Promise.all(
        nextGroups.map((group) => apiService.getDeviceGroup(group.id)),
      );
      if (groupCountsRequestIdRef.current !== requestId) return;
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
        if (groupCountsRequestIdRef.current !== requestId) return;
        nextGroups.forEach((group, index) => {
          configByGroup[group.id] = configResponses[index].data || DEFAULT_GROUP_CONFIG;
        });
      }

      if (groupCountsRequestIdRef.current !== requestId) return;
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
      if (groupCountsRequestIdRef.current !== requestId) return;
      console.error(error);
      setGroupMemberCounts({});
      setGroupSummaries({});
    }
  };

  const effectiveCodesRefreshTimerRef = useRef<number | null>(null);
  const facilityIdRef = useRef(facilityId);
  facilityIdRef.current = facilityId;

  const refreshAccessCodeMetadata = useCallback(async () => {
    if (!showAccessCodes) return;
    try {
      const [effectiveList, pushStateResp] = await Promise.all([
        apiService.getEffectiveAccessCodes(facilityId),
        apiService.getAccessCodePushState(facilityId),
      ]);
      if (facilityIdRef.current !== facilityId) return;
      setEffectiveCodes(effectiveList.data || []);
      setPushState(
        pushStateResp.data
          ? {
              status: pushStateResp.data.status,
              last_error: pushStateResp.data.last_error ?? null,
              updated_at: pushStateResp.data.updated_at,
            }
          : null,
      );
    } catch (error) {
      console.error(error);
    }
  }, [facilityId, showAccessCodes]);

  const scheduleEffectiveCodesRefresh = useCallback(() => {
    if (effectiveCodesRefreshTimerRef.current != null) {
      window.clearTimeout(effectiveCodesRefreshTimerRef.current);
    }
    const requestedFacilityId = facilityId;
    effectiveCodesRefreshTimerRef.current = window.setTimeout(() => {
      effectiveCodesRefreshTimerRef.current = null;
      apiService
        .getEffectiveAccessCodes(requestedFacilityId)
        .then((resp) => {
          if (facilityIdRef.current !== requestedFacilityId) return;
          setEffectiveCodes(resp.data || []);
        })
        .catch((error) => console.error(error));
    }, 300);
  }, [facilityId]);

  useEffect(() => {
    refreshAccessCodeMetadata().catch(() => undefined);
  }, [refreshAccessCodeMetadata]);

  // Cancel pending effective-code refetch on facility change or unmount.
  useEffect(() => () => {
    if (effectiveCodesRefreshTimerRef.current != null) {
      window.clearTimeout(effectiveCodesRefreshTimerRef.current);
      effectiveCodesRefreshTimerRef.current = null;
    }
  }, [facilityId]);
  useWebSocketSubscription<{
    facility_id: string;
    status: string;
    last_error: string | null;
    updated_at?: string;
    refresh_effective_codes?: boolean;
  }>(
    'access_code_push_state',
    (payload) => {
      if (payload.facility_id && payload.facility_id !== facilityId) return;
      setPushState((prev) => {
        // Ignore out-of-order WS frames (timeout error arriving after a newer pending/active).
        if (prev?.updated_at && payload.updated_at) {
          const prevTs = Date.parse(prev.updated_at);
          const nextTs = Date.parse(payload.updated_at);
          if (Number.isFinite(prevTs) && Number.isFinite(nextTs) && nextTs < prevTs) {
            return prev;
          }
        }
        return {
          status: payload.status,
          last_error: payload.last_error,
          updated_at: payload.updated_at,
        };
      });
      if (payload.refresh_effective_codes) {
        scheduleEffectiveCodesRefresh();
      }
    },
    {
      enabled: Boolean(facilityId) && showAccessCodes,
      filters: { facility_id: facilityId },
    },
  );

  useEffect(() => {
    loadGroupCounts(groups).catch(() => undefined);
  }, [groups, effectiveCodes, showAccessCodes, keypadDeviceById]);

  useEffect(() => {
    if (
      pendingDeletedGroupIdRef.current
      && initialGroupId !== pendingDeletedGroupIdRef.current
    ) {
      pendingDeletedGroupIdRef.current = null;
    }
  }, [initialGroupId]);

  useEffect(() => {
    setExpandedMemberKey(null);
  }, [selectedGroupId, detailTab]);

  useEffect(() => {
    if (includeUnitsWithoutLock || !selectedUnitId) return;
    const unit = groupableUnits.find((item) => item.id === selectedUnitId);
    if (unit && !groupableUnitHasAssignedLock(unit, devices)) {
      setSelectedUnitId('');
    }
  }, [includeUnitsWithoutLock, selectedUnitId, groupableUnits, devices]);

  useEffect(() => {
    if (detailTab !== 'users' || !selectedGroupId) return;
    loadSelectedGroupUsers(selectedGroupId).catch(() => undefined);
  }, [detailTab, selectedGroupId]);

  useEffect(() => {
    const fallbackGroupId = defaultGroup?.id || sortedGroups[0]?.id || '';
    const urlGroupId =
      initialGroupId && groups.some((group) => group.id === initialGroupId)
        ? initialGroupId
        : null;

    if (urlGroupId && selectedGroupId !== urlGroupId) {
      if (pendingDeletedGroupIdRef.current === urlGroupId) {
        return;
      }
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
    setSelectedGroupUsers([]);
    setUsersLoadedForGroupId(null);
    setSelectedGroupId(groupId);
    loadSelectedGroupMembers(groupId).catch(() => undefined);
    onGroupChange?.(groupId);
  };

  const selectedSummary = selectedGroup ? groupSummaries[selectedGroup.id] : null;
  const hasUnitMembers = selectedGroupMembers.some((member) => member.device_type === 'blulok');
  const detailTabs = [
    { key: 'members', label: 'Members', count: selectedGroupMembers.length },
    {
      key: 'users',
      label: 'Users',
      count: usersLoadedForGroupId === selectedGroupId ? selectedGroupUsers.length : undefined,
    },
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

  const addUnitMember = async () => {
    if (!selectedGroupId || !selectedGroup || !selectedUnitId) return;
    if (selectedMemberKeys.has(`unit:${selectedUnitId}`)) {
      addToast({ type: 'error', title: 'Unit is already a member of this group' });
      return;
    }
    setSaving(true);
    try {
      await apiService.addDeviceGroupMember(selectedGroupId, {
        unitId: selectedUnitId,
        deviceType: 'blulok',
      });
      setSelectedUnitId('');
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      await refreshGroupUsersAfterMemberChange(selectedGroupId);
      addToast({ type: 'success', title: 'Unit added to access group' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to add unit to access group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const addAccessControlMember = async () => {
    if (!selectedGroupId || !selectedGroup || !selectedDeviceId) return;
    if (selectedGroupMembers.some((member) => member.device_id === selectedDeviceId)) {
      addToast({ type: 'error', title: 'Device is already a member of this group' });
      return;
    }
    setSaving(true);
    try {
      await apiService.addDeviceGroupMember(selectedGroupId, {
        deviceId: selectedDeviceId,
        deviceType: 'access_control',
      });
      setSelectedDeviceId('');
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      await refreshGroupUsersAfterMemberChange(selectedGroupId);
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
      const removeId = member.device_type === 'blulok' && member.source_unit_id
        ? member.source_unit_id
        : member.device_id;
      await apiService.removeDeviceGroupMember(selectedGroupId, removeId, member.device_type);
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      await refreshGroupUsersAfterMemberChange(selectedGroupId);
      addToast({
        type: 'success',
        title: member.device_type === 'blulok' ? 'Unit removed from access group' : 'Device removed from access group',
      });
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

    const deletedGroupId = selectedGroupId;
    const fallbackGroupId = defaultGroup?.id || sortedGroups.find((g) => g.id !== deletedGroupId)?.id || '';
    membersRequestIdRef.current += 1;
    groupCountsRequestIdRef.current += 1;
    pendingDeletedGroupIdRef.current = deletedGroupId;

    setSaving(true);
    try {
      await apiService.deleteDeviceGroup(deletedGroupId);
      setSelectedGroupId(fallbackGroupId);
      setSelectedGroupMembers([]);
      setSelectedGroupUsers([]);
      setUsersLoadedForGroupId(null);
      onGroupChange?.(fallbackGroupId);
      await onGroupsChanged();
      if (fallbackGroupId) {
        await loadSelectedGroupMembers(fallbackGroupId);
      }
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
                          Units and devices are added here automatically when provisioned. Move a unit or device into a specific group to restrict access to a wing or section.
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
                      onChange={(key) => setDetailTab(key as 'members' | 'users' | 'codes')}
                    />
                  </div>
                </div>

                <div className="flex-1 px-5 py-5 sm:px-6">
                  {detailTab === 'members' ? (
                    <>
                      {showUnitLockFilter && (
                        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-100">
                              Units without locks
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                              {includeUnitsWithoutLock
                                ? 'Showing vacant units in the member list and add picker.'
                                : 'Vacant units are hidden from the member list and add picker.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={includeUnitsWithoutLock}
                            aria-label="Include units without locks"
                            onClick={() => setIncludeUnitsWithoutLock((current) => !current)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              includeUnitsWithoutLock ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                includeUnitsWithoutLock ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      )}

                      {!selectedGroup.is_default && (
                        <div className="mb-4 space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="flex-1">
                              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Add unit
                              </label>
                              <SearchableSelect
                                value={selectedUnitId}
                                onChange={setSelectedUnitId}
                                options={groupableUnitOptions}
                                placeholder="Search by unit number or status..."
                                emptyMessage="No eligible units found"
                                className="w-full"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={addUnitMember}
                                disabled={saving || !selectedUnitId || groupableUnitOptions.length === 0}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50 sm:w-auto"
                              >
                                <PlusIcon className="h-4 w-4" aria-hidden />
                                Add unit
                              </button>
                            </div>
                          </div>
                          {groupableAccessControlOptions.length > 0 && (
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <div className="flex-1">
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  Add access control device
                                </label>
                                <SearchableSelect
                                  value={selectedDeviceId}
                                  onChange={setSelectedDeviceId}
                                  options={groupableAccessControlOptions}
                                  placeholder="Search by name, serial, location, or ID..."
                                  emptyMessage="No eligible access control devices found"
                                  className="w-full"
                                />
                              </div>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={addAccessControlMember}
                                  disabled={saving || !selectedDeviceId}
                                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50 dark:border-primary-900/50 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50 sm:w-auto"
                                >
                                  <PlusIcon className="h-4 w-4" aria-hidden />
                                  Add device
                                </button>
                              </div>
                            </div>
                          )}
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
                              ? 'Units and devices will appear here as they are provisioned.'
                              : 'Add units or access-control devices using the selectors above.'}
                          </p>
                        </div>
                      ) : memberSections.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-600">
                          <UsersIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
                          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                            All members are hidden by filter
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Turn on &quot;Units without locks&quot; to show vacant unit members.
                          </p>
                        </div>
                      ) : (
                        <div className={`${ACCESS_GROUP_LIST_SCROLL_CLASS} pr-0.5`}>
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
                                  const isBlulok = member.device_type === 'blulok';
                                  const unit = isBlulok
                                    ? resolveUnitForMember(member, groupableUnits)
                                    : undefined;
                                  const lockDevice = isBlulok
                                    ? resolveLockDeviceForUnitMember(member, devices, unit)
                                    : undefined;
                                  const accessControlDevice = !isBlulok
                                    ? devices.find((item) => item.id === member.device_id)
                                    : undefined;
                                  const displayDevice = isBlulok ? lockDevice : accessControlDevice;
                                  const hasAssignedLock = isBlulok
                                    ? unitMemberHasAssignedLock(member, devices, unit)
                                    : false;
                                  const showRemove = !selectedGroup.is_default;
                                  const memberKey = resolveGroupMemberKey(member);
                                  const isExpanded = expandedMemberKey === memberKey;
                                  const iconDevice = isBlulok
                                    ? ({ device_category: 'blulok' } as const)
                                    : ({
                                        device_category: 'access_control' as const,
                                        device_type: accessControlDevice?.device_type,
                                      } as const);
                                  const iconMeta = getDeviceIconMeta(iconDevice);
                                  const unitIdForLink = member.source_unit_id || unit?.id;
                                  const detailLinks = [
                                    ...(isBlulok && unitIdForLink
                                      ? [{ label: 'View unit', to: `/units/${unitIdForLink}` }]
                                      : []),
                                    ...(hasAssignedLock && lockDevice?.id
                                      ? [{ label: 'View lock', to: `/devices/${lockDevice.id}` }]
                                      : []),
                                    ...(!isBlulok
                                      ? [{ label: 'View device', to: `/devices/${member.device_id}` }]
                                      : []),
                                  ];
                                  const subtitle = resolveAccessGroupMemberSubtitle(
                                    member,
                                    displayDevice,
                                    unit,
                                  );
                                  return (
                                    <div key={memberKey}>
                                      <div
                                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                                          index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''
                                        } ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setExpandedMemberKey(isExpanded ? null : memberKey)}
                                          aria-expanded={isExpanded}
                                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                        >
                                          <DeviceTypeIcon
                                            device={iconDevice}
                                            size="md"
                                            meta={iconMeta}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="truncate font-medium text-gray-900 dark:text-white">
                                                {resolveAccessGroupMemberTitle(member, displayDevice, unit)}
                                              </span>
                                              {isBlulok && !hasAssignedLock && (
                                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                                  No lock
                                                </span>
                                              )}
                                              {selectedGroup.is_default && (
                                                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                                  Auto-assigned
                                                </span>
                                              )}
                                            </div>
                                            <p className={`truncate text-xs ${isBlulok && !hasAssignedLock ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                              {subtitle}
                                            </p>
                                          </div>
                                          {isExpanded ? (
                                            <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                                          ) : (
                                            <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                                          )}
                                        </button>
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
                                      {isExpanded && <AccessGroupRowDetailLinks links={detailLinks} />}
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : detailTab === 'users' ? (
                    <AccessGroupUsersPanel
                      users={selectedGroupUsers}
                      loading={loadingUsers}
                      loadError={usersLoadError}
                      hasUnitLocks={hasUnitMembers}
                    />
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Select an access group to manage members, users, and codes.</p>
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
