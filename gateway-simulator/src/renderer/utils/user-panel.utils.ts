export const USER_PANEL_TABS = [
  { id: 'session', label: 'Session', hint: 'Cloud JWT & identity' },
  { id: 'devices', label: 'Devices', hint: 'Phones, keys & route passes' },
  { id: 'app', label: 'App', hint: 'Opt-in /ws/app realtime' },
] as const;

export type UserPanelTabId = (typeof USER_PANEL_TABS)[number]['id'];

const TAB_STORAGE_KEY = 'simulator.userPanelTab';

export function readUserPanelTab(): UserPanelTabId {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY);
    if (raw && USER_PANEL_TABS.some((t) => t.id === raw)) {
      return raw as UserPanelTabId;
    }
  } catch {
    // ignore
  }
  return 'session';
}

export function writeUserPanelTab(tab: UserPanelTabId): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

export function isUserPanelTabId(value: string): value is UserPanelTabId {
  return USER_PANEL_TABS.some((t) => t.id === value);
}
