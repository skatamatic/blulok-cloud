import { get, post, put } from './httpClient';

export async function getSystemSettings() {
  return get('/system-settings');
}

export async function updateSystemSettings(settings: object) {
  return put('/system-settings', settings);
}

export async function getNotificationSettings() {
  return get('/system-settings/notifications');
}

export async function updateNotificationSettings(config: object) {
  return put('/system-settings/notifications', config);
}

export async function sendTestNotifications(payload?: { toEmail?: string; toPhone?: string; configOverride?: object }) {
  return post<{ success: boolean; message: string; sent?: string[]; errors?: { channel: string; message: string }[]; toEmail?: string; toPhone?: string }>('/system-settings/notifications/test', payload || {});
}

export async function testNotificationConnection(payload?: { configOverride?: object }) {
  return post<{ success: boolean; message: string }>('/system-settings/notifications/test-connection', payload || {});
}
