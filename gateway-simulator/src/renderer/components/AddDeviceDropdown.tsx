import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { GatewayInventoryKind } from '@protocol/device-kinds';
import { ADD_DEVICE_KIND_OPTIONS } from '../utils/device-icon.utils';
import { DeviceKindIcon } from './DeviceKindIcon';

type Props = {
  onSelect: (kind: GatewayInventoryKind) => void | Promise<void>;
  disabled?: boolean;
};

export function AddDeviceDropdown({ onSelect, disabled }: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<GatewayInventoryKind | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  const handleSelect = async (kind: GatewayInventoryKind) => {
    if (busyKind) return;
    setBusyKind(kind);
    try {
      await onSelect(kind);
      close();
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <div ref={rootRef} className="add-device-menu">
      <button
        type="button"
        className="add-device-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        disabled={disabled || !!busyKind}
        onClick={() => setOpen((prev) => !prev)}
      >
        <PlusIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span>Add device</span>
        <ChevronDownIcon
          className={`add-device-trigger-chevron h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div id={menuId} className="add-device-menu-panel" role="menu" aria-label="Choose device type">
          {ADD_DEVICE_KIND_OPTIONS.map((option) => {
            const { kind, label, description } = option;
            const busy = busyKind === kind;

            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className="add-device-menu-item"
                disabled={!!busyKind}
                aria-busy={busy}
                onClick={() => void handleSelect(kind)}
              >
                <DeviceKindIcon kind={kind} status="online" size="md" title={label} />
                <span className="add-device-menu-copy">
                  <span className="add-device-menu-label">{label}</span>
                  <span className="add-device-menu-description">{description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
