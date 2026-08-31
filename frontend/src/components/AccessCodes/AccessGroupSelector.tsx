import {
  CheckCircleIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { DeviceGroup } from '@/types/facility.types';
import {
  GroupCardSummary,
  pushStatusClasses,
  pushStatusLabel,
  sortAccessGroups,
} from '@/components/AccessCodes/access-groups.utils';

interface AccessGroupSelectorProps {
  groups: DeviceGroup[];
  groupSummaries: Record<string, GroupCardSummary>;
  selectedGroupId: string;
  facilityPushStatus: string;
  onSelect: (groupId: string) => void;
  layout?: 'sidebar' | 'grid';
}

function formatGroupMeta(
  group: DeviceGroup,
  summary: GroupCardSummary | undefined,
): string {
  const memberCount = summary?.members.length ?? 0;
  const memberLabel = `${memberCount} member${memberCount === 1 ? '' : 's'}`;
  if (!summary?.hasKeypadDevices) {
    return memberLabel;
  }
  const code = group.access_code_current_code || 'No code';
  return `${memberLabel} · ${code}`;
}

export function AccessGroupSelector({
  groups,
  groupSummaries,
  selectedGroupId,
  facilityPushStatus,
  onSelect,
  layout = 'sidebar',
}: AccessGroupSelectorProps) {
  const sortedGroups = sortAccessGroups(groups);

  if (sortedGroups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-4 py-8 text-center dark:border-gray-600 dark:bg-gray-800/40">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No access groups yet. Create one to organize devices and codes.
        </p>
      </div>
    );
  }

  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedGroups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            summary={groupSummaries[group.id]}
            isSelected={selectedGroupId === group.id}
            facilityPushStatus={facilityPushStatus}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <nav className="space-y-1.5" aria-label="Access groups">
      {sortedGroups.map((group) => {
        const summary = groupSummaries[group.id];
        const isSelected = selectedGroupId === group.id;
        const meta = formatGroupMeta(group, summary);

        return (
          <button
            key={group.id}
            type="button"
            aria-label={`Select ${group.name} access group`}
            aria-pressed={isSelected}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelect(group.id)}
            className={`group relative w-full rounded-lg border px-3 py-3 text-left transition-all duration-200 ${
              isSelected
                ? 'border-primary-300 bg-primary-50/90 shadow-sm ring-1 ring-primary-500/20 dark:border-primary-700 dark:bg-primary-950/40 dark:ring-primary-500/25'
                : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:group-hover:bg-gray-700'
                }`}
              >
                {group.is_default ? (
                  <ShieldCheckIcon className="h-4 w-4" aria-hidden />
                ) : (
                  <UsersIcon className="h-4 w-4" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{group.name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{meta}</p>
                  </div>
                  {isSelected && (
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {group.is_default && (
                    <span className="inline-flex rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      Default
                    </span>
                  )}
                  {summary && (
                    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      summary.config.is_enabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
                    }`}
                    >
                      {summary.config.is_enabled ? 'Rotation on' : 'Rotation off'}
                    </span>
                  )}
                  {summary && !summary.hasKeypadDevices && (
                    <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      No keypad
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

interface GroupCardProps {
  group: DeviceGroup;
  summary: GroupCardSummary | undefined;
  isSelected: boolean;
  facilityPushStatus: string;
  onSelect: (groupId: string) => void;
}

function GroupCard({
  group,
  summary,
  isSelected,
  facilityPushStatus,
  onSelect,
}: GroupCardProps) {
  const cardPushStatus = isSelected && summary?.hasKeypadDevices
    ? facilityPushStatus
    : summary?.hasKeypadDevices
      ? facilityPushStatus
      : 'unknown';

  return (
    <button
      type="button"
      aria-label={`Select ${group.name} access group`}
      aria-pressed={isSelected}
      onClick={() => onSelect(group.id)}
      className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
        isSelected
          ? 'border-primary-300 bg-primary-50/70 shadow-sm ring-2 ring-primary-500/40 dark:border-primary-800 dark:bg-primary-950/30 dark:ring-primary-500/30'
          : 'border-gray-200 bg-gray-50/60 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-white">{group.name}</p>
          {group.is_default && (
            <span className="mt-1 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Default — all tenants
            </span>
          )}
        </div>
        {isSelected && (
          <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            Selected
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${pushStatusClasses(cardPushStatus || 'unknown')}`}>
          Push: {pushStatusLabel(cardPushStatus)}
        </span>
        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
          {summary?.members.length ?? 0} member
          {(summary?.members.length ?? 0) === 1 ? '' : 's'}
        </span>
      </div>

      {summary && !summary.hasKeypadDevices && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Add a keypad-enabled access-control device to configure codes.
        </p>
      )}
    </button>
  );
}
