/**
 * @jest-environment jsdom
 */
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SecretField } from '@/pages/settings/notifications/SecretField';
import { SECRET_MASK } from '@/types/notification.types';

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SecretField id="secret" label="Password" value={value} onChange={setValue} />
      <span data-testid="value">{value}</span>
    </>
  );
}

describe('SecretField', () => {
  it('clears the mask on focus so a new secret can be typed', () => {
    render(<Harness initial={SECRET_MASK} />);
    const input = screen.getByLabelText('Password');

    fireEvent.focus(input);

    expect(screen.getByTestId('value').textContent).toBe('');
  });

  it('restores the mask when a stored secret is left blank', () => {
    render(<Harness initial={SECRET_MASK} />);
    const input = screen.getByLabelText('Password');

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(screen.getByTestId('value').textContent).toBe(SECRET_MASK);
  });

  it('keeps a newly typed secret on blur', () => {
    render(<Harness initial={SECRET_MASK} />);
    const input = screen.getByLabelText('Password');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'new-secret' } });
    fireEvent.blur(input);

    expect(screen.getByTestId('value').textContent).toBe('new-secret');
  });

  it('does not invent a mask for a field that never had a secret', () => {
    render(<Harness initial="" />);
    const input = screen.getByLabelText('Password');

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(screen.getByTestId('value').textContent).toBe('');
  });
});
