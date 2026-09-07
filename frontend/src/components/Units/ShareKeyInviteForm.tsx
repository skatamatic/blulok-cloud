import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';
import {
  detailsBtnPrimarySm,
  detailsBtnSecondarySm,
  detailsFormLabelClass,
  detailsInputClass,
} from '@/components/Common/details-page.styles';
import { datetimeLocalToIso } from '@/utils/datetime.utils';
import {
  isValidShareInvitePhone,
  type ShareKeyAccessLevel,
} from '@/utils/shareKeyInvite.utils';

interface ShareKeyInviteFormProps {
  unitId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
  submitLabel?: string;
}

export function ShareKeyInviteForm({
  unitId,
  onSuccess,
  onCancel,
  showCancel = true,
  submitLabel = 'Send invite',
}: ShareKeyInviteFormProps) {
  const { addToast } = useToast();
  const [phone, setPhone] = useState('');
  const [accessLevel, setAccessLevel] = useState<ShareKeyAccessLevel>('limited');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!unitId) return;
    if (!isValidShareInvitePhone(phone)) {
      addToast({ type: 'error', title: 'Enter a valid phone number (E.164 preferred)' });
      return;
    }
    const expiresIso = expiresAt ? datetimeLocalToIso(expiresAt) : undefined;
    if (expiresAt && !expiresIso) {
      addToast({ type: 'error', title: 'Enter a valid expiration date and time' });
      return;
    }
    try {
      setSubmitting(true);
      await apiService.inviteSharedKey({
        unit_id: unitId,
        phone: phone.trim(),
        access_level: accessLevel,
        ...(expiresIso ? { expires_at: expiresIso } : {}),
      });
      addToast({ type: 'success', title: 'Invite sent successfully' });
      setPhone('');
      setAccessLevel('limited');
      setExpiresAt('');
      onSuccess?.();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } } };
      const msg =
        err?.response?.data?.error || err?.response?.data?.message || 'Failed to send invite';
      addToast({ type: 'error', title: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={detailsFormLabelClass}>Phone number</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
          className={detailsInputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Use international format; US numbers may be entered without +1.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={detailsFormLabelClass}>Access level</label>
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as ShareKeyAccessLevel)}
            className={detailsInputClass}
          >
            <option value="full">Full</option>
            <option value="limited">Limited</option>
            <option value="temporary">Temporary</option>
            <option value="permanent">Permanent</option>
          </select>
        </div>
        <div>
          <label className={detailsFormLabelClass}>Expires at (optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={detailsInputClass}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {showCancel && onCancel && (
          <button type="button" onClick={onCancel} className={detailsBtnSecondarySm}>
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!phone.trim() || submitting}
          className={detailsBtnPrimarySm}
        >
          {submitting ? 'Sending…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
