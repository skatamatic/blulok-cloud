/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewSettingsModal } from '@/components/Widget/facility-viewer/ViewSettingsModal';
import { ThemeProvider } from '@/contexts/ThemeContext';

function renderModal(
  props: Partial<React.ComponentProps<typeof ViewSettingsModal>> = {}
) {
  const onChange = jest.fn();
  const onClose = jest.fn();
  render(
    <ThemeProvider>
      <ViewSettingsModal
        isOpen
        onClose={onClose}
        skyPreset="blank"
        groundPreset="blank"
        onChange={onChange}
        {...props}
      />
    </ThemeProvider>
  );
  return { onChange, onClose };
}

describe('ViewSettingsModal', () => {
  it('renders sky and ground preset sections', () => {
    renderModal();
    expect(screen.getByText('Sky')).toBeInTheDocument();
    expect(screen.getByText('Ground')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Daytime/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Grass/i })).toBeInTheDocument();
  });

  it('calls onChange when a preset card is selected', () => {
    const { onChange } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Sunset/i }));
    expect(onChange).toHaveBeenCalledWith({ skyPreset: 'sunset' });

    fireEvent.click(screen.getByRole('button', { name: /^Grid/i }));
    expect(onChange).toHaveBeenCalledWith({ groundPreset: 'grid' });
  });

  it('closes when Done is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
