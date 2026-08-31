import { LockClosedIcon } from '@heroicons/react/24/outline';

interface RecoveryBlockingBannerProps {
  message?: string;
  className?: string;
}

export function RecoveryBlockingBanner({
  message = 'Gateway swap recovery is in progress — this action is blocked until recovery completes or is bypassed.',
  className = '',
}: RecoveryBlockingBannerProps) {
  return (
    <div
      className={`rounded-lg border border-amber-300/60 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 ${className}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <LockClosedIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-amber-900 dark:text-amber-200">{message}</p>
      </div>
    </div>
  );
}

export default RecoveryBlockingBanner;
