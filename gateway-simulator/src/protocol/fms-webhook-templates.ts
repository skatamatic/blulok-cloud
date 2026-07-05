export type WebhookPayloadFormat = 'cloudevents' | 'flat';

export type WebhookTemplateFieldType = 'text' | 'email' | 'datetime' | 'boolean';

export type WebhookTemplateField = {
  key: string;
  label: string;
  path: string;
  type: WebhookTemplateFieldType;
  required?: boolean;
  placeholder?: string;
};

export type WebhookTemplateContext = {
  externalFacilityId: string;
  eventId?: string;
  timestamp?: string;
};

export type WebhookEventTemplate = {
  id: string;
  label: string;
  eventType: string;
  format: WebhookPayloadFormat;
  providerTypes: string[];
  fields: WebhookTemplateField[];
  buildDefaultValues: (ctx: WebhookTemplateContext) => Record<string, string | boolean>;
  buildPayload: (values: Record<string, string | boolean>, ctx: WebhookTemplateContext) => unknown;
};

const STOREDGE_PROVIDER = 'storedge';
const SIMULATED_PROVIDER = 'simulated';
const GENERIC_REST_PROVIDER = 'generic_rest';

function isoNow(): string {
  return new Date().toISOString();
}

function defaultEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = current[part];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function valuesFromPayload(payload: unknown, fields: WebhookTemplateField[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = getAtPath(payload, field.path);
    if (raw === undefined || raw === null) continue;
    if (field.type === 'boolean') {
      out[field.key] = Boolean(raw);
    } else {
      out[field.key] = String(raw);
    }
  }
  return out;
}

function applyFieldValues(
  skeleton: Record<string, unknown>,
  fields: WebhookTemplateField[],
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(skeleton)) as Record<string, unknown>;
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === '') continue;
    setAtPath(result, field.path, field.type === 'boolean' ? value === true || value === 'true' : value);
  }
  return result;
}

function storedgeTemplate(
  id: string,
  label: string,
  eventType: string,
  bodyFields: WebhookTemplateField[],
  defaultBody: (ctx: WebhookTemplateContext) => Record<string, unknown>,
): WebhookEventTemplate {
  const fields: WebhookTemplateField[] = [
    { key: 'eventId', label: 'Event ID', path: 'id', type: 'text', required: true },
    { key: 'time', label: 'Time', path: 'time', type: 'datetime', required: true },
    ...bodyFields,
  ];

  return {
    id,
    label,
    eventType,
    format: 'cloudevents',
    providerTypes: [STOREDGE_PROVIDER],
    fields,
    buildDefaultValues(ctx) {
      const eventId = ctx.eventId ?? defaultEventId();
      const time = ctx.timestamp ?? isoNow();
      const body = defaultBody(ctx);
      const values: Record<string, string | boolean> = {
        eventId,
        time,
      };
      for (const field of bodyFields) {
        const raw = body[field.path.replace(/^body\./, '')] ?? getAtPath({ body }, field.path);
        if (raw !== undefined && raw !== null) {
          values[field.key] = field.type === 'boolean' ? Boolean(raw) : String(raw);
        }
      }
      return values;
    },
    buildPayload(values, ctx) {
      const eventId = String(values.eventId || ctx.eventId || defaultEventId());
      const time = String(values.time || ctx.timestamp || isoNow());
      const skeleton: Record<string, unknown> = {
        id: eventId,
        time,
        type: eventType,
        body: defaultBody(ctx),
      };
      return applyFieldValues(skeleton, fields, values);
    },
  };
}

