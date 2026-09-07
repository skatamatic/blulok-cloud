/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewSettingsPanel } from '@/components/Widget/facility-viewer/ViewSettingsPanel';
import { ThemeProvider } from '@/contexts/ThemeContext';

function renderPanel(
  props: Partial<React.ComponentProps<typeof ViewSettingsPanel>> = {}
) {
  const onDraftChange = jest.fn();
  const onApply = jest.fn();
  const onCancel = jest.fn();
  render(
    <ThemeProvider>
      <div className="relative h-[480px] w-[720px]">
        <ViewSettingsPanel
          isOpen
          skyPreset="blank"
          groundPreset="blank"
          onDraftChange={onDraftChange}
          onApply={onApply}
          onCancel={onCancel}
          {...props}
        />
      </div>
    </ThemeProvider>
  );
  return { onDraftChange, onApply, onCancel };
}

describe('ViewSettingsPanel', () => {
  it('renders sky and ground preset sections with fine tune panel', () => {
    renderPanel();
    expect(screen.getAllByText('Sky').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Ground').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Fine tune')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Daytime/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Grass/i })).toBeInTheDocument();
  });

  it('calls onDraftChange when a preset card is selected', () => {
    const { onDraftChange } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Sunset/i }));
    expect(onDraftChange).toHaveBeenCalledWith({ skyPreset: 'sunset' });

    fireEvent.click(screen.getByRole('button', { name: /^Grid/i }));
    expect(onDraftChange).toHaveBeenCalledWith({ groundPreset: 'grid' });
  });

  it('shows contextual sky controls for procedural presets', () => {
    renderPanel({ skyPreset: 'day' });
    expect(screen.getByText('Sun elevation')).toBeInTheDocument();
    expect(screen.getByText('Sun azimuth')).toBeInTheDocument();
  });

  it('patches environmentOptions when a fine tune slider changes', () => {
    const { onDraftChange } = renderPanel({ skyPreset: 'day' });
    const slider = screen.getByLabelText(/Sun elevation/i);
    fireEvent.change(slider, { target: { value: '42' } });
    expect(onDraftChange).toHaveBeenCalledWith({
      environmentOptions: {
        sky: { sunElevation: 42 },
      },
    });
  });

  it('shows woodland scenery controls for the woodland ground preset', () => {
    renderPanel({ groundPreset: 'woodland' });
    expect(screen.getByText('Woodland scenery')).toBeInTheDocument();
    expect(screen.getByText('Tree density')).toBeInTheDocument();
  });

  it('calls onApply when OK is clicked', () => {
    const { onApply } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const { onCancel } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables local terrain preset when facility has no terrain config', () => {
    renderPanel({ hasTerrain: false });
    const localButton = screen.getByRole('button', { name: /Local Terrain/i });
    expect(localButton).toBeDisabled();
    expect(localButton).toHaveAttribute(
      'title',
      'Set up local terrain in the BluDesign editor'
    );
  });

  it('enables local terrain preset when facility has terrain config', () => {
    renderPanel({ hasTerrain: true });
    const localButton = screen.getByRole('button', { name: /Local Terrain/i });
    expect(localButton).not.toBeDisabled();
  });
});
