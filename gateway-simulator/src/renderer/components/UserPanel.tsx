import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import type { CloudUserSummary, UserInstanceState } from '@protocol/user-simulator-state';
import type { CatalogSessionSummary } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { PanelSection } from './PanelSection';
import { CloudApiLoginCard } from './CloudApiLoginCard';
import { UserDeviceCard } from './UserDeviceCard';
import { DEV_CATALOG_LOGIN_ACCOUNTS } from '../config/devTestAccounts';

type Props = {
  user: UserInstanceState;
  gateways: GatewayInstanceState[];
  onRefresh: () => void;
};

export function UserPanel({ user, gateways, onRefresh }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedDeviceIds, setExpandedDeviceIds] = useState<Set<string>>(() => new Set());
  const [selectedFacilityId, setSelectedFacilityId] = useState('');

  const facilities = useMemo(() => {
    const map = new Map<string, string>();
    for (const gw of gateways) {
      map.set(gw.facilityId, gw.facilityName ?? gw.facilityId);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [gateways]);

  const selectedDevice = useMemo(() => {
    const expandedId = [...expandedDeviceIds][0];
    return user.devices.find((d) => d.id === expandedId) ?? user.devices[0] ?? null;
  }, [expandedDeviceIds, user.devices]);
  const effectiveFacilityId = selectedFacilityId || facilities[0]?.id || '';

  useEffect(() => {
    setExpandedDeviceIds((current) => {
      const next = new Set([...current].filter((id) => user.devices.some((d) => d.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [user.devices]);

  const toggleDeviceExpanded = (deviceId: string) => {
    setExpandedDeviceIds((current) => {
      const next = new Set(current);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      onRefresh();
    } catch (err) {
      toast.error('Action failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshSession = () =>
    void run('login', async () => {
      await window.simulator.loginUser(user.id, selectedDevice?.appDeviceId);
      toast.success('Session refreshed');
    });

  const handleAddDevice = () =>
    void run('add-device', async () => {
      const next = await window.simulator.addUserDevice(user.id);
      const newDeviceId = next.devices[next.devices.length - 1]?.id;
      if (newDeviceId) {
        setExpandedDeviceIds(new Set([newDeviceId]));
      }
      toast.success('Device added with fresh Ed25519 keys');
    });

  return (
    <div className="user-panel space-y-5 p-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Simulated user</p>
        <h2 className="text-xl font-semibold">{user.label}</h2>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      <PanelSection embedded className="space-y-4">
        <h3 className="device-detail-section-title">Cloud session</h3>
        <p className="text-sm text-gray-500">
          Sessions are minted via dev admin and cached locally. Refresh when expired.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Role</dt>
            <dd className="font-medium">{user.role ?? '—'}</dd>
          </div>
          {user.cloudUserId && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Cloud user ID</dt>
              <dd className="font-mono text-xs text-gray-500 truncate">{user.cloudUserId}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={busy === 'login'} onClick={handleRefreshSession}>
            {busy === 'login' ? 'Refreshing…' : 'Refresh session'}
          </button>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${user.loggedIn ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {user.loggedIn ? 'Session active' : 'No cached session'}
          </span>
        </div>
        {user.opsPublicKeyB64 && (
          <p className="text-xs font-mono text-gray-400 truncate" title={user.opsPublicKeyB64}>
            Ops key: {user.opsPublicKeyB64.slice(0, 24)}…
          </p>
        )}
      </PanelSection>

      <PanelSection embedded className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="device-detail-section-title mb-0">App devices</h3>
          <button type="button" className="btn-secondary inline-flex items-center gap-1 text-sm" disabled={busy === 'add-device'} onClick={handleAddDevice}>
            <PlusIcon className="h-4 w-4" />
            Add simulator device
          </button>
        </div>

        {!user.devices.length && (
          <p className="text-sm text-gray-500">
            Import pulls registered devices from the backend. Add a simulator device to register new keys.
          </p>
        )}

        <div className="user-device-list space-y-2">
          {user.devices.map((device) => (
            <UserDeviceCard
              key={device.id}
              user={user}
              device={device}
              expanded={expandedDeviceIds.has(device.id)}
              onToggle={() => toggleDeviceExpanded(device.id)}
              facilities={facilities}
              effectiveFacilityId={effectiveFacilityId}
              onFacilityChange={setSelectedFacilityId}
              busy={busy !== null}
              onRegister={() =>
                void run(`register-${device.id}`, async () => {
                  await window.simulator.registerUserDevice(user.id, device.id);
                  toast.success('Device key registered');
                })
              }
              onRegenerateKeys={() =>
                void run(`regen-${device.id}`, async () => {
                  await window.simulator.regenerateUserDeviceKeys(user.id, device.id);
                  toast.success(
                    device.linkedFromBackend
                      ? 'Local keys generated — register with backend'
                      : 'New keypair generated',
                  );
                })
              }
              onRemove={() =>
                void run(`remove-${device.id}`, async () => {
                  await window.simulator.removeUserDevice(user.id, device.id);
                  setExpandedDeviceIds((current) => {
                    const next = new Set(current);
                    next.delete(device.id);
                    return next;
                  });
                })
              }
              onFetchPass={(facilityId, facilityName) =>
                run(`pass-${device.id}`, async () => {
                  await window.simulator.fetchUserRoutePass(user.id, device.id, facilityId, facilityName);
                  toast.success('Route pass fetched');
                })
              }
              onTamperChange={(facilityId, tamper) =>
                void window.simulator
                  .setUserRoutePassTamper(user.id, device.id, { facilityId, tamper })
                  .then(onRefresh)
              }
              onClearPass={(facilityId) =>
                void window.simulator.clearUserRoutePass(user.id, device.id, facilityId).then(onRefresh)
              }
            />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

export function ImportUserForm({
  importedCloudUserIds,
  onImported,
  onCancel,
}: {
  importedCloudUserIds: string[];
  onImported: (user: UserInstanceState) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<CloudUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [catalogSession, setCatalogSession] = useState<CatalogSessionSummary | null>(null);

  const importedSet = useMemo(() => new Set(importedCloudUserIds), [importedCloudUserIds]);
  const canImport = Boolean(catalogSession?.canImportUsers);

  useEffect(() => {
    void window.simulator.getCatalogSession().then(setCatalogSession);
  }, []);

  useEffect(() => {
    if (!canImport) {
      setUsers([]);
      setTotal(0);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      void window.simulator
        .listCloudUsers({ search: search.trim() || undefined, limit: 100 })
        .then((result) => {
          setUsers(result.users.filter((u) => u.isActive));
          setTotal(result.total);
        })
        .catch((err) => toast.error('Could not load users', errorMessage(err)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [search, canImport, toast]);

  const importUser = async (cloudUser: CloudUserSummary) => {
    setBusyId(cloudUser.id);
    try {
      const label = `${cloudUser.firstName} ${cloudUser.lastName}`.trim() || cloudUser.email || cloudUser.id;
      const user = await window.simulator.importCloudUser({ cloudUserId: cloudUser.id, label });
      onImported(user);
    } catch (err) {
      toast.error('Could not import user', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card mx-auto max-w-2xl">
      <button type="button" className="btn-secondary mb-4 inline-flex items-center gap-2 text-sm" onClick={onCancel}>
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>
      <h2 className="mb-2 text-lg font-semibold">Import user from backend</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Sign in with an Admin or Dev Admin account to browse users, mint cached JWTs, and pull registered devices.
        This is separate from your gateway setup login.
      </p>

      <div className="mb-6">
        <CloudApiLoginCard
          capability="import"
          title="Admin sign in"
          description="Admin or Dev Admin required to browse and import cloud users."
          quickLoginAccounts={DEV_CATALOG_LOGIN_ACCOUNTS}
          onSessionChange={setCatalogSession}
        />
      </div>

      {canImport && (
        <>
          <div className="relative mb-4">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="input !pl-9"
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <p className="mb-2 text-xs text-gray-500">{total > 0 ? `${total} users` : loading ? 'Loading…' : 'No users found'}</p>

          <ul className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto">
            {users.map((cloudUser) => {
              const already = importedSet.has(cloudUser.id);
              const displayName = `${cloudUser.firstName} ${cloudUser.lastName}`.trim();
              return (
                <li
                  key={cloudUser.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{displayName || cloudUser.email || cloudUser.id}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {cloudUser.email ?? cloudUser.phoneNumber ?? '—'} · {cloudUser.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary shrink-0 text-sm"
                    disabled={already || busyId !== null}
                    onClick={() => void importUser(cloudUser)}
                  >
                    {already ? 'Added' : busyId === cloudUser.id ? 'Importing…' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
