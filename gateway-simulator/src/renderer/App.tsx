import { useMemo, useState, useCallback } from 'react';
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import type { UserInstanceState } from '@protocol/user-simulator-state';
import { SimulatorSidebar } from './components/SimulatorSidebar';
import { RemoveGatewayDialog } from './components/RemoveGatewayDialog';
import { SetupWizard } from './components/SetupWizard';
import { GatewayPanel } from './components/GatewayPanel';
import { UserPanel, ImportUserForm } from './components/UserPanel';
import { WebhookSimulatorPanel } from './components/WebhookSimulatorPanel';
import { PreferencesModal } from './components/PreferencesModal';
import { AppStatusBar } from './components/AppStatusBar';
import { AppStartupSplash } from './components/AppStartupSplash';
import { useCatalogState } from './hooks/useCatalogState';
import { useHistoryState } from './hooks/useHistoryState';
import { useGatewayConnectionToasts } from './hooks/useGatewayConnectionToasts';
import { useToast } from './contexts/ToastContext';
import { errorMessage } from './utils/error-message.utils';

function connectionSummary(instances: GatewayInstanceState[]) {
  const connected = instances.filter((g) => g.connectionStatus === 'connected').length;
  const connecting = instances.some((g) => g.connectionStatus === 'connecting');
  const allConnected = instances.length > 0 && connected === instances.length;
  return { connecting, allConnected };
}

function summarizeBulkConnect(
  before: Map<string, GatewayInstanceState['connectionStatus']>,
  after: GatewayInstanceState[],
): { attempted: number; connected: number; failed: number } {
  let attempted = 0;
  let connected = 0;
  let failed = 0;

  for (const gateway of after) {
    const prior = before.get(gateway.id);
    if (prior === 'connected' || prior === 'connecting') continue;
    attempted += 1;
    if (gateway.connectionStatus === 'connected') connected += 1;
    if (gateway.connectionStatus === 'error') failed += 1;
  }

  return { attempted, connected, failed };
}

