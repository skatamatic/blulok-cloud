/**
 * FMS Change Review Modal
 *
 * Displays detected changes with before/after comparison.
 * Allows the user to select and apply changes.
 */

import { Fragment, useState } from 'react';
import { Dialog, Transition, Tab } from '@headlessui/react';
import {
  XMarkIcon,
  MinusIcon,
  CheckIcon,
  UserPlusIcon,
  UserMinusIcon,
  PencilSquareIcon,
  ArrowsRightLeftIcon,
  HomeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  ShieldExclamationIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  FMSChange,
  FMSChangeType,
  FMSSyncResult,
  FMSChangeApplicationResult,
  FMSChangeAction,
} from '@/types/fms.types';
import { fmsService } from '@/services/fms.service';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/utils/datetime.utils';

interface FMSChangeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  changes: FMSChange[];
  onApply: (changeIds: string[]) => Promise<void>;
  syncResult: FMSSyncResult | null;
  facilityName?: string;
}

type ChangeFilter = 'all' | 'added' | 'updated' | 'removed' | 'invalid';

type ChangeVisualStyle = {
  label: string;
  icon: typeof UserPlusIcon;
  accent: string;
  iconBg: string;
  iconText: string;
  tagBg: string;
  tagText: string;
};

const CHANGE_STYLES: Record<FMSChangeType, ChangeVisualStyle> = {
  [FMSChangeType.TENANT_ADDED]: {
    label: 'Tenant added',
    icon: UserPlusIcon,
    accent: 'border-l-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    tagBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    tagText: 'text-emerald-700 dark:text-emerald-300',
  },
  [FMSChangeType.TENANT_REMOVED]: {
    label: 'Tenant removed',
    icon: UserMinusIcon,
    accent: 'border-l-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    tagBg: 'bg-rose-50 dark:bg-rose-950/30',
    tagText: 'text-rose-700 dark:text-rose-300',
  },
  [FMSChangeType.TENANT_UPDATED]: {
    label: 'Tenant updated',
    icon: PencilSquareIcon,
    accent: 'border-l-[#147FD4]',
    iconBg: 'bg-sky-50 dark:bg-sky-950/40',
    iconText: 'text-[#147FD4] dark:text-sky-400',
    tagBg: 'bg-sky-50 dark:bg-sky-950/30',
    tagText: 'text-sky-700 dark:text-sky-300',
  },
  [FMSChangeType.TENANT_UNIT_CHANGED]: {
    label: 'Unit assignment',
    icon: ArrowsRightLeftIcon,
    accent: 'border-l-violet-500',
    iconBg: 'bg-violet-50 dark:bg-violet-950/40',
    iconText: 'text-violet-600 dark:text-violet-400',
    tagBg: 'bg-violet-50 dark:bg-violet-950/30',
    tagText: 'text-violet-700 dark:text-violet-300',
  },
  [FMSChangeType.UNIT_ADDED]: {
    label: 'Unit added',
    icon: HomeIcon,
    accent: 'border-l-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    tagBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    tagText: 'text-emerald-700 dark:text-emerald-300',
  },
  [FMSChangeType.UNIT_UPDATED]: {
    label: 'Unit updated',
    icon: HomeIcon,
    accent: 'border-l-[#147FD4]',
    iconBg: 'bg-sky-50 dark:bg-sky-950/40',
    iconText: 'text-[#147FD4] dark:text-sky-400',
    tagBg: 'bg-sky-50 dark:bg-sky-950/30',
    tagText: 'text-sky-700 dark:text-sky-300',
  },
  [FMSChangeType.UNIT_REMOVED]: {
    label: 'Unit removed',
    icon: HomeIcon,
    accent: 'border-l-rose-500',
    iconBg: 'bg-rose-50 dark:bg-rose-950/40',
    iconText: 'text-rose-600 dark:text-rose-400',
    tagBg: 'bg-rose-50 dark:bg-rose-950/30',
    tagText: 'text-rose-700 dark:text-rose-300',
  },
  [FMSChangeType.UNIT_OVERLOCK_CHANGED]: {
    label: 'Unit overlock',
    icon: ShieldExclamationIcon,
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    iconText: 'text-amber-600 dark:text-amber-400',
    tagBg: 'bg-amber-50 dark:bg-amber-950/30',
    tagText: 'text-amber-700 dark:text-amber-300',
  },
};

const DEFAULT_CHANGE_STYLE: ChangeVisualStyle = {
  label: 'Change',
  icon: PencilSquareIcon,
  accent: 'border-l-gray-400',
  iconBg: 'bg-gray-100 dark:bg-gray-800',
  iconText: 'text-gray-600 dark:text-gray-400',
  tagBg: 'bg-gray-100 dark:bg-gray-800',
  tagText: 'text-gray-700 dark:text-gray-300',
};

