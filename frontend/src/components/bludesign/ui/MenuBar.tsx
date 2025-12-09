/**
 * Menu Bar
 * 
 * Top menu bar with dropdown menus for the BluDesign editor.
 * Uses Portal to ensure dropdowns render above everything.
 * Theme-aware styling.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';

interface MenuItem {
  label?: string;
  onClick?: () => void;
  divider?: boolean;
  disabled?: boolean;
  shortcut?: string;
  header?: boolean; // For section headers (non-clickable)
}

interface MenuDropdownProps {
  label: string;
  items: MenuItem[];
  isDark: boolean;
}

const MenuDropdown: React.FC<MenuDropdownProps> = ({ label, items, isDark }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({ x: rect.left, y: rect.bottom + 4 });
    }
    setOpen(true);
  }, []);

  // Handle click outside - use mouseup to allow menu items to execute first
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // If clicking on the trigger button, let the button handle it
      if (buttonRef.current?.contains(target)) {
        return;
      }
      
      // If clicking inside the dropdown, don't close (menu items handle themselves)
      if (dropdownRef.current?.contains(target)) {
        return;
      }
      
      // Click is outside both button and dropdown - close it
      setOpen(false);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    // Use click (mouseup) instead of mousedown to let menu items execute first
    document.addEventListener('click', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Handle menu item click - execute immediately and close
  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled || !item.onClick) return;
    
    // Execute the action immediately
    item.onClick();
    
    // Close the dropdown
    setOpen(false);
  }, []);

  const dropdownContent = open ? createPortal(
    <div
      ref={dropdownRef}
      className={`fixed rounded-md shadow-xl py-1 min-w-[180px] ${
        isDark 
          ? 'bg-gray-900 border border-gray-700' 
          : 'bg-white border border-gray-200'
      }`}
      style={{
        left: dropdownPosition.x,
        top: dropdownPosition.y,
        zIndex: 99999,
      }}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return <div key={idx} className={`my-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />;
        }
        if (item.header) {
          return (
            <div
              key={idx}
              className={`
                px-4 py-1.5 text-xs font-semibold uppercase tracking-wide
                ${isDark ? 'text-gray-500' : 'text-gray-400'}
              `}
            >
              {item.label}
            </div>
          );
        }
        return (
          <div
            key={idx}
            role="menuitem"
            tabIndex={item.disabled ? -1 : 0}
            className={`
              w-full text-left px-4 py-2 text-sm flex items-center justify-between
              transition-colors select-none
              ${item.disabled 
                ? isDark ? 'text-gray-500 cursor-not-allowed' : 'text-gray-400 cursor-not-allowed'
                : isDark ? 'text-gray-200 hover:bg-gray-800 cursor-pointer' : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
              }
            `}
            onMouseDown={(e) => {
              // Prevent default to avoid focus issues
              e.preventDefault();
              e.stopPropagation();
              handleItemClick(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleItemClick(item);
              }
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className={`text-xs ml-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        className={`
          px-3 py-1.5 text-sm rounded transition-colors
          ${open 
            ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'
            : isDark ? 'text-gray-300 hover:bg-gray-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          }
        `}
        onClick={() => (open ? setOpen(false) : openDropdown())}
      >
        {label}
      </button>
      {dropdownContent}
    </>
  );
};

// Panel visibility state
interface PanelVisibility {
  tools: boolean;
  assets: boolean;
  smartobjects: boolean;
  view: boolean;
  properties: boolean;
  floors: boolean;
  skins: boolean;
  datasource: boolean;
  buildingSkin: boolean;
}

interface MenuBarProps {
  // Facility save/load
  currentFacilityName: string | null;
  hasUnsavedChanges: boolean;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  
  // Edit operations
  onUndo?: () => void;
  onRedo?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  hasClipboard?: boolean;
  
  // Layout management
  onSaveLayoutAsDefault: () => void;
  onResetPanels: () => void;
  onShowAbout: () => void;
  aboutInfo: Array<{ label: string; value: string }>;
  
  // Panel visibility
  panelVisibility?: PanelVisibility;
  onTogglePanelVisibility?: (panel: keyof PanelVisibility) => void;
  
  // Preferences
  onOpenPreferences?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  currentFacilityName,
  hasUnsavedChanges,
  onNew,
  onSave,
  onSaveAs,
  onLoad,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onSelectAll,
  canUndo = false,
  canRedo = false,
  hasSelection = false,
  hasClipboard = false,
  onSaveLayoutAsDefault,
  onResetPanels,
  onShowAbout,
  aboutInfo,
  panelVisibility,
  onTogglePanelVisibility,
  onOpenPreferences,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  return (
    <div 
      data-ui-element="true"
      className={`h-10 flex-shrink-0 flex items-center px-2 gap-1 border-b shadow-sm ${
        isDark 
          ? 'bg-gray-900 text-gray-100 border-gray-800' 
          : 'bg-white text-gray-900 border-gray-200'
      }`}
    >
      <MenuDropdown
        label="File"
        isDark={isDark}
        items={[
          { label: 'New', onClick: onNew, shortcut: 'Ctrl+N' },
          { label: 'Open...', onClick: onLoad, shortcut: 'Ctrl+O' },
          { divider: true },
          { label: 'Save', onClick: onSave, shortcut: 'Ctrl+S' },
          { label: 'Save As...', onClick: onSaveAs, shortcut: 'Ctrl+Shift+S' },
          { divider: true },
          { label: 'Export...', onClick: () => console.log('Export'), disabled: true },
        ]}
      />
      <MenuDropdown
        label="Edit"
        isDark={isDark}
        items={[
          { label: 'Undo', onClick: onUndo, shortcut: 'Ctrl+Z', disabled: !canUndo },
          { label: 'Redo', onClick: onRedo, shortcut: 'Ctrl+Y', disabled: !canRedo },
          { divider: true },
          { label: 'Cut', onClick: onCut, shortcut: 'Ctrl+X', disabled: !hasSelection },
          { label: 'Copy', onClick: onCopy, shortcut: 'Ctrl+C', disabled: !hasSelection },
          { label: 'Paste', onClick: onPaste, shortcut: 'Ctrl+V', disabled: !hasClipboard },
          { label: 'Delete', onClick: onDelete, shortcut: 'Del', disabled: !hasSelection },
          { divider: true },
          { label: 'Select All', onClick: onSelectAll, shortcut: 'Ctrl+A' },
          { divider: true },
          { label: 'Preferences...', onClick: onOpenPreferences },
        ]}
      />
      <MenuDropdown
        label="View"
        isDark={isDark}
        items={[
          // Panels section header
          { label: 'Panels', header: true },
          // All panel toggles
          ...(panelVisibility && onTogglePanelVisibility ? [
            { label: `${panelVisibility.tools ? '✓ ' : '  '}Tools`, onClick: () => onTogglePanelVisibility('tools') },
            { label: `${panelVisibility.assets ? '✓ ' : '  '}Assets`, onClick: () => onTogglePanelVisibility('assets') },
            { label: `${panelVisibility.smartobjects ? '✓ ' : '  '}Smart Objects`, onClick: () => onTogglePanelVisibility('smartobjects') },
            { label: `${panelVisibility.view ? '✓ ' : '  '}View Controls`, onClick: () => onTogglePanelVisibility('view') },
            { label: `${panelVisibility.properties ? '✓ ' : '  '}Properties`, onClick: () => onTogglePanelVisibility('properties') },
            { label: `${panelVisibility.floors ? '✓ ' : '  '}Floors`, onClick: () => onTogglePanelVisibility('floors') },
            { label: `${panelVisibility.skins ? '✓ ' : '  '}Theme`, onClick: () => onTogglePanelVisibility('skins') },
            { label: `${panelVisibility.datasource ? '✓ ' : '  '}Data Source`, onClick: () => onTogglePanelVisibility('datasource') },
          ] : []),
          { divider: true } as MenuItem,
          // Layout section header
          { label: 'Layout', header: true },
          { label: 'Reset Panel Positions', onClick: onResetPanels },
          { label: 'Save Layout as Default', onClick: onSaveLayoutAsDefault },
        ]}
      />
      <MenuDropdown
        label="Help"
        isDark={isDark}
        items={[
          { label: 'About BluDesign', onClick: onShowAbout },
          { divider: true },
          ...aboutInfo.map(info => ({ 
            label: `${info.label}: ${info.value}`,
            disabled: true,
          })),
        ]}
      />
      
      {/* Facility name display */}
      <div className="flex-1" />
      {currentFacilityName && (
        <div className={`px-3 py-1 text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {currentFacilityName}
          {hasUnsavedChanges && <span className="ml-1 text-primary-500">*</span>}
        </div>
      )}
    </div>
  );
};

export default MenuBar;
