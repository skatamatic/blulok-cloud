/**
 * Contextual editor hotkeys for the help modal and tool-specific hints.
 */

import { EditorTool } from '../core/types';

export interface ContextualHotkey {
  key: string;
  description: string;
  modifier?: 'ctrl' | 'shift' | 'alt' | 'ctrl+shift' | 'ctrl+alt';
}

export interface EditorHelpSection {
  title: string;
  hotkeys: ContextualHotkey[];
}

export const EDITOR_HELP_SECTIONS: EditorHelpSection[] = [
  {
    title: 'Selection',
    hotkeys: [
      { key: 'V', description: 'Select tool' },
      { key: 'Drag', description: 'Box select' },
      { key: 'B', description: 'Building tool' },
      { key: 'Del', description: 'Delete selection' },
      { key: 'C', description: 'Copy', modifier: 'ctrl' },
      { key: 'X', description: 'Cut', modifier: 'ctrl' },
      { key: 'V', description: 'Paste', modifier: 'ctrl' },
    ],
  },
  {
    title: 'Building Selection',
    hotkeys: [
      { key: 'B', description: 'Building tool' },
      { key: 'Drag', description: 'Box select buildings' },
      { key: 'DblClick', description: 'Select building' },
      { key: 'V', description: 'Object select tool' },
      { key: 'Del', description: 'Delete building' },
    ],
  },
  {
    title: 'Placement',
    hotkeys: [
      { key: 'P', description: 'Place tool' },
      { key: 'Q', description: 'Rotate left' },
      { key: 'E', description: 'Rotate right' },
      { key: 'Click', description: 'Place asset' },
      { key: 'Drag', description: 'Line paint / fill area' },
      { key: 'Drag', description: 'Angled row', modifier: 'alt' },
      { key: 'R-Click', description: 'Delete object' },
      { key: 'Esc', description: 'Cancel placement' },
    ],
  },
  {
    title: 'Camera',
    hotkeys: [
      { key: 'Drag', description: 'Rotate camera', modifier: 'ctrl' },
      { key: '←/→', description: 'Orbit 90°', modifier: 'ctrl' },
    ],
  },
  {
    title: 'Grid',
    hotkeys: [
      { key: 'A', description: 'Align grid to selection', modifier: 'ctrl+alt' },
      { key: 'R', description: 'Reset grid axes', modifier: 'ctrl+alt' },
    ],
  },
];

export function getContextTitle(activeTool: EditorTool, isPlacing: boolean): string {
  if (activeTool === EditorTool.PLACE && isPlacing) return 'Placement';
  if (activeTool === EditorTool.SELECT) return 'Selection';
  if (activeTool === EditorTool.SELECT_BUILDING) return 'Building';
  if (activeTool === EditorTool.MOVE) return 'Move';
  return 'Controls';
}

export function getContextualHotkeys(
  activeTool: EditorTool,
  isPlacing: boolean,
  hasSelection: boolean,
  hasClipboard: boolean
): ContextualHotkey[] {
  const items: ContextualHotkey[] = [];

  if (activeTool === EditorTool.PLACE && isPlacing) {
    items.push(
      { key: 'Q', description: 'Rotate left' },
      { key: 'E', description: 'Rotate right' },
      { key: 'Click', description: 'Place asset' },
      { key: 'Drag', description: 'Line paint / fill area' },
      { key: 'Drag', description: 'Angled row', modifier: 'alt' },
      { key: 'R-Click', description: 'Delete object' },
      { key: 'Esc', description: 'Cancel' }
    );
  }

  if (activeTool === EditorTool.SELECT) {
    items.push(
      { key: 'Drag', description: 'Box select' },
      { key: 'B', description: 'Building tool' }
    );

    if (hasSelection) {
      items.push(
        { key: 'Del', description: 'Delete' },
        { key: 'C', description: 'Copy', modifier: 'ctrl' },
        { key: 'X', description: 'Cut', modifier: 'ctrl' }
      );
    }

    if (hasClipboard) {
      items.push({ key: 'V', description: 'Paste', modifier: 'ctrl' });
    }
  }

  if (activeTool === EditorTool.SELECT_BUILDING) {
    items.push(
      { key: 'Drag', description: 'Box select' },
      { key: 'DblClick', description: 'Select building' },
      { key: 'V', description: 'Object select' }
    );

    if (hasSelection) {
      items.push({ key: 'Del', description: 'Delete building' });
    }
  }

  if (
    activeTool === EditorTool.PLACE ||
    activeTool === EditorTool.SELECT ||
    activeTool === EditorTool.SELECT_BUILDING
  ) {
    items.push(
      { key: 'Drag', description: 'Rotate camera', modifier: 'ctrl' },
      { key: '←/→', description: 'Orbit 90°', modifier: 'ctrl' }
    );
  }

  items.push(
    { key: 'A', description: 'Align grid to selection', modifier: 'ctrl+alt' },
    { key: 'R', description: 'Reset grid axes', modifier: 'ctrl+alt' }
  );

  return items;
}
