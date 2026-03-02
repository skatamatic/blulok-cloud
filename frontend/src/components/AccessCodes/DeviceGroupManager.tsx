import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiService } from '@/services/api.service';
import { AccessMethod, DeviceGroup } from '@/types/facility.types';
import { useToast } from '@/contexts/ToastContext';
import { SearchableSelect } from '@/components/Common/SearchableSelect';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { Modal } from '@/components/Modal/Modal';
import { withReturnPath } from '@/hooks/useBackNavigation';

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
  device_status?: string;
}

interface GroupMemberRef {
  device_id: string;
  device_type: 'access_control' | 'blulok';
  source_unit_id?: string | null;
}

interface DeviceGroupManagerProps {
  facilityId: string;
  devices: GroupableDevice[];
  groups: DeviceGroup[];
  onGroupsChanged: () => Promise<void>;
}

export function DeviceGroupManager({ facilityId, devices, groups, onGroupsChanged }: DeviceGroupManagerProps) {
  const { addToast } = useToast();
  const location = useLocation();
  const [groupName, setGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'zone' | 'access_code'>('zone');
  const [groupTypeFilter, setGroupTypeFilter] = useState<'all' | 'zone' | 'access_code'>('all');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<GroupMemberRef[]>([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<string, number>>({});
  const [accessControlAccessCodeMembership, setAccessControlAccessCodeMembership] = useState<
    Record<string, { groupId: string; groupName: string }>
  >({});
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const normalizedGroupName = groupName.trim();
  const groupNamePattern = /^[A-Za-z0-9\s\-_.(),+&:'/#!;]+$/;

  const groupableDevices = useMemo(
    () => devices,
    [devices],
  );

  const duplicateGroupName = groups.some(
    (group) => group.name.trim().toLowerCase() === normalizedGroupName.toLowerCase(),
  );
  const hasInvalidGroupNameChars = normalizedGroupName.length > 0 && !groupNamePattern.test(normalizedGroupName);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const filteredGroups = useMemo(
    () => (groupTypeFilter === 'all' ? groups : groups.filter((group) => group.group_type === groupTypeFilter)),
    [groups, groupTypeFilter],
  );
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
    () => groupableDevices
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
          device.device_category === 'blulok' ? 'BluLok device' : 'Access control device',
          device.device_category === 'blulok' && device.unit_number ? `Unit ${device.unit_number}` : '',
          device.device_category === 'blulok' && device.device_serial ? `Serial ${device.device_serial}` : '',
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
          device.device_category === 'access_control' ? (device.location_description || '') : '',
          device.device_category === 'access_control' ? (device.device_type || '') : '',
        ].filter(Boolean) as string[],
      })),
    [groupableDevices, selectedMemberKeys],
  );

  const loadSelectedGroupMembers = async (groupId: string) => {
    if (!groupId) {
      setSelectedGroupMembers([]);
      setGroupLoadError(null);
      return;
    }
    setLoadingMembers(true);
    try {
      const response = await apiService.getDeviceGroup(groupId);
      setSelectedGroupMembers(
        (response.data?.members || []).map((member) => ({
          device_id: member.device_id,
          device_type: member.device_type || 'access_control',
          source_unit_id: member.source_unit_id || null,
        })),
      );
      setGroupLoadError(null);
    } catch (error) {
      console.error(error);
      setSelectedGroupMembers([]);
      setGroupLoadError('Failed to load group members');
      addToast({ type: 'error', title: 'Failed to load group members' });
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadGroupCounts = async (nextGroups: DeviceGroup[]) => {
    if (nextGroups.length === 0) {
      setGroupMemberCounts({});
      setAccessControlAccessCodeMembership({});
      return;
    }
    try {
      const detailResponses = await Promise.all(
        nextGroups.map((group) => apiService.getDeviceGroup(group.id)),
      );
      const counts: Record<string, number> = {};
      const memberGroupByDevice: Record<string, { groupId: string; groupName: string }> = {};
      nextGroups.forEach((group, index) => {
        const members = detailResponses[index].data?.members || [];
        counts[group.id] = members.length;
        if (group.group_type === 'access_code') {
          members.forEach((member) => {
            const memberType = member.device_type || 'access_control';
            if (memberType !== 'access_control') return;
            if (!memberGroupByDevice[member.device_id]) {
              memberGroupByDevice[member.device_id] = {
                groupId: group.id,
                groupName: group.name,
              };
            }
          });
        }
      });
      setGroupMemberCounts(counts);
      setAccessControlAccessCodeMembership(memberGroupByDevice);
    } catch (error) {
      console.error(error);
      // Non-fatal; keep UI usable with unknown counts.
      setGroupMemberCounts({});
      setAccessControlAccessCodeMembership({});
    }
  };

  useEffect(() => {
    loadGroupCounts(groups).catch(() => undefined);
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
      loadSelectedGroupMembers(groups[0].id).catch(() => undefined);
      return;
    }
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      const fallback = groups[0]?.id || '';
      setSelectedGroupId(fallback);
      loadSelectedGroupMembers(fallback).catch(() => undefined);
    }
  }, [groups, selectedGroupId]);

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
      addToast({ type: 'error', title: 'A group with that name already exists' });
      return;
    }
    setSaving(true);
    try {
      const created = await apiService.createDeviceGroup({
        facility_id: facilityId,
        group_type: newGroupType,
        name: normalizedGroupName,
      });
      setGroupName('');
      await onGroupsChanged();
      if (created.data?.id) {
        setSelectedGroupId(created.data.id);
      }
      setNewGroupType('zone');
      setShowCreateDialog(false);
      addToast({ type: 'success', title: `${newGroupType === 'access_code' ? 'Access-code group' : 'Zone'} created` });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to create group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    if (!selectedGroupId) return;
    const targetDeviceId = selectedDeviceId;
    if (!targetDeviceId) return;
    if (selectedGroupMembers.some((member) => member.device_id === targetDeviceId)) {
      addToast({ type: 'error', title: 'Device is already a member of this group' });
      return;
    }
    setSaving(true);
    try {
      const selectedDevice = groupableDevices.find((device) => device.id === targetDeviceId);
      const deviceType = selectedDevice?.device_category === 'blulok' ? 'blulok' : 'access_control';
      if (selectedGroup?.group_type === 'access_code' && deviceType === 'access_control') {
        const existingMembership = accessControlAccessCodeMembership[targetDeviceId];
        if (existingMembership && existingMembership.groupId !== selectedGroupId) {
          addToast({
            type: 'error',
            title: `Access-control device is already in access-code group "${existingMembership.groupName}"`,
          });
          return;
        }
      }
      await apiService.addDeviceGroupMember(selectedGroupId, {
        deviceId: targetDeviceId,
        unitId: deviceType === 'blulok' ? selectedDevice?.unit_id : undefined,
        deviceType,
      });
      setSelectedDeviceId('');
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      addToast({ type: 'success', title: 'Device added to group' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to add device to group';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const makeSelectedGroupGlobal = async () => {
    if (!selectedGroupId || !selectedGroup || selectedGroup.group_type !== 'access_code') return;
    if (selectedGroup.is_global_shared) return;
    setSaving(true);
    try {
      await apiService.updateDeviceGroup(selectedGroupId, {
        is_global_shared: true,
      });
      await onGroupsChanged();
      addToast({ type: 'success', title: 'Group is now global shared' });
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.message || 'Failed to set group as global shared';
      addToast({ type: 'error', title: String(message) });
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: GroupMemberRef) => {
    if (!selectedGroupId) return;
    setSaving(true);
    try {
      await apiService.removeDeviceGroupMember(selectedGroupId, member.device_id, member.device_type);
      await onGroupsChanged();
      await loadSelectedGroupMembers(selectedGroupId);
      addToast({ type: 'success', title: 'Device removed from group' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to remove device from group' });
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedGroup = async () => {
    if (!selectedGroupId || !selectedGroup) return;

    setSaving(true);
    try {
      await apiService.deleteDeviceGroup(selectedGroupId);
      setSelectedGroupId('');
      setSelectedGroupMembers([]);
      await onGroupsChanged();
      addToast({ type: 'success', title: 'Group deleted' });
    } catch (error) {
      console.error(error);
      addToast({ type: 'error', title: 'Failed to delete group' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Device Groups</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Manage Zones (general-purpose grouping) and Access-Code Groups (shared keypad code scopes).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          Add Group
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Groups</h4>
          <div className="mb-2 flex gap-1">
            {([
              { id: 'all', label: 'All' },
              { id: 'zone', label: 'Zones' },
              { id: 'access_code', label: 'Access Codes' },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setGroupTypeFilter(option.id)}
                className={`rounded px-2 py-1 text-xs ${
                  groupTypeFilter === option.id
                    ? 'bg-primary-600 text-white'
                    : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {filteredGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupId(group.id);
                  loadSelectedGroupMembers(group.id).catch(() => undefined);
                }}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedGroupId === group.id
                    ? 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-200'
                    : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="font-medium block truncate">{group.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {group.group_type === 'access_code' ? 'Access Code Group' : 'Zone'}
                      </span>
                      {group.group_type === 'access_code' && group.is_global_shared && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Global
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{groupMemberCounts[group.id] ?? '-'}</span>
                </div>
              </button>
            ))}
            {filteredGroups.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No groups yet. Create one above.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
          {!selectedGroup ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a group to manage members.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedGroup.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedGroup.group_type === 'access_code'
                      ? `${selectedGroup.is_global_shared ? 'Global Shared Access Code Group' : 'Access Code Group'}`
                      : 'Zone'} • Members: {selectedGroupMembers.length}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
                >
                  Delete Group
                </button>
              </div>

              {selectedGroup.group_type === 'access_code' && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  {selectedGroup.is_global_shared ? (
                    <span className="rounded bg-blue-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      Global shared group
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={makeSelectedGroupGlobal}
                      disabled={saving}
                      className="rounded-md border border-blue-300 dark:border-blue-700 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 disabled:opacity-50"
                    >
                      Set as Default
                    </button>
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    Only one access-code group can be global at a time.
                  </span>
                </div>
              )}

              <div className="mb-3 flex gap-2">
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
                  className="rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {groupableDeviceOptions.length === 0 && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                  No eligible devices are available for grouping.
                </p>
              )}
              {groupLoadError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{groupLoadError}</p>}

              {loadingMembers ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading members...</p>
              ) : selectedGroupMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No members in this group.</p>
              ) : (
                <div className="space-y-2">
                  {selectedGroupMembers.map((member) => {
                    const device = devices.find((item) => item.id === member.device_id);
                    const isBlulok = member.device_type === 'blulok';
                    const unitLabel = isBlulok && device?.unit_number ? `Unit ${device.unit_number}` : null;
                    return (
                      <div
                        key={`${member.device_type}:${member.device_id}`}
                        className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {device?.name || member.device_id}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="capitalize">{member.device_type.replace('_', ' ')}</span>
                            {unitLabel ? ` • ${unitLabel}` : ''}
                            {member.source_unit_id ? ' • linked to unit' : ''}
                            {device?.device_serial ? ` • ${device.device_serial}` : ''}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs">
                            <Link to={`/devices/${member.device_id}`} state={withReturnPath(location)} className="text-primary-600 dark:text-primary-400 hover:underline">
                              View device
                            </Link>
                            {isBlulok && device?.unit_id && (
                              <Link to={`/units/${device.unit_id}`} state={withReturnPath(location)} className="text-primary-600 dark:text-primary-400 hover:underline">
                                View unit
                              </Link>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(member)}
                          disabled={saving}
                          className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Group"
        message={`Delete group "${selectedGroup?.name || ''}" with ${selectedGroupMembers.length} member(s)? This cannot be undone.`}
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
          setGroupName('');
          setNewGroupType('zone');
        }}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Add Group</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create a zone or access-code group for this facility.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Group Type
            </label>
            <select
              value={newGroupType}
              onChange={(event) => setNewGroupType(event.target.value as 'zone' | 'access_code')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              <option value="zone">Zone</option>
              <option value="access_code">Access Code Group</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Group Name
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="New group name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
            {duplicateGroupName && groupName.trim() && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">Group name already exists in this facility.</p>
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
                setGroupName('');
                setNewGroupType('zone');
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
              Create Group
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

