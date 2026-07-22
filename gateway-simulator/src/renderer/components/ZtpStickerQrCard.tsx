import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ClipboardDocumentIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { buildZtpClaimUri } from '../utils/ztp-sticker-qr.utils';

type Props = {
  deviceId: string;
  publicKeyCompressedB64url: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const PREVIEW_SIZE = 180;
const OVERLAY_SIZE = 360;

export function ZtpStickerQrCard({ deviceId, publicKeyCompressedB64url }: Props) {
  const uri = buildZtpClaimUri(deviceId, publicKeyCompressedB64url);
  const [copied, setCopied] = useState<'uri' | 'id' | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const markCopied = (which: 'uri' | 'id') => {
    setCopied(which);
    window.setTimeout(() => setCopied((current) => (current === which ? null : current)), 1600);
  };

  const handleCopyUri = () =>
    void copyText(uri).then((ok) => {
      if (ok) markCopied('uri');
    });

  const handleCopyId = () =>
    void copyText(deviceId).then((ok) => {
      if (ok) markCopied('id');
    });

  useEffect(() => {
    if (!enlarged) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setEnlarged(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [enlarged]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          className="group mx-auto shrink-0 rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200 transition hover:ring-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:ring-gray-700 dark:hover:ring-primary-500"
          onClick={() => setEnlarged(true)}
          aria-label="Enlarge sticker QR for scanning"
          title="Click to enlarge for scanning"
        >
          <QRCodeSVG
            value={uri}
            size={PREVIEW_SIZE}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#050505"
            title="Gateway claim sticker QR"
          />
          <span className="mt-2 block text-center text-[10px] font-medium uppercase tracking-wide text-gray-400 transition group-hover:text-primary-600 dark:group-hover:text-primary-400">
            Tap to enlarge
          </span>
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Factory sticker QR</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Scan with a real phone (facility admin Add gateway) while this simulator is in
              provision WAITING. Same payload as a physical sticker — public key only.
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Device ID</p>
            <div className="mt-1 flex items-start gap-2">
              <p className="min-w-0 break-all font-mono text-xs text-gray-800 dark:text-gray-200">
                {deviceId}
              </p>
              <button
                type="button"
                className="btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs"
                onClick={handleCopyId}
                title="Copy device ID"
              >
                {copied === 'id' ? (
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                )}
                {copied === 'id' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Claim URI</p>
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
              {uri}
            </p>
            <button
              type="button"
              className="btn-secondary mt-2 inline-flex items-center gap-1 text-xs"
              onClick={handleCopyUri}
            >
              {copied === 'uri' ? (
                <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
              {copied === 'uri' ? 'URI copied' : 'Copy URI'}
            </button>
          </div>
        </div>
      </div>

      {enlarged &&
        createPortal(
          <div
            className="confirm-dialog-backdrop ztp-qr-enlarge-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEnlarged(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ztp-qr-enlarge-title"
              className="ztp-qr-enlarge-panel"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="ztp-qr-enlarge-title" className="text-base font-semibold text-gray-900 dark:text-white">
                    Scan sticker QR
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Hold the phone steady — ESC or click outside to close
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="btn-secondary !px-2 !py-2"
                  aria-label="Close enlarged QR"
                  onClick={() => setEnlarged(false)}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200">
                <QRCodeSVG
                  value={uri}
                  size={OVERLAY_SIZE}
                  level="M"
                  includeMargin
                  bgColor="#ffffff"
                  fgColor="#050505"
                  title="Enlarged gateway claim sticker QR"
                />
              </div>

              <p className="mt-4 break-all text-center font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {deviceId}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
