/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WidgetSizeDropdown } from '@/components/Widget/WidgetSizeDropdown';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { WidgetSize } from '@/types/widget.types';

type DropdownProps = {
  widgetId: string;
  currentSize: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  enhancedMenu?: ReactNode;
  onRemove?: () => void;
};

function renderDropdown(props: Partial<DropdownProps> & { omitRemove?: boolean } = {}) {
  const onSizeChange = jest.fn();
  const onRemove = jest.fn();
  const {
    omitRemove,
    availableSizes = [
      'small',
      'medium',
      'large',
      'dock-top',
      'dock-bottom',
      'dock-left',
      'dock-right',
      'dock-bottom-two-thirds',
      'dock-full',
    ] as WidgetSize[],
    currentSize = 'medium' as WidgetSize,
    enhancedMenu,
    ...rest
  } = props;

  const view = render(
    <DropdownProvider>
      <div className="group">
        <WidgetSizeDropdown
          widgetId="w-1"
          currentSize={currentSize}
          availableSizes={availableSizes}
          onSizeChange={onSizeChange}
          onRemove={omitRemove ? undefined : onRemove}
          enhancedMenu={enhancedMenu}
          {...rest}
        />
      </div>
    </DropdownProvider>
  );
  return { ...view, onSizeChange, onRemove };
}

describe('WidgetSizeDropdown', () => {
  it('renders nothing when there is no menu content', () => {
    const { container } = render(
      <DropdownProvider>
        <WidgetSizeDropdown
          widgetId="empty"
          currentSize="medium"
          availableSizes={['small', 'medium']}
          onSizeChange={jest.fn()}
        />
      </DropdownProvider>
    );
    expect(container.querySelector('[aria-label="Widget options"]')).toBeNull();
  });

  it('opens menu and selects a dock size', async () => {
    const { onSizeChange } = renderDropdown({ currentSize: 'medium' });

    fireEvent.click(screen.getByLabelText('Widget options'));

    expect(await screen.findByText('Dock layout')).toBeInTheDocument();
    expect(screen.getByText('Dock — Top half')).toBeInTheDocument();
    expect(screen.getByText('Dock — Full page')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dock — Left half'));
    expect(onSizeChange).toHaveBeenCalledWith('dock-left');
  });

  it('shows undock when currently docked and standard sizes exist', async () => {
    const { onSizeChange } = renderDropdown({ currentSize: 'dock-top' });

    fireEvent.click(screen.getByLabelText('Widget options'));
    expect(await screen.findByText('Undock')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Undock'));
    expect(onSizeChange).toHaveBeenCalledWith('small');
  });

  it('removes widget from the menu', async () => {
    const { onRemove } = renderDropdown();

    fireEvent.click(screen.getByLabelText('Widget options'));
    fireEvent.click(await screen.findByText('Remove Widget'));

    expect(onRemove).toHaveBeenCalled();
  });

  it('renders enhanced configuration section', async () => {
    renderDropdown({
      enhancedMenu: <div>Custom config panel</div>,
    });

    fireEvent.click(screen.getByLabelText('Widget options'));

    expect(await screen.findByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Custom config panel')).toBeInTheDocument();
  });

  it('toggles closed when clicking the button again', async () => {
    renderDropdown();

    const button = screen.getByLabelText('Widget options');
    fireEvent.click(button);
    expect(await screen.findByText('Dock layout')).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByText('Dock layout')).not.toBeInTheDocument();
    });
  });
});
