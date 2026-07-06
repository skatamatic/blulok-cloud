export type StatusUnreachableReason =
  | 'gateway_offline'
  | 'gateway_maintenance'
  | 'gateway_error';

const REASON_LABELS: Record<StatusUnreachableReason, string> = {
  gateway_offline: 'Gateway offline — device unreachable',
  gateway_maintenance: 'Gateway in maintenance — device unreachable',
  gateway_error: 'Gateway error — device unreachable',
};

export function statusUnreachableReasonLabel(
  reason: StatusUnreachableReason | string | null | undefined,
): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason as StatusUnreachableReason] ?? String(reason);
}

export function hasReportedStatusMismatch(params: {
  effective?: string | null;
  reported?: string | null;
  reason?: string | null;
}): boolean {
  if (!params.reason) return false;
  const effective = (params.effective ?? '').toLowerCase();
  const reported = (params.reported ?? '').toLowerCase();
  return Boolean(reported) && effective !== reported;
}

/** Resolve effective/reported/reason from API or WS row (unit or device). */
export function resolveReachabilityDisplayFields(source: {
  effectiveStatus?: string | null;
  reportedDeviceStatus?: string | null;
  reportedStatus?: string | null;
  statusUnreachableReason?: string | null;
}): { effective: string; reported: string; reason: string | null } {
  const effective = source.effectiveStatus ?? 'offline';
  const reported =
    source.reportedDeviceStatus ?? source.reportedStatus ?? effective;
  const reason = source.statusUnreachableReason ?? null;
  return { effective, reported, reason };
}
