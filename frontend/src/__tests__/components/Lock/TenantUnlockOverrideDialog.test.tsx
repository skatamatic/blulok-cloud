/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TenantUnlockOverrideDialog } from '@/components/Lock/TenantUnlockOverrideDialog';

describe('TenantUnlockOverrideDialog', () => {
  it('keeps Unlock anyway disabled until a reason is selected', () => {
    const onConfirm = jest.fn();
    render(
      <TenantUnlockOverrideDialog
        isOpen
        unitLabel="A-101"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Unlock anyway/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Tenant locked phone in unit/i));
    expect(screen.getByRole('button', { name: /Unlock anyway/i })).not.toBeDisabled();
  });

  it('submits selected reason and optional notes', async () => {
    const onConfirm = jest.fn();
    render(
      <TenantUnlockOverrideDialog
        isOpen
        unitLabel="A-101"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Emergency \(Fire, flood, other\)/i));
    fireEvent.change(screen.getByLabelText(/Notes/i), {
      target: { value: ' Water under door ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Unlock anyway/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        reason: 'emergency',
        notes: 'Water under door',
      });
    });
  });

  it('calls onCancel', () => {
    const onCancel = jest.fn();
    render(
      <TenantUnlockOverrideDialog isOpen onConfirm={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('re-hydrates reason and notes from initialDraft', () => {
    render(
      <TenantUnlockOverrideDialog
        isOpen
        initialDraft={{ reason: 'testing_maintenance', notes: 'Scheduled PM' }}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/Testing and\/or Maintenance/i)).toBeChecked();
    expect(screen.getByLabelText(/Notes/i)).toHaveValue('Scheduled PM');
    expect(screen.getByRole('button', { name: /Unlock anyway/i })).not.toBeDisabled();
  });
});
