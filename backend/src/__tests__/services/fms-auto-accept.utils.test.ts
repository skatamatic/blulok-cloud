import { shouldAutoAcceptChanges } from '@/services/fms/fms-auto-accept.utils';

describe('shouldAutoAcceptChanges', () => {
  it('uses autoAcceptChanges for manual sync', () => {
    expect(
      shouldAutoAcceptChanges({ autoAcceptChanges: true, autoAcceptWebhookChanges: false }, 'manual'),
    ).toBe(true);
    expect(
      shouldAutoAcceptChanges({ autoAcceptChanges: false, autoAcceptWebhookChanges: true }, 'manual'),
    ).toBe(false);
  });

  it('prefers autoAcceptWebhookChanges for webhooks when set', () => {
    expect(
      shouldAutoAcceptChanges({ autoAcceptChanges: false, autoAcceptWebhookChanges: true }, 'webhook'),
    ).toBe(true);
    expect(
      shouldAutoAcceptChanges({ autoAcceptChanges: true, autoAcceptWebhookChanges: false }, 'webhook'),
    ).toBe(false);
  });

  it('falls back to autoAcceptChanges for webhooks when webhook flag unset', () => {
    expect(shouldAutoAcceptChanges({ autoAcceptChanges: true }, 'webhook')).toBe(true);
    expect(shouldAutoAcceptChanges({ autoAcceptChanges: false }, 'webhook')).toBe(false);
  });

  it('uses autoAcceptChanges for automatic trigger', () => {
    expect(
      shouldAutoAcceptChanges({ autoAcceptChanges: true, autoAcceptWebhookChanges: false }, 'automatic'),
    ).toBe(true);
  });
});