export function App() {
  const toast = useToast();
  const {
    instances,
    users,
    activeGatewayId,
    activeUserId,
    activeGateway,
    activeUser,
    sidebarCatalog,
    webhookSimulatorPrefs,
    setInstances,
    setUsers,
    setActiveGatewayId,
    setActiveUserId,
    setSidebarCatalog,
    applyHydrate,
    hydrated,
  } = useCatalogState();
  const [showSetup, setShowSetup] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [gatewayToRemove, setGatewayToRemove] = useState<GatewayInstanceState | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const { connecting, allConnected } = useMemo(
    () => connectionSummary(instances),
    [instances],
  );

  useGatewayConnectionToasts(instances, {
    hydrated,
    notify: !bulkBusy,
  });

  const refresh = () => {
    void window.simulator.listInstances().then(setInstances);
    void window.simulator.listUsers().then(setUsers);
  };

  const applyHistory = useCallback(
    (result: Parameters<typeof applyHydrate>[0]) => {
      applyHydrate(result);
    },
    [applyHydrate],
  );

  const { history, undo, redo } = useHistoryState(applyHistory, toast);

  const handleBulkConnection = async () => {
    if (!instances.length || bulkBusy || connecting) return;

    const beforeStatuses = new Map(
      instances.map((gateway) => [gateway.id, gateway.connectionStatus] as const),
    );

    setBulkBusy(true);
    try {
      const next = allConnected
        ? await window.simulator.disconnectAll()
        : await window.simulator.connectAll();
      setInstances(next);

      if (!allConnected) {
        const { attempted, connected, failed } = summarizeBulkConnect(beforeStatuses, next);
        if (attempted > 1) {
          if (failed > 0) {
            toast.error(
              'Some gateways failed to connect',
              `${failed} of ${attempted} could not connect.`,
            );
          } else if (connected > 0) {
            toast.success(`Connected ${connected} gateways`);
          }
        }
      }
    } catch (err) {
      toast.error('Bulk connection failed', errorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleAddGateway = () => setShowSetup(true);

  const handleSetupComplete = async (data: {
    backendUrl: string;
    token?: string;
    facilityId: string;
    facilityName: string;
    gatewayId?: string;
    label: string;
    gatewayName: string;
    gatewaySerial: string;
    authMode?: 'legacy_jwt' | 'ztp_keypair';
  }) => {
    try {
      const state = await window.simulator.createGateway({
        label: data.label,
        backendUrl: data.backendUrl,
        facilityId: data.facilityId,
        facilityName: data.facilityName,
        gatewayId: data.gatewayId,
        gatewayName: data.gatewayName,
        gatewaySerial: data.gatewaySerial,
        token: data.token,
        authMode: data.authMode,
      });
      setInstances((prev) => [...prev.filter((g) => g.id !== state.id), state]);
      setActiveGatewayId(state.id);
      setShowSetup(false);
      toast.success(`${state.label} added`);
    } catch (err) {
      toast.error('Could not add gateway', errorMessage(err));
    }
  };

  const handleRemoveGateway = async (id: string) => {
    await window.simulator.removeGateway(id);
    setInstances((prev) => prev.filter((g) => g.id !== id));
    if (activeGatewayId === id) setActiveGatewayId(null);
  };

  const handleRemoveUser = async (id: string) => {
    await window.simulator.removeUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (activeUserId === id) setActiveUserId(null);
  };

  const requestRemoveGateway = (id: string) => {
    const gateway = instances.find((g) => g.id === id);
    if (gateway) setGatewayToRemove(gateway);
  };

  const confirmRemove = async () => {
    if (!gatewayToRemove || removeBusy) return;
    setRemoveBusy(true);
    try {
      await handleRemoveGateway(gatewayToRemove.id);
      setGatewayToRemove(null);
    } catch (err) {
      toast.error('Could not remove gateway', errorMessage(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const bulkBusyLabel = bulkBusy || connecting;
  const showEmpty = !showSetup && !showCreateUser && hydrated &&
    sidebarCatalog !== 'webhooks' &&
    ((sidebarCatalog === 'gateways' && !instances.length) || (sidebarCatalog === 'users' && !users.length));

  return (
    <>
      <AppStartupSplash visible={!hydrated} />
      {hydrated ? (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
        <div>
          <h1 className="text-lg font-bold text-primary-600">BluLok Gateway Simulator</h1>
          <p className="text-xs text-gray-500">Gateway + mobile user test harness</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-secondary !p-2"
              disabled={!history.canUndo}
              title={history.undoLabel ? `Undo ${history.undoLabel}` : 'Undo'}
              onClick={() => void undo()}
            >
              <ArrowUturnLeftIcon className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              className="btn-secondary !p-2"
              disabled={!history.canRedo}
              title={history.redoLabel ? `Redo ${history.redoLabel}` : 'Redo'}
              onClick={() => void redo()}
            >
              <ArrowUturnRightIcon className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {instances.length > 0 && sidebarCatalog === 'gateways' && (
            <button
              type="button"
              className={`app-header-bulk-btn ${allConnected ? 'app-header-bulk-btn-disconnect' : 'app-header-bulk-btn-connect'}`}
              disabled={bulkBusyLabel}
              title={
                bulkBusyLabel
                  ? 'Connecting all gateways…'
                  : allConnected
                    ? 'Disconnect all gateways'
                    : 'Connect all gateways'
              }
              onClick={() => void handleBulkConnection()}
            >
              {bulkBusyLabel ? (
                <ArrowPathIcon className="app-header-bulk-btn-spinner h-4 w-4 shrink-0" aria-hidden />
              ) : allConnected ? (
                <SignalSlashIcon className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <SignalIcon className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                {bulkBusyLabel ? 'Connecting…' : allConnected ? 'Disconnect all' : 'Connect all'}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SimulatorSidebar
          catalog={sidebarCatalog}
          onCatalogChange={setSidebarCatalog}
          instances={instances}
          users={users}
          activeGatewayId={activeGatewayId}
          activeUserId={activeUserId}
          onSelectGateway={setActiveGatewayId}
          onSelectUser={setActiveUserId}
          onAddGateway={handleAddGateway}
          onAddUser={() => setShowCreateUser(true)}
          onRemoveGateway={requestRemoveGateway}
          onRemoveUser={(id) => void handleRemoveUser(id)}
          onOpenPreferences={() => setShowPreferences(true)}
        />

        <RemoveGatewayDialog
          gateway={gatewayToRemove}
          isLoading={removeBusy}
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            if (!removeBusy) setGatewayToRemove(null);
          }}
        />

        <PreferencesModal
          isOpen={showPreferences}
          onClose={() => setShowPreferences(false)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
          {showSetup && (
            <div className="flex-1 overflow-y-auto p-6">
              <SetupWizard
                existingTabCount={instances.length}
                onComplete={(d) => void handleSetupComplete(d)}
                onCancel={() => setShowSetup(false)}
              />
            </div>
          )}

          {showCreateUser && (
            <div className="flex-1 overflow-y-auto p-6">
              <ImportUserForm
                importedCloudUserIds={users.map((u) => u.cloudUserId).filter(Boolean) as string[]}
                onImported={(user: UserInstanceState) => {
                  setUsers((prev) => [...prev.filter((u) => u.id !== user.id), user]);
                  setActiveUserId(user.id);
                  setShowCreateUser(false);
                }}
                onCancel={() => setShowCreateUser(false)}
              />
            </div>
          )}

          {showEmpty && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                {sidebarCatalog === 'gateways' ? 'No simulated gateways yet.' : 'No simulated users yet.'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use {sidebarCatalog === 'gateways' ? 'Add gateway' : 'Import user'} in the sidebar.
              </p>
            </div>
          )}

          {!showSetup && !showCreateUser && sidebarCatalog === 'gateways' && activeGateway && (
            <div className="min-h-0 flex-1">
              <GatewayPanel gateway={activeGateway} users={users} onRefresh={refresh} />
            </div>
          )}

          {!showSetup && !showCreateUser && sidebarCatalog === 'users' && activeUser && (
            <div className="min-h-0 flex-1">
              <UserPanel user={activeUser} gateways={instances} onRefresh={refresh} />
            </div>
          )}

          {!showSetup && !showCreateUser && sidebarCatalog === 'webhooks' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WebhookSimulatorPanel
                initialFacilityId={webhookSimulatorPrefs?.selectedFacilityId}
                initialTemplateId={webhookSimulatorPrefs?.selectedTemplateId}
              />
            </div>
          )}
        </main>
      </div>

      {sidebarCatalog === 'gateways' && <AppStatusBar gateway={activeGateway} />}
    </div>
      ) : null}
    </>
  );
}