function flatTemplate(
  id: string,
  label: string,
  eventType: string,
  dataFields: WebhookTemplateField[],
  defaultData: (ctx: WebhookTemplateContext) => Record<string, unknown>,
): WebhookEventTemplate {
  const fields: WebhookTemplateField[] = [
    { key: 'eventId', label: 'Event ID', path: 'id', type: 'text', required: true },
    { key: 'timestamp', label: 'Timestamp', path: 'timestamp', type: 'datetime', required: true },
    { key: 'facilityId', label: 'Facility ID (external)', path: 'facility_id', type: 'text', required: true },
    ...dataFields,
  ];

  return {
    id,
    label,
    eventType,
    format: 'flat',
    providerTypes: [SIMULATED_PROVIDER, GENERIC_REST_PROVIDER],
    fields,
    buildDefaultValues(ctx) {
      const data = defaultData(ctx);
      const values: Record<string, string | boolean> = {
        eventId: ctx.eventId ?? defaultEventId(),
        timestamp: ctx.timestamp ?? isoNow(),
        facilityId: ctx.externalFacilityId,
      };
      for (const field of dataFields) {
        const raw = getAtPath({ data }, field.path);
        if (raw !== undefined && raw !== null) {
          values[field.key] = field.type === 'boolean' ? Boolean(raw) : String(raw);
        }
      }
      return values;
    },
    buildPayload(values, ctx) {
      const skeleton: Record<string, unknown> = {
        id: String(values.eventId || ctx.eventId || defaultEventId()),
        event_type: eventType,
        timestamp: String(values.timestamp || ctx.timestamp || isoNow()),
        facility_id: String(values.facilityId || ctx.externalFacilityId),
        data: defaultData(ctx),
      };
      return applyFieldValues(skeleton, fields, values);
    },
  };
}

const tenantBodyFields: WebhookTemplateField[] = [
  { key: 'facilityId', label: 'Facility ID (external)', path: 'body.facility_id', type: 'text', required: true },
  { key: 'tenantId', label: 'Tenant ID', path: 'body.tenant_id', type: 'text', required: true },
  { key: 'firstName', label: 'First name', path: 'body.first_name', type: 'text' },
  { key: 'lastName', label: 'Last name', path: 'body.last_name', type: 'text' },
  { key: 'email', label: 'Email', path: 'body.email', type: 'email' },
  { key: 'phone', label: 'Phone', path: 'body.phone', type: 'text' },
];

const ledgerBodyFields: WebhookTemplateField[] = [
  { key: 'facilityId', label: 'Facility ID (external)', path: 'body.facility_id', type: 'text', required: true },
  { key: 'ledgerId', label: 'Ledger ID', path: 'body.ledger_id', type: 'text', required: true },
  { key: 'tenantId', label: 'Tenant ID', path: 'body.tenant_id', type: 'text', required: true },
  { key: 'unitId', label: 'Unit ID', path: 'body.unit_id', type: 'text', required: true },
  { key: 'moveInDate', label: 'Move-in date', path: 'body.move_in_date', type: 'datetime' },
];

const unitIdBodyFields: WebhookTemplateField[] = [
  { key: 'facilityId', label: 'Facility ID (external)', path: 'body.facility_id', type: 'text', required: true },
  { key: 'unitId', label: 'Unit ID', path: 'body.unit_id', type: 'text', required: true },
];

const flatTenantFields: WebhookTemplateField[] = [
  { key: 'tenantId', label: 'Tenant ID', path: 'data.tenant_id', type: 'text', required: true },
  { key: 'firstName', label: 'First name', path: 'data.first_name', type: 'text' },
  { key: 'lastName', label: 'Last name', path: 'data.last_name', type: 'text' },
  { key: 'email', label: 'Email', path: 'data.email', type: 'email' },
];

const flatLedgerFields: WebhookTemplateField[] = [
  { key: 'ledgerId', label: 'Ledger ID', path: 'data.ledger_id', type: 'text', required: true },
  { key: 'tenantId', label: 'Tenant ID', path: 'data.tenant_id', type: 'text', required: true },
  { key: 'unitId', label: 'Unit ID', path: 'data.unit_id', type: 'text', required: true },
];

const flatUnitFields: WebhookTemplateField[] = [
  { key: 'unitId', label: 'Unit ID', path: 'data.unit_id', type: 'text', required: true },
];

