import { WidgetTypeHelper, WIDGET_TYPES } from '@/types/widget.types';

describe('WidgetTypeHelper.extractWidgetTypeFromId', () => {
  it('maps legacy facilities stats ids to stats-facilities', () => {
    expect(WidgetTypeHelper.extractWidgetTypeFromId('widget_facilities_stats_1')).toBe(
      WIDGET_TYPES['stats-facilities']
    );
  });

  it('maps shared-keys legacy ids without hitting the generic "status" branch', () => {
    expect(WidgetTypeHelper.extractWidgetTypeFromId('dashboard_shared_keys_1')).toBe(
      WIDGET_TYPES['shared-keys']
    );
  });

  it('maps sync FMS widget ids', () => {
    expect(WidgetTypeHelper.extractWidgetTypeFromId('dashboard_syncfms')).toBe(WIDGET_TYPES['sync-fms']);
  });

  it('returns canonical id when already valid', () => {
    const canonical = WIDGET_TYPES['access-history'];
    expect(WidgetTypeHelper.extractWidgetTypeFromId(canonical)).toBe(canonical);
  });

  it('falls back for unknown ids with stats substring', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = WidgetTypeHelper.extractWidgetTypeFromId('custom_stats_widget');
    expect(result).toBe('stats-facilities');
    warn.mockRestore();
  });
});
