import { Link } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { buildFacilityAccessGroupsPath } from '@/components/AccessCodes/access-groups.utils';
import { defaultGroupBadgeClass } from '@/components/Common/details-page.styles';
import {
  formatAccessGroupLabel,
  sortAccessGroupRefs,
  type UnitAccessGroupRef,
} from '@/utils/device-group-membership.utils';
import { withReturnPath } from '@/hooks/useBackNavigation';
import type { Location } from 'react-router-dom';

interface AccessGroupPillLinksProps {
  groups: UnitAccessGroupRef[];
  facilityId: string;
  location: Location;
  className?: string;
}

export function accessGroupPillClassName(isDefault?: boolean): string {
  return isDefault
    ? `${defaultGroupBadgeClass} rounded-full hover:bg-blue-200/80 dark:hover:bg-blue-900/50`
    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-800';
}

export function AccessGroupPillLinks({
  groups,
  facilityId,
  location,
  className = '',
}: AccessGroupPillLinksProps) {
  const sortedGroups = sortAccessGroupRefs(groups);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {sortedGroups.map((group) => (
        <Link
          key={group.id}
          to={buildFacilityAccessGroupsPath(facilityId, group.id)}
          state={withReturnPath(location)}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${accessGroupPillClassName(group.is_default)}`}
        >
          {formatAccessGroupLabel(group)}
          <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