function getChangeStyle(type: FMSChangeType): ChangeVisualStyle {
  return CHANGE_STYLES[type] ?? DEFAULT_CHANGE_STYLE;
}

function formatActionLabel(action: FMSChangeAction | string): string {
  return String(action).replace(/_/g, ' ');
}

function generateChangesSummary(result: FMSChangeApplicationResult, selectedCount: number): string {
  const parts: string[] = [];

  if (result.changesApplied > 0) {
    parts.push(`Applied ${result.changesApplied} of ${selectedCount} change${selectedCount !== 1 ? 's' : ''}`);
  }

  const { accessChanges } = result;
  const details: string[] = [];

  if (accessChanges.usersCreated.length > 0) {
    details.push(`${accessChanges.usersCreated.length} user${accessChanges.usersCreated.length !== 1 ? 's' : ''} created`);
  }
  if (accessChanges.usersDeactivated.length > 0) {
    details.push(`${accessChanges.usersDeactivated.length} user${accessChanges.usersDeactivated.length !== 1 ? 's' : ''} deactivated`);
  }
  if (accessChanges.accessGranted.length > 0) {
    details.push(`${accessChanges.accessGranted.length} unit access granted`);
  }
  if (accessChanges.accessRevoked.length > 0) {
    details.push(`${accessChanges.accessRevoked.length} unit access revoked`);
  }

  if (details.length > 0) {
    parts.push(`(${details.join(', ')})`);
  }

  return parts.join(' ');
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${formatFieldLabel(k)}: ${formatFieldValue(v)}`)
      .join(', ');
  }
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    return formatDateTime(value);
  }
  return String(value);
}

function ChangeDataFields({ data }: { data: unknown }) {
  if (!data) return null;

  return (
    <div className="space-y-1.5">
      {Object.entries(data as Record<string, unknown>).map(([key, value]) => {
        if (key === 'id' || key === 'externalId' || key === 'tenantId') return null;

        const formattedValue = formatFieldValue(value);
        const highlighted = ['email', 'unitNumber', 'firstName', 'lastName'].includes(key);

        return (
          <div
            key={key}
            className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-xs ${
              highlighted
                ? 'bg-white/80 dark:bg-gray-900/60 ring-1 ring-[#147FD4]/20 dark:ring-sky-500/20'
                : 'bg-white/50 dark:bg-gray-900/30'
            }`}
          >
            <span className="font-medium text-gray-500 dark:text-gray-400">{formatFieldLabel(key)}</span>
            <span
              className={`text-right font-semibold ${
                highlighted ? 'text-[#147FD4] dark:text-sky-300' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {formattedValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FMSChangeReviewModal({
  isOpen,
  onClose,
  changes,
  onApply,
  syncResult,
  facilityName,
}: FMSChangeReviewModalProps) {
  const { hideReview, minimizeReview } = useFMSSync();
  const { addToast } = useToast();
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(
    new Set(changes.filter((c) => c.is_valid !== false).map((c) => c.id)),
  );
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ChangeFilter>('all');

  const toggleChange = (changeId: string) => {
    const change = changes.find((c) => c.id === changeId);
    if (change?.is_valid === false) return;

    const next = new Set(selectedChanges);
    if (next.has(changeId)) next.delete(changeId);
    else next.add(changeId);
    setSelectedChanges(next);
  };

  const toggleExpand = (changeId: string) => {
    const next = new Set(expandedChanges);
    if (next.has(changeId)) next.delete(changeId);
    else next.add(changeId);
    setExpandedChanges(next);
  };

  const addedCount = changes.filter(
    (c) =>
      c.is_valid !== false &&
      (c.change_type === FMSChangeType.TENANT_ADDED || c.change_type === FMSChangeType.UNIT_ADDED),
  ).length;

  const updatedCount = changes.filter(
    (c) =>
      c.is_valid !== false &&
      (c.change_type === FMSChangeType.TENANT_UPDATED ||
        c.change_type === FMSChangeType.UNIT_UPDATED ||
        c.change_type === FMSChangeType.TENANT_UNIT_CHANGED ||
        c.change_type === FMSChangeType.UNIT_OVERLOCK_CHANGED),
  ).length;

  const removedCount = changes.filter(
    (c) => c.is_valid !== false && c.change_type === FMSChangeType.TENANT_REMOVED,
  ).length;

  const invalidCount = changes.filter((c) => c.is_valid === false).length;

  const filteredChanges = changes.filter((change) => {
    const valid = change.is_valid !== false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'added') {
      return valid && (change.change_type === FMSChangeType.TENANT_ADDED || change.change_type === FMSChangeType.UNIT_ADDED);
    }
    if (activeFilter === 'updated') {
      return (
        valid &&
        (change.change_type === FMSChangeType.TENANT_UPDATED ||
          change.change_type === FMSChangeType.UNIT_UPDATED ||
          change.change_type === FMSChangeType.TENANT_UNIT_CHANGED ||
          change.change_type === FMSChangeType.UNIT_OVERLOCK_CHANGED)
      );
    }
    if (activeFilter === 'removed') {
      return valid && change.change_type === FMSChangeType.TENANT_REMOVED;
    }
    if (activeFilter === 'invalid') return change.is_valid === false;
    return true;
  });

  const filteredSelectedCount = filteredChanges.filter((c) => selectedChanges.has(c.id)).length;

  const selectAll = () => {
    setSelectedChanges(new Set(filteredChanges.filter((c) => c.is_valid !== false).map((c) => c.id)));
  };

  const selectNone = () => {
    setSelectedChanges(new Set());
  };

  const titleSuffix = facilityName ? ` — ${facilityName}` : '';

  async function handleReview(accepted: boolean) {
    if (!syncResult) return;

    const changeIds = Array.from(selectedChanges);

    try {
      setApplying(true);
      await fmsService.reviewChanges(syncResult.syncLogId, changeIds, accepted);

      if (accepted) {
        const result = await fmsService.applyChanges(syncResult.syncLogId, changeIds);

        if (result.changesFailed > 0 || result.errors.length > 0) {
          addToast({
            type: 'error',
            title: 'Some Changes Failed',
            message:
              result.errors.length > 0
                ? result.errors[0]
                : `${result.changesFailed} change${result.changesFailed !== 1 ? 's' : ''} failed to apply`,
            duration: 8000,
          });
          return;
        }

        addToast({
          type: 'success',
          title: 'Changes Applied Successfully',
          message: generateChangesSummary(result, changeIds.length) || 'All selected changes have been applied',
          duration: 6000,
        });

        await onApply(changeIds);
        hideReview();
        onClose();
      } else {
        addToast({
          type: 'info',
          title: 'Changes Rejected',
          message: `${changeIds.length} change${changeIds.length !== 1 ? 's' : ''} rejected`,
        });
        hideReview();
        onClose();
      }
    } catch (error: unknown) {
      addToast({
        type: 'error',
        title: `Failed to ${accepted ? 'Apply' : 'Reject'} Changes`,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 8000,
      });
    } finally {
      setApplying(false);
    }
  }

  const tabItems: { key: ChangeFilter; label: string; count: number; activeClass: string }[] = [
    { key: 'all', label: 'All Changes', count: changes.length, activeClass: 'text-gray-900 dark:text-white' },
    { key: 'added', label: 'Added', count: addedCount, activeClass: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'updated', label: 'Updated', count: updatedCount, activeClass: 'text-[#147FD4] dark:text-sky-400' },
    { key: 'removed', label: 'Removed', count: removedCount, activeClass: 'text-rose-600 dark:text-rose-400' },
    { key: 'invalid', label: 'Invalid', count: invalidCount, activeClass: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => {
          hideReview();
          onClose();
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-3 scale-[0.98]"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 translate-y-2 scale-[0.98]"
            >
              <Dialog.Panel className="flex w-full max-w-4xl max-h-[min(88vh,780px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
                {/* Header */}
                <div className="relative shrink-0 border-b border-gray-200/80 px-5 pb-0 pt-5 dark:border-gray-700/80 sm:px-6">
                  <div className="flex items-start gap-3 pr-16">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#147FD4]/10 text-[#147FD4] dark:bg-sky-500/15 dark:text-sky-400">
                      <ClipboardDocumentCheckIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white sm:text-xl">
                        Review FMS Changes
                        <span className="font-normal text-gray-500 dark:text-gray-400">
                          {' '}
                          ({changes.length} detected){titleSuffix}
                        </span>
                      </Dialog.Title>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Select the changes to accept. Gateway access updates apply automatically.
                      </p>
                    </div>
                  </div>

                  <div className="absolute right-4 top-4 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={minimizeReview}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      title="Minimize to status bar"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        hideReview();
                        onClose();
                      }}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-rose-500 dark:hover:bg-gray-800 dark:hover:text-rose-400"
                      title="Cancel and close"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 -mb-px overflow-x-auto scrollbar-hide">
                    <Tab.Group
                      onChange={(index) => {
                        const filters: ChangeFilter[] = ['all', 'added', 'updated', 'removed', 'invalid'];
                        setActiveFilter(filters[index] ?? 'all');
                      }}
                    >
                      <Tab.List className="flex min-w-max gap-1">
                        {tabItems.map((tab) => (
                          <Tab
                            key={tab.key}
                            className={({ selected }) =>
                              `relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors outline-none ${
                                selected
                                  ? tab.activeClass
                                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                              }`
                            }
                          >
                            {({ selected }) => (
                              <>
                                {tab.label} ({tab.count})
                                {selected && (
                                  <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[#147FD4] dark:bg-sky-400" />
                                )}
                              </>
                            )}
                          </Tab>
                        ))}
                      </Tab.List>
                    </Tab.Group>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="status-area-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                  {filteredChanges.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <MagnifyingGlassIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No changes in this category</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try another tab to see more results.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredChanges.map((change) => {
                        const style = getChangeStyle(change.change_type);
                        const Icon = style.icon;
                        const isExpanded = expandedChanges.has(change.id);
                        const isSelected = selectedChanges.has(change.id);
                        const isInvalid = change.is_valid === false;

                        return (
                          <div
                            key={change.id}
                            data-testid="fms-change-card"
                            onClick={() => !isInvalid && toggleChange(change.id)}
                            className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
                              isInvalid
                                ? 'cursor-not-allowed border-amber-200/80 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/20'
                                : 'cursor-pointer'
                            } ${
                              isSelected && !isInvalid
                                ? 'border-[#147FD4]/40 bg-[#147FD4]/[0.04] shadow-sm ring-1 ring-[#147FD4]/25 dark:border-sky-500/40 dark:bg-sky-500/5 dark:ring-sky-500/20'
                                : !isInvalid
                                  ? 'border-gray-200/90 bg-gray-50/50 hover:border-gray-300 hover:bg-white dark:border-gray-700/80 dark:bg-gray-800/30 dark:hover:border-gray-600 dark:hover:bg-gray-800/60'
                                  : ''
                            } border-l-[3px] ${isInvalid ? 'border-l-amber-500' : style.accent}`}
                          >
                            <div className="flex gap-3 p-3.5 sm:p-4">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${style.iconBg} ${style.iconText}`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>

                              <div className="min-w-0 flex-1 pr-8">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{style.label}</h4>
                                  <span className="hidden rounded-md bg-gray-200/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-700/70 dark:text-gray-400 sm:inline">
                                    {change.change_type.replace(/_/g, ' ')}
                                  </span>
                                </div>

                                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                                  {change.impact_summary}
                                </p>

                                {isInvalid && (
                                  <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/30">
                                    <div className="flex gap-2">
                                      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                      <div>
                                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                                          Cannot apply this change
                                        </p>
                                        {change.validation_errors && change.validation_errors.length > 0 ? (
                                          <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                                            {change.validation_errors.map((err, idx) => (
                                              <li key={idx}>{err}</li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="mt-1 text-xs italic text-amber-700 dark:text-amber-400">
                                            Validation details not available.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {change.required_actions && change.required_actions.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {change.required_actions.map((action, idx) => (
                                      <span
                                        key={idx}
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${style.tagBg} ${style.tagText}`}
                                      >
                                        {formatActionLabel(action)}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {isExpanded && (
                                  <div className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-gray-200/80 dark:bg-gray-900/50 dark:ring-gray-700/80">
                                    <div
                                      className={`grid gap-4 ${change.before_data ? 'sm:grid-cols-2' : 'grid-cols-1'}`}
                                    >
                                      {Boolean(change.before_data) && (
                                        <div>
                                          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                            Current (Before)
                                          </p>
                                          <ChangeDataFields data={change.before_data} />
                                        </div>
                                      )}
                                      <div>
                                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                          {change.before_data ? 'New (After)' : 'Details'}
                                        </p>
                                        <ChangeDataFields data={change.after_data ?? change.before_data} />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="absolute right-3 top-3.5 flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  data-testid="fms-change-expand"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(change.id);
                                  }}
                                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-200/80 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                  aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                                >
                                  {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4" />
                                  ) : (
                                    <ChevronRightIcon className="h-4 w-4" />
                                  )}
                                </button>

                                {!isInvalid && (
                                  <div
                                    className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                                      isSelected
                                        ? 'border-[#147FD4] bg-[#147FD4] text-white dark:border-sky-500 dark:bg-sky-500'
                                        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-[#147FD4]/60'
                                    }`}
                                  >
                                    {isSelected && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-gray-200/80 bg-gray-50/90 px-5 py-4 dark:border-gray-700/80 dark:bg-gray-950/50 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-[#147FD4] dark:text-sky-400">{filteredSelectedCount}</span>
                        {' of '}
                        {filteredChanges.length} selected
                      </span>
                      <span className="hidden text-gray-300 dark:text-gray-600 sm:inline">·</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-sm font-medium text-[#147FD4] transition-colors hover:text-[#106bb3] dark:text-sky-400 dark:hover:text-sky-300"
                        >
                          Select All
                        </button>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <button
                          type="button"
                          onClick={selectNone}
                          className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Select None
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReview(true)}
                      disabled={applying || filteredSelectedCount === 0}
                      className="btn-primary w-full gap-2 rounded-lg sm:w-auto"
                    >
                      {applying ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <CheckIcon className="h-4 w-4" />
                          Accept & Apply ({filteredSelectedCount})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
