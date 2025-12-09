/**
 * Input Coordinator
 * 
 * Centralized event handling with a priority system to prevent
 * conflicts between multiple input handlers (gizmo, placement,
 * selection, camera).
 * 
 * Priority order (highest first):
 * - UI (always checked first - floating panels, menus, dialogs)
 * - GIZMO (0): Translate gizmo has highest priority
 * - PLACEMENT (1): Asset placement mode
 * - SELECTION (2): Object selection
 * - CAMERA (3): Camera controls (lowest priority)
 * 
 * UI elements always take precedence to prevent panel drag issues.
 */

import { isUICapturing } from '../ui/UICapture';

export enum InputPriority {
  GIZMO = 0,
  PLACEMENT = 1,
  SELECTION = 2,
  CAMERA = 3,
}

export type InputEventType = 
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'click'
  | 'dblclick'
  | 'wheel'
  | 'keydown'
  | 'keyup';

export interface InputHandler {
  /** Unique identifier for this handler */
  id: string;
  /** Priority level (lower = higher priority) */
  priority: InputPriority;
  /** Whether this handler is currently active */
  enabled: boolean;
  /** Handle the event, return true if consumed (stops propagation to lower priorities) */
  handle: (event: Event, eventType: InputEventType) => boolean;
  /** Optional: Check if this handler wants to claim input (for hover states) */
  wantsInput?: () => boolean;
  
  // Direct event handlers - InputCoordinator will call these
  onMouseDown?: (e: MouseEvent) => void;
  onMouseUp?: (e: MouseEvent) => void;
  onMouseMove?: (e: MouseEvent) => void;
  onClick?: (e: MouseEvent) => void;
  onDoubleClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onWheel?: (e: WheelEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
}

export class InputCoordinator {
  private container: HTMLElement;
  private handlers: Map<string, InputHandler> = new Map();
  private sortedHandlers: InputHandler[] = [];
  
  // Track if UI is actively capturing mouse (e.g., panel dragging)
  private uiCapturingMouse: boolean = false;
  
  // Bound event handlers
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundDoubleClick: (e: MouseEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Bind event handlers
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundClick = this.onClick.bind(this);
    this.boundDoubleClick = this.onDoubleClick.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    
    // Add event listeners with capture phase to run BEFORE OrbitControls
    // This ensures InputCoordinator routes events before any other handlers
    this.container.addEventListener('mousedown', this.boundMouseDown, { capture: true });
    this.container.addEventListener('mouseup', this.boundMouseUp, { capture: true });
    this.container.addEventListener('mousemove', this.boundMouseMove, { capture: true });
    this.container.addEventListener('click', this.boundClick, { capture: true });
    this.container.addEventListener('dblclick', this.boundDoubleClick, { capture: true });
    this.container.addEventListener('wheel', this.boundWheel, { capture: true, passive: false });
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  /**
   * Check if an event target is within a UI element that should take precedence
   * (floating panels, menus, dialogs, buttons, etc.)
   */
  private isUIElement(event: Event): boolean {
    const target = event.target as HTMLElement;
    if (!target) return false;
    
    // Check global UI capture state (set by FloatingPanel during drag/resize)
    if (isUICapturing()) return true;
    
    // If UI is actively capturing (e.g., dragging a panel), continue capturing
    if (this.uiCapturingMouse) return true;
    
    // Check if target or any parent is a UI element
    let el: HTMLElement | null = target;
    while (el && el !== this.container) {
      // Check for specific UI data attributes
      if (el.dataset.uiElement === 'true') return true;
      if (el.dataset.floatingPanel === 'true') return true;
      
      // Check for common UI patterns
      if (el.tagName === 'BUTTON') return true;
      if (el.tagName === 'INPUT') return true;
      if (el.tagName === 'SELECT') return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'LABEL') return true;
      
      // Check for specific class patterns
      if (el.classList.contains('floating-panel')) return true;
      if (el.classList.contains('dialog')) return true;
      if (el.classList.contains('menu')) return true;
      if (el.classList.contains('dropdown')) return true;
      if (el.classList.contains('panel-header')) return true;
      if (el.classList.contains('panel-resize')) return true;
      
      // Check role attributes
      if (el.getAttribute('role') === 'dialog') return true;
      if (el.getAttribute('role') === 'menu') return true;
      if (el.getAttribute('role') === 'button') return true;
      
      el = el.parentElement;
    }
    
    return false;
  }

  /**
   * Notify that UI is capturing mouse events (e.g., panel drag started)
   */
  setUICapturing(capturing: boolean): void {
    this.uiCapturingMouse = capturing;
  }

  /**
   * Check if UI is currently capturing mouse
   */
  isUICapturing(): boolean {
    return this.uiCapturingMouse;
  }

  /**
   * Register an input handler
   */
  registerHandler(handler: InputHandler): void {
    this.handlers.set(handler.id, handler);
    this.updateSortedHandlers();
  }

  /**
   * Unregister an input handler
   */
  unregisterHandler(id: string): void {
    this.handlers.delete(id);
    this.updateSortedHandlers();
  }

  /**
   * Enable/disable a handler
   */
  setHandlerEnabled(id: string, enabled: boolean): void {
    const handler = this.handlers.get(id);
    if (handler) {
      handler.enabled = enabled;
    }
  }

  /**
   * Check if a handler is enabled
   */
  isHandlerEnabled(id: string): boolean {
    const handler = this.handlers.get(id);
    return handler?.enabled ?? false;
  }

  /**
   * Get handler by ID
   */
  getHandler(id: string): InputHandler | undefined {
    return this.handlers.get(id);
  }

