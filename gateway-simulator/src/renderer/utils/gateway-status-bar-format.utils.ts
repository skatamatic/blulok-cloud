import type { StatefulPushOperation } from './gateway-status-bar.types';

export function formatPayloadDetails(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function buildFirmwareTooltip(push: StatefulPushOperation): string[] {
  const lines = ['Operation: firmware push', `Phase: ${push.phase}`];
  if (push.pushId) lines.push(`Push ID: ${push.pushId}`);
  if (push.version) lines.push(`Version: ${push.version}`);
  if (push.targetType) lines.push(`Target: ${push.targetType}`);
  if (push.chunkCount != null) {
    lines.push(`Chunks: ${push.chunksReceived ?? 0}/${push.chunkCount}`);
  }
  if (push.error) lines.push(`Error: ${push.error}`);
  return lines;
}

export function buildSnapshotTooltip(push: StatefulPushOperation): string[] {
  const lines = ['Operation: inventory snapshot push', `Phase: ${push.phase}`];
  if (push.pushId) lines.push(`Snapshot ID: ${push.pushId}`);
  if (push.chunkCount != null) {
    lines.push(`Chunks: ${push.chunksReceived ?? 0}/${push.chunkCount}`);
  }
  if (push.error) lines.push(`Error: ${push.error}`);
  return lines;
}

export function formatStatusBarTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
