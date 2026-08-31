import type { AccessEventDenialReason } from '@protocol/access-events';

export type TryOpenInlineResult = {
  at: string;
  granted: boolean;
  message: string;
  denial_reason?: AccessEventDenialReason;
  schedule_name?: string;
};

type TryOpenResultBannerProps = {
  result: TryOpenInlineResult;
};

export function TryOpenResultBanner({ result }: TryOpenResultBannerProps) {
  const tone = result.granted
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
    : 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-100';

  return (
    <div
      className={`mt-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200 ${tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{result.granted ? 'Access granted' : 'Access denied'}</span>
        <time className="text-xs opacity-70" dateTime={result.at}>
          {new Date(result.at).toLocaleTimeString()}
        </time>
      </div>
      <p className="mt-1">{result.message}</p>
      {result.denial_reason ? (
        <p className="mt-1 text-xs opacity-80">Reason: {result.denial_reason.replace(/_/g, ' ')}</p>
      ) : null}
      {result.schedule_name ? (
        <p className="mt-1 text-xs opacity-80">Schedule: {result.schedule_name}</p>
      ) : null}
    </div>
  );
}
