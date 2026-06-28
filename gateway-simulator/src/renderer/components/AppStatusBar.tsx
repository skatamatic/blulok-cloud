import type { ReactNode } from 'react';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { useGatewayStatusBar } from '../hooks/useGatewayStatusBar';
import {
  buildStatusBarTooltip,
  formatStatusBarTimestamp,
  type StatusBarHistoryEntry,
} from '../utils/gateway-status-bar.utils';
import { ReconnectIndicator } from './ReconnectIndicator';
import { SessionRoleBadge } from './SessionRoleBadge';

type Props = {
  gateway: GatewayInstanceState | null;
};

function phaseClass(phase: StatusBarHistoryEntry['phase'] | 'idle'): string {
  switch (phase) {
    case 'sending':
    case 'in-progress':
      return 'app-status-bar-activity-active';
    case 'success':
      return 'app-status-bar-activity-success';
    case 'failed':
      return 'app-status-bar-activity-failed';
    default:
      return 'app-status-bar-activity-idle';
  }
}

function StatusTooltip({ lines, children }: { lines: string[]; children: ReactNode }) {
  return (
    <span className="app-status-bar-tooltip-wrap">
      {children}
      <span className="app-status-bar-tooltip" role="tooltip">
        {lines.map((line, index) =>
          line === '' ? (
            <span key={`spacer-${index}`} className="app-status-bar-tooltip-spacer" />
          ) : (
            <span key={`${line}-${index}`} className="app-status-bar-tooltip-line">
              {line}
            </span>
          ),
        )}
      </span>
    </span>
  );
}

export function AppStatusBar({ gateway }: Props) {
  const { state, display } = useGatewayStatusBar(gateway);
  const activityPhase = display?.phase ?? 'idle';
  const tooltipLines = buildStatusBarTooltip(state, display);
  const connected = gateway?.connectionStatus === 'connected';

  return (
    <footer className="app-status-bar" aria-label="Gateway activity status">
      <div className="app-status-bar-section app-status-bar-section-left">
        <div className="app-status-bar-left-copy">
          <span
            className={`app-status-bar-gateway-label ${gateway ? `app-status-bar-connection-${gateway.connectionStatus}` : ''}`}
          >
            {gateway?.label ?? 'No gateway selected'}
          </span>
          {gateway && (
            <div className="app-status-bar-indicators">
              <SessionRoleBadge
                connectionStatus={gateway.connectionStatus}
                sessionRole={gateway.sessionRole}
                compact
                variant="pill"
              />
              <ReconnectIndicator reconnectAt={gateway.reconnectAt} />
              {gateway.behavior.liveStateSync && connected && (
                <span className="live-sync-indicator">Live sync</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="app-status-bar-section app-status-bar-section-right">
        <StatusTooltip lines={tooltipLines}>
          <span className={`app-status-bar-activity ${phaseClass(activityPhase)}`}>
            {(display?.phase === 'sending' || display?.phase === 'in-progress') && (
              <span className="app-status-bar-spinner" aria-hidden />
            )}
            <span className="app-status-bar-activity-text">{display?.message ?? 'Ready'}</span>
          </span>
        </StatusTooltip>
        <span className="app-status-bar-timestamp">
          {display ? formatStatusBarTimestamp(display.timestamp) : '—'}
        </span>
      </div>
    </footer>
  );
}
