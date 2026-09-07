export const GATEWAY_PANEL_TABS = [
  { id: 'devices', label: 'Devices', hint: 'Inventory, state & access events' },
  { id: 'connection', label: 'Connection', hint: 'WebSocket & provisioning' },
  { id: 'behavior', label: 'Behavior', hint: 'Command response modes' },
  { id: 'settings', label: 'Settings', hint: 'Name, serial & identity' },
  { id: 'logs', label: 'Logs', hint: 'Protocol event stream' },
] as const;

export type GatewayPanelTabId = (typeof GATEWAY_PANEL_TABS)[number]['id'];

const TAB_STORAGE_KEY = 'simulator.gatewayPanelTab';

export function readGatewayPanelTab(): GatewayPanelTabId {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw === 'access') return 'devices';
    if (raw && GATEWAY_PANEL_TABS.some((t) => t.id === raw)) {
      return raw as GatewayPanelTabId;
    }
  } catch {
    // ignore
  }
  return 'devices';
}

export function writeGatewayPanelTab(tab: GatewayPanelTabId): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

export function isGatewayPanelTabId(value: string): value is GatewayPanelTabId {
  return GATEWAY_PANEL_TABS.some((t) => t.id === value);
}
