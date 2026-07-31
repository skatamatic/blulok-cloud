import {
  FMSApplyErrorDetail,
  FMSChange,
  FMSChangeApplicationResult,
  FMSChangeType,
} from '@/types/fms.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEGACY_ERROR_RE =
  /^Failed to apply (?<changeType>[a-z_]+) for (?<externalId>[^:]+):\s*(?<message>.+)$/i;

const MAX_REASON_GROUPS = 3;
const MAX_EXAMPLE_LABELS = 3;

const KNOWN_REASON_SHORTCUTS: Array<{ match: RegExp; label: string }> = [
  {
    match: /cannot change unit status while tenants are assigned/i,
    label: "can't change status while tenants are assigned",
  },
  {
    match: /cannot set unit to occupied without a tenant/i,
    label: 'need a tenant before marking occupied',
  },
];

const CHANGE_TYPE_NOUN: Record<FMSChangeType, { singular: string; plural: string }> = {
  [FMSChangeType.TENANT_ADDED]: { singular: 'tenant add', plural: 'tenant adds' },
  [FMSChangeType.TENANT_REMOVED]: { singular: 'tenant removal', plural: 'tenant removals' },
  [FMSChangeType.TENANT_UPDATED]: { singular: 'tenant update', plural: 'tenant updates' },
  [FMSChangeType.TENANT_UNIT_CHANGED]: {
    singular: 'tenant unit change',
    plural: 'tenant unit changes',
  },
  [FMSChangeType.UNIT_ADDED]: { singular: 'unit add', plural: 'unit adds' },
  [FMSChangeType.UNIT_REMOVED]: { singular: 'unit removal', plural: 'unit removals' },
  [FMSChangeType.UNIT_UPDATED]: { singular: 'unit update', plural: 'unit updates' },
  [FMSChangeType.UNIT_OVERLOCK_CHANGED]: {
    singular: 'overlock change',
    plural: 'overlock changes',
  },
};

