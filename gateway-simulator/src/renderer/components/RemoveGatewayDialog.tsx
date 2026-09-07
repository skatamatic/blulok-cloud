import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  gateway: GatewayInstanceState | null;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function connectionLabel(status: GatewayInstanceState['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Error';
    default:
      return 'Disconnected';
  }
}

export function RemoveGatewayDialog({ gateway, isLoading, onConfirm, onCancel }: Props) {
  const isConnected = gateway?.connectionStatus === 'connected';
  const deviceCount = gateway?.devices.length ?? 0;

  return (
    <ConfirmDialog
      isOpen={gateway !== null}
      title="Remove gateway?"
      confirmLabel="Remove gateway"
      cancelLabel="Keep gateway"
      confirmTone="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <>
          <span className="font-medium text-gray-900 dark:text-white">{gateway?.label}</span>
          {' will be removed from this simulator. Saved devices, behavior settings, and event history for this instance will be deleted.'}
        </>
      }
    >
      <div className="confirm-dialog-detail-card">
        <div className="confirm-dialog-detail-row">
          <span className="confirm-dialog-detail-label">Facility</span>
          <span className="confirm-dialog-detail-value">{gateway?.facilityName ?? gateway?.facilityId}</span>
        </div>
        <div className="confirm-dialog-detail-row">
          <span className="confirm-dialog-detail-label">Status</span>
          <span className="confirm-dialog-detail-value">
            {gateway ? connectionLabel(gateway.connectionStatus) : '—'}
          </span>
        </div>
        <div className="confirm-dialog-detail-row">
          <span className="confirm-dialog-detail-label">Devices</span>
          <span className="confirm-dialog-detail-value">{deviceCount}</span>
        </div>
      </div>

      {isConnected && (
        <div className="confirm-dialog-warning" role="note">
          <ExclamationTriangleIcon className="confirm-dialog-warning-icon" aria-hidden />
          <p>This gateway is connected. Removing it will end the active simulation session.</p>
        </div>
      )}
    </ConfirmDialog>
  );
}
