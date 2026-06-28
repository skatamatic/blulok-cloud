import { useEffect, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { PanelSection } from './PanelSection';

type Props = {
  gateway: GatewayInstanceState;
  onChange: () => void;
};

type FormState = {
  label: string;
  gatewayName: string;
  gatewaySerial: string;
};

function toFormState(gateway: GatewayInstanceState): FormState {
  return {
    label: gateway.label,
    gatewayName: gateway.gatewayName ?? '',
    gatewaySerial: gateway.gatewaySerial ?? '',
  };
}

function formsEqual(a: FormState, b: FormState): boolean {
  return a.label === b.label && a.gatewayName === b.gatewayName && a.gatewaySerial === b.gatewaySerial;
}

export function GatewaySettingsPanel({ gateway, onChange }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(gateway));
  const [savedForm, setSavedForm] = useState<FormState>(() => toFormState(gateway));
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = !formsEqual(form, savedForm);

  useEffect(() => {
    const next = toFormState(gateway);
    setForm(next);
    setSavedForm(next);
  }, [gateway.id, gateway.label, gateway.gatewayName, gateway.gatewaySerial]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCloud(true);
    setError('');
    void window.simulator
      .fetchGatewayCloud(gateway.id)
      .then(() => {
        if (!cancelled) onChange();
      })
      .catch((err) => {
        if (!cancelled) {
          const message = errorMessage(err);
          setError(message);
          toast.error('Could not load gateway details', message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCloud(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway.id]);

  const refreshFromCloud = async () => {
    setLoadingCloud(true);
    setError('');
    try {
      await window.simulator.fetchGatewayCloud(gateway.id);
      onChange();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error('Could not refresh gateway details', message);
    } finally {
      setLoadingCloud(false);
    }
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError('');
    try {
      const patch: {
        label?: string;
        gatewayName?: string;
        gatewaySerial?: string;
      } = {};

      if (form.label.trim() !== savedForm.label) patch.label = form.label.trim();
      if (form.gatewayName.trim() !== savedForm.gatewayName) patch.gatewayName = form.gatewayName.trim();
      if (form.gatewaySerial.trim() !== savedForm.gatewaySerial) {
        patch.gatewaySerial = form.gatewaySerial.trim();
      }

      if (!form.gatewayName.trim()) {
        setError('Gateway name is required.');
        return;
      }

      await window.simulator.updateGatewaySettings(gateway.id, patch);
      const nextSaved = { ...form, gatewayName: form.gatewayName.trim(), label: form.label.trim() };
      setSavedForm(nextSaved);
      setForm(nextSaved);
      onChange();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error('Could not save settings', message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(savedForm);
    setError('');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PanelSection embedded className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Gateway settings</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Update how this simulator appears locally and how the gateway is registered in BluLok Cloud.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary !px-3 !py-2"
            disabled={loadingCloud || saving}
            onClick={() => void refreshFromCloud()}
          >
            <ArrowPathIcon className={`mr-1.5 inline h-4 w-4 ${loadingCloud ? 'animate-spin' : ''}`} aria-hidden />
            Refresh from cloud
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="gateway-settings-label">
              Simulator tab label
            </label>
            <input
              id="gateway-settings-label"
              className="input"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Gateway 1"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Shown in the sidebar only — does not change the cloud gateway record.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="gateway-settings-name">
                Gateway name
              </label>
              <input
                id="gateway-settings-name"
                className="input"
                value={form.gatewayName}
                onChange={(e) => setForm((prev) => ({ ...prev, gatewayName: e.target.value }))}
                placeholder="Building A gateway"
                disabled={loadingCloud}
              />
            </div>
            <div>
              <label className="label" htmlFor="gateway-settings-serial">
                Hardware serial
              </label>
              <input
                id="gateway-settings-serial"
                className="input font-mono text-sm"
                value={form.gatewaySerial}
                onChange={(e) => setForm((prev) => ({ ...prev, gatewaySerial: e.target.value }))}
                placeholder="GW-001234"
                disabled={loadingCloud}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Stored as the gateway&apos;s MAC / serial field in cloud inventory sync.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Read-only</p>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400">Gateway UUID</dt>
              <dd className="font-mono text-xs text-gray-800 dark:text-gray-200">{gateway.gatewayId}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400">Facility</dt>
              <dd className="text-gray-800 dark:text-gray-200">{gateway.facilityName ?? gateway.facilityId}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400">Backend</dt>
              <dd className="truncate font-mono text-xs text-gray-800 dark:text-gray-200">{gateway.backendUrl}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          {savedFlash && (
            <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="h-4 w-4" aria-hidden />
              Saved
            </span>
          )}
          <button type="button" className="btn-secondary !px-3 !py-2" disabled={!dirty || saving} onClick={reset}>
            Reset
          </button>
          <button type="button" className="btn-primary !px-3 !py-2" disabled={!dirty || saving || loadingCloud} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </PanelSection>
    </div>
  );
}