  /**
   * Check if any higher-priority handler wants input
   * (useful for deciding whether to show hover states)
   */
  isHigherPriorityActive(priority: InputPriority): boolean {
    for (const handler of this.sortedHandlers) {
      if (handler.priority >= priority) break;
      if (handler.enabled && handler.wantsInput?.()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update the sorted handlers list
   */
  private updateSortedHandlers(): void {
    this.sortedHandlers = Array.from(this.handlers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Dispatch an event to handlers in priority order.
   * Calls the appropriate handler method based on event type.
   * If a handler's `handle` method returns true, lower priority handlers are skipped.
   */
  private dispatchEvent(event: Event, eventType: InputEventType): void {
    for (const handler of this.sortedHandlers) {
      if (!handler.enabled) continue;
      
      try {
        // Check if this handler wants to block lower priorities (e.g., gizmo is hovered)
        const shouldBlock = handler.handle(event, eventType);
        
        // Call the specific event handler if it exists
        switch (eventType) {
          case 'mousedown':
            handler.onMouseDown?.(event as MouseEvent);
            break;
          case 'mouseup':
            handler.onMouseUp?.(event as MouseEvent);
            break;
          case 'mousemove':
            handler.onMouseMove?.(event as MouseEvent);
            break;
          case 'click':
            handler.onClick?.(event as MouseEvent);
            break;
          case 'dblclick':
            handler.onDoubleClick?.(event as MouseEvent);
            break;
          case 'wheel':
            handler.onWheel?.(event as WheelEvent);
            break;
          case 'keydown':
            handler.onKeyDown?.(event as KeyboardEvent);
            break;
          case 'keyup':
            handler.onKeyUp?.(event as KeyboardEvent);
            break;
        }
        
        // If this handler wants exclusive control, stop propagation to lower priorities
        if (shouldBlock) {
          event.stopPropagation();
          event.preventDefault();
          return;
        }
      } catch (error) {
        console.error(`[InputCoordinator] Error in handler ${handler.id}:`, error);
      }
    }
  }

  // Event handlers
  private onMouseDown(event: MouseEvent): void {
    // FIRST: Check if global UI capture is active (FloatingPanel drag/resize in progress)
    // If so, don't interfere - let the event flow to document handlers
    if (isUICapturing()) {
      return; // Don't stop propagation - UI needs this event
    }
    
    // If this is a UI element, mark as capturing but DON'T stop propagation
    // React needs the event to bubble for its synthetic event system to work
    // We'll prevent 3D handlers from processing by checking our flag
    if (this.isUIElement(event)) {
      this.uiCapturingMouse = true;
      // DO NOT call stopPropagation - React's FloatingPanel needs the event to bubble
      // OrbitControls will receive the event BUT won't start a drag if we prevent
      // our handlers from processing. The camera controller also needs to not start rotation.
      return; // Let UI handle via React events
    }
    this.dispatchEvent(event, 'mousedown');
  }

  private onMouseUp(event: MouseEvent): void {
    // FIRST: Check if global UI capture is active
    // If so, let the event flow to document handlers without interference
    if (isUICapturing()) {
      this.uiCapturingMouse = false; // Reset our internal flag too
      return; // Don't stop propagation - UI needs this event
    }
    
    // Release our internal UI capturing flag on mouse up
    if (this.uiCapturingMouse) {
      this.uiCapturingMouse = false;
      return; // Don't dispatch to 3D handlers
    }
    if (this.isUIElement(event)) {
      event.stopPropagation();
      return;
    }
    this.dispatchEvent(event, 'mouseup');
  }

  private onMouseMove(event: MouseEvent): void {
    // FIRST: Check if global UI capture is active (FloatingPanel drag/resize)
    // This is critical - we must NOT stop propagation so document handlers receive the event
    if (isUICapturing()) {
      return; // Don't stop propagation - UI needs this event for drag/resize
    }
    
    // Check our internal flag (set when mousedown was on UI element)
    if (this.uiCapturingMouse) {
      return; // Just return without stopping propagation
    }
    
    // For regular UI elements (not during drag), stop propagation
    if (this.isUIElement(event)) {
      event.stopPropagation();
      return;
    }
    this.dispatchEvent(event, 'mousemove');
  }

  private onClick(event: MouseEvent): void {
    // Don't interfere during UI capture
    if (isUICapturing()) return;
    
    if (this.isUIElement(event)) {
      event.stopPropagation();
      return;
    }
    this.dispatchEvent(event, 'click');
  }

  private onDoubleClick(event: MouseEvent): void {
    // Don't interfere during UI capture
    if (isUICapturing()) return;
    
    if (this.isUIElement(event)) {
      event.stopPropagation();
      return;
    }
    this.dispatchEvent(event, 'dblclick');
  }

  private onWheel(event: WheelEvent): void {
    // Don't interfere during UI capture
    if (isUICapturing()) return;
    
    // Wheel events should work unless directly on a UI element
    if (this.isUIElement(event)) {
      event.stopPropagation();
      return;
    }
    this.dispatchEvent(event, 'wheel');
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Skip if typing in an input element
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    this.dispatchEvent(event, 'keydown');
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.dispatchEvent(event, 'keyup');
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Must match capture option from addEventListener
    this.container.removeEventListener('mousedown', this.boundMouseDown, { capture: true });
    this.container.removeEventListener('mouseup', this.boundMouseUp, { capture: true });
    this.container.removeEventListener('mousemove', this.boundMouseMove, { capture: true });
    this.container.removeEventListener('click', this.boundClick, { capture: true });
    this.container.removeEventListener('dblclick', this.boundDoubleClick, { capture: true });
    this.container.removeEventListener('wheel', this.boundWheel, { capture: true });
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    
    this.handlers.clear();
    this.sortedHandlers = [];
  }
}

