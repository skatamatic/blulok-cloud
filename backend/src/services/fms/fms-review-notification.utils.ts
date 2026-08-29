/**
 * Operator-facing copy when FMS sync/webhook changes need review.
 * Keeps dashboard notifications and webhook pushes on the same wording.
 */

const OPAQUE_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const MAX_PROBLEM_SUMMARIES = 2;

export type FmsReviewableChange = {
  is_valid?: boolean | number | null;
  impact_summary?: string | null;
  validation_errors?: string[] | null;
};

export function sanitizeFmsReviewProblem(text: string): string {
  return text.replace(OPAQUE_ID_RE, 'another FMS record').replace(/\s+/g, ' ').trim();
}

export function collectFmsReviewProblems(changes: FmsReviewableChange[]): {
  invalidCount: number;
  problemSummaries: string[];
} {
  const seen = new Set<string>();
  const problemSummaries: string[] = [];
  let invalidCount = 0;

  for (const change of changes) {
    if (change.is_valid !== false && change.is_valid !== 0) {
      continue;
    }
    invalidCount += 1;
    const raw = change.validation_errors?.find((error) => error?.trim()) || change.impact_summary;
    if (!raw) continue;
    const cleaned = sanitizeFmsReviewProblem(raw);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    problemSummaries.push(cleaned);
    if (problemSummaries.length >= MAX_PROBLEM_SUMMARIES) {
      break;
    }
  }

  return { invalidCount, problemSummaries };
}

export type FmsPendingReviewNotification = {
  title: string;
  message: string;
  statusLabel: string;
  autoApplyBlocked: boolean;
};

export function buildFmsPendingReviewNotification(options: {
  facilityName: string;
  pendingCount: number;
  changesDetected: number;
  changesApplied?: number;
  autoApplyAttempted: boolean;
  problemSummaries?: string[];
  source: 'sync' | 'webhook';
  eventLabel?: string;
}): FmsPendingReviewNotification {
  const problems = (options.problemSummaries ?? [])
    .map(sanitizeFmsReviewProblem)
    .filter(Boolean);
  const applied = Math.max(0, options.changesApplied ?? 0);
  const autoApplyBlocked = problems.length > 0 || options.autoApplyAttempted;
  const title = options.source === 'webhook' ? 'FMS Update Push' : 'FMS Changes Need Review';

  if (!autoApplyBlocked) {
    const count = options.pendingCount;
    const appliedNote =
      options.changesDetected > count && applied > 0
        ? ` ${applied} change${applied === 1 ? ' was' : 's were'} applied.`
        : '';
    const lead =
      options.source === 'webhook' && options.eventLabel
        ? `${options.facilityName} received a ${options.eventLabel.toLowerCase()} update.`
        : `${options.facilityName}:`;
    return {
      title,
      message: `${lead} ${count} change${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your review before ${count === 1 ? 'it takes' : 'they take'} effect.${appliedNote}`,
      statusLabel: 'Needs your review',
      autoApplyBlocked: false,
    };
  }

  const lead =
    options.source === 'webhook' && options.eventLabel
      ? `${options.facilityName} received a ${options.eventLabel.toLowerCase()} update.`
      : `FMS sync for ${options.facilityName} finished.`;
  const blocked =
    applied > 0
      ? ` Automatic sync applied ${applied} change${applied === 1 ? '' : 's'} but did not finish because a problem was detected.`
      : ' Automatic sync did not apply because a problem was detected.';
  const reviewCount = ` ${options.pendingCount} change${options.pendingCount === 1 ? '' : 's'} need${options.pendingCount === 1 ? 's' : ''} your review.`;
  const problem = problems[0] ? ` ${problems[0]}` : '';
  const nextStep = /open review changes/i.test(problem)
    ? ''
    : ' Open Review changes to see the cause and how to fix it.';

  return {
    title,
    message: `${lead}${blocked}${reviewCount}${problem}${nextStep}`,
    statusLabel:
      applied > 0 ? `${applied} applied · automatic sync stopped` : 'Automatic sync did not apply',
    autoApplyBlocked: true,
  };
}