export const FMS_WEBHOOK_TEMPLATES: WebhookEventTemplate[] = [
  storedgeTemplate('storedge-tenant-created', 'Tenant created', 'com.storedge.tenant.created.v1', tenantBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    tenant_id: 'tenant-demo-001',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@example.com',
  })),
  storedgeTemplate('storedge-tenant-updated', 'Tenant updated', 'com.storedge.tenant.updated.v1', tenantBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    tenant_id: 'tenant-demo-001',
    first_name: 'Jane',
    last_name: 'Doe-Updated',
    email: 'jane.doe@example.com',
  })),
  storedgeTemplate('storedge-ledger-moved-in', 'Ledger moved in', 'com.storedge.ledger.moved-in.v1', ledgerBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    ledger_id: 'ledger-demo-001',
    tenant_id: 'tenant-demo-001',
    unit_id: 'unit-demo-001',
    move_in_date: isoNow(),
  })),
  storedgeTemplate('storedge-ledger-moved-out', 'Ledger moved out', 'com.storedge.ledger.moved-out.v1', ledgerBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    ledger_id: 'ledger-demo-001',
    tenant_id: 'tenant-demo-001',
    unit_id: 'unit-demo-001',
  })),
  storedgeTemplate('storedge-unit-created', 'Unit created', 'com.storedge.unit.created.v1', unitIdBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    unit_id: 'unit-demo-001',
  })),
  storedgeTemplate('storedge-unit-deleted', 'Unit deleted', 'com.storedge.unit.deleted.v1', unitIdBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    unit_id: 'unit-demo-001',
  })),
  storedgeTemplate('storedge-overlock-applied', 'Overlock applied', 'com.storedge.unit.overlock-applied.v1', unitIdBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    unit_id: 'unit-demo-001',
  })),
  storedgeTemplate('storedge-overlock-removed', 'Overlock removed', 'com.storedge.unit.overlock-removed.v1', unitIdBodyFields, (ctx) => ({
    facility_id: ctx.externalFacilityId,
    unit_id: 'unit-demo-001',
  })),

  flatTemplate('flat-tenant-created', 'Tenant created', 'tenant.created', flatTenantFields, (ctx) => ({
    tenant_id: 'tenant-demo-001',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@example.com',
  })),
  flatTemplate('flat-tenant-updated', 'Tenant updated', 'tenant.updated', flatTenantFields, (ctx) => ({
    tenant_id: 'tenant-demo-001',
    first_name: 'Jane',
    last_name: 'Doe-Updated',
    email: 'jane.doe@example.com',
  })),
  flatTemplate('flat-ledger-moved-in', 'Ledger moved in', 'ledger.moved-in', flatLedgerFields, () => ({
    ledger_id: 'ledger-demo-001',
    tenant_id: 'tenant-demo-001',
    unit_id: 'unit-demo-001',
  })),
  flatTemplate('flat-ledger-moved-out', 'Ledger moved out', 'ledger.moved-out', flatLedgerFields, () => ({
    ledger_id: 'ledger-demo-001',
    tenant_id: 'tenant-demo-001',
    unit_id: 'unit-demo-001',
  })),
  flatTemplate('flat-unit-created', 'Unit created', 'unit.created', flatUnitFields, () => ({
    unit_id: 'unit-demo-001',
  })),
  flatTemplate('flat-unit-deleted', 'Unit deleted', 'unit.deleted', flatUnitFields, () => ({
    unit_id: 'unit-demo-001',
  })),
  flatTemplate('flat-overlock-applied', 'Overlock applied', 'unit.overlock-applied', flatUnitFields, () => ({
    unit_id: 'unit-demo-001',
  })),
  flatTemplate('flat-overlock-removed', 'Overlock removed', 'unit.overlock-removed', flatUnitFields, () => ({
    unit_id: 'unit-demo-001',
  })),
];

export function listTemplatesForProvider(providerType: string): WebhookEventTemplate[] {
  const normalized = providerType.toLowerCase();
  return FMS_WEBHOOK_TEMPLATES.filter((t) => t.providerTypes.includes(normalized));
}

export function getTemplateById(templateId: string): WebhookEventTemplate | undefined {
  return FMS_WEBHOOK_TEMPLATES.find((t) => t.id === templateId);
}

export function parseTemplatePayload(
  template: WebhookEventTemplate,
  payload: unknown,
): Record<string, string | boolean> {
  return valuesFromPayload(payload, template.fields);
}

export function buildTemplateContextFromConfig(config: {
  customSettings?: { facilityId?: string };
  providerType?: string;
}): WebhookTemplateContext {
  const externalFacilityId =
    (config.customSettings?.facilityId as string | undefined) ??
    (config as { facilityId?: string }).facilityId ??
    'external-facility-id';
  return { externalFacilityId };
}
