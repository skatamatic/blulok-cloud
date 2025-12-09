/**
 * Selection Manager
 * 
 * Handles object selection via raycasting, hover states, and multi-selection.
 * Includes drag (marquee) selection support.
 */

import * as THREE from 'three';
import { SelectionState } from './types';

// Selection filter type
export type SelectionFilter = 'all' | 'smart' | 'visual';

// Drag selection state
export interface DragSelectionState {
  isDragging: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number } | null;
}

export class SelectionManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // State
  private selectedIds: Set<string> = new Set();
  private hoveredId: string | null = null;
  private isEnabled: boolean = true;
  private isMultiSelectMode: boolean = false;
  
  // Drag selection state
  private isDragSelecting: boolean = false;
  private dragStartPoint: { x: number; y: number } | null = null;
  private dragCurrentPoint: { x: number; y: number } | null = null;
  private mouseDownPoint: { x: number; y: number } | null = null;
  private isMouseDown: boolean = false;
  
  // Flag to prevent click handler from running after drag selection
  private justFinishedDragSelection: boolean = false;
  
  // Drag threshold - must move at least this many pixels to start drag selection
  private readonly DRAG_THRESHOLD = 5;
  
  // Filter
  private selectionFilter: SelectionFilter = 'all';
  
  // Floor filtering
  private isFloorMode: boolean = false;
  private currentFloor: number = 0;
  
  // Building selection mode - when false, buildings (walls, floor tiles) are ignored
  private ignoreBuildings: boolean = true;
  
  // Callbacks
  private onSelectionChange: (state: SelectionState) => void;
  private onDragSelectionChange?: (state: DragSelectionState) => void;
  private onBuildingDoubleClick?: (buildingId: string) => void;
  
  // Bound event handlers
  private handleMouseMove: (e: MouseEvent) => void;
  private handleClick: (e: MouseEvent) => void;
  private handleDoubleClick: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement,
    onSelectionChange: (state: SelectionState) => void,
    onDragSelectionChange?: (state: DragSelectionState) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.onSelectionChange = onSelectionChange;
    this.onDragSelectionChange = onDragSelectionChange;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Bind event handlers for external use (InputCoordinator will call these)
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleClick = this.onClick.bind(this);
    this.handleDoubleClick = this.onDoubleClick.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseUp = this.onMouseUp.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleKeyUp = this.onKeyUp.bind(this);
    
    // NOTE: Event listeners are managed by InputCoordinator, not added here.
    // BluDesignEngine registers us with InputCoordinator which routes events.
  }

  /**
   * Get handlers for InputCoordinator registration
   */
  getInputHandlers() {
    return {
      onMouseDown: this.handleMouseDown,
      onMouseUp: this.handleMouseUp,
      onMouseMove: this.handleMouseMove,
      onClick: this.handleClick,
      onDoubleClick: this.handleDoubleClick,
      onKeyDown: this.handleKeyDown,
      onKeyUp: this.handleKeyUp,
    };
  }

  /**
   * Update camera reference (when camera changes)
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Enable/disable selection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearHover();
      this.cancelDragSelection();
    }
  }

  /**
   * Check if enabled
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Set the drag selection change callback
   */
  setOnDragSelectionChange(callback: (state: DragSelectionState) => void): void {
    this.onDragSelectionChange = callback;
  }

  /**
   * Set the building double-click callback
   * Called when a user double-clicks on a building element (wall or floor tile)
   */
  setOnBuildingDoubleClick(callback: (buildingId: string) => void): void {
    this.onBuildingDoubleClick = callback;
  }

  /**
   * Set selection filter
   * Optionally clears any currently selected objects that don't pass the new filter
   */
  setFilter(filter: SelectionFilter, clearNonMatching: boolean = true): void {
    this.selectionFilter = filter;
    
    // If clearNonMatching is true, remove any selected objects that don't pass the new filter
    if (clearNonMatching && filter !== 'all') {
      const idsToRemove: string[] = [];
      
      this.selectedIds.forEach((id) => {
        const obj = this.findObjectById(id);
        if (obj) {
          const isSmart = obj.userData.isSmart === true;
          const passes = filter === 'smart' ? isSmart : !isSmart;
          if (!passes) {
            idsToRemove.push(id);
          }
        }
      });
      
      if (idsToRemove.length > 0) {
        idsToRemove.forEach((id) => this.selectedIds.delete(id));
        this.notifyChange();
      }
    }
  }

  /**
   * Get current filter
   */
  getFilter(): SelectionFilter {
    return this.selectionFilter;
  }

  /**
   * Update (call in render loop)
   */
  update(): void {
    // Could add continuous updates here if needed
  }

  /**
   * Get current selection state
   */
  getState(): SelectionState {
    return {
      selectedIds: Array.from(this.selectedIds),
      hoveredId: this.hoveredId,
      isMultiSelect: this.isMultiSelectMode,
    };
  }

  /**
   * Get selected IDs
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  /**
   * Check if an object is selected
   */
  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /**
   * Select an object
   */
  select(id: string, additive: boolean = false): void {
    if (!additive) {
      this.selectedIds.clear();
    }
    this.selectedIds.add(id);
    this.notifyChange();
  }

  /**
   * Deselect an object
   */
  deselect(id: string): void {
    this.selectedIds.delete(id);
    this.notifyChange();
  }

  /**
   * Toggle selection
   */
  toggleSelect(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.notifyChange();
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedIds.clear();
    this.notifyChange();
  }

  /**
   * Select multiple objects
   */
  selectMultiple(ids: string[]): void {
    this.selectedIds.clear();
    ids.forEach((id) => this.selectedIds.add(id));
    this.notifyChange();
  }

  /**
   * Select multiple objects, bypassing floor filter
   * Used for building selection across all floors
   */
  selectMultipleUnfiltered(ids: string[]): void {
    this.selectedIds.clear();
    ids.forEach((id) => this.selectedIds.add(id));
    this.notifyChange();
  }

  /**
   * Perform raycast to find objects under mouse
   */
  raycast(screenPosition: THREE.Vector2): THREE.Intersection[] {
    this.raycaster.setFromCamera(screenPosition, this.camera);
    
    const selectableObjects = this.getSelectableObjects();
    return this.raycaster.intersectObjects(selectableObjects, true);
  }

  /**
   * Get the object ID from an intersection
   */
  getObjectIdFromIntersection(intersection: THREE.Intersection): string | null {
    let object: THREE.Object3D | null = intersection.object;
    
    // Walk up the hierarchy to find the selectable parent
    while (object) {
      if (object.userData.id && object.userData.selectable) {
        return object.userData.id;
      }
      object = object.parent;
    }
    
    return null;
  }

  /**
   * Get all selectable objects in the scene
   */
  private getSelectableObjects(): THREE.Object3D[] {
    const selectables: THREE.Object3D[] = [];
    
    this.scene.traverse((object) => {
      if (object.userData.selectable === true) {
        selectables.push(object);
      }
    });
    
    return selectables;
  }

  /**
   * Find a selectable object by its ID
   */
  private findObjectById(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    
    this.scene.traverse((object) => {
      if (object.userData.id === id && object.userData.selectable === true) {
        found = object;
      }
    });
    
    return found;
  }

  /**
   * Clear hover state
   */
  private clearHover(): void {
    if (this.hoveredId !== null) {
      this.hoveredId = null;
      this.notifyChange();
    }
  }

  /**
   * Get mouse position relative to container
   */
  private getMousePosition(event: MouseEvent): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * Calculate distance between two points
   */
  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Handle mouse down - start potential drag selection
   */
  private onMouseDown(event: MouseEvent): void {
    if (!this.isEnabled || event.button !== 0) return;
    
    // InputCoordinator handles event routing - no need to stop propagation
    const pos = this.getMousePosition(event);
    this.mouseDownPoint = pos;
    this.isMouseDown = true;
    
    // Don't start drag selection yet - wait for mouse move
  }

  /**
   * Handle mouse up - end drag selection or click
   */
  private onMouseUp(event: MouseEvent): void {
    if (!this.isEnabled || event.button !== 0) return;
    
    const wasDragging = this.isDragSelecting;
    
    if (wasDragging && this.dragStartPoint && this.dragCurrentPoint) {
      // Perform box selection
      this.selectObjectsInBox(this.dragStartPoint, this.dragCurrentPoint);
      
      // Set flag to prevent click handler from clearing selection
      // The click event fires AFTER mouseup, so we need this flag
      this.justFinishedDragSelection = true;
      
      // Reset the flag on next frame (after click event has fired)
      requestAnimationFrame(() => {
        this.justFinishedDragSelection = false;
      });
    }
    
    // Reset drag state
    this.cancelDragSelection();
    this.isMouseDown = false;
    this.mouseDownPoint = null;
  }

  /**
   * Cancel drag selection
   */
  private cancelDragSelection(): void {
    const wasActive = this.isDragSelecting;
    
    this.isDragSelecting = false;
    this.dragStartPoint = null;
    this.dragCurrentPoint = null;
    
    if (wasActive) {
      this.notifyDragSelectionChange();
    }
  }

  /**
   * Select objects within a 2D screen box
   * Selects any object whose 2D bounding box INTERSECTS with the selection box
   */
  private selectObjectsInBox(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const rect = this.container.getBoundingClientRect();
    
    // Get selection box bounds in screen space
    const selMinX = Math.min(start.x, end.x);
    const selMaxX = Math.max(start.x, end.x);
    const selMinY = Math.min(start.y, end.y);
    const selMaxY = Math.max(start.y, end.y);
    
    // Get all selectable objects that pass the filter
    const selectables = this.getSelectableObjects();
    const idsToSelect: string[] = [];
    
    selectables.forEach((obj) => {
      const id = obj.userData.id;
      if (!id) return;
      
      // Skip walls - they can only be selected via double-click
      if (obj.userData.isWall) return;
      
      // Check if object passes filter
      if (!this.passesFilter(obj)) return;
      
      // Get object's 3D bounding box
      const box3D = new THREE.Box3().setFromObject(obj);
      
      // Get the 8 corners of the 3D bounding box and project them to screen space
      const corners = [
        new THREE.Vector3(box3D.min.x, box3D.min.y, box3D.min.z),
        new THREE.Vector3(box3D.min.x, box3D.min.y, box3D.max.z),
        new THREE.Vector3(box3D.min.x, box3D.max.y, box3D.min.z),
        new THREE.Vector3(box3D.min.x, box3D.max.y, box3D.max.z),
        new THREE.Vector3(box3D.max.x, box3D.min.y, box3D.min.z),
        new THREE.Vector3(box3D.max.x, box3D.min.y, box3D.max.z),
        new THREE.Vector3(box3D.max.x, box3D.max.y, box3D.min.z),
        new THREE.Vector3(box3D.max.x, box3D.max.y, box3D.max.z),
      ];
      
      // Find the 2D screen bounding box of the object
      let objMinX = Infinity;
      let objMaxX = -Infinity;
      let objMinY = Infinity;
      let objMaxY = -Infinity;
      
      for (const corner of corners) {
        const projected = corner.clone().project(this.camera);
        const screenX = (projected.x + 1) / 2 * rect.width;
        const screenY = (-projected.y + 1) / 2 * rect.height;
        
        objMinX = Math.min(objMinX, screenX);
        objMaxX = Math.max(objMaxX, screenX);
        objMinY = Math.min(objMinY, screenY);
        objMaxY = Math.max(objMaxY, screenY);
      }
      
      // Check if the two rectangles intersect (AABB intersection test)
      const intersects = !(objMaxX < selMinX || objMinX > selMaxX || 
                          objMaxY < selMinY || objMinY > selMaxY);
      
      if (intersects) {
        idsToSelect.push(id);
      }
    });
    
    // Update selection
    if (this.isMultiSelectMode) {
      idsToSelect.forEach((id) => this.selectedIds.add(id));
    } else {
      this.selectedIds.clear();
      idsToSelect.forEach((id) => this.selectedIds.add(id));
    }
    
    this.notifyChange();
  }

  /**
   * Check if an object passes the current filter
   */
  private passesFilter(obj: THREE.Object3D): boolean {
    // Building filter - when ignoreBuildings is true, skip building elements
    if (this.ignoreBuildings) {
      if (obj.userData.isWall || obj.userData.isFloorTile || obj.userData.isBuildingWall) {
        return false;
      }
    }
    
    // Floor filter - when in floor mode, only allow selection of objects on current floor
    if (this.isFloorMode) {
      const objFloor = obj.userData.floor ?? 0;
      if (objFloor !== this.currentFloor) {
        return false;
      }
    }
    
    // Smart/Visual filter
    if (this.selectionFilter === 'all') return true;
    
    const isSmart = obj.userData.isSmart === true;
    
    if (this.selectionFilter === 'smart') return isSmart;
    if (this.selectionFilter === 'visual') return !isSmart;
    
    return true;
  }

  /**
   * Set floor mode and current floor for filtering
   */
  setFloorMode(enabled: boolean, floor: number = 0): void {
    this.isFloorMode = enabled;
    this.currentFloor = floor;
  }

  /**
   * Update the current floor (for floor filtering)
   */
  setCurrentFloor(floor: number): void {
    this.currentFloor = floor;
  }

  /**
   * Set whether to ignore buildings (walls, floor tiles) in selection
   * When true (default), buildings can only be selected via building selection tool
   */
  setIgnoreBuildings(ignore: boolean): void {
    this.ignoreBuildings = ignore;
  }

  /**
   * Get whether buildings are ignored in selection
   */
  getIgnoreBuildings(): boolean {
    return this.ignoreBuildings;
  }

  /**
   * Notify drag selection change
   */
  private notifyDragSelectionChange(): void {
    if (this.onDragSelectionChange) {
      this.onDragSelectionChange({
        isDragging: this.isDragSelecting,
        startPoint: this.dragStartPoint,
        currentPoint: this.dragCurrentPoint,
      });
    }
  }

  /**
   * Handle mouse move
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    const pos = this.getMousePosition(event);
    
    // Calculate normalized mouse position for raycasting
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Handle drag selection
    if (this.isMouseDown && this.mouseDownPoint) {
      const distance = this.getDistance(this.mouseDownPoint, pos);
      
      // Start drag selection if we've moved past threshold
      if (!this.isDragSelecting && distance > this.DRAG_THRESHOLD) {
        this.isDragSelecting = true;
        this.dragStartPoint = { ...this.mouseDownPoint };
        this.dragCurrentPoint = pos;
        this.notifyDragSelectionChange();
      } else if (this.isDragSelecting) {
        // Update drag selection
        this.dragCurrentPoint = pos;
        this.notifyDragSelectionChange();
      }
      
      // Skip hover detection during drag
      if (this.isDragSelecting) return;
    }
    
    // Raycast for hover - find first intersection that passes floor filter
    const intersections = this.raycast(this.mouse);
    
    let hoveredId: string | null = null;
    for (const intersection of intersections) {
      const id = this.getObjectIdFromIntersection(intersection);
      if (id) {
        // Get the object to check floor filter
        const obj = this.findObjectById(id);
        if (obj && this.passesFilter(obj)) {
          hoveredId = id;
          break;
        }
      }
    }
    
    if (hoveredId !== this.hoveredId) {
      this.hoveredId = hoveredId;
      this.notifyChange();
    }
  }

  /**
   * Handle click
   */
  private onClick(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    // Skip click if we were drag selecting or just finished drag selection
    // The click event fires AFTER mouseup, so we need to check the flag
    if (this.isDragSelecting || this.justFinishedDragSelection) return;
    
    // Calculate normalized mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast
    const intersections = this.raycast(this.mouse);
    
    // Find first intersection that passes the floor filter
    let selectedId: string | null = null;
    for (const intersection of intersections) {
      const id = this.getObjectIdFromIntersection(intersection);
      if (id) {
        // Get the object to check floor filter
        const obj = this.findObjectById(id);
        
        // Skip walls - they can only be selected via double-click
        if (obj?.userData.isWall) {
          continue;
        }
        
        if (obj && this.passesFilter(obj)) {
          selectedId = id;
          break;
        }
      }
    }
    
    if (selectedId) {
      if (this.isMultiSelectMode) {
        this.toggleSelect(selectedId);
      } else {
        this.select(selectedId, false);
      }
    } else if (!this.isMultiSelectMode) {
      // Click on empty space clears selection (unless in multi-select mode)
      this.clearSelection();
    }
  }

  /**
   * Handle double-click - select entire building if clicking on building element
   * Only works when in building selection mode (ignoreBuildings = false)
   */
  private onDoubleClick(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    // Only allow building selection via double-click when NOT ignoring buildings
    if (this.ignoreBuildings) return;
    
    // Calculate normalized mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast
    const intersections = this.raycast(this.mouse);
    
    for (const intersection of intersections) {
      const object = intersection.object;
      
      // Check if it's a building element (wall or floor tile)
      if (object.userData.buildingId) {
        const buildingId = object.userData.buildingId;
        
        // Call the building double-click callback if set
        if (this.onBuildingDoubleClick) {
          this.onBuildingDoubleClick(buildingId);
        }
        return;
      }
      
      // Walk up hierarchy to find building element
      let parent = object.parent;
      while (parent) {
        if (parent.userData.buildingId) {
          if (this.onBuildingDoubleClick) {
            this.onBuildingDoubleClick(parent.userData.buildingId);
          }
          return;
        }
        parent = parent.parent;
      }
    }
  }

  /**
   * Handle key down
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isMultiSelectMode = true;
    }
    
    // Escape clears selection
    if (event.key === 'Escape') {
      this.clearSelection();
      this.cancelDragSelection();
    }
  }

  /**
   * Handle key up
   */
  private onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isMultiSelectMode = false;
    }
  }

  /**
   * Notify selection change
   */
  private notifyChange(): void {
    this.onSelectionChange(this.getState());
  }

  /**
   * Get world position from screen position
   */
  getWorldPositionFromScreen(
    screenPosition: THREE.Vector2,
    groundPlaneY: number = 0
  ): THREE.Vector3 | null {
    this.raycaster.setFromCamera(screenPosition, this.camera);
    
    // Create a ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundPlaneY);
    const intersection = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(groundPlane, intersection)) {
      return intersection;
    }
    
    return null;
  }

  /**
   * Get drag selection state
   */
  getDragSelectionState(): DragSelectionState {
    return {
      isDragging: this.isDragSelecting,
      startPoint: this.dragStartPoint,
      currentPoint: this.dragCurrentPoint,
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // No direct event listeners to remove - InputCoordinator manages events
  }
}
