import WebSocket from 'ws';
import { wsGatewayProvisionUrl } from '@protocol/constants';
import {
  ZTP_PROVISION_PREFIX,
  buildZtpSignPayload,
  signZtpPayload,
} from '../auth/ztp-keypair.utils';

export type ProvisionWaitingResult = {
  deviceId: string;
  ws: WebSocket;
  waitAssigned: (timeoutMs?: number) => Promise<{
    gatewayId: string;
    facilityId: string;
    sessionRole?: 'active' | 'swap_candidate';
  }>;
  close: () => void;
};

/**
 * Open /ws/gateway-provision, prove key possession, sit in WAITING until claim ASSIGNED.
 */
export async function startGatewayProvision(params: {
  backendUrl: string;
  deviceId: string;
  publicKeyB64: string;
  privateKeyPem: string;
  onLog?: (msg: string) => void;
}): Promise<ProvisionWaitingResult> {
  const url = wsGatewayProvisionUrl(params.backendUrl);
  params.onLog?.(`Connecting provision ${url}`);

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });

  const waitForType = (types: string[], timeoutMs = 15000): Promise<any> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${types.join('|')}`)), timeoutMs);
      const onMsg = (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(String(data));
          if (types.includes(msg?.type)) {
            clearTimeout(timer);
            ws.off('message', onMsg);
            resolve(msg);
          }
          if (msg?.type === 'PROVISION_ERROR') {
            clearTimeout(timer);
            ws.off('message', onMsg);
            reject(new Error(`${msg.code}: ${msg.message}`));
          }
        } catch {
          /* ignore */
        }
      };
      ws.on('message', onMsg);
    });

  ws.send(
    JSON.stringify({
      type: 'PROVISION_HELLO',
      device_id: params.deviceId,
      public_key: params.publicKeyB64,
    }),
  );
  const challenge = await waitForType(['PROVISION_CHALLENGE']);
  const nonce = String(challenge.nonce || '');
  const payload = buildZtpSignPayload(ZTP_PROVISION_PREFIX, nonce, params.deviceId);
  const signature = signZtpPayload(params.privateKeyPem, payload);
  ws.send(JSON.stringify({ type: 'PROVISION_AUTH', signature }));
  await waitForType(['PROVISION_WAITING']);
  params.onLog?.('PROVISION_WAITING — awaiting claim');

  return {
    deviceId: params.deviceId,
    ws,
    waitAssigned: (timeoutMs = 30 * 60_000) =>
      waitForType(['PROVISION_ASSIGNED'], timeoutMs).then((msg) => ({
        gatewayId: String(msg.gatewayId),
        facilityId: String(msg.facilityId),
        sessionRole:
          msg.sessionRole === 'swap_candidate' || msg.sessionRole === 'active'
            ? msg.sessionRole
            : undefined,
      })),
    close: () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
