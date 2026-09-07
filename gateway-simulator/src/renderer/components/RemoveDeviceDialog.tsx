import type { DeviceInventoryItem } from '@protocol/device-kinds';
import { ConfirmDialog } from './ConfirmDialog';
import { inventoryDeviceLabel, KIND_LABELS } from '../utils/device-inventory.utils';

type Props = {
  device: DeviceInventoryItem | null;
  isLoading?: boolean;
  dontAskAgain: boolean;
  onDontAskAgainChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveDeviceDialog({
  device,
  isLoading,
  dontAskAgain,
  onDontAskAgainChange,
  onConfirm,
  onCancel,
}: Props) {
  const label = device ? inventoryDeviceLabel(device) : '';

  return (
    <ConfirmDialog
      isOpen={device !== null}
      title="Remove device?"
      confirmLabel="Remove device"
      cancelLabel="Keep device"
      confirmTone="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
      dontAskAgain={{
        checked: dontAskAgain,
        onChange: onDontAskAgainChange,
        label: "Don't ask me again this session",
      }}
      message={
        <>
          <span className="font-medium text-gray-900 dark:text-white">{label}</span>
          {' will be removed from this gateway inventory. The cloud will be updated on the next inventory sync.'}
        </>
      }
    >
      {device && (
        <div className="confirm-dialog-detail-card">
          <div className="confirm-dialog-detail-row">
            <span className="confirm-dialog-detail-label">Kind</span>
            <span className="confirm-dialog-detail-value">{KIND_LABELS[device.kind]}</span>
          </div>
          <div className="confirm-dialog-detail-row">
            <span className="confirm-dialog-detail-label">Identifier</span>
            <span className="confirm-dialog-detail-value font-mono text-xs">{label}</span>
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
}
