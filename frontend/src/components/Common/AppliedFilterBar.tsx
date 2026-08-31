import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  appliedFilterBarClass,
  appliedFilterChipClass,
  appliedFilterChipRemoveClass,
  appliedFilterClearAllClass,
} from '@/components/Common/list-filters.styles';

export type AppliedFilter = {
  id: string;
  /** e.g. "Unit: 102" */
  label: string;
  onRemove: () => void;
};

interface AppliedFilterBarProps {
  filters: AppliedFilter[];
  onClearAll: () => void;
  className?: string;
}

/** Standard bar of applied filters — dismissible chips plus Clear all. */
export function AppliedFilterBar({ filters, onClearAll, className = '' }: AppliedFilterBarProps) {
  if (filters.length === 0) return null;

  return (
    <div
      className={`${appliedFilterBarClass} ${className}`.trim()}
      role="group"
      aria-label="Applied filters"
    >
      {filters.map((filter) => (
        <span key={filter.id} className={appliedFilterChipClass} title={filter.label}>
          <span className="min-w-0 max-w-[14rem] truncate">{filter.label}</span>
          <button
            type="button"
            aria-label={`Remove ${filter.label}`}
            onClick={filter.onRemove}
            className={appliedFilterChipRemoveClass}
          >
            <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className={appliedFilterClearAllClass}>
        Clear all
      </button>
    </div>
  );
}
