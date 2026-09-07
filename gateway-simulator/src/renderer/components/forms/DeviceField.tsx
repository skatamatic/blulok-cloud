import type { ReactNode } from 'react';

type Props = {
  label: string;
  hint?: string;
  children: ReactNode;
  span?: 'full';
};

export function DeviceField({ label, hint, children, span }: Props) {
  return (
    <div className={`device-field ${span === 'full' ? 'device-field-full' : ''}`}>
      <div className="device-field-head">
      <span className="device-field-label">{label}</span>
        {hint && <span className="device-field-hint">{hint}</span>}
      </div>
      <div className="device-field-body">{children}</div>
    </div>
  );
}
