import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { DeviceInventoryItem, LockState } from '@protocol/device-kinds';
import {
  buildDeviceSummaryStats,
  inventoryDeviceKey,
  inventoryDeviceLabel,
  isEditableInventoryDevice,
  resolveDevicePresenceStatus,
  isLockShownOpen,
} from '../utils/device-inventory.utils';
import { DeviceKindIcon } from './DeviceKindIcon';
import { DeferredTextInput } from './DeferredInput';
import { DeviceField } from './forms/DeviceField';
import { RangeField } from './forms/RangeField';
import { SegmentedControl, type SegmentOption } from './forms/SegmentedControl';
import { ToggleSwitch } from './forms/ToggleSwitch';

type DeviceCardProps = {
  item: DeviceInventoryItem;
  onPatch: (item: DeviceInventoryItem, patch: Partial<DeviceInventoryItem>) => Promise<void>;
  onRemove: (key: string) => Promise<void>;
  onOpenDetails?: (key: string) => void;
};

const LOCK_STATE_OPTIONS: SegmentOption<LockState>[] = [
  { value: 'CLOSED', label: 'Closed', tone: 'success' },
  { value: 'OPENED', label: 'Open', tone: 'warning' },
  { value: 'ERROR', label: 'Error', tone: 'danger' },
  { value: 'UNKNOWN', label: 'Unknown', tone: 'neutral' },
];

const ACCESS_TYPE_OPTIONS: SegmentOption<'gate' | 'door' | 'elevator'>[] = [
  { value: 'gate', label: 'Gate' },
  { value: 'door', label: 'Door' },
  { value: 'elevator', label: 'Elevator' },
];

function SummaryStats({ stats }: { stats: ReturnType<typeof buildDeviceSummaryStats> }) {
  return (
    <div className="device-card-stats" aria-label="Device status">
      {stats.map((stat) => (
        <span key={stat.key} className={`device-stat device-stat-${stat.tone ?? 'neutral'}`}>
          {stat.label}
        </span>
      ))}
    </div>
  );
}

function DeviceCardSwitch({
  label,
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <label className="device-card-switch">
      <span className="device-card-switch-label">{label}</span>
      <ToggleSwitch compact checked={checked} labelOn={labelOn} labelOff={labelOff} onChange={onChange} />
    </label>
  );
}

function DeviceCardPrimaryRow({
  label,
  children,
  toggles,
}: {
  label: string;
  children: ReactNode;
  toggles: ReactNode;
}) {
  return (
    <div className="device-card-primary-row">
      <div className="device-card-primary-control">
        <span className="device-card-control-label">{label}</span>
        {children}
      </div>
      <div className="device-card-toggle-cluster">{toggles}</div>
    </div>
  );
}

