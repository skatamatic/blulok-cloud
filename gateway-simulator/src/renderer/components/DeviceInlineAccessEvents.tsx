import { useState } from 'react';
import { BoltIcon } from '@heroicons/react/24/outline';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import { ACCESS_EVENT_PRESETS } from '@protocol/access-events';
import { inventoryDeviceKey } from '../utils/device-inventory.utils';
import { simulateAccessEvent } from '../utils/simulator-client';

type Props = {
  gatewayId: string;
  item: DeviceInventoryItem;
  connected: boolean;
  onRefresh: () => void;
  /** When true, omits the section header (parent provides context). */
  embedded?: boolean;
};

function presetTone(presetId: string): 'granted' | 'denied' | 'admin' {
  if (presetId.includes('denied')) return 'denied';
  if (presetId.includes('admin')) return 'admin';
  return 'granted';
}

export function DeviceInlineAccessEvents({ gatewayId, item, connected, onRefresh, embedded }: Props) {
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deviceKey = inventoryDeviceKey(item);

  const fire = async (presetId: string) => {
    if (!connected || busy) return;
    const preset = ACCESS_EVENT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setBusy(true);
    setLastResult(null);
    try {
      await simulateAccessEvent(gatewayId, {
        deviceKey,
        ...preset.request,
      });
      setLastResult(`${preset.label} sent`);
      onRefresh();
    } catch (err) {
      setLastResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`device-card-footer ${embedded ? 'device-card-footer-embedded' : ''}`}>
      {!embedded && (
        <header className="device-card-footer-header">
          <div className="device-card-footer-title-wrap">
            <BoltIcon className="device-card-footer-icon" aria-hidden />
            <span className="device-card-footer-title">Access events</span>
          </div>
          {!connected && <span className="device-card-footer-hint">Connect gateway to send</span>}
        </header>
      )}
      <div className="access-preset-grid">
        {ACCESS_EVENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`access-preset-btn access-preset-btn-${presetTone(preset.id)}`}
            disabled={!connected || busy}
            title={preset.description}
            onClick={() => void fire(preset.id)}
          >
            <span className="access-preset-label">{preset.label}</span>
            <span className="access-preset-desc">{preset.description}</span>
          </button>
        ))}
      </div>
      {lastResult && (
        <p
          className={`access-preset-result ${lastResult.endsWith('sent') ? 'access-preset-result-ok' : 'access-preset-result-err'}`}
          role="status"
        >
          {lastResult}
        </p>
      )}
    </section>
  );
}
