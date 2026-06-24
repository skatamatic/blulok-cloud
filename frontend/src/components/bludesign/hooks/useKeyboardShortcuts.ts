/**
 * Keyboard Shortcuts Hook
 * 
 * Manages keyboard shortcuts for the editor.
 */

import { useEffect, useCallback } from 'react';
import { EditorTool } from '../core/types';

interface KeyboardShortcutsOptions {
  enabled?: boolean;
  onToolChange?: (tool: EditorTool) => void;
  onRotateIsometric?: (direction: 'cw' | 'ccw') => void;
  onRotateOrientation?: (direction: 'cw' | 'ccw') => void;
  onRotateSelection?: (direction: 'cw' | 'ccw') => void; // Rotate selected objects
  onMoveSelection?: (direction: 'up' | 'down' | 'left' | 'right') => void; // Arrow key movement
  onRotateCamera90?: (direction: 'cw' | 'ccw') => void; // Alt+Left/Alt+Right camera orbit
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
  onAltChange?: (isHeld: boolean) => void; // For controlling camera rotation during placement
  onAlignGridToSelection?: () => void;
  onResetGridAlignment?: () => void;
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
    onAltChange,
    onAlignGridToSelection,
    onResetGridAlignment,
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
    const isAlt = event.altKey;
    const isShift = event.shiftKey;

    // Standard edit shortcuts (Ctrl/Cmd) — must run before tool/camera key handlers
    if (isCtrl && !isAlt) {
      switch (key) {
        case 's':
          if (isShift) {
            onSaveAs?.();
          } else {
            onSave?.();
          }
          event.preventDefault();
          return;
        case 'z':
          if (isShift) {
            onRedo?.();
          } else {
            onUndo?.();
          }
          event.preventDefault();
          return;
        case 'y':
          onRedo?.();
          event.preventDefault();
          return;
      }
    }

    // Tool shortcuts — skip when a modifier would collide with edit/camera bindings
    if (!isAlt && !isShift && !isCtrl) {
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
          // Skip 90-degree rotation when Alt is held - Alt+Q/E does fine rotation via InputCoordinator
          if (isAlt) break;
          // Rotate asset orientation during placement, rotate selection if selected
          if (activeTool === EditorTool.PLACE) {
            onRotateOrientation?.('ccw');
          } else if (hasSelection) {
            onRotateSelection?.('ccw');
          }
          event.preventDefault();
          break;
        case 'e':
          // Skip 90-degree rotation when Alt is held - Alt+Q/E does fine rotation via InputCoordinator
          if (isAlt) break;
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

    // Alt shortcuts (clipboard, file open/new, camera orbit)
    if (isAlt && !isShift && !isCtrl) {
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
        case 'n':
          onNew?.();
          event.preventDefault();
          break;
        case 'o':
          onLoad?.();
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

    // Alt+Shift shortcuts
    if (isAlt && isShift && !isCtrl) {
      switch (key) {
        case 'a':
          onSelectAll?.();
          event.preventDefault();
          break;
        case 'd':
          onDuplicate?.();
          event.preventDefault();
          break;
        case 'g':
          onAlignGridToSelection?.();
          event.preventDefault();
          break;
        case 'r':
          onResetGridAlignment?.();
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
    onAlignGridToSelection,
    onResetGridAlignment,
  ]);

  // Handle Alt key changes for placement mode camera rotation
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Alt') {
      onAltChange?.(false);
    }
  }, [onAltChange]);

  const handleAltKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Alt') {
      onAltChange?.(true);
    }
  }, [onAltChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleAltKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleAltKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleAltKeyDown, handleKeyUp]);
}
