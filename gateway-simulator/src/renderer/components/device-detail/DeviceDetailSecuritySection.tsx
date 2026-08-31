import { useMemo } from 'react';
import { DeviceDetailKeyRow } from './DeviceDetailKeyRow';
import { DeviceDetailSection } from './DeviceDetailSection';
import type { DeviceDetailSectionProps } from './device-detail.types';

export function DeviceDetailSecuritySection({ gateway, item, sim }: DeviceDetailSectionProps) {
  const denylistRows = useMemo(() => sim.denylist ?? [], [sim.denylist]);
  const accessCodes = useMemo(() => sim.accessCodes ?? [], [sim.accessCodes]);

  return (
    <div className="device-detail-stack">
      <DeviceDetailSection
        title="Trust keys"
        description="Public trust anchors stored on device firmware. Root private key never lives on the lock — cloud/provisioning tooling holds it and signs ops-key rotation packets verified with root public."
      >
        <div className="device-detail-form-grid">
          <div className="device-detail-grid-span-full">
            <DeviceDetailKeyRow label="Root public key (provisioned)" value={sim.rootKeyPublicB64} />
          </div>
          <div className="device-detail-grid-span-full">
            <DeviceDetailKeyRow label="Operations public key (trusted)" value={sim.operationsKeyPublicB64} />
          </div>
          {sim.operationsKeyRotatedAt && (
            <DeviceDetailKeyRow label="Ops key rotated" value={sim.operationsKeyRotatedAt} />
          )}
          {gateway.opsPublicKey && (
            <div className="device-detail-grid-span-full">
              <DeviceDetailKeyRow label="Gateway AUTH ops key" value={gateway.opsPublicKey} />
            </div>
          )}
        </div>
      </DeviceDetailSection>

      <DeviceDetailSection
        title={`Denylist (${denylistRows.length})`}
        description="Subjects blocked from route-pass access. Populated by DENYLIST_SYNC on connect, DENYLIST_ADD/REMOVE, or inventory sync."
      >
        {denylistRows.length === 0 ? (
          <p className="device-detail-empty">No denylist entries yet.</p>
        ) : (
          <ul className="device-detail-table">
            {denylistRows.map((row) => (
              <li key={row.sub} className="device-detail-table-row">
                <code>{row.sub}</code>
                <span className="text-xs text-gray-500">
                  {row.exp ? `exp ${row.exp}` : 'no exp'}
                  {' · '}
                  {row.addedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DeviceDetailSection>

      {item.kind === 'access_control' && (
        <DeviceDetailSection
          title={`Access codes (${accessCodes.length})`}
          description="Keypad codes stored locally after ACCESS_CODE_UPDATE from the cloud."
        >
          {sim.lastAccessCodePushAt && (
            <p className="device-detail-footnote mb-3">
              Last push: {sim.lastAccessCodePushAt}
              {sim.lastAccessCodeNonce ? ` · nonce ${sim.lastAccessCodeNonce}` : ''}
            </p>
          )}
          {accessCodes.length === 0 ? (
            <p className="device-detail-empty">No codes stored yet.</p>
          ) : (
            <ul className="device-detail-table">
              {accessCodes.map((code, index) => (
                <li key={`${code.code}-${index}`} className="device-detail-table-row">
                  <code>{code.code}</code>
                  <span className="text-xs text-gray-500">
                    until {code.valid_until}
                    {code.valid_from ? ` · from ${code.valid_from}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DeviceDetailSection>
      )}
    </div>
  );
}
