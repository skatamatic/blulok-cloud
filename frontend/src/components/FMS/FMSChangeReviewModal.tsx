/**
 * FMS Change Review Modal
 * 
 * Displays detected changes with before/after comparison
 * Allows user to select and apply changes
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
} from '@heroicons/react/24/outline';
import { FMSChange, FMSChangeType, FMSSyncResult, FMSChangeApplicationResult } from '@/types/fms.types';
import { fmsService } from '@/services/fms.service';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { useToast } from '@/contexts/ToastContext';

interface FMSChangeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  changes: FMSChange[];
  onApply: (changeIds: string[]) => Promise<void>;
  syncResult: FMSSyncResult | null;
  facilityName?: string;
}

type ChangeFilter = 'all' | 'added' | 'updated' | 'removed' | 'invalid';

/**
 * Generate a human-readable summary message from FMS change application result
 */
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
    new Set(changes.filter(c => c.is_valid !== false && c.is_valid !== null && c.is_valid !== undefined).map(c => c.id))
  );
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ChangeFilter>('all');

  const toggleChange = (changeId: string) => {
    // Don't allow selecting invalid changes
    const change = changes.find(c => c.id === changeId);
    if (change && (change.is_valid === false || change.is_valid === null || change.is_valid === undefined)) {
      return;
    }

    const newSelected = new Set(selectedChanges);
    if (newSelected.has(changeId)) {
      newSelected.delete(changeId);
    } else {
      newSelected.add(changeId);
    }
    setSelectedChanges(newSelected);
  };

  const toggleExpand = (changeId: string) => {
    const newExpanded = new Set(expandedChanges);
    if (newExpanded.has(changeId)) {
      newExpanded.delete(changeId);
    } else {
      newExpanded.add(changeId);
    }
    setExpandedChanges(newExpanded);
  };

  const selectAll = () => {
    // Only select valid changes (not invalid ones)
    const validFilteredChanges = filteredChanges.filter(c => c.is_valid !== false);
    setSelectedChanges(new Set(validFilteredChanges.map(c => c.id)));
  };

  const selectNone = () => {
    setSelectedChanges(new Set());
  };

  // Calculate counts
  // Treat changes without is_valid as valid (backward compatibility)
  const isValidChange = (c: FMSChange) => c.is_valid !== false;

  const addedCount = changes.filter(c =>
    isValidChange(c) && (
      c.change_type === FMSChangeType.TENANT_ADDED ||
      c.change_type === FMSChangeType.UNIT_ADDED
    )
  ).length;

  const updatedCount = changes.filter(c =>
    isValidChange(c) && (
      c.change_type === FMSChangeType.TENANT_UPDATED ||
      c.change_type === FMSChangeType.UNIT_UPDATED ||
      c.change_type === FMSChangeType.TENANT_UNIT_CHANGED
    )
  ).length;

  const removedCount = changes.filter(c =>
    isValidChange(c) && c.change_type === FMSChangeType.TENANT_REMOVED
  ).length;

  const invalidCount = changes.filter(c => c.is_valid === false).length;

  // Filter changes based on active tab
  const filteredChanges = changes.filter(change => {
    // For specific type tabs (added, updated, removed), only show valid changes (default to valid when is_valid is undefined)
    const isValidChange = change.is_valid !== false;

    if (activeFilter === 'all') return true;

    if (activeFilter === 'added') {
      return isValidChange && (
        change.change_type === FMSChangeType.TENANT_ADDED ||
        change.change_type === FMSChangeType.UNIT_ADDED
      );
    }

    if (activeFilter === 'updated') {
      return isValidChange && (
        change.change_type === FMSChangeType.TENANT_UPDATED ||
        change.change_type === FMSChangeType.UNIT_UPDATED ||
        change.change_type === FMSChangeType.TENANT_UNIT_CHANGED
      );
    }

    if (activeFilter === 'removed') {
      return isValidChange && change.change_type === FMSChangeType.TENANT_REMOVED;
    }

    if (activeFilter === 'invalid') {
      return change.is_valid === false;
    }

    return true;
  });

  // Count of selected changes that are visible in the current filter
  const filteredSelectedCount = filteredChanges.filter(c => selectedChanges.has(c.id)).length;



  const getChangeIcon = (type: FMSChangeType) => {
    switch (type) {
      case FMSChangeType.TENANT_ADDED:
        return UserPlusIcon;
      case FMSChangeType.TENANT_REMOVED:
        return UserMinusIcon;
      case FMSChangeType.TENANT_UPDATED:
        return PencilSquareIcon;
      case FMSChangeType.TENANT_UNIT_CHANGED:
        return ArrowsRightLeftIcon;
      case FMSChangeType.UNIT_ADDED:
      case FMSChangeType.UNIT_UPDATED:
        return HomeIcon;
      default:
        return PencilSquareIcon;
    }
  };

  const getChangeColor = (type: FMSChangeType) => {
    switch (type) {
      case FMSChangeType.TENANT_ADDED:
      case FMSChangeType.UNIT_ADDED:
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case FMSChangeType.TENANT_REMOVED:
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case FMSChangeType.TENANT_UPDATED:
      case FMSChangeType.UNIT_UPDATED:
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case FMSChangeType.TENANT_UNIT_CHANGED:
        return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const renderChangeData = (data: any) => {
    if (!data) return null;

    const formatLabel = (key: string): string => {
      // Convert camelCase or snake_case to Title Case
      return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
    };

    const formatValue = (value: any): string => {
      if (value === null || value === undefined) return 'N/A';
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (Array.isArray(value)) {
        if (value.length === 0) return 'None';
        return value.join(', ');
      }
      if (typeof value === 'object') {
        // Handle nested objects (like customFields)
        return Object.entries(value)
          .map(([k, v]) => `${formatLabel(k)}: ${formatValue(v)}`)
          .join(', ');
      }
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Format dates
        try {
          return new Date(value).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
        } catch {
          return value;
        }
      }
      return String(value);
    };

    const renderField = (key: string, value: any) => {
      // Skip internal/technical fields
      if (key === 'id' || key === 'externalId' || key === 'tenantId') return null;

      const formattedValue = formatValue(value);
      const isHighlighted = key === 'email' || key === 'unitNumber' || key === 'firstName' || key === 'lastName';

      return (
        <div
          key={key}
          className={`flex justify-between items-start py-2 px-3 rounded-lg ${
            isHighlighted
              ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
              : 'bg-white dark:bg-gray-800'
          }`}
        >
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mr-3">
            {formatLabel(key)}:
          </span>
          <span className={`text-xs font-semibold text-right ${
            isHighlighted
              ? 'text-primary-700 dark:text-primary-300'
              : 'text-gray-900 dark:text-white'
          }`}>
            {formattedValue}
          </span>
        </div>
      );
    };

    return (
      <>
        {Object.entries(data).map(([key, value]) => renderField(key, value))}
      </>
    );
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {
        hideReview();
        onClose();
      }}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-2xl transition-all relative">
                {/* Window Controls - Top Right */}
                <div className="absolute top-4 right-4 flex items-center space-x-1 z-10">
                  <button
                    onClick={minimizeReview}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Minimize to status bar"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      hideReview();
                      onClose();
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Cancel and close"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Header */}
                <div className="border-b-2 border-gray-200 dark:border-gray-700 px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
                  <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white text-center">
                    Review FMS Changes ({changes.length} detected){facilityName ? ` - ${facilityName}` : ''}
                  </Dialog.Title>

                  {/* Tab Navigation */}
                  <div className="mt-4">
                    <Tab.Group onChange={(index) => {
                      const filters: ChangeFilter[] = ['all', 'added', 'updated', 'removed', 'invalid'];
                      setActiveFilter(filters[index] || 'all');
                    }}>
                      <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 dark:bg-gray-900/50 p-1">
                        <Tab
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${selected
                              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                            }`
                          }
                        >
                          All Changes ({changes.length})
                        </Tab>
                        <Tab
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${selected
                              ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 shadow'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-green-600 dark:hover:text-green-400'
                            }`
                          }
                        >
                          <span className="flex items-center justify-center">
                            Added ({addedCount})
                          </span>
                        </Tab>
                        <Tab
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${selected
                              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-blue-600 dark:hover:text-blue-400'
                            }`
                          }
                        >
                          <span className="flex items-center justify-center">
                            Updated ({updatedCount})
                          </span>
                        </Tab>
                        <Tab
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${selected
                              ? 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 shadow'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-red-600 dark:hover:text-red-400'
                            }`
                          }
                        >
                          <span className="flex items-center justify-center">
                            Removed ({removedCount})
                          </span>
                        </Tab>
                        <Tab
                          className={({ selected }) =>
                            `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                            ${selected
                              ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 shadow'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 hover:text-orange-600 dark:hover:text-orange-400'
                            }`
                          }
                        >
                          <span className="flex items-center justify-center">
                            Invalid ({invalidCount})
                          </span>
                        </Tab>
                      </Tab.List>
                    </Tab.Group>
                  </div>
                </div>

                {/* Changes List */}
                <div className="px-6 py-4 max-h-[500px] overflow-y-auto">
                  {filteredChanges.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-2">🔍</div>
                      <div className="font-medium">No changes in this category</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredChanges.map((change) => {
                        const Icon = getChangeIcon(change.change_type);
                        const isExpanded = expandedChanges.has(change.id);
                        const isSelected = selectedChanges.has(change.id);

                        const isInvalid = change.is_valid === false || change.is_valid === null || change.is_valid === undefined;


                        return (
                          <div
                            key={change.id}
                            onClick={() => !isInvalid && toggleChange(change.id)}
                            className={`group relative border-2 rounded-xl transition-all ${
                              isInvalid
                                ? 'cursor-not-allowed border-orange-300 dark:border-orange-600 bg-orange-50/80 dark:bg-orange-950/40 shadow-sm'
                                : 'cursor-pointer'
                            } ${
                              isSelected && !isInvalid
                                ? 'border-primary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md'
                                : !isInvalid
                                ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                                : ''
                            }`}
                          >
                            {/* Selection Indicator */}
                            {!isInvalid && (
                              <div className={`absolute top-4 right-4 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all ${
                                isSelected
                                  ? 'bg-primary-600 border-primary-600 scale-110'
                                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-primary-400'
                              }`}>
                                {isSelected && (
                                  <CheckIcon className="h-4 w-4 text-white" />
                                )}
                              </div>
                            )}

                            {/* Invalid indicator */}
                            {isInvalid && (
                              <div className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 border-2 border-orange-300 shadow-lg">
                                <ExclamationTriangleIcon className="h-4 w-4 text-white" />
                              </div>
                            )}

                            <div className="p-4 pr-14">
                              <div className="flex items-start">
                                {/* Icon */}
                                <div className={`p-2.5 rounded-xl ${getChangeColor(change.change_type)} transition-transform group-hover:scale-105`}>
                                  <Icon className="h-6 w-6" />
                                </div>

                                {/* Content */}
                                <div className="ml-4 flex-1">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                      {change.change_type.replace(/_/g, ' ').toUpperCase()}
                                    </h4>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpand(change.id);
                                      }}
                                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      {isExpanded ? (
                                        <ChevronDownIcon className="h-5 w-5" />
                                      ) : (
                                        <ChevronRightIcon className="h-5 w-5" />
                                      )}
                                    </button>
                                  </div>

                                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                    {change.impact_summary}
                                  </p>

                                  {/* Validation Errors */}
                                  {isInvalid && (
                                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                                      <div className="flex items-start">
                                        <div className="flex-shrink-0">
                                          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-400 mt-0.5" />
                                        </div>
                                        <div className="ml-3 flex-1">
                                          <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                                            Cannot apply this change
                                          </div>
                                          {change.validation_errors && change.validation_errors.length > 0 ? (
                                            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                                              {change.validation_errors.map((error, idx) => (
                                                <li key={idx} className="flex items-start">
                                                  <span className="text-red-500 mr-2 mt-0.5">•</span>
                                                  <span>{error}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p className="text-sm text-red-600 dark:text-red-400 italic">
                                              Validation details not available. Please contact support.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Required Actions */}
                                  {change.required_actions && change.required_actions.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {change.required_actions.map((action, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 rounded-md"
                                        >
                                          {action.replace(/_/g, ' ')}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Expanded Details */}
                                  {isExpanded && (
                                    <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                      <div className={`grid ${change.before_data ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
                                        {change.before_data && (
                                          <div>
                                            <div className="flex items-center mb-3">
                                              <div className="h-8 w-1 bg-red-500 rounded-full mr-2"></div>
                                              <div className="font-semibold text-gray-900 dark:text-white text-sm">
                                                Current (Before)
                                              </div>
                                            </div>
                                            <div className="space-y-2">
                                              {renderChangeData(change.before_data)}
                                            </div>
                                          </div>
                                        )}
                                        <div>
                                          <div className="flex items-center mb-3">
                                            <div className="h-8 w-1 bg-green-500 rounded-full mr-2"></div>
                                            <div className="font-semibold text-gray-900 dark:text-white text-sm">
                                              {change.before_data ? 'New (After)' : 'Details'}
                                            </div>
                                          </div>
                                          <div className="space-y-2">
                                            {renderChangeData(change.after_data)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t-2 border-gray-200 dark:border-gray-700 px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
                  <div className="flex items-center justify-between">
                    {/* Left: x of Y changes selected */}
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span className="text-primary-600 dark:text-primary-400 font-semibold">{filteredSelectedCount}</span> of {filteredChanges.length} changes selected
                    </div>

                    {/* Center: Select All/None buttons */}
                    <div className="flex items-center space-x-3 absolute left-1/2 transform -translate-x-1/2">
                      <button
                        onClick={selectAll}
                        className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <button
                        onClick={selectNone}
                        className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                      >
                        Select None
                      </button>
                    </div>

                    {/* Right: Accept & Apply button */}
                    <button
                      onClick={() => handleReview(true)}
                      disabled={applying || filteredSelectedCount === 0}
                      className="px-5 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                    >
                      {applying ? (
                        <>
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Applying...
                        </>
                      ) : (
                        <>
                          <CheckIcon className="h-5 w-5 inline mr-2" />
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

  async function handleReview(accepted: boolean) {
    if (!syncResult) return;

    const changeIds = Array.from(selectedChanges);

    try {
      setApplying(true);
      
      // Review changes first (marks them as accepted/rejected)
      await fmsService.reviewChanges(
        syncResult.syncLogId,
        changeIds,
        accepted
      );

      if (accepted) {
        // Apply the accepted changes
        console.log('[FMS] Applying changes:', { syncLogId: syncResult.syncLogId, changeIds });
        const result = await fmsService.applyChanges(syncResult.syncLogId, changeIds);
        console.log('[FMS] Apply changes result:', result);
        
        // Check if there were any errors
        if (result.changesFailed > 0 || result.errors.length > 0) {
          console.log('[FMS] Some changes failed:', result);
          // Show error toast with details
          addToast({
            type: 'error',
            title: 'Some Changes Failed',
            message: result.errors.length > 0 
              ? result.errors[0] 
              : `${result.changesFailed} change${result.changesFailed !== 1 ? 's' : ''} failed to apply`,
            duration: 8000,
          });
          
          // Keep modal open so user can see what failed
          return;
        }
        
        // Success! Show summary toast
        console.log('[FMS] All changes applied successfully');
        const summary = generateChangesSummary(result, changeIds.length);
        console.log('[FMS] Toast summary:', summary);
        addToast({
          type: 'success',
          title: 'Changes Applied Successfully',
          message: summary || 'All selected changes have been applied',
          duration: 6000,
        });
        
        // Call onApply callback (if provided for additional logic)
        await onApply(changeIds);
        
        // Close the review modal
        console.log('[FMS] Closing review modal');
        hideReview();
        onClose();
      } else {
        // Changes rejected
        addToast({
          type: 'info',
          title: 'Changes Rejected',
          message: `${changeIds.length} change${changeIds.length !== 1 ? 's' : ''} rejected`,
        });
        
        hideReview();
        onClose();
      }
    } catch (error: any) {
      // Show error toast
      addToast({
        type: 'error',
        title: `Failed to ${accepted ? 'Apply' : 'Reject'} Changes`,
        message: error.message || 'An unexpected error occurred',
        duration: 8000,
      });
      
      // Keep modal open on error so user can retry or see the issue
    } finally {
      setApplying(false);
    }
  }
}
