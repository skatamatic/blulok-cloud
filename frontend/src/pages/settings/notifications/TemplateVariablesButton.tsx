import { useState } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { TemplateVariablesModal } from './TemplateVariablesModal';

interface TemplateVariablesButtonProps {
  channel: 'sms' | 'email';
}

export function TemplateVariablesButton({ channel }: TemplateVariablesButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Template variables"
        title="Template variables"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-primary-950/40 dark:hover:text-primary-300"
      >
        <InformationCircleIcon className="h-5 w-5" />
      </button>
      <TemplateVariablesModal
        isOpen={open}
        onClose={() => setOpen(false)}
        channel={channel}
      />
    </>
  );
}
