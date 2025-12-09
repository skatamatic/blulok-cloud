/**
 * Keyboard Shortcuts Hook
 * 
 * Manages keyboard shortcuts for the editor.
 */

import { useEffect, useCallback } from 'react';
import { EditorTool, CameraMode } from '../core/types';

interface KeyboardShortcutsOptions {
  enabled?: boolean;
  onToolChange?: (tool: EditorTool) => void;
  onRotateIsometric?: (direction: 'cw' | 'ccw') => void;
  onRotateOrientation?: (direction: 'cw' | 'ccw') => void;
  onRotateSelection?: (direction: 'cw' | 'ccw') => void; // Rotate selected objects
  onMoveSelection?: (direction: 'up' | 'down' | 'left' | 'right') => void; // Arrow key movement
  onRotateCamera90?: (direction: 'cw' | 'ccw') => void; // Ctrl+Left/Ctrl+Right camera orbit
  onToggleCameraMode?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onToggleGrid?: () => void;
  onEscape?: () => void;
  onPlaceAsset?: () => void;
  onNew?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onLoad?: () => void;
  activeTool?: EditorTool; // To know if we're in placement mode
  hasSelection?: boolean; // To know if we have objects selected
  onCtrlChange?: (isHeld: boolean) => void; // For controlling camera rotation during placement
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}): void {
  const {
    enabled = true,
    onToolChange,
    onRotateIsometric,
    onRotateOrientation,
    onRotateSelection,
    onMoveSelection,
    onRotateCamera90,
    onToggleCameraMode,
    onDelete,
    onDuplicate,
    onUndo,
    onRedo,
    onCopy,
    onCut,
    onPaste,
    onSelectAll,
    onToggleGrid,
    onEscape,
    onPlaceAsset,
    onNew,
    onSave,
    onSaveAs,
    onLoad,
    activeTool,
    hasSelection,
    onCtrlChange,
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if typing in an input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;

    // Tool shortcuts
    if (!isCtrl && !isShift) {
      switch (key) {
        case 'v':
          onToolChange?.(EditorTool.SELECT);
          event.preventDefault();
          break;
        case 'p':
          onToolChange?.(EditorTool.PLACE);
          event.preventDefault();
          break;
        case 'm':
          onToolChange?.(EditorTool.MOVE);
          event.preventDefault();
          break;
        case 'delete':
        case 'backspace':
          onDelete?.();
          event.preventDefault();
          break;
        case 'b':
          onToolChange?.(EditorTool.SELECT_BUILDING);
          event.preventDefault();
          break;
        case 'q':
          // Rotate asset orientation during placement, rotate selection if selected
          if (activeTool === EditorTool.PLACE) {
            onRotateOrientation?.('ccw');
          } else if (hasSelection) {
            onRotateSelection?.('ccw');
          }
          event.preventDefault();
          break;
        case 'e':
          // Rotate asset orientation during placement, rotate selection if selected
          if (activeTool === EditorTool.PLACE) {
            onRotateOrientation?.('cw');
          } else if (hasSelection) {
            onRotateSelection?.('cw');
          }
          event.preventDefault();
          break;
        case ' ':
        case 'space':
          if (activeTool === EditorTool.PLACE) {
            onPlaceAsset?.();
            event.preventDefault();
          }
          break;
        case 'f':
          onToggleCameraMode?.();
          event.preventDefault();
          break;
        case 'g':
          onToggleGrid?.();
          event.preventDefault();
          break;
        case 'escape':
          onEscape?.();
          event.preventDefault();
          break;
        // Arrow keys for fine movement of selection
        case 'arrowup':
          if (hasSelection) {
            onMoveSelection?.('up');
            event.preventDefault();
          }
          break;
        case 'arrowdown':
          if (hasSelection) {
            onMoveSelection?.('down');
            event.preventDefault();
          }
          break;
        case 'arrowleft':
          if (hasSelection) {
            onMoveSelection?.('left');
            event.preventDefault();
          }
          break;
        case 'arrowright':
          if (hasSelection) {
            onMoveSelection?.('right');
            event.preventDefault();
          }
          break;
      }
    }

    // Ctrl shortcuts
    if (isCtrl && !isShift) {
      switch (key) {
        case 'c':
          onCopy?.();
          event.preventDefault();
          break;
        case 'x':
          onCut?.();
          event.preventDefault();
          break;
        case 'v':
          onPaste?.();
          event.preventDefault();
          break;
        case 'a':
          onSelectAll?.();
          event.preventDefault();
          break;
        case 'd':
          onDuplicate?.();
          event.preventDefault();
          break;
        case 'z':
          onUndo?.();
          event.preventDefault();
          break;
        case 'n':
          onNew?.();
          event.preventDefault();
          break;
        case 'o':
          onLoad?.();
          event.preventDefault();
          break;
        case 's':
          onSave?.();
          event.preventDefault();
          break;
        case 'y':
          onRedo?.();
          event.preventDefault();
          break;
        case 'arrowleft':
          // Rotate camera view counter-clockwise by 90 degrees
          onRotateCamera90?.('ccw');
          event.preventDefault();
          break;
        case 'arrowright':
          // Rotate camera view clockwise by 90 degrees
          onRotateCamera90?.('cw');
          event.preventDefault();
          break;
      }
    }

    // Ctrl+Shift shortcuts
    if (isCtrl && isShift) {
      switch (key) {
        case 'z':
          onRedo?.();
          event.preventDefault();
          break;
        case 's':
          onSaveAs?.();
          event.preventDefault();
          break;
      }
    }
  }, [
    enabled,
    onToolChange,
    onRotateIsometric,
    onRotateOrientation,
    onRotateSelection,
    onMoveSelection,
    onRotateCamera90,
    onToggleCameraMode,
    onDelete,
    onDuplicate,
    onUndo,
    onRedo,
    onCopy,
    onCut,
    onPaste,
    onSelectAll,
    onToggleGrid,
    onEscape,
    onPlaceAsset,
    onNew,
    onSave,
    onSaveAs,
    onLoad,
    activeTool,
    hasSelection,
  ]);

  // Handle Ctrl key changes for placement mode camera rotation
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    // Notify when Ctrl is released
    if (event.key === 'Control' || event.key === 'Meta') {
      onCtrlChange?.(false);
    }
  }, [onCtrlChange]);

  const handleCtrlKeyDown = useCallback((event: KeyboardEvent) => {
    // Notify when Ctrl is pressed
    if (event.key === 'Control' || event.key === 'Meta') {
      onCtrlChange?.(true);
    }
  }, [onCtrlChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleCtrlKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleCtrlKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleCtrlKeyDown, handleKeyUp]);
}

