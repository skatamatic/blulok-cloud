export const DEVICE_DETAIL_TABS = [
  { id: 'overview', label: 'Overview', hint: 'Identity, binding, and live telemetry' },
  { id: 'security', label: 'Security', hint: 'Trust keys, denylist, and keypad codes' },
  { id: 'simulate', label: 'Simulate', hint: 'Route pass and access events' },
  { id: 'activity', label: 'Activity', hint: 'Inbound command log' },
] as const;

export type DeviceDetailTabId = (typeof DEVICE_DETAIL_TABS)[number]['id'];
