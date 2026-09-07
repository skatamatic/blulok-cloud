import { useState } from 'react';
import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { ConfirmDialog } from './ConfirmDialog';
import { PanelSection } from './PanelSection';
import { ZtpStickerQrCard } from './ZtpStickerQrCard';

type Props = {
  gateway: GatewayInstanceState;
  embedded?: boolean;
  onChange: () => void;
};

type ConfirmKind = 'localFactory' | 'releaseCloud' | null;

export function ZtpLifecyclePanel({ gateway, embedded, onChange }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const isZtp = gateway.authMode === 'ztp_keypair';
  const waiting = gateway.connectionStatus === 'provisioning';
  const connected = gateway.connectionStatus === 'connected';
  const busyConnect =
    gateway.connectionStatus === 'connecting' || gateway.connectionStatus === 'provisioning';
  const showStickerQr = Boolean(isZtp && gateway.ztpPublicKeyB64 && gateway.gatewayId);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChange();
    } catch (err) {
      toast.error(`${label} failed`, errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmOpen = confirmKind !== null;
  const confirmTitle =
    confirmKind === 'releaseCloud' ? 'Release cloud + factory reset?' : 'Reset to factory (local)?';
  const confirmMessage =
    confirmKind === 'releaseCloud' ? (
      <>
        Releases this gateway in the cloud (unbind facility) and returns the simulator to{' '}
        <strong>provisioning</strong> with the same sticker keys for re-claim.
        {(connected || busyConnect) && (
          <>
            {' '}
            The active WebSocket will disconnect — real firmware also leaves the ops socket after{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-800">ztp_released</code>.
          </>
        )}
      </>
    ) : (
      <>
        Sets lifecycle to <strong>provisioning</strong> locally without calling cloud release. Same
        sticker keys are kept.
        {(connected || busyConnect) && (
          <> The active WebSocket will disconnect so the unit is no longer in an ops session.</>
        )}
      </>
    );

  return (
    <PanelSection embedded={embedded} className="space-y-4">
      <div>
        <h3 className="font-semibold">Cloud auth & provisioning</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Simulate factory sticker ZTP: Connect enters the waiting room; claim greenfield-binds or
          prepares a swap candidate when the facility already has a gateway; release returns the
          device to provisioning with the same sticker keys (and disconnects any live session).
        </p>
      </div>

      <div>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Auth mode</span>
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={gateway.authMode === 'legacy_jwt'}
              disabled={busy || busyConnect || connected}
              onChange={() =>
                void run('Switch auth mode', () =>
                  window.simulator.updateGatewaySettings(gateway.id, { authMode: 'legacy_jwt' }),
                )
              }
            />
            Legacy JWT
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={gateway.authMode === 'ztp_keypair'}
              disabled={busy || busyConnect || connected}
              onChange={() =>
                void run('Switch auth mode', () =>
                  window.simulator.updateGatewaySettings(gateway.id, { authMode: 'ztp_keypair' }),
                )
              }
            />
            ZTP keypair (ECDSA)
          </label>
        </div>
        {(busyConnect || connected) && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Disconnect to change auth mode.</p>
        )}
      </div>

      {isZtp && (
        <>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
            <p className="text-xs uppercase text-gray-500">Lifecycle</p>
            <p className="mt-1 font-medium capitalize">{gateway.ztpLifecyclePhase}</p>
            {waiting && (
              <p className="mt-1 text-xs text-primary-600 dark:text-primary-400">
                In provision WAITING — scan the sticker QR with a real phone, claim via API, or use
                Claim below (works for first install and RMA swap-prep).
              </p>
            )}
            {connected && gateway.sessionRole === 'swap_candidate' && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Parked as swap_candidate — the live gateway session was not replaced. Finish
                Swap/Recovery in the portal to promote this unit.
              </p>
            )}
            {gateway.ztpPublicKeyB64 && (
              <div className="mt-2">
                <p className="text-xs uppercase text-gray-500">Sticker public key</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-gray-700 dark:text-gray-300">
                  {gateway.ztpPublicKeyB64}
                </p>
              </div>
            )}
          </div>

          {showStickerQr && (
            <ZtpStickerQrCard
              deviceId={gateway.gatewayId}
              publicKeyCompressedB64url={gateway.ztpPublicKeyB64!}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !waiting}
              title={!waiting ? 'Connect while in provisioning lifecycle to enter WAITING' : undefined}
              onClick={() => void run('Claim', () => window.simulator.claimZtpGateway(gateway.id))}
            >
              Claim to this facility
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => setConfirmKind('localFactory')}
            >
              Reset to factory (local)
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => setConfirmKind('releaseCloud')}
            >
              Release cloud + factory
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmKind === 'releaseCloud' ? 'Release + reset' : 'Reset to factory'}
        confirmTone={confirmKind === 'releaseCloud' ? 'danger' : 'primary'}
        isLoading={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmKind(null);
        }}
        onConfirm={() => {
          const kind = confirmKind;
          if (!kind) return;
          void (async () => {
            await run(
              kind === 'releaseCloud' ? 'Release + factory' : 'Enter provisioning',
              () =>
                window.simulator.enterProvisioning(gateway.id, {
                  releaseCloud: kind === 'releaseCloud',
                }),
            );
            setConfirmKind(null);
          })();
        }}
      />
    </PanelSection>
  );
}
