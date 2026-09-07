/**
 * Panel Container
 * 
 * A collapsible, draggable panel system for the editor UI.
 * Panels can be positioned on any edge and support custom content.
 */

import React, { useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

export type PanelPosition = 'left' | 'right' | 'top' | 'bottom';

interface PanelContainerProps {
  id: string;
  title: string;
  icon?: ReactNode;
  position: PanelPosition;
  defaultCollapsed?: boolean;
  collapsible?: boolean;
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  children: ReactNode;
  onCollapsedChange?: (collapsed: boolean) => void;
  draggable?: boolean;
  defaultPosition?: { x: number; y: number };
  snapThreshold?: number;
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  id,
  title,
  icon,
  position,
  defaultCollapsed = false,
  collapsible = true,
  width = 280,
  height = 'auto',
  minWidth = 200,
  minHeight = 100,
  className = '',
  children,
  onCollapsedChange,
  draggable = true,
  defaultPosition,
  snapThreshold = 32,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isDragging, setIsDragging] = useState(false);
  const [positionState, setPositionState] = useState<{ x: number; y: number }>(() =>
    defaultPosition ?? getDefaultPosition(position)
  );
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleToggle = useCallback(() => {
    if (!collapsible || isDragging) return;
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapsedChange?.(newState);
  }, [collapsible, isCollapsed, onCollapsedChange, isDragging]);

  const isHorizontal = position === 'left' || position === 'right';
  const ChevronIcon = getChevronIcon(position, isCollapsed);

  const containerClasses = getContainerClasses();
  const contentClasses = getContentClasses(isHorizontal);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!draggable) return;
      setIsDragging(false);
      const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const onMove = (ev: MouseEvent) => {
        const nextPos = {
          x: ev.clientX - dragOffset.current.x,
          y: ev.clientY - dragOffset.current.y,
        };
        setPositionState(nextPos);
        setIsDragging(true);
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        if (!isDragging) return;

        const { innerWidth, innerHeight } = window;
        const snapped = { ...positionState };
        if (ev.clientX < snapThreshold) {
          snapped.x = 16;
        } else if (innerWidth - ev.clientX < snapThreshold) {
          snapped.x = innerWidth - (Number(width) || 280) - 16;
        }
        if (ev.clientY < snapThreshold) {
          snapped.y = 16;
        } else if (innerHeight - ev.clientY < snapThreshold) {
          snapped.y = innerHeight - 120;
        }
        setPositionState(snapped);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [draggable, isDragging, positionState, snapThreshold, width]
  );

  useEffect(() => {
    if (defaultPosition) {
      setPositionState(defaultPosition);
    }
  }, [defaultPosition]);

  return (
    <div
      id={`panel-${id}`}
      className={`
        ${containerClasses}
        bg-gray-900/90 dark:bg-gray-900/90 bg-white/90
        backdrop-blur-md
        border border-gray-200/60 dark:border-gray-700/60
        shadow-2xl
        transition-all duration-300 ease-out
        ${isDragging ? 'cursor-grabbing select-none' : 'cursor-default'}
        ${className}
      `}
      style={{
        left: positionState.x,
        top: positionState.y,
        width: isCollapsed && isHorizontal ? 'auto' : width,
        height: isCollapsed && !isHorizontal ? 'auto' : height,
        minWidth: isCollapsed ? 'auto' : minWidth,
        minHeight: isCollapsed ? 'auto' : minHeight,
      }}
    >
      {/* Header */}
      <div
        className={`
          flex items-center justify-between
          px-3 py-2
          bg-gray-800/60 dark:bg-gray-800/60 bg-gray-100/80
          border-b border-gray-700/40 dark:border-gray-700/40 border-gray-200/70
          ${collapsible ? 'hover:bg-gray-700/40 dark:hover:bg-gray-700/40 hover:bg-gray-200/80' : ''}
          transition-colors duration-150
        `}
        onMouseDown={handleMouseDown}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-primary-500 dark:text-primary-400">
              {icon}
            </span>
          )}
          {(!isCollapsed || !isHorizontal) && (
            <span className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">
              {title}
            </span>
          )}
        </div>
        {collapsible && (
          <button
            className="p-1 rounded hover:bg-gray-600/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          >
            <ChevronIcon className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Content */}
      <div
        className={`
          ${contentClasses}
          ${isCollapsed ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-[80vh] opacity-100'}
          transition-all duration-300 ease-out
        `}
      >
        <div className="p-3">
          {children}
        </div>
      </div>
    </div>
  );
};

function getChevronIcon(position: PanelPosition, isCollapsed: boolean) {
  switch (position) {
    case 'left':
      return isCollapsed ? ChevronRightIcon : ChevronLeftIcon;
    case 'right':
      return isCollapsed ? ChevronLeftIcon : ChevronRightIcon;
    case 'top':
      return isCollapsed ? ChevronDownIcon : ChevronUpIcon;
    case 'bottom':
      return isCollapsed ? ChevronUpIcon : ChevronDownIcon;
  }
}

function getContainerClasses(): string {
  return 'absolute z-30 rounded-lg';
}

function getContentClasses(isHorizontal: boolean): string {
  return isHorizontal ? 'overflow-y-auto' : 'overflow-x-auto';
}

function getDefaultPosition(position: PanelPosition): { x: number; y: number } {
  const margin = 16;
  switch (position) {
    case 'left':
      return { x: margin, y: margin };
    case 'right':
      return { x: window.innerWidth - 320, y: margin };
    case 'top':
      return { x: window.innerWidth / 2 - 150, y: margin };
    case 'bottom':
      return { x: window.innerWidth / 2 - 150, y: window.innerHeight - 200 };
    default:
      return { x: margin, y: margin };
  }
}

// Panel Section Component for organizing content within panels
interface PanelSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  title,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`mb-3 last:mb-0 ${className}`}>
      {title && (
        <div
          className={`
            flex items-center justify-between
            text-xs font-semibold text-gray-400 uppercase tracking-wider
            mb-2 pb-1 border-b border-gray-700/30
            ${collapsible ? 'cursor-pointer hover:text-gray-300' : ''}
          `}
          onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
        >
          <span>{title}</span>
          {collapsible && (
            <ChevronDownIcon
              className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
            />
          )}
        </div>
      )}
      <div
        className={`
          ${isCollapsed ? 'hidden' : 'block'}
        `}
      >
        {children}
      </div>
    </div>
  );
};

// Panel Button Component
interface PanelButtonProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PanelButton: React.FC<PanelButtonProps> = ({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
  };

  return (
    <button
      className={`
        flex items-center gap-2 w-full
        ${sizeClasses[size]}
        rounded-md font-medium
        transition-all duration-150
        ${active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-gray-700/40 dark:bg-gray-700/40 bg-gray-100 text-gray-800 dark:text-gray-300 hover:bg-gray-600/40 dark:hover:bg-gray-600/40 hover:text-gray-900 dark:hover:text-white'
        }
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
};

// Panel Grid for arranging buttons/items in a grid
interface PanelGridProps {
  columns?: number;
  gap?: number;
  children: ReactNode;
}

export const PanelGrid: React.FC<PanelGridProps> = ({
  columns = 2,
  gap = 2,
  children,
}) => {
  return (
    <div
      className={`grid gap-${gap}`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {children}
    </div>
  );
};

// Panel Divider
export const PanelDivider: React.FC = () => (
  <div className="my-3 border-t border-gray-700/50" />
);

