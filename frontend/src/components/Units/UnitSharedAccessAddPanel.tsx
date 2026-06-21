import { useState } from 'react';
import { UserFilter } from '@/components/Common/UserFilter';
import { overviewAsideClass } from '@/components/Common/DetailsPageLayout';
import { SegmentedTabs } from '@/components/Common/SegmentedTabs';
import { detailsBtnPrimarySm, detailsBtnSecondarySm } from '@/components/Common/details-page.styles';
import { ShareKeyInviteForm } from '@/components/Units/ShareKeyInviteForm';

type SharedAccessAddMode = 'existing' | 'invite';

interface UnitSharedAccessAddPanelProps {
  unitId: string;
  facilityId: string;
  currentUserId?: string;
  assigningTenant: boolean;
  selectedSharedTenant: string;
  onSelectedSharedTenantChange: (tenantId: string) => void;
  onAssignExisting: () => void | Promise<void>;
  onCancel: () => void;
  onInviteSuccess?: () => void;
}

const modeTabs = [
  { key: 'existing', label: 'Existing user' },
  { key: 'invite', label: 'Invite by phone' },
] as const;

export function UnitSharedAccessAddPanel({
  unitId,
  facilityId,
  currentUserId,
  assigningTenant,
  selectedSharedTenant,
  onSelectedSharedTenantChange,
  onAssignExisting,
  onCancel,
  onInviteSuccess,
}: UnitSharedAccessAddPanelProps) {
  const [mode, setMode] = useState<SharedAccessAddMode>('existing');

  return (
    <div className={`mb-3 ${overviewAsideClass}`}>
      <SegmentedTabs
        tabs={[...modeTabs]}
        activeTab={mode}
        onChange={(key) => setMode(key as SharedAccessAddMode)}
        size="sm"
        ariaLabel="Shared access method"
        className="mb-3"
      />

      {mode === 'existing' ? (
        <>
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
            Search for a tenant who already has an account.
          </p>
          <UserFilter
            value={selectedSharedTenant}
            onChange={onSelectedSharedTenantChange}
            placeholder="Search for tenant..."
            className="w-full"
            facilityId={facilityId}
            roleFilter="tenant"
            excludeUserIds={[currentUserId || '']}
          />
          {selectedSharedTenant && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className={detailsBtnSecondarySm}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onAssignExisting()}
                disabled={assigningTenant}
                className={detailsBtnPrimarySm}
              >
                {assigningTenant ? 'Adding…' : 'Add access'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
            Send an invite to someone who does not have an account yet.
          </p>
          <ShareKeyInviteForm unitId={unitId} onSuccess={onInviteSuccess} onCancel={onCancel} />
        </>
      )}
    </div>
  );
}
