/**
 * Storable Edge CloudEvents catalog.
 * https://webhooks.storable.io/event-catalog/discover/events
 *
 * Apply: occupancy / identity events BluLok acts on.
 * Ignore: valid catalog events we acknowledge and store but do not apply yet.
 *
 * Lead vs ledger move-in: Storable fires `lead.moved-in` when a reservation
 * converts to occupancy (ledger_id is often still null). `ledger.moved-in`
 * is the rental-account event with a ledger UUID. Both carry tenant_id + unit_id;
 * BluLok applies them through the same assign path. If both arrive, the second
 * assign is a no-op. We do not yet apply lead.created / lead.cancelled.
 */

export type StoredgeApplyEventType =
  | 'tenant.created'
  | 'tenant.updated'
  | 'ledger.moved-in'
  | 'ledger.moved-out'
  | 'unit.created'
  | 'unit.deleted'
  | 'unit.overlock-applied'
  | 'unit.overlock-removed';

export type StoredgeCloudEventType =
  | 'com.storedge.tenant.created.v1'
  | 'com.storedge.tenant.updated.v1'
  | 'com.storedge.ledger.moved-in.v1'
  | 'com.storedge.ledger.moved-out.v1'
  | 'com.storedge.lead.moved-in.v1'
  | 'com.storedge.unit.created.v1'
  | 'com.storedge.unit.deleted.v1'
  | 'com.storedge.unit.overlock-applied.v1'
  | 'com.storedge.unit.overlock-removed.v1'
  | 'com.storedge.lead.created.v1'
  | 'com.storedge.lead.cancelled.v1'
  | 'com.storedge.contact.created.v1'
  | 'com.storedge.contact.updated.v1'
  | 'com.storedge.contact.deleted.v1'
  | 'com.storedge.gate-access.code-changed.v1'
  | 'com.storedge.gate-access.code-enabled.v1'
  | 'com.storedge.gate-access.code-locked-out.v1'
  | 'com.storedge.gate-access.code-terminated.v1'
  | 'com.storedge.insurance.expired.v1'
  | 'com.storedge.insurance.expiring.v1';

export type StoredgeWebhookDisposition = 'apply' | 'ignored';

export type StoredgeWebhookTypeResolution = {
  eventType: string;
  disposition: StoredgeWebhookDisposition;
  applyAs?: StoredgeApplyEventType;
};

const APPLY_TYPE_MAP: Record<string, { eventType: string; applyAs: StoredgeApplyEventType }> = {
  'com.storedge.tenant.created.v1': { eventType: 'tenant.created', applyAs: 'tenant.created' },
  'com.storedge.tenant.updated.v1': { eventType: 'tenant.updated', applyAs: 'tenant.updated' },
  'com.storedge.ledger.moved-in.v1': { eventType: 'ledger.moved-in', applyAs: 'ledger.moved-in' },
  'com.storedge.ledger.moved-out.v1': { eventType: 'ledger.moved-out', applyAs: 'ledger.moved-out' },
  'com.storedge.lead.moved-in.v1': { eventType: 'lead.moved-in', applyAs: 'ledger.moved-in' },
  'com.storedge.unit.created.v1': { eventType: 'unit.created', applyAs: 'unit.created' },
  'com.storedge.unit.deleted.v1': { eventType: 'unit.deleted', applyAs: 'unit.deleted' },
  'com.storedge.unit.overlock-applied.v1': {
    eventType: 'unit.overlock-applied',
    applyAs: 'unit.overlock-applied',
  },
  'com.storedge.unit.overlock-removed.v1': {
    eventType: 'unit.overlock-removed',
    applyAs: 'unit.overlock-removed',
  },
};

const IGNORED_TYPE_LABELS: Record<string, string> = {
  'com.storedge.lead.created.v1': 'lead.created',
  'com.storedge.lead.cancelled.v1': 'lead.cancelled',
  'com.storedge.contact.created.v1': 'contact.created',
  'com.storedge.contact.updated.v1': 'contact.updated',
  'com.storedge.contact.deleted.v1': 'contact.deleted',
  'com.storedge.gate-access.code-changed.v1': 'gate-access.code-changed',
  'com.storedge.gate-access.code-enabled.v1': 'gate-access.code-enabled',
  'com.storedge.gate-access.code-locked-out.v1': 'gate-access.code-locked-out',
  'com.storedge.gate-access.code-terminated.v1': 'gate-access.code-terminated',
  'com.storedge.insurance.expired.v1': 'insurance.expired',
  'com.storedge.insurance.expiring.v1': 'insurance.expiring',
};

/** Short labels for webhook subscribe copy / docs. */
export const STOREDGE_SUBSCRIBE_APPLY_EVENTS = [
  'tenant.created',
  'tenant.updated',
  'ledger.moved-in',
  'ledger.moved-out',
  'lead.moved-in',
  'unit.created',
  'unit.deleted',
  'unit.overlock-applied',
  'unit.overlock-removed',
] as const;

export function shortStoredgeEventType(cloudEventType: string): string {
  return cloudEventType.replace(/^com\.storedge\./, '').replace(/\.v\d+$/, '');
}

export function resolveStoredgeWebhookType(cloudEventType: string): StoredgeWebhookTypeResolution {
  const apply = APPLY_TYPE_MAP[cloudEventType];
  if (apply) {
    return { eventType: apply.eventType, disposition: 'apply', applyAs: apply.applyAs };
  }

  const ignoredLabel = IGNORED_TYPE_LABELS[cloudEventType];
  if (ignoredLabel) {
    return { eventType: ignoredLabel, disposition: 'ignored' };
  }

  return { eventType: shortStoredgeEventType(cloudEventType), disposition: 'ignored' };
}
