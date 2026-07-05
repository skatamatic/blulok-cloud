import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { FmsWebhookTargetSummary, SendFmsWebhookResponse } from '@protocol/ipc-channels';
import {
  buildTemplateContextFromConfig,
  listTemplatesForProvider,
  parseTemplatePayload,
  type WebhookEventTemplate,
} from '@protocol/fms-webhook-templates';
import { CloudApiLoginCard, useCloudApiAuthorized } from './CloudApiLoginCard';
import { PanelSection } from './PanelSection';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { DEV_WEBHOOK_LOGIN_ACCOUNTS } from '../config/devTestAccounts';

type EditorTab = 'form' | 'json' | 'headers';

type HeaderRow = { id: string; key: string; value: string };

type RecentSend = {
  id: string;
  timestamp: string;
  eventLabel: string;
  facilityLabel: string;
  status: number;
  ok: boolean;
  syncLogId?: string;
};

type Props = {
  initialFacilityId?: string;
  initialTemplateId?: string;
};

function newHeaderRow(): HeaderRow {
  return { id: crypto.randomUUID(), key: '', value: '' };
}

function authModeLabel(mode: FmsWebhookTargetSummary['authMode']): string {
  if (mode === 'hmac') return 'HMAC';
  if (mode === 'header_secret') return 'Header secret';
  return 'None';
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function WebhookSimulatorPanel({ initialFacilityId, initialTemplateId }: Props) {
  const toast = useToast();
  const { authorized, refresh: refreshSession } = useCloudApiAuthorized('webhooks');
  const [targets, setTargets] = useState<FmsWebhookTargetSummary[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState(initialFacilityId ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId ?? '');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [jsonText, setJsonText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('form');
  const [extraHeaders, setExtraHeaders] = useState<HeaderRow[]>([newHeaderRow()]);
  const [sending, setSending] = useState(false);
  const [lastResponse, setLastResponse] = useState<SendFmsWebhookResponse | null>(null);
  const [recentSends, setRecentSends] = useState<RecentSend[]>([]);
  const lastRebuildKeyRef = useRef('');

  const selectedTarget = useMemo(
    () => targets.find((t) => t.facilityId === selectedFacilityId) ?? null,
    [targets, selectedFacilityId],
  );

  const templates = useMemo(
    () => (selectedTarget ? listTemplatesForProvider(selectedTarget.providerType) : []),
    [selectedTarget],
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? templates[0] ?? null,
    [templates, selectedTemplateId],
  );

  const loadTargets = useCallback(async () => {
    if (!authorized) {
      setTargets([]);
      return;
    }
    setLoadingTargets(true);
    try {
      const list = await window.simulator.listFmsWebhookTargets();
      setTargets(list);
      setSelectedFacilityId((prev) => {
        if (list.length && !list.some((t) => t.facilityId === prev)) {
          return list[0]!.facilityId;
        }
        return prev;
      });
    } catch (err) {
      toast.error('Could not load FMS configs', errorMessage(err));
    } finally {
      setLoadingTargets(false);
    }
  }, [authorized, toast]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const rebuildFromTemplate = useCallback(
    (template: WebhookEventTemplate, target: FmsWebhookTargetSummary) => {
      const ctx = buildTemplateContextFromConfig({
        customSettings: { facilityId: target.externalFacilityId },
      });
      const values = template.buildDefaultValues(ctx);
      const payload = template.buildPayload(values, ctx);
      setFormValues(values);
      setJsonText(JSON.stringify(payload, null, 2));
      setJsonError(null);
    },
    [],
  );

  useEffect(() => {
    if (!selectedTarget || !selectedTemplate) return;
    const rebuildKey = `${selectedTarget.facilityId}:${selectedTemplate.id}`;
    if (lastRebuildKeyRef.current === rebuildKey) return;
    lastRebuildKeyRef.current = rebuildKey;
    rebuildFromTemplate(selectedTemplate, selectedTarget);
    void window.simulator.saveWebhookSimulatorState({
      selectedFacilityId: selectedTarget.facilityId,
      selectedTemplateId: selectedTemplate.id,
    });
  }, [selectedTarget, selectedTemplate, rebuildFromTemplate]);

  useEffect(() => {
    if (templates.length && !templates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]!.id);
    }
  }, [templates, selectedTemplateId]);

  const syncJsonFromForm = (values: Record<string, string | boolean>) => {
    if (!selectedTemplate || !selectedTarget) return;
    const ctx = buildTemplateContextFromConfig({
      customSettings: { facilityId: selectedTarget.externalFacilityId },
    });
    const payload = selectedTemplate.buildPayload(values, ctx);
    setJsonText(JSON.stringify(payload, null, 2));
    setJsonError(null);
  };

  const handleFormChange = (key: string, value: string | boolean) => {
    const next = { ...formValues, [key]: value };
    setFormValues(next);
    syncJsonFromForm(next);
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    if (!selectedTemplate) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      setFormValues(parseTemplatePayload(selectedTemplate, parsed));
      setJsonError(null);
    } catch (err) {
      setJsonError(errorMessage(err));
    }
  };

  const parsedPayload = useMemo(() => {
    try {
      return JSON.parse(jsonText) as unknown;
    } catch {
      return null;
    }
  }, [jsonText]);

  const authHeaderPreview = useMemo(() => {
    const rows: Array<{ key: string; value: string }> = [{ key: 'Content-Type', value: 'application/json' }];
    if (!selectedTarget) return rows;
    if (selectedTarget.authMode === 'hmac') {
      const header = selectedTarget.webhookSignatureHeader?.trim() || 'X-Storable-Signature';
      rows.push({ key: header, value: '(HMAC-SHA256 of JSON body — applied on send)' });
    } else if (selectedTarget.authMode === 'header_secret') {
      const header = selectedTarget.webhookAuthHeader?.trim() || 'Authorization';
      rows.push({ key: header, value: '(shared secret — applied on send)' });
    }
    return rows;
  }, [selectedTarget]);

  const sendBlockedReason = useMemo(() => {
    if (!selectedTarget) return 'Select a target facility';
    if (!selectedTarget.isEnabled) return 'FMS integration is disabled for this facility';
    if (!selectedTarget.authReady) return 'Webhook auth secret is missing in FMS settings';
    if (!templates.length) return `No templates for provider "${selectedTarget.providerType}"`;
    if (jsonError) return 'Fix JSON errors before sending';
    if (parsedPayload == null) return 'Fix JSON payload before sending';
    return null;
  }, [selectedTarget, templates.length, jsonError, parsedPayload]);

  const handleSend = async () => {
    if (sendBlockedReason || !selectedTarget || parsedPayload == null) {
      toast.error('Cannot send webhook', sendBlockedReason ?? 'Invalid payload');
      return;
    }
    setSending(true);
    setLastResponse(null);
    try {
      const extras = Object.fromEntries(
        extraHeaders.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
      );
      const response = await window.simulator.sendFmsWebhook({
        facilityId: selectedTarget.facilityId,
        body: parsedPayload,
        extraHeaders: extras,
      });
      setLastResponse(response);
      const body = response.body as Record<string, unknown> | null;
      setRecentSends((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventLabel: selectedTemplate?.label ?? 'Webhook',
          facilityLabel: selectedTarget.facilityName ?? selectedTarget.facilityId,
          status: response.status,
          ok: response.ok,
          syncLogId: typeof body?.syncLogId === 'string' ? body.syncLogId : undefined,
        },
        ...prev,
      ].slice(0, 10));
      if (response.ok) {
        toast.success('Webhook delivered', `HTTP ${response.status}`);
      } else {
        toast.error('Webhook rejected', `HTTP ${response.status}`);
      }
    } catch (err) {
      toast.error('Send failed', errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-8">
      <header>
        <h1 className="text-xl font-semibold">FMS webhook simulator</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Fetch webhook-enabled FMS configs, compose provider-shaped payloads, and POST to your backend receiver.
        </p>
      </header>

      <PanelSection embedded className="space-y-4">
        <CloudApiLoginCard
          capability="webhooks"
          description="Sign in as Admin, Dev Admin, or Facility Admin. Credentials are cached separately from gateway setup login."
          quickLoginAccounts={DEV_WEBHOOK_LOGIN_ACCOUNTS}
          onSessionChange={() => refreshSession()}
        />
      </PanelSection>

      {authorized && (
        <>
          <PanelSection embedded className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[min(100%,16rem)] flex-1">
                <label className="label">Target facility</label>
                <select
                  className="input"
                  value={selectedFacilityId}
                  onChange={(e) => setSelectedFacilityId(e.target.value)}
                  disabled={!targets.length}
                >
                  {targets.map((t) => (
                    <option key={t.facilityId} value={t.facilityId}>
                      {t.facilityName ?? t.facilityId} — {t.providerType}
                      {!t.isEnabled ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2"
                disabled={loadingTargets}
                onClick={() => void loadTargets()}
              >
                <ArrowPathIcon className={`h-4 w-4 ${loadingTargets ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {!targets.length && !loadingTargets && (
              <p className="text-sm text-gray-500">No webhook-enabled FMS configurations found.</p>
            )}

            {selectedTarget && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-primary-600/10 px-2.5 py-1 font-medium text-primary-700 dark:text-primary-300">
                  {selectedTarget.providerType}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  Auth: {authModeLabel(selectedTarget.authMode)}
                </span>
                <span className="truncate rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {selectedTarget.webhookUrl}
                </span>
              </div>
            )}

            {selectedTarget && !selectedTarget.isEnabled && (
              <WarningBanner>FMS integration is disabled for this facility — enable it before sending webhooks.</WarningBanner>
            )}

            {selectedTarget?.authMode === 'none' && (
              <WarningBanner>This facility uses no-auth webhook mode — for local/dev testing only.</WarningBanner>
            )}

            {selectedTarget && !selectedTarget.authReady && selectedTarget.authMode !== 'none' && (
              <WarningBanner>
                Webhook auth mode is {authModeLabel(selectedTarget.authMode)} but no signing secret is configured in
                FMS settings.
              </WarningBanner>
            )}

            {selectedTarget?.providerType === 'storedge' && !selectedTarget.hasExternalFacilityId && (
              <WarningBanner>
                Storable external facility ID is not set in FMS config (customSettings.facilityId). Webhooks will likely
                fail facility_id validation.
              </WarningBanner>
            )}
          </PanelSection>

          {selectedTarget && templates.length === 0 && (
            <PanelSection embedded>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No event templates are available for provider <strong>{selectedTarget.providerType}</strong>. You can
                still send a custom payload by adding templates for this provider, or use the JSON tab after selecting a
                supported provider.
              </p>
            </PanelSection>
          )}

          {selectedTarget && templates.length > 0 && selectedTemplate && (
            <PanelSection embedded className="space-y-4">
              <div>
                <label className="label">Event template</label>
                <select
                  className="input"
                  value={selectedTemplate.id}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.eventType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {(['form', 'json', 'headers'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      editorTab === tab
                        ? 'border-b-2 border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                    onClick={() => setEditorTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {editorTab === 'form' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedTemplate.fields.map((field) => (
                    <div key={field.key} className={field.type === 'boolean' ? 'sm:col-span-2' : ''}>
                      <label className="label">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </label>
                      {field.type === 'boolean' ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formValues[field.key] === true || formValues[field.key] === 'true'}
                            onChange={(e) => handleFormChange(field.key, e.target.checked)}
                          />
                          Enabled
                        </label>
                      ) : (
                        <input
                          className="input"
                          type={field.type === 'email' ? 'email' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                          value={String(formValues[field.key] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(e) => handleFormChange(field.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editorTab === 'json' && (
                <div className="space-y-2">
                  <textarea
                    className="input min-h-[min(20rem,50vh)] font-mono text-xs leading-relaxed"
                    value={jsonText}
                    spellCheck={false}
                    onChange={(e) => handleJsonChange(e.target.value)}
                  />
                  {jsonError && <p className="text-sm text-red-600 dark:text-red-400">{jsonError}</p>}
                </div>
              )}

              {editorTab === 'headers' && (
                <div className="space-y-4">
                  <div>
                    <p className="label mb-2">Auto auth headers (from FMS config)</p>
                    <ul className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-900/40">
                      {authHeaderPreview.map(({ key, value }) => (
                        <li key={key} className="break-all">
                          <span className="text-gray-500">{key}:</span> {value}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="label mb-2">Additional headers</p>
                    <div className="space-y-2">
                      {extraHeaders.map((row, index) => (
                        <div key={row.id} className="flex gap-2">
                          <input
                            className="input flex-1 font-mono text-xs"
                            placeholder="Header name"
                            value={row.key}
                            onChange={(e) => {
                              const next = [...extraHeaders];
                              next[index] = { ...row, key: e.target.value };
                              setExtraHeaders(next);
                            }}
                          />
                          <input
                            className="input flex-[2] font-mono text-xs"
                            placeholder="Value"
                            value={row.value}
                            onChange={(e) => {
                              const next = [...extraHeaders];
                              next[index] = { ...row, value: e.target.value };
                              setExtraHeaders(next);
                            }}
                          />
                          <button
                            type="button"
                            className="btn-secondary shrink-0 text-xs"
                            onClick={() => setExtraHeaders(extraHeaders.filter((h) => h.id !== row.id))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => setExtraHeaders([...extraHeaders, newHeaderRow()])}
                      >
                        Add header
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                  disabled={sending || sendBlockedReason != null}
                  title={sendBlockedReason ?? undefined}
                  onClick={() => void handleSend()}
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {sending ? 'Sending…' : 'Send webhook'}
                </button>
                {sendBlockedReason && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sendBlockedReason}</p>
                )}
              </div>

              {lastResponse && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="mb-2 text-sm font-medium">
                    Response — HTTP {lastResponse.status}{' '}
                    <span className={lastResponse.ok ? 'text-green-600' : 'text-red-600'}>
                      {lastResponse.ok ? 'OK' : 'Error'}
                    </span>
                  </p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                    {typeof lastResponse.body === 'string'
                      ? lastResponse.body
                      : JSON.stringify(lastResponse.body, null, 2)}
                  </pre>
                </div>
              )}
            </PanelSection>
          )}

          {recentSends.length > 0 && (
            <PanelSection embedded>
              <h3 className="mb-3 text-sm font-semibold">Recent sends</h3>
              <ul className="space-y-2 text-sm">
                {recentSends.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium">{entry.eventLabel}</p>
                      <p className="text-xs text-gray-500">
                        {entry.facilityLabel} · {new Date(entry.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className={entry.ok ? 'text-green-600' : 'text-red-600'}>HTTP {entry.status}</p>
                      {entry.syncLogId && <p className="text-gray-500">syncLog: {entry.syncLogId}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}
        </>
      )}
    </div>
  );
}
