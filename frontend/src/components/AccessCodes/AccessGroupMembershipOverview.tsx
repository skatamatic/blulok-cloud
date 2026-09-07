import { Link } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { AccessGroupPillLinks } from '@/components/AccessCodes/AccessGroupPillLinks';
import { buildFacilityAccessGroupsPath } from '@/components/AccessCodes/access-groups.utils';
import { OverviewSectionHeader } from '@/components/Common/DetailsPageLayout';
import { detailsBtnLinkSm } from '@/components/Common/details-page.styles';
import type { UnitAccessGroupRef } from '@/utils/device-group-membership.utils';
import { withReturnPath } from '@/hooks/useBackNavigation';
import type { Location } from 'react-router-dom';

interface AccessGroupMembershipOverviewProps {
  groups: UnitAccessGroupRef[];
  facilityId: string;
  location: Location;
  title?: string;
  description?: string;
  hasBoundDevice?: boolean;
  canManageGroups?: boolean;
  noDeviceMessage?: string;
  noGroupsMessage?: string;
}

export function AccessGroupMembershipOverview({
  groups,
  facilityId,
  location,
  title = 'Access',
  description = 'Group membership for this lock',
  hasBoundDevice = true,
  canManageGroups = false,
  noDeviceMessage = 'Assign a BluLok device to determine access group membership.',
  noGroupsMessage = 'This lock is not assigned to any access group yet.',
}: AccessGroupMembershipOverviewProps) {
  const manageLink =
    canManageGroups && hasBoundDevice ? (
      <Link
        to={buildFacilityAccessGroupsPath(facilityId)}
        state={withReturnPath(location)}
        className={detailsBtnLinkSm}
      >
        Manage groups
        <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
      </Link>
    ) : undefined;

  return (
    <>
      <OverviewSectionHeader title={title} description={description} action={manageLink} />
      {!hasBoundDevice ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{noDeviceMessage}</p>
      ) : groups.length > 0 ? (
        <AccessGroupPillLinks
          groups={groups}
          facilityId={facilityId}
          location={location}
          className="mt-3"
        />
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{noGroupsMessage}</p>
      )}
    </>
  );
}
