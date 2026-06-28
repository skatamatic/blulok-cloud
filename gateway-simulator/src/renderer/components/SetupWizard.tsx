import { useEffect, useState } from 'react';
import type { FacilitySummary, GatewayRecordSummary } from '@protocol/ipc-channels';
import { DEFAULT_BACKEND_URL } from '@protocol/constants';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import {
  buildExistingGatewayDefaults,
  buildNewGatewayDefaults,
  type GatewaySetupFields,
} from '../utils/setup-gateway-defaults';
import { DevQuickLoginButtons } from './DevQuickLoginButtons';
import type { DevQuickLoginAccount } from '../config/devTestAccounts';

type SetupCompleteData = {
  backendUrl: string;
  token?: string;
  facilityId: string;
  facilityName: string;
  gatewayId?: string;
  label: string;
  gatewayName: string;
  gatewaySerial: string;
};

type Props = {
  existingTabCount: number;
  onComplete: (data: SetupCompleteData) => void;
  onCancel?: () => void;
};

export function SetupWizard({ existingTabCount, onComplete, onCancel }: Props) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [savedSession, setSavedSession] = useState<{ backendUrl: string; email: string } | null>(null);
  const [useDifferentAccount, setUseDifferentAccount] = useState(false);
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | undefined>();
  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [gateways, setGateways] = useState<GatewayRecordSummary[]>([]);
  const [facilityId, setFacilityId] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [gatewayId, setGatewayId] = useState('');
  const [useNewGateway, setUseNewGateway] = useState(true);
  const [fields, setFields] = useState<GatewaySetupFields>({
    label: `Gateway ${existingTabCount + 1}`,
    gatewayName: '',
    gatewaySerial: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.simulator.getSession().then((session) => {
      if (cancelled) return;
      if (session.available && session.backendUrl && session.email) {
        setSavedSession({ backendUrl: session.backendUrl, email: session.email });
        setBackendUrl(session.backendUrl);
      }
      setSessionChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyNewGatewayDefaults = (name: string) => {
    setFields(buildNewGatewayDefaults({ facilityName: name, tabIndex: existingTabCount }));
  };

  const login = async (creds?: { email: string; password: string }) => {
    const loginEmail = creds?.email ?? email;
    const loginPassword = creds?.password ?? password;
    if (!loginEmail.trim() || !loginPassword) {
      setError('Email and password required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await window.simulator.login({
        backendUrl,
        email: loginEmail.trim(),
        password: loginPassword,
      });
      setEmail(loginEmail.trim());
      setToken(res.token);
      const facs = await window.simulator.listFacilities();
      setFacilities(facs);
      setStep(2);
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      toast.error('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (account: DevQuickLoginAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    void login({ email: account.email, password: account.password });
  };

  const continueWithSession = async () => {
    if (!savedSession) return;
    setLoading(true);
    setError('');
    setBackendUrl(savedSession.backendUrl);
    setToken(undefined);
    try {
      const facs = await window.simulator.listFacilities();
      setFacilities(facs);
      setStep(2);
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      toast.error('Could not load facilities', message);
      setUseDifferentAccount(true);
    } finally {
      setLoading(false);
    }
  };

  const pickFacility = async (id: string) => {
    const fac = facilities.find((f) => f.id === id);
    const name = fac?.name ?? id;
    setFacilityId(id);
    setFacilityName(name);
    setUseNewGateway(true);
    setGatewayId('');
    applyNewGatewayDefaults(name);
    setLoading(true);
    setError('');
    try {
      const gws = await window.simulator.listGateways(id);
      setGateways(gws);
      setStep(3);
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      toast.error('Could not load gateways', message);
    } finally {
      setLoading(false);
    }
  };

  const selectExistingGateway = (id: string) => {
    setGatewayId(id);
    const record = gateways.find((g) => g.id === id);
    if (record) {
      setFields(buildExistingGatewayDefaults(record, existingTabCount));
    }
  };

  const switchToNewGateway = () => {
    setUseNewGateway(true);
    setGatewayId('');
    applyNewGatewayDefaults(facilityName);
  };

  const switchToExistingGateway = () => {
    setUseNewGateway(false);
    if (gatewayId) {
      selectExistingGateway(gatewayId);
    }
  };

  const finish = () => {
    onComplete({
      backendUrl,
      token,
      facilityId,
      facilityName,
      gatewayId: useNewGateway ? undefined : gatewayId,
      label: fields.label.trim(),
      gatewayName: fields.gatewayName.trim(),
      gatewaySerial: fields.gatewaySerial.trim(),
    });
  };

  const canCreate =
    fields.label.trim().length > 0 &&
    fields.gatewayName.trim().length > 0 &&
    fields.gatewaySerial.trim().length > 0 &&
    (useNewGateway || gatewayId.length > 0);

  if (!sessionChecked) {
    return (
      <div className="card mx-auto max-w-lg">
        <h2 className="mb-4 text-lg font-semibold">Setup Simulated Gateway</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Checking saved session…</p>
      </div>
    );
  }

  const showLoginForm = !savedSession || useDifferentAccount;

  return (
    <div className="card mx-auto max-w-lg">
      <h2 className="mb-4 text-lg font-semibold">Setup Simulated Gateway</h2>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {savedSession && !useDifferentAccount ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Continue with your saved session or sign in as a different user.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                <p className="text-sm font-medium">{savedSession.email}</p>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{savedSession.backendUrl}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {onCancel && (
                  <button type="button" className="btn-secondary" onClick={onCancel}>
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading}
                  onClick={() => void continueWithSession()}
                >
                  {loading ? 'Loading facilities…' : 'Continue'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading}
                  onClick={() => setUseDifferentAccount(true)}
                >
                  Sign in as different user
                </button>
              </div>
            </>
          ) : (
            <>
              {savedSession && (
                <button
                  type="button"
                  className="text-sm text-primary-600 hover:underline dark:text-primary-400"
                  onClick={() => {
                    setUseDifferentAccount(false);
                    setError('');
                  }}
                >
                  ← Back to saved session
                </button>
              )}
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
                />
              </div>
              <div className="flex gap-2 pt-2">
                {onCancel && (
                  <button type="button" className="btn-secondary" onClick={onCancel}>
                    Cancel
                  </button>
                )}
                <button type="button" className="btn-primary" disabled={loading} onClick={() => void login()}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
              <DevQuickLoginButtons backendUrl={backendUrl} disabled={loading} onSelect={handleQuickLogin} />
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">Select a facility:</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {facilities.map((f) => (
              <button
                key={f.id}
                type="button"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-500 dark:border-gray-700"
                disabled={loading}
                onClick={() => void pickFacility(f.id)}
              >
                {f.name}
                <span className="ml-2 text-xs text-gray-400">{f.id.slice(0, 8)}…</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary mt-2" onClick={() => setStep(1)}>
            Back
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Facility: <span className="font-medium text-gray-900 dark:text-gray-100">{facilityName}</span>
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={useNewGateway}
              onChange={() => switchToNewGateway()}
            />
            New simulated gateway (auto-register on connect)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={!useNewGateway}
              onChange={() => switchToExistingGateway()}
            />
            Use existing gateway record
          </label>

          {!useNewGateway && (
            <select
              className="input"
              value={gatewayId}
              onChange={(e) => selectExistingGateway(e.target.value)}
            >
              <option value="">Select gateway…</option>
              {gateways.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name ?? g.id} ({g.status ?? 'unknown'})
                </option>
              ))}
            </select>
          )}

          <div>
            <label className="label">Simulator tab name</label>
            <input
              className="input"
              value={fields.label}
              onChange={(e) => setFields((prev) => ({ ...prev, label: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Gateway name (cloud)</label>
            <input
              className="input"
              value={fields.gatewayName}
              onChange={(e) => setFields((prev) => ({ ...prev, gatewayName: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Gateway serial</label>
            <input
              className="input font-mono text-sm"
              value={fields.gatewaySerial}
              onChange={(e) => setFields((prev) => ({ ...prev, gatewaySerial: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn-primary" disabled={!canCreate} onClick={finish}>
              Create tab
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
