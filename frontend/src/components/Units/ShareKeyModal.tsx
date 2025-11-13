import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { useToast } from '@/contexts/ToastContext';
import { apiService } from '@/services/api.service';

interface ShareKeyModalProps {
  isOpen: boolean;
  unitId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShareKeyModal({ isOpen, unitId, onClose, onSuccess }: ShareKeyModalProps) {
  const { addToast } = useToast();
  const [phone, setPhone] = useState('');
  const [accessLevel, setAccessLevel] = useState<'full' | 'limited' | 'temporary' | 'permanent'>('limited');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPhone('');
      setAccessLevel('limited');
      setExpiresAt('');
    }
  }, [isOpen]);

  const isValidPhone = (value: string) => {
    const raw = (value || '').trim();
    if (!raw) return false;
    const digits = raw.replace(/\D/g, '');
    return raw.startsWith('+') ? digits.length >= 10 : digits.length >= 10; // client-side hint only
  };

  const handleSubmit = async () => {
    if (!unitId) return;
    if (!isValidPhone(phone)) {
      addToast({ type: 'error', title: 'Enter a valid phone number (E.164 preferred)' });
      return;
    }
    try {
      setSubmitting(true);
      await apiService.inviteSharedKey({
        unit_id: unitId,
        phone: phone.trim(),
        access_level: accessLevel,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      });
      addToast({ type: 'success', title: 'Invite sent successfully' });
      onSuccess();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'Failed to send invite';
      addToast({ type: 'error', title: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Share Key Access</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Invite a user by phone to access this unit.</p>
      </div>
      <div className="px-6 py-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone (E.164)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15551234567"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use full international format; US numbers may be entered without +1.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Access Level</label>
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as any)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="full">Full</option>
            <option value="limited">Limited</option>
            <option value="temporary">Temporary</option>
            <option value="permanent">Permanent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expires At (optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!phone || submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send Invite'}
        </button>
      </div>
    </Modal>
  );
}


