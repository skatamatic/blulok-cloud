import type { GatewayRecordSummary } from '@protocol/ipc-channels';

export type GatewaySetupFields = {
  label: string;
  gatewayName: string;
  gatewaySerial: string;
};

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Defaults for a new auto-registering simulated gateway tab. */
export function buildNewGatewayDefaults(opts: {
  facilityName: string;
  tabIndex: number;
}): GatewaySetupFields {
  const n = Math.max(1, opts.tabIndex + 1);
  const suffix = randomSuffix();
  const facility = opts.facilityName.trim() || 'Facility';
  return {
    label: `Gateway ${n}`,
    gatewayName: `${facility} Sim ${n}`,
    gatewaySerial: `SIM-GW-${suffix}`,
  };
}

/** Pre-fill tab, cloud name, and serial from an existing gateway record. */
export function buildExistingGatewayDefaults(
  gateway: GatewayRecordSummary,
  tabIndex: number,
): GatewaySetupFields {
  const n = Math.max(1, tabIndex + 1);
  const name = gateway.name?.trim() || `Gateway ${n}`;
  const serial =
    gateway.mac_address?.trim() ||
    `SIM-GW-${gateway.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  return {
    label: name,
    gatewayName: name,
    gatewaySerial: serial,
  };
}
