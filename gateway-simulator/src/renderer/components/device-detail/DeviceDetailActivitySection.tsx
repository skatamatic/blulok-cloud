import { useMemo } from 'react';
import { DeviceDetailSection } from './DeviceDetailSection';
import type { DeviceDetailSectionProps } from './device-detail.types';

export function DeviceDetailActivitySection({ sim }: DeviceDetailSectionProps) {
  const commandLog = useMemo(() => sim.recentCommands ?? [], [sim.recentCommands]);

  return (
    <div className="device-detail-stack">
      <DeviceDetailSection
        title="Recent commands"
        description="Inbound cloud commands accepted or rejected by this simulated device."
      >
        {commandLog.length === 0 ? (
          <p className="device-detail-empty">No inbound commands recorded yet.</p>
        ) : (
          <ul className="device-detail-log">
            {commandLog.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className={entry.accepted ? 'device-detail-log-ok' : 'device-detail-log-fail'}>
                <time className="text-xs text-gray-400">{entry.at}</time>
                <span className="font-medium">{entry.cmd_type}</span>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </DeviceDetailSection>
    </div>
  );
}
