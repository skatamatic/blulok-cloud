import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Modal, ModalBody, ModalFooter } from '@/components/Modal/Modal';
import {
  NOTIFICATION_TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_GROUPS,
} from '@/constants/notification-template-variables';

interface TemplateVariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: 'sms' | 'email';
}

function token(key: string): string {
  return `{{${key}}}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function TemplateVariablesModal({
  isOpen,
  onClose,
  channel,
}: TemplateVariablesModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const channelLabel = channel === 'email' ? 'email' : 'SMS';

  const handleCopy = async (key: string) => {
    const ok = await copyText(token(key));
    if (!ok) return;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1400);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Template variables">
      <ModalBody>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          Insert a token like <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100">{'{{user_first_name}}'}</code>
          {' '}in the subject or body. Values are filled when the message is sent. Missing data
          becomes blank — nothing is dropped. Facility fields use the recipient’s primary facility
          (the one with the most assigned units, or their first facility assignment). Dates and
          expiry use that facility’s timezone (Pacific / Vancouver if none is set). Use{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-700">{'{{user_phone}}'}</code>
          {' '}for a readable number or{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-700">{'{{user_phone_e164}}'}</code>
          {' '}for +E.164.
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Showing tokens available for {channelLabel}. Click a token to copy it.
        </p>

        <div className="mt-5 max-h-[28rem] space-y-5 overflow-y-auto pr-1">
          {TEMPLATE_VARIABLE_GROUPS.map((group) => {
            const items = NOTIFICATION_TEMPLATE_VARIABLES.filter((item) => item.group === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {group.label}
                </h3>
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                  {items.map((item) => {
                    const emailOnly = item.channels === 'email';
                    const dimmed = emailOnly && channel === 'sms';
                    return (
                      <li
                        key={item.key}
                        className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between ${
                          dimmed ? 'bg-gray-50/80 dark:bg-gray-900/40' : 'bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.label}
                            </span>
                            {emailOnly ? (
                              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
                                Email only
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                            {item.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy(item.key)}
                          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700 transition-colors duration-150 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:bg-primary-950/40 dark:hover:text-primary-200"
                          aria-label={`Copy ${token(item.key)}`}
                        >
                          {copiedKey === item.key ? (
                            <>
                              <CheckIcon className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
                              Copied
                            </>
                          ) : (
                            token(item.key)
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="btn-secondary">
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}
