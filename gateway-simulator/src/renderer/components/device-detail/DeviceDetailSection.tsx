import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DeviceDetailSection({ title, description, children }: Props) {
  return (
    <section className="device-detail-block">
      <header className="device-detail-block-head">
        <h4 className="device-detail-section-title">{title}</h4>
        {description ? <p className="device-detail-section-desc">{description}</p> : null}
      </header>
      <div className="device-detail-block-body">{children}</div>
    </section>
  );
}
