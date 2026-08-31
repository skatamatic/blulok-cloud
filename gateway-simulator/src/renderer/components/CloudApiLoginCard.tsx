import { useCallback, useEffect, useState } from 'react';
import type { CatalogSessionSummary } from '@protocol/ipc-channels';
import { DEFAULT_BACKEND_URL } from '@protocol/constants';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { DevQuickLoginButtons } from './DevQuickLoginButtons';
import type { DevQuickLoginAccount } from '../config/devTestAccounts';

export type CloudApiCapability = 'import' | 'webhooks';

const INSUFFICIENT_ROLE_MESSAGE: Record<CloudApiCapability, string> = {
  import: 'Admin or Dev Admin is required to import users.',
  webhooks: 'Admin, Dev Admin, or Facility Admin is required to simulate webhooks.',
};

function isAuthorized(session: CatalogSessionSummary | null, capability: CloudApiCapability): boolean {
  if (!session) return false;
  if (capability === 'import') return Boolean(session.canImportUsers);
  return Boolean(session.canSimulateFmsWebhooks);
}

type Props = {
  capability: CloudApiCapability;
  title?: string;
  description: string;
  quickLoginAccounts?: DevQuickLoginAccount[];
  onSessionChange?: (session: CatalogSessionSummary | null) => void;
};

export function CloudApiLoginCard({
  capability,
  title = 'Cloud API sign in',
  description,
  quickLoginAccounts,
  onSessionChange,
}: Props) {
  const toast = useToast();
  const [catalogSession, setCatalogSession] = useState<CatalogSessionSummary | null>(null);
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(true);

  const authorized = isAuthorized(catalogSession, capability);
  const hasSession = Boolean(catalogSession?.available && catalogSession.email);
  const insufficientRole = hasSession && !authorized;

  const refreshCatalogSession = useCallback(() => {
    void window.simulator.getCatalogSession().then((session) => {
      setCatalogSession(session);
      if (session.backendUrl) setBackendUrl(session.backendUrl);
      const ok = isAuthorized(session, capability);
      setShowLoginForm(!session.available || !ok);
      onSessionChange?.(session);
    });
  }, [capability, onSessionChange]);

  useEffect(() => {
    refreshCatalogSession();
  }, [refreshCatalogSession]);

  const handleLogin = async (creds?: { email: string; password: string }) => {
    const loginEmail = creds?.email ?? email;
    const loginPassword = creds?.password ?? password;
    if (!loginEmail.trim() || !loginPassword) {
      toast.error('Email and password required');
      return;
    }
    setLoginBusy(true);
    try {
      await window.simulator.loginCatalog({
        backendUrl: backendUrl.trim(),
        email: loginEmail.trim(),
        password: loginPassword,
      });
      setEmail(loginEmail.trim());
      setPassword('');
      setShowLoginForm(false);
      refreshCatalogSession();
      toast.success('Signed in');
    } catch (err) {
      toast.error('Sign in failed', errorMessage(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignOut = async () => {
    await window.simulator.clearCatalogSession();
    setShowLoginForm(true);
    refreshCatalogSession();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      {authorized && !showLoginForm && catalogSession?.email && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{catalogSession.email}</p>
            <p className="text-xs text-gray-500">{catalogSession.role?.replace(/_/g, ' ')}</p>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      )}

      {insufficientRole && catalogSession?.email && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-700/50 dark:bg-amber-950/30">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-amber-950 dark:text-amber-100">
              Signed in as {catalogSession.email}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              {INSUFFICIENT_ROLE_MESSAGE[capability]}
            </p>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      )}

      {(!hasSession || showLoginForm) && !insufficientRole && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <label className="label">Backend URL</label>
            <input className="input" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLogin();
              }}
            />
          </div>
          <button type="button" className="btn-primary" disabled={loginBusy} onClick={() => void handleLogin()}>
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
          {quickLoginAccounts?.length ? (
            <DevQuickLoginButtons
              backendUrl={backendUrl}
              disabled={loginBusy}
              accounts={quickLoginAccounts}
              onSelect={(account) => {
                setEmail(account.email);
                setPassword(account.password);
                void handleLogin({ email: account.email, password: account.password });
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function useCloudApiAuthorized(capability: CloudApiCapability): {
  authorized: boolean;
  session: CatalogSessionSummary | null;
  refresh: () => void;
} {
  const [session, setSession] = useState<CatalogSessionSummary | null>(null);

  const refresh = useCallback(() => {
    void window.simulator.getCatalogSession().then(setSession);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    authorized: isAuthorized(session, capability),
    session,
    refresh,
  };
}
