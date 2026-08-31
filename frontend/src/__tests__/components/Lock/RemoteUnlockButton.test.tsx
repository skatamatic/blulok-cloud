/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { RemoteUnlockButton } from '@/components/Lock/RemoteUnlockButton';

describe('RemoteUnlockButton', () => {
  it('uses primary tone by default when unlock is available', () => {
    render(
      <RemoteUnlockButton
        lockStatus="locked"
        hasDevice
        remoteSupported
        onUnlock={jest.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Unlock$/i });
    expect(btn.className).toContain('btn-primary');
    expect(btn.className).not.toContain('btn-warning');
  });

  it('uses warning tone when override is required', () => {
    render(
      <RemoteUnlockButton
        lockStatus="locked"
        hasDevice
        remoteSupported
        tone="warning"
        onUnlock={jest.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Unlock$/i });
    expect(btn.className).toContain('btn-warning');
    expect(btn).toHaveAttribute('title', expect.stringMatching(/override/i));
  });
});
