import type { GatewayInstanceState } from '@protocol/ipc-channels';

type Props = {
  gateway: GatewayInstanceState;
};

function gatewaySerialDisplay(gateway: GatewayInstanceState): string {
  if (gateway.gatewaySerial?.trim()) return gateway.gatewaySerial.trim();
  return gateway.gatewayId;
}

export function GatewayTabIdentity({ gateway }: Props) {
  const serial = gatewaySerialDisplay(gateway);

  return (
    <div className="gateway-tab-identity" title={`${gateway.label} — ${serial}`}>
      <p className="gateway-tab-identity-label">{gateway.label}</p>
      <p className="gateway-tab-identity-serial">{serial}</p>
    </div>
  );
}
