import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { errorMessage } from '../../utils/error-message.utils';
import { DeviceInlineAccessEvents } from '../DeviceInlineAccessEvents';
import { DeviceField } from '../forms/DeviceField';
import { DeviceDetailSection } from './DeviceDetailSection';
import type { DeviceDetailSectionProps } from './device-detail.types';
import { TryOpenResultBanner, type TryOpenInlineResult } from './TryOpenResultBanner';

export function DeviceDetailSimulateSection({
  gateway,
  deviceKey,
  item,
  sim,
  connected,
  users,
  onRefresh,
}: DeviceDetailSectionProps) {
  const toast = useToast();
  const [tryOpenUserId, setTryOpenUserId] = useState('');
  const [tryOpenDeviceId, setTryOpenDeviceId] = useState('');
  const [tryOpenBusy, setTryOpenBusy] = useState(false);
  const [tryOpenResult, setTryOpenResult] = useState<TryOpenInlineResult | null>(null);

  const [accessCode, setAccessCode] = useState('');
  const [accessCodeBusy, setAccessCodeBusy] = useState(false);
  const [accessCodeResult, setAccessCodeResult] = useState<TryOpenInlineResult | null>(null);

  const isAccessControl = item.kind === 'access_control';
  const storedCodeCount = sim.accessCodes?.length ?? 0;
  const tryOpenUser = users.find((u) => u.id === tryOpenUserId);
  const tryOpenDevices = tryOpenUser?.devices ?? [];

  const handleTryOpen = async () => {
    const user = users.find((u) => u.id === tryOpenUserId);
    const device = user?.devices.find((d) => d.id === tryOpenDeviceId);
    if (!user || !device) {
      toast.error('Select a user and app device');
      return;
    }
    if (!connected) {
      toast.error('Gateway must be connected to report access events');
      return;
    }
    setTryOpenBusy(true);
    try {
      const result = await window.simulator.tryOpenWithUserDevice(gateway.id, {
        deviceKey,
        userId: user.id,
        appDeviceId: device.appDeviceId,
      });
      onRefresh();
      setTryOpenResult({
        at: new Date().toISOString(),
        granted: result.granted,
        message: result.message,
        denial_reason: result.denial_reason,
      });
    } catch (err) {
      toast.error('Try open failed', errorMessage(err));
    } finally {
      setTryOpenBusy(false);
    }
  };

  const handleTryAccessCode = async () => {
    if (!accessCode.trim()) {
      toast.error('Enter an access code');
      return;
    }
    if (!connected) {
      toast.error('Gateway must be connected to report access events');
      return;
    }
    setAccessCodeBusy(true);
    try {
      const result = await window.simulator.tryOpenWithAccessCode(gateway.id, {
        deviceKey,
        code: accessCode.trim(),
      });
      onRefresh();
      setAccessCodeResult({
        at: new Date().toISOString(),
        granted: result.granted,
        message: result.message,
        denial_reason: result.denial_reason,
        schedule_name: result.schedule_name,
      });
    } catch (err) {
      toast.error('Keypad try failed', errorMessage(err));
    } finally {
      setAccessCodeBusy(false);
    }
  };

  return (
    <div className="device-detail-stack">
      {users.length > 0 && (
        <DeviceDetailSection
          title="Try open with user device"
          description="Simulates presenting a cached route pass at the lock. Uses the ops key from the gateway session or user login."
        >
          <div className="device-detail-form-grid">
            <DeviceField label="Simulated user">
              <select
                className="input select-field"
                value={tryOpenUserId}
                onChange={(e) => {
                  setTryOpenUserId(e.target.value);
                  setTryOpenDeviceId('');
                  setTryOpenResult(null);
                }}
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </DeviceField>
            <DeviceField label="App device">
              <select
                className="input select-field"
                value={tryOpenDeviceId}
                onChange={(e) => {
                  setTryOpenDeviceId(e.target.value);
                  setTryOpenResult(null);
                }}
                disabled={!tryOpenUserId}
              >
                <option value="">Select device…</option>
                {tryOpenDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.deviceName} ({d.appDeviceId})</option>
                ))}
              </select>
            </DeviceField>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={tryOpenBusy || !tryOpenUserId || !tryOpenDeviceId}
            onClick={() => void handleTryOpen()}
          >
            {tryOpenBusy ? 'Presenting route pass…' : 'Try open with route pass'}
          </button>
          {tryOpenResult ? <TryOpenResultBanner result={tryOpenResult} /> : null}
        </DeviceDetailSection>
      )}

      {isAccessControl ? (
        <DeviceDetailSection
          title="Try with access code"
          description={`Simulates keypad entry against codes pushed via ACCESS_CODE_UPDATE. Validates validity dates and schedule time windows.${storedCodeCount > 0 ? ` ${storedCodeCount} code(s) stored on device.` : ' No codes stored yet — push from cloud first.'}`}
        >
          <div className="device-detail-form-grid device-detail-form-grid-narrow">
            <DeviceField label="Access code">
              <input
                type="text"
                className="input font-mono tracking-widest"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter code…"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setAccessCodeResult(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !accessCodeBusy && accessCode.trim()) {
                    void handleTryAccessCode();
                  }
                }}
              />
            </DeviceField>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={accessCodeBusy || !accessCode.trim()}
            onClick={() => void handleTryAccessCode()}
          >
            {accessCodeBusy ? 'Checking code…' : 'Try with access code'}
          </button>
          {accessCodeResult ? <TryOpenResultBanner result={accessCodeResult} /> : null}
        </DeviceDetailSection>
      ) : null}

      <DeviceDetailSection
        title="Access events"
        description="Fire preset access events to the cloud as if they originated at this device."
      >
        <DeviceInlineAccessEvents
          gatewayId={gateway.id}
          item={item}
          connected={connected}
          onRefresh={onRefresh}
          embedded
        />
      </DeviceDetailSection>
    </div>
  );
}
