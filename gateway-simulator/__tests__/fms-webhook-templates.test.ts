import { describe, expect, it } from 'vitest';
import {
  FMS_WEBHOOK_TEMPLATES,
  buildTemplateContextFromConfig,
  getTemplateById,
  listTemplatesForProvider,
  parseTemplatePayload,
} from '../src/protocol/fms-webhook-templates';

describe('fms-webhook-templates', () => {
  it('lists storedge templates for storedge provider', () => {
    const templates = listTemplatesForProvider('storedge');
    expect(templates.length).toBe(8);
    expect(templates.every((t) => t.format === 'cloudevents')).toBe(true);
  });

  it('lists flat templates for simulated and generic_rest', () => {
    expect(listTemplatesForProvider('simulated').length).toBe(8);
    expect(listTemplatesForProvider('generic_rest').length).toBe(8);
  });

  it('builds storedge tenant.updated payload with external facility id', () => {
    const template = getTemplateById('storedge-tenant-updated');
    expect(template).toBeDefined();
    const ctx = { externalFacilityId: 'ext-fac-123' };
    const values = template!.buildDefaultValues(ctx);
    const payload = template!.buildPayload(values, ctx) as Record<string, unknown>;
    expect(payload.type).toBe('com.storedge.tenant.updated.v1');
    expect((payload.body as Record<string, unknown>).facility_id).toBe('ext-fac-123');
    expect(payload.id).toBeTruthy();
  });

  it('builds flat payload for simulated provider', () => {
    const template = getTemplateById('flat-overlock-applied');
    expect(template).toBeDefined();
    const ctx = { externalFacilityId: 'sim-fac-1' };
    const values = template!.buildDefaultValues(ctx);
    const payload = template!.buildPayload(values, ctx) as Record<string, unknown>;
    expect(payload.event_type).toBe('unit.overlock-applied');
    expect(payload.facility_id).toBe('sim-fac-1');
    expect((payload.data as Record<string, unknown>).unit_id).toBe('unit-demo-001');
  });

  it('round-trips form values from payload', () => {
    const template = getTemplateById('storedge-overlock-applied')!;
    const ctx = { externalFacilityId: 'ext-1' };
    const payload = template.buildPayload(template.buildDefaultValues(ctx), ctx);
    const parsed = parseTemplatePayload(template, payload);
    expect(parsed.facilityId).toBe('ext-1');
    expect(parsed.unitId).toBe('unit-demo-001');
  });

  it('derives context from FMS config customSettings', () => {
    const ctx = buildTemplateContextFromConfig({
      customSettings: { facilityId: 'storedge-ext-99' },
    });
    expect(ctx.externalFacilityId).toBe('storedge-ext-99');
  });

  it('has unique template ids', () => {
    const ids = FMS_WEBHOOK_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
