import type { GatewayInstanceState } from '@protocol/ipc-channels';

export type GatewayFacilityGroup = {
  facilityId: string;
  facilityLabel: string;
  gateways: GatewayInstanceState[];
};

export function resolveGatewayFacilityLabel(gateway: GatewayInstanceState): string {
  const name = gateway.facilityName?.trim();
  return name || gateway.facilityId;
}

export function groupGatewaysByFacility(instances: GatewayInstanceState[]): GatewayFacilityGroup[] {
  const groups = new Map<string, GatewayFacilityGroup>();

  for (const gateway of instances) {
    const existing = groups.get(gateway.facilityId);
    if (existing) {
      existing.gateways.push(gateway);
      continue;
    }
    groups.set(gateway.facilityId, {
      facilityId: gateway.facilityId,
      facilityLabel: resolveGatewayFacilityLabel(gateway),
      gateways: [gateway],
    });
  }

  return [...groups.values()].sort((a, b) =>
    a.facilityLabel.localeCompare(b.facilityLabel, undefined, { sensitivity: 'base' }),
  );
}
