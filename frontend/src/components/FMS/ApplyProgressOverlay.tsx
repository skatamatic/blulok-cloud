import { createPortal } from 'react-dom';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export type ApplyProgressOverlayProps = {
  show: boolean;
  percent: number;
  message: string;
  elapsedSec: number;
  remainingSec: number | null;
  title?: string;
};

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/** Full-screen apply progress — portaled above modals (Headless UI Dialog z-index). */
export function ApplyProgressOverlay({
  show,
  percent,
  message,
  elapsedSec,
  remainingSec,
  title = 'Applying FMS changes',
}: ApplyProgressOverlayProps) {
  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-black/50 px-8 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      role="alertdialog"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-8 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col items-center text-center">
          <ArrowPathIcon className="h-12 w-12 animate-spin text-[#147FD4] dark:text-sky-400" />
          <p className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
          <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-[#147FD4] transition-all duration-500 ease-out dark:bg-sky-500"
              style={{ width: `${Math.max(3, Math.min(100, percent))}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{Math.round(percent)}% complete</span>
            <span>Elapsed {formatElapsed(elapsedSec)}</span>
            {remainingSec != null && <span>~{formatElapsed(remainingSec)} remaining</span>}
          </div>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            Large batches may take a minute. Please keep this window open.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
