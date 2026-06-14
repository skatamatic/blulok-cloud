import { useCallback, useState } from 'react';
import { PromptDialog, type PromptField } from '@/components/Common/PromptDialog';

export interface OpenPromptOptions {
  title: string;
  message?: string;
  fields: PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
}

export function usePromptDialog() {
  const [promptState, setPromptState] = useState<
    (OpenPromptOptions & { resolve: (values: Record<string, string> | null) => void }) | null
  >(null);

  const openPrompt = useCallback((options: OpenPromptOptions) => {
    return new Promise<Record<string, string> | null>((resolve) => {
      setPromptState({ ...options, resolve });
    });
  }, []);

  const closePrompt = useCallback((values: Record<string, string> | null) => {
    setPromptState((current) => {
      current?.resolve(values);
      return null;
    });
  }, []);

  const promptDialog = promptState ? (
    <PromptDialog
      isOpen
      title={promptState.title}
      message={promptState.message}
      fields={promptState.fields}
      confirmLabel={promptState.confirmLabel}
      cancelLabel={promptState.cancelLabel}
      onConfirm={(values) => closePrompt(values)}
      onCancel={() => closePrompt(null)}
    />
  ) : null;

  return { openPrompt, promptDialog };
}
