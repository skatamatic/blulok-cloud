/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FullscreenWidgetView } from '@/components/Dashboard/FullscreenWidgetView';

describe('FullscreenWidgetView', () => {
  it('renders nothing when closed', () => {
    render(
      <FullscreenWidgetView isOpen={false} onExit={() => {}}>
        <div>contents</div>
      </FullscreenWidgetView>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders contents and back button when open', () => {
    render(
      <FullscreenWidgetView isOpen onExit={() => {}} widgetTitle="Units Manager">
        <div data-testid="content">contents</div>
      </FullscreenWidgetView>
    );

    expect(screen.getByRole('dialog', { name: /Units Manager.*fullscreen/i })).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit fullscreen/i })).toBeInTheDocument();
  });

  it('calls onExit when the back button is clicked', () => {
    const onExit = jest.fn();
    render(
      <FullscreenWidgetView isOpen onExit={onExit}>
        <div>contents</div>
      </FullscreenWidgetView>
    );
    fireEvent.click(screen.getByRole('button', { name: /Exit fullscreen/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('calls onExit when Escape is pressed', () => {
    const onExit = jest.fn();
    render(
      <FullscreenWidgetView isOpen onExit={onExit}>
        <div>contents</div>
      </FullscreenWidgetView>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape when closed', () => {
    const onExit = jest.fn();
    render(
      <FullscreenWidgetView isOpen={false} onExit={onExit}>
        <div>contents</div>
      </FullscreenWidgetView>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });
});
