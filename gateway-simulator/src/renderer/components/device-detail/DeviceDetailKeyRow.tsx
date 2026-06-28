export function DeviceDetailKeyRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="device-detail-key-row">
      <span className="device-detail-key-label">{label}</span>
      <code className="device-detail-key-value">{value ?? '—'}</code>
    </div>
  );
}
