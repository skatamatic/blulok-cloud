import type { ReactNode } from 'react';

type Props = {
  embedded?: boolean;
  className?: string;
  children: ReactNode;
};

export function PanelSection({ embedded, className = '', children }: Props) {
  const base = embedded ? 'panel-section-block' : 'card';
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}
