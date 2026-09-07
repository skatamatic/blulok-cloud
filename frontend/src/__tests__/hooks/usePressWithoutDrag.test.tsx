/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { usePressWithoutDrag } from '@/hooks/usePressWithoutDrag';

function PressButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { pressProps } = usePressWithoutDrag(onPress, { disabled });
  return <div data-testid="press-target" {...pressProps} />;
}

describe('usePressWithoutDrag', () => {
  it('fires onPress once for a pointer tap followed by click', async () => {
    const onPress = jest.fn();
    render(<PressButton onPress={onPress} />);
    const target = screen.getByTestId('press-target');

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 10, clientY: 10 });
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
    fireEvent.click(target);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    render(<PressButton onPress={onPress} disabled />);
    const target = screen.getByTestId('press-target');

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(target);

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire onPress after pointer movement exceeds drag threshold', async () => {
    const onPress = jest.fn();
    render(<PressButton onPress={onPress} />);

    fireEvent.pointerDown(screen.getByTestId('press-target'), {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 30, clientY: 30 });
    await waitFor(() => expect(onPress).not.toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('press-target'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