function DeviceCardEditor({
  item,
  online,
  patch,
}: {
  item: DeviceInventoryItem;
  online: boolean;
  patch: (fields: Partial<DeviceInventoryItem>) => void;
}) {
  return (
    <div className="device-card-controls">
      {item.kind === 'lock' && (
        <>
          <DeviceCardPrimaryRow
            label="Lock state"
            toggles={(
              <DeviceCardSwitch
                label="Online"
                checked={item.online ?? false}
                labelOn="Online"
                labelOff="Offline"
                onChange={(next) => patch({ online: next })}
              />
            )}
          >
            <SegmentedControl
              fullWidth
              muteTones
              options={LOCK_STATE_OPTIONS}
              value={item.state ?? 'UNKNOWN'}
              onChange={(state) =>
                patch({
                  state,
                  locked: state === 'CLOSED',
                })
              }
            />
          </DeviceCardPrimaryRow>

          <div className="device-card-metrics">
            <DeviceField label="Battery" hint="mV">
              <RangeField
                value={item.battery_level}
                min={2500}
                max={4200}
                step={10}
                unit="mV"
                onChange={(battery_level) => patch({ battery_level })}
              />
            </DeviceField>
            <DeviceField label="Signal" hint="dBm">
              <RangeField
                value={item.signal_strength}
                min={-100}
                max={-30}
                step={1}
                unit="dBm"
                onChange={(signal_strength) => patch({ signal_strength })}
              />
            </DeviceField>
          </div>
        </>
      )}

      {item.kind === 'access_control' && (
        <DeviceCardPrimaryRow
          label="Type"
          toggles={(
            <>
              <DeviceCardSwitch
                label="Online"
                checked={item.online ?? false}
                labelOn="Online"
                labelOff="Offline"
                onChange={(next) => patch({ online: next })}
              />
              <DeviceCardSwitch
                label="Locked"
                checked={item.locked ?? false}
                labelOn="Locked"
                labelOff="Unlocked"
                onChange={(locked) => patch({ locked })}
              />
            </>
          )}
        >
          <SegmentedControl
            fullWidth
            muteTones
            options={ACCESS_TYPE_OPTIONS}
            value={item.device_type ?? 'gate'}
            onChange={(device_type) => patch({ device_type })}
          />
        </DeviceCardPrimaryRow>
      )}

      {(item.kind === 'bridge' || item.kind === 'friend_node') && (
        <DeviceCardPrimaryRow
          label="State"
          toggles={(
            <DeviceCardSwitch
              label="Online"
              checked={online}
              labelOn="Online"
              labelOff="Offline"
              onChange={(next) => patch({ online: next })}
            />
          )}
        >
          <DeferredTextInput
            value={(item as { state?: string }).state}
            placeholder="healthy"
            onCommit={(state) => patch({ state })}
          />
        </DeviceCardPrimaryRow>
      )}
    </div>
  );
}

export const DeviceCard = memo(function DeviceCard({
  item,
  onPatch,
  onRemove,
  onOpenDetails,
}: DeviceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const key = inventoryDeviceKey(item);
  const editable = isEditableInventoryDevice(item);
  const presence = resolveDevicePresenceStatus(item);
  const online = presence === 'online';
  const lockOpen = isLockShownOpen(item);
  const summaryStats = useMemo(() => buildDeviceSummaryStats(item), [item]);
  const label = inventoryDeviceLabel(item);

  const patch = useCallback(
    (patchFields: Partial<DeviceInventoryItem>) => void onPatch(item, patchFields),
    [item, onPatch],
  );

  const toggleExpanded = () => {
    if (!editable) return;
    setExpanded((open) => !open);
  };

  return (
    <article
      className={`device-card ${expanded ? 'device-card-expanded' : 'device-card-collapsed'}`}
    >
      <div className="device-card-bar">
        <button
          type="button"
          className={`device-card-toggle ${editable ? 'device-card-toggle-expandable' : 'device-card-toggle-static'}`}
          aria-expanded={editable ? expanded : undefined}
          aria-controls={editable ? `device-panel-${key}` : undefined}
          disabled={!editable}
          onClick={toggleExpanded}
        >
          <DeviceKindIcon kind={item.kind} status={presence} lockOpen={lockOpen} size="sm" />
          <span className="device-card-title" title={label}>
            {label}
          </span>
          <SummaryStats stats={summaryStats} />
          {editable && (
            <ChevronDownIcon
              className={`device-card-chevron ${expanded ? 'device-card-chevron-open' : ''}`}
              aria-hidden
            />
          )}
        </button>

        {editable && (
          <div className="device-card-actions">
            <button
              type="button"
              className="device-card-details-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails?.(key);
              }}
            >
              <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" aria-hidden />
              Details
            </button>
            <button
              type="button"
              className="device-card-remove"
              aria-label={`Remove ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                void onRemove(key);
              }}
            >
              <TrashIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {editable && (
        <div
          className={`device-card-expand ${expanded ? 'device-card-expand-open' : ''}`}
          aria-hidden={!expanded}
        >
          <div className="device-card-expand-inner">
            <div className="device-card-panel" id={`device-panel-${key}`}>
              <DeviceCardEditor item={item} online={online} patch={patch} />
            </div>
          </div>
        </div>
      )}
    </article>
  );
});
