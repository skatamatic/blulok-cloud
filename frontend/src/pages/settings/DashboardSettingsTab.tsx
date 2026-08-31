import { useAuth } from '@/contexts/AuthContext';
import { DashboardManagementPanel } from '@/components/Settings/DashboardManagementPanel';
import { useSavedDashboards } from '@/hooks/useSavedDashboards';
import { useDashboardAssignments } from '@/hooks/useDashboardAssignments';
import {
  canEditDashboardLayout,
  canManageDashboardLibrary,
} from '@/utils/settings-rbac.utils';
import { PersonalDashboardSettingsSection } from './sections/PersonalDashboardSettingsSection';

export default function DashboardSettingsTab() {
  const { authState } = useAuth();
  const role = authState.user?.role;
  const showPersonalLayout = canEditDashboardLayout(role);
  const showLibrary = canManageDashboardLibrary(role);

  const savedDashboards = useSavedDashboards({
    enabled: showLibrary,
    onLoaded: () => undefined,
  });
  const { assignments } = useDashboardAssignments({ enabled: showLibrary });

  if (!showPersonalLayout && !showLibrary) {
    return null;
  }

  return (
    <div className="space-y-8">
      {showPersonalLayout && <PersonalDashboardSettingsSection />}
      {showLibrary && (
        <DashboardManagementPanel
          templates={savedDashboards.dashboards}
          templatesLoading={savedDashboards.isLoading}
          templatesError={savedDashboards.error}
          templatesActionId={savedDashboards.actionId}
          assignmentCount={assignments.length}
          onRefreshTemplates={() => void savedDashboards.refresh()}
          onRenameTemplate={savedDashboards.renameDashboard}
          onDeleteTemplate={savedDashboards.deleteDashboard}
        />
      )}
    </div>
  );
}
