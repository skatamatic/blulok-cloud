import { useEffect, useState } from 'react';
import { ChevronDownIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import type { CachedRoutePassState, RoutePassDetails, RoutePassTamperMode } from '@protocol/user-simulator-state';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import {
  formatRoutePassHeaderForDisplay,
  formatRoutePassPayloadForDisplay,
  routePassTamperHelpText,
  routePassTamperLabel,
} from '../utils/route-pass-display.utils';
import { SegmentedControl, type SegmentOption } from './forms/SegmentedControl';

const TAMPER_OPTIONS: SegmentOption<RoutePassTamperMode>[] = [
  { value: 'none', label: 'Valid', tone: 'success' },
  { value: 'force_expired', label: 'Expired', tone: 'warning' },
  { value: 'corrupt_signature', label: 'Bad sig', tone: 'danger' },
];

type Props = {
  userId: string;
  deviceId: string;
  pass: CachedRoutePassState;
  onTamperChange: (tamper: RoutePassTamperMode) => void;
  onClear: () => void;
};

function RoutePassPayloadBlock({ label, content }: { label: string; content: string }) {
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="route-pass-payload-block">
      <div className="route-pass-payload-block-header">
        <p className="route-pass-payload-block-label">{label}</p>
        <button type="button" className="btn-secondary route-pass-copy-btn" onClick={() => void copy()}>
          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <pre className="route-pass-payload-pre">{content}</pre>
    </div>
  );
}

function RoutePassPayloadExpand({ details }: { details: RoutePassDetails }) {
  const payloadChanged =
    details.tamper !== 'none' &&
    JSON.stringify(details.payload) !== JSON.stringify(details.originalPayload);

  return (
    <div className="route-pass-payload-expand space-y-3">
      {details.tamper !== 'none' && (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          Showing presentable JWT with tamper mode: {routePassTamperLabel(details.tamper)}
          {payloadChanged ? ' — payload differs from cached token.' : ''}
        </p>
      )}
      <RoutePassPayloadBlock label="Header" content={formatRoutePassHeaderForDisplay(details.header)} />
      <RoutePassPayloadBlock
        label={payloadChanged ? 'Payload (presentable)' : 'Payload'}
        content={formatRoutePassPayloadForDisplay(details.payload as Record<string, unknown>)}
      />
      {payloadChanged && (
        <RoutePassPayloadBlock
          label="Payload (cached original)"
          content={formatRoutePassPayloadForDisplay(details.originalPayload as Record<string, unknown>)}
        />
      )}
      <RoutePassPayloadBlock label="Presentable JWT" content={details.presentableJwt} />
      {details.presentableJwt !== details.jwt && (
        <RoutePassPayloadBlock label="Cached JWT" content={details.jwt} />
      )}
    </div>
  );
}

export function CachedRoutePassCard({ userId, deviceId, pass, onTamperChange, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<RoutePassDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void window.simulator
      .getUserRoutePassDetails(userId, deviceId, pass.facilityId)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, userId, deviceId, pass.facilityId, pass.tamper]);

  const expiryLabel =
    pass.expiresAt != null
      ? new Date(pass.expiresAt * 1000).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null;

  return (
    <div className="route-pass-card rounded-lg bg-gray-50 p-3 dark:bg-gray-900 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{pass.facilityName ?? pass.facilityId}</p>
          <p className="text-xs font-mono text-gray-500">{pass.jwtPreview}</p>
          {pass.sub && <p className="text-xs text-gray-500">Sub: {pass.sub}</p>}
          {pass.aud && (
            <p className="text-xs text-gray-500">
              Aud: {pass.aud.slice(0, 4).join(', ')}
              {pass.aud.length > 4 ? ` (+${pass.aud.length - 4} more)` : ''}
            </p>
          )}
          {expiryLabel && <p className="text-xs text-gray-500">Expires: {expiryLabel}</p>}
        </div>
        <button
          type="button"
          className="route-pass-expand-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span>{expanded ? 'Hide payload' : 'View payload'}</span>
          <ChevronDownIcon className={`route-pass-expand-chevron ${expanded ? 'is-open' : ''}`} />
        </button>
      </div>

      <div className={`route-pass-expand-panel ${expanded ? 'is-open' : ''}`} aria-hidden={!expanded}>
        <div className="route-pass-expand-panel-inner">
          {loading && <p className="text-xs text-gray-500">Loading route pass…</p>}
          {loadError && (
            <p className="text-xs text-red-600" role="alert">
              {loadError}
            </p>
          )}
          {details && !loading && <RoutePassPayloadExpand details={details} />}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Simulate lock denial</p>
        <SegmentedControl value={pass.tamper} options={TAMPER_OPTIONS} onChange={onTamperChange} />
        <p className="text-xs text-gray-500 dark:text-gray-400">{routePassTamperHelpText(pass.tamper)}</p>
      </div>
      <button type="button" className="text-xs text-red-600" onClick={onClear}>
        Clear cached pass
      </button>
    </div>
  );
}
