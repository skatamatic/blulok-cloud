import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Delete"
        message="Are you sure?"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirms, cancels, and supports danger tone + footer', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        isOpen
        title="Reset account"
        message="This cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Keep"
        confirmTone="danger"
        footerExtra={<span>Extra note</span>}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Extra note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveClass('btn-danger');

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('cancels on Escape and backdrop click unless loading', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const { rerender } = render(
      <ConfirmDialog
        isOpen
        title="Confirm"
        message="Proceed?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onCancel).toHaveBeenCalledTimes(2);

    rerender(
      <ConfirmDialog
        isOpen
        title="Confirm"
        message="Proceed?"
        isLoading
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('disables confirm when confirmDisabled is set', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Confirm"
        message="Proceed?"
        confirmDisabled
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
