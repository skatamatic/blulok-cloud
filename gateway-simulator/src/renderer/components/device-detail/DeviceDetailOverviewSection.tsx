import type { DeviceInventoryItem, LockState } from '@protocol/device-kinds';
import { DeferredTextInput } from '../DeferredInput';
import { DeviceField } from '../forms/DeviceField';
import { RangeField } from '../forms/RangeField';
import { SegmentedControl, type SegmentOption } from '../forms/SegmentedControl';
import { DeviceDetailKeyRow } from './DeviceDetailKeyRow';
import { DeviceDetailSection } from './DeviceDetailSection';
import { DeviceDetailSwitch } from './DeviceDetailSwitch';
import type { DeviceDetailSectionProps } from './device-detail.types';

const LOCK_STATE_OPTIONS: SegmentOption<LockState>[] = [
  { value: 'CLOSED', label: 'Closed', tone: 'success' },
  { value: 'OPENED', label: 'Open', tone: 'warning' },
  { value: 'ERROR', label: 'Error', tone: 'danger' },
  { value: 'UNKNOWN', label: 'Unknown', tone: 'neutral' },
];

export function DeviceDetailOverviewSection({ item, sim, applyUpdate }: DeviceDetailSectionProps) {
  return (
    <div className="device-detail-stack">
      <DeviceDetailSection
        title="Identity & binding"
        description="Cloud-facing identifiers and editable binding fields for this simulated device."
      >
        <div className="device-detail-form-grid">
          <div className="device-detail-grid-span-full">
            <DeviceDetailKeyRow label="Facility ID" value={sim.facilityId} />
          </div>

          {item.kind === 'lock' && (
            <>
              <DeviceDetailKeyRow label="Lock ID" value={item.lock_id} />
              <DeviceField label="Lock number">
                <DeferredTextInput
                  value={String(item.lock_number ?? 1)}
                  onCommit={(v) => void applyUpdate({
                    inventoryPatch: { lock_number: Number.parseInt(v, 10) || 1 } as Partial<DeviceInventoryItem>,
                  })}
                />
              </DeviceField>
            </>
          )}

          {item.kind === 'access_control' && (
            <>
              <DeviceDetailKeyRow label="Access ID" value={item.access_id} />
              <DeviceField label="Relay channel">
                <DeferredTextInput
                  value={String(item.relay_channel ?? 1)}
                  onCommit={(v) => void applyUpdate({
                    inventoryPatch: { relay_channel: Number.parseInt(v, 10) || 1 } as Partial<DeviceInventoryItem>,
                  })}
                />
              </DeviceField>
            </>
          )}

          {(item.kind === 'bridge' || item.kind === 'friend_node') && (
            <DeviceDetailKeyRow label="Serial" value={item.serial} />
          )}
        </div>
      </DeviceDetailSection>

      <DeviceDetailSection
        title="Telemetry"
        description="Adjust reported device state — changes sync to the cloud on the next inventory push."
      >
        {item.kind === 'lock' && (
          <>
            <DeviceField label="Lock state" span="full">
              <SegmentedControl
                fullWidth
                muteTones
                options={LOCK_STATE_OPTIONS}
                value={item.state ?? 'UNKNOWN'}
                onChange={(state) =>
                  void applyUpdate({
                    inventoryPatch: { state, locked: state === 'CLOSED' } as Partial<DeviceInventoryItem>,
                  })
                }
              />
            </DeviceField>

            <div className="device-detail-form-grid device-detail-form-grid-metrics">
              <DeviceField label="Battery" hint="mV">
                <RangeField
                  value={item.battery_level}
                  min={2500}
                  max={4200}
                  step={10}
                  unit="mV"
                  onChange={(battery_level) => void applyUpdate({ inventoryPatch: { battery_level } as Partial<DeviceInventoryItem> })}
                />
              </DeviceField>
              <DeviceField label="Signal" hint="dBm">
                <RangeField
                  value={item.signal_strength}
                  min={-100}
                  max={-30}
                  step={1}
                  unit="dBm"
                  onChange={(signal_strength) => void applyUpdate({ inventoryPatch: { signal_strength } as Partial<DeviceInventoryItem> })}
                />
              </DeviceField>
              <DeviceField label="Temperature" hint={item.temperature_unit ?? '°C'}>
                <DeferredTextInput
                  value={item.temperature_value != null ? String(item.temperature_value) : ''}
                  placeholder="optional"
                  onCommit={(v) => void applyUpdate({
                    inventoryPatch: {
                      temperature_value: v.trim() ? Number.parseFloat(v) : undefined,
                      temperature_unit: item.temperature_unit ?? '°C',
                    } as Partial<DeviceInventoryItem>,
                  })}
                />
              </DeviceField>
              <DeviceField label="Firmware">
                <DeferredTextInput
                  value={item.firmware_version}
                  onCommit={(firmware_version) => void applyUpdate({ inventoryPatch: { firmware_version } as Partial<DeviceInventoryItem> })}
                />
              </DeviceField>
            </div>
          </>
        )}

        {item.kind === 'access_control' && (
          <div className="device-detail-form-grid">
            <DeviceField label="Firmware">
              <DeferredTextInput
                value={item.firmware_version}
                onCommit={(firmware_version) => void applyUpdate({ inventoryPatch: { firmware_version } as Partial<DeviceInventoryItem> })}
              />
            </DeviceField>
          </div>
        )}

        {(item.kind === 'bridge' || item.kind === 'friend_node') && (
          <div className="device-detail-form-grid">
            <DeviceField label="State">
              <DeferredTextInput
                value={item.state}
                onCommit={(state) => void applyUpdate({ inventoryPatch: { state } as Partial<DeviceInventoryItem> })}
              />
            </DeviceField>
          </div>
        )}

        <div className="device-detail-status-row">
          <DeviceDetailSwitch
            label="Online"
            checked={item.online ?? false}
            labelOn="Online"
            labelOff="Offline"
            onChange={(online) => void applyUpdate({ inventoryPatch: { online } as Partial<DeviceInventoryItem> })}
          />
          {item.kind === 'access_control' && (
            <DeviceDetailSwitch
              label="Locked"
              checked={item.locked ?? false}
              labelOn="Locked"
              labelOff="Unlocked"
              onChange={(locked) => void applyUpdate({ inventoryPatch: { locked } as Partial<DeviceInventoryItem> })}
            />
          )}
        </div>

        <div className="device-detail-form-grid">
          <DeviceField label="Error code">
            <DeferredTextInput
              value={sim.errorCode ?? ''}
              placeholder="optional"
              onCommit={(errorCode) => void applyUpdate({ simPatch: { errorCode: errorCode.trim() || undefined } })}
            />
          </DeviceField>
          <div className="device-detail-grid-span-full">
            <DeviceField label="Error message">
              <DeferredTextInput
                value={sim.errorMessage ?? ''}
                placeholder="optional"
                onCommit={(errorMessage) => void applyUpdate({ simPatch: { errorMessage: errorMessage.trim() || undefined } })}
              />
            </DeviceField>
          </div>
        </div>

        {(sim.lastSecureTimeSyncAt || sim.lastSecureTimeSyncTs != null) && (
          <p className="device-detail-footnote">
            Last secure time sync: {sim.lastSecureTimeSyncAt ?? sim.lastSecureTimeSyncTs}
          </p>
        )}
      </DeviceDetailSection>
    </div>
  );
}