export type FmsApplyFailureToast = {
  title: string;
  message: string;
  toastType: 'warning' | 'error';
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function humanizeReason(message: string): string {
  const trimmed = message.trim();
  for (const shortcut of KNOWN_REASON_SHORTCUTS) {
    if (shortcut.match.test(trimmed)) {
      return shortcut.label;
    }
  }
  // Drop trailing instructional sentences for toast brevity.
  const firstSentence = trimmed.split(/(?<=\.)\s+/)[0] ?? trimmed;
  return firstSentence.replace(/\.$/, '').trim().toLowerCase();
}

function changeTypeNoun(changeType: string, count: number): string {
  const known = CHANGE_TYPE_NOUN[changeType as FMSChangeType];
  if (known) {
    return count === 1 ? known.singular : known.plural;
  }
  const words = changeType.replace(/_/g, ' ');
  return count === 1 ? words : `${words}s`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function labelFromChange(change: FMSChange): string | null {
  const after = asRecord(change.after_data);
  const before = asRecord(change.before_data);
  const candidates = [
    after?.unitNumber,
    before?.unitNumber,
    after?.email,
    before?.email,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !isUuid(candidate)) {
      return candidate.trim();
    }
  }
  const first =
    (typeof after?.firstName === 'string' && after.firstName) ||
    (typeof before?.firstName === 'string' && before.firstName) ||
    '';
  const last =
    (typeof after?.lastName === 'string' && after.lastName) ||
    (typeof before?.lastName === 'string' && before.lastName) ||
    '';
  const name = `${first} ${last}`.trim();
  if (name && !isUuid(name)) return name;
  if (change.external_id && !isUuid(change.external_id)) return change.external_id;
  return null;
}

function enrichDetailsFromChanges(
  details: FMSApplyErrorDetail[],
  changes?: FMSChange[],
): FMSApplyErrorDetail[] {
  if (!changes?.length) return details;
  const byId = new Map(changes.map((c) => [c.id, c]));
  return details.map((detail) => {
    if (detail.entityLabel && !isUuid(detail.entityLabel) && detail.entityLabel !== 'a unit' && detail.entityLabel !== 'a tenant') {
      return detail;
    }
    const change = byId.get(detail.changeId);
    if (!change) return detail;
    const label = labelFromChange(change);
    return label ? { ...detail, entityLabel: label } : detail;
  });
}

function parseLegacyErrors(errors: string[]): FMSApplyErrorDetail[] {
  return errors.flatMap((raw, index) => {
    const match = LEGACY_ERROR_RE.exec(raw);
    if (!match?.groups) {
      return [
        {
          changeId: `legacy-${index}`,
          changeType: FMSChangeType.UNIT_UPDATED,
          entityType: 'unit' as const,
          externalId: '',
          entityLabel: '',
          message: raw,
        },
      ];
    }
    const changeType = match.groups.changeType as FMSChangeType;
    const entityType = changeType.startsWith('tenant') ? 'tenant' : 'unit';
    return [
      {
        changeId: `legacy-${index}`,
        changeType,
        entityType,
        externalId: match.groups.externalId?.trim() ?? '',
        entityLabel: '',
        message: match.groups.message?.trim() ?? raw,
      },
    ];
  });
}

function collectDetails(
  result: FMSChangeApplicationResult,
  changes?: FMSChange[],
): FMSApplyErrorDetail[] {
  if (result.errorDetails && result.errorDetails.length > 0) {
    return enrichDetailsFromChanges(result.errorDetails, changes);
  }
  if (result.errors.length > 0) {
    return parseLegacyErrors(result.errors);
  }
  return [];
}

function buildReasonSummary(details: FMSApplyErrorDetail[]): string {
  const byReason = new Map<string, { count: number; changeType: string }>();
  for (const detail of details) {
    const reason = humanizeReason(detail.message);
    const existing = byReason.get(reason);
    if (existing) {
      existing.count += 1;
    } else {
      byReason.set(reason, { count: 1, changeType: detail.changeType });
    }
  }

  const sorted = [...byReason.entries()].sort((a, b) => b[1].count - a[1].count);
  const top = sorted.slice(0, MAX_REASON_GROUPS);
  const remainingGroups = sorted.length - top.length;

  const parts = top.map(([reason, { count }]) => `${count} ${reason}`);
  let summary = parts.join('; ');
  if (remainingGroups > 0) {
    summary += `; and ${remainingGroups} other issue${remainingGroups !== 1 ? 's' : ''}`;
  }
  return summary;
}

function dominantChangeNoun(details: FMSApplyErrorDetail[]): string {
  const counts = new Map<string, number>();
  for (const detail of details) {
    counts.set(detail.changeType, (counts.get(detail.changeType) ?? 0) + 1);
  }
  let topType = details[0]?.changeType ?? FMSChangeType.UNIT_UPDATED;
  let topCount = 0;
  for (const [type, count] of counts) {
    if (count > topCount) {
      topType = type as FMSChangeType;
      topCount = count;
    }
  }
  return changeTypeNoun(topType, details.length);
}

function exampleLabels(details: FMSApplyErrorDetail[]): string | null {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const detail of details) {
    const label = detail.entityLabel?.trim();
    if (!label || isUuid(label) || label === 'a unit' || label === 'a tenant') continue;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= MAX_EXAMPLE_LABELS) break;
  }
  if (labels.length === 0) return null;
  return `Examples: ${labels.join(', ')}`;
}

/**
 * Build a short, human-friendly toast for FMS apply failures.
 * Prefers structured errorDetails; falls back to parsing legacy errors[].
 */
export function formatFmsApplyFailureToast(
  result: FMSChangeApplicationResult,
  selectedCount?: number,
  changes?: FMSChange[],
): FmsApplyFailureToast {
  const failed = result.changesFailed || result.errors.length || result.errorDetails?.length || 0;
  const applied = result.changesApplied;
  const total = selectedCount ?? applied + failed;
  const toastType: 'warning' | 'error' = applied > 0 ? 'warning' : 'error';
  const title = applied > 0 ? 'Some Changes Failed' : 'Apply Failed';

  const details = collectDetails(result, changes);

  if (details.length === 0) {
    const count = failed || 1;
    return {
      title,
      toastType,
      message:
        applied > 0
          ? `Applied ${applied} of ${total} change${total !== 1 ? 's' : ''}. ${count} change${count !== 1 ? 's' : ''} failed to apply. Open the review list for details.`
          : `${count} change${count !== 1 ? 's' : ''} failed to apply. Open the review list for details.`,
    };
  }

  const noun = dominantChangeNoun(details);
  const reasonSummary = buildReasonSummary(details);
  const head =
    applied > 0
      ? `Applied ${applied} of ${total} change${total !== 1 ? 's' : ''}. `
      : total > 0 && applied === 0
        ? `${total} change${total !== 1 ? 's' : ''} couldn’t be applied. `
        : '';

  const failureClause = `${details.length} ${noun} failed: ${reasonSummary}.`;
  const examples = exampleLabels(details);
  const message = `${head}${failureClause}${examples ? ` ${examples}.` : ''}`.trim();

  return { title, toastType, message };
}
