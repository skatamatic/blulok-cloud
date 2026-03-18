/**
 * Placement Manager
 * 
 * Handles asset placement with ghost preview, grid snapping, and validation.
 * Supports different placement modes:
 * - Single click: Place single asset
 * - Drag for ground: Rectangle fill with 1x1 tiles
 * - Drag for walls/fences: Path-based painting (Bresenham line)
 * - Drag for smart assets: Straight-line placement
 */

import * as THREE from 'three';
import { AssetMetadata, AssetCategory, GridPosition, Orientation, PlacedObject, BuildingWall } from './types';
import { GridSystem } from './GridSystem';
import { AssetFactory } from '../assets/AssetFactory';
import { BuildingManager } from './BuildingManager';
import { isUICapturing } from '../ui/UICapture';

// Placement mode determines how drag-to-place works
type PlacementMode = 'single' | 'rectangle' | 'path' | 'line' | 'building' | 'paste' | 'angled-line';

// Preview item during drag (used for non-rectangle modes)
interface PreviewItem {
  gridPos: GridPosition;
  ghostMesh: THREE.Object3D;
  isValid: boolean;
  orientation?: Orientation; // Orientation for this specific item (for path-based placement)
}

// Max tiles before switching to simplified preview (outline + fill instead of individual tiles)
const MAX_INSTANCED_TILES = 2000;

export class PlacementManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private gridSystem: GridSystem;
  private buildingManager: BuildingManager | null = null;
  
  // State
  private isPlacing: boolean = false;
  private activeAsset: AssetMetadata | null = null;
  private activeOrientation: Orientation = Orientation.NORTH;
  private activeRotation: number = 0; // Arbitrary rotation in radians
  
  // Alt+drag angled placement state
  private isAltDragging: boolean = false;
  private altDragStartWorld: THREE.Vector3 | null = null;
  private altKeyPressed: boolean = false;
  
  // Wall-adjacent placement (for doors/windows)
  private wallSnappedPlacement: {
    wall: BuildingWall;
    orientation: Orientation;
    isSnapped: boolean;
  } | null = null;
  
  // Floor support
  private currentFloorY: number = 0;
  private currentFloor: number = 0;
  
  // Visual elements
  private ghostMesh: THREE.Object3D | null = null;
  private ghostMeshInternalYOffset: number = 0; // Internal Y offset from model grounding
  private ghostMeshInternalXOffset: number = 0; // Internal X offset for centering
  private ghostMeshInternalZOffset: number = 0; // Internal Z offset for centering
  private gridSelector: THREE.Mesh | null = null;
  
  // Mouse tracking for hiding preview when outside 3D view
  private isMouseOver3DView: boolean = true;
  
  // Drag placement state
  private isDragging: boolean = false;
  private dragStartPosition: GridPosition | null = null;
  private dragPreviewItems: PreviewItem[] = [];
  private placementMode: PlacementMode = 'single';
  
  // Optimized rectangle preview using InstancedMesh
  private instancedPreview: THREE.InstancedMesh | null = null;
  private instancedPreviewOutline: THREE.LineSegments | null = null;
  private lastRectangleBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private rectanglePreviewPositions: GridPosition[] = [];
  
  // Drag threshold (pixels) - only start dragging after moving this distance
  private dragThreshold: number = 5;
  private mouseDownPosition: { x: number; y: number } | null = null;
  
  // Paste preview state
  private pasteObjects: PlacedObject[] = [];
  private pasteGhostMeshes: Map<string, THREE.Object3D> = new Map();
  private pasteRelativePositions: Map<string, { x: number; z: number }> = new Map();
  private pasteAnchorPosition: { x: number; z: number } | null = null;
  
  // Raycasting
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private groundPlane: THREE.Plane;
  
  // Current placement state
  private currentGridPosition: GridPosition | null = null;
  private isValidPlacement: boolean = false;
  
  // Callbacks
  private onPlacementChange: (gridPos: GridPosition | null, isValid: boolean) => void;
  private onAssetPlaced: (object: PlacedObject) => void;
  private onBatchPlaced?: (objects: PlacedObject[]) => void;
  private onDeleteRequest?: (objectId: string) => void;
  private onBuildingPlaced?: (footprint: { minX: number; maxX: number; minZ: number; maxZ: number }) => void;
  private onRotationControlChange?: (enableRotation: boolean) => void;
  private onGetHoveredAssetRotation?: (worldPos: THREE.Vector3) => number | null;
  
  // Event handlers
  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;
  private handleContextMenu: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement,
    gridSystem: GridSystem,
    _assetFactory: AssetFactory,
    onPlacementChange: (gridPos: GridPosition | null, isValid: boolean) => void,
    onAssetPlaced: (object: PlacedObject) => void,
    onDeleteRequest?: (objectId: string) => void,
    onBatchPlaced?: (objects: PlacedObject[]) => void,
    onBuildingPlaced?: (footprint: { minX: number; maxX: number; minZ: number; maxZ: number }) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.gridSystem = gridSystem;
    this.onPlacementChange = onPlacementChange;
    this.onAssetPlaced = onAssetPlaced;
    this.onDeleteRequest = onDeleteRequest;
    this.onBatchPlaced = onBatchPlaced;
    this.onBuildingPlaced = onBuildingPlaced;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    // Bind event handlers for external use (InputCoordinator will call these)
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseUp = this.onMouseUp.bind(this);
    this.handleContextMenu = this.onContextMenu.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);
    this.handleKeyUp = this.onKeyUp.bind(this);
  }

  /**
   * Get handlers for InputCoordinator registration
   */
  getInputHandlers() {
    return {
      onMouseDown: this.handleMouseDown,
      onMouseUp: this.handleMouseUp,
      onMouseMove: this.handleMouseMove,
      onContextMenu: this.handleContextMenu,
      onKeyDown: this.handleKeyDown,
      onKeyUp: this.handleKeyUp,
    };
  }
  
  /**
   * Check if the mouse event target is over a UI element
   * This includes floating panels, buttons, inputs, etc.
   */
  private isMouseOverUI(event: MouseEvent): boolean {
    // Check if UI is actively capturing (dragging a panel, etc.)
    if (isUICapturing()) return true;
    
    const target = event.target as HTMLElement;
    if (!target) return false;
    
    // Walk up the DOM tree to check for UI elements
    let el: HTMLElement | null = target;
    while (el && el !== this.container) {
      // Check for UI data attributes
      if (el.dataset.uiElement === 'true') return true;
      if (el.dataset.floatingPanel === 'true') return true;
      
      // Check for common UI elements
      if (el.tagName === 'BUTTON') return true;
      if (el.tagName === 'INPUT') return true;
      if (el.tagName === 'SELECT') return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'LABEL') return true;
      
      // Check for UI class patterns
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
   * Hide placement indicators (ghost mesh and grid selector)
   * Called when mouse leaves the 3D view area or hovers over UI
   */
  private hidePlacementIndicators(): void {
    if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
    if (this.gridSelector) {
      this.gridSelector.visible = false;
    }
    // Also hide drag preview items
    for (const item of this.dragPreviewItems) {
      item.ghostMesh.visible = false;
    }
    // Hide paste ghosts
    for (const [, mesh] of this.pasteGhostMeshes) {
      mesh.visible = false;
    }
    // Hide instanced preview and outline
    if (this.instancedPreview) {
      this.instancedPreview.visible = false;
    }
    if (this.instancedPreviewOutline) {
      this.instancedPreviewOutline.visible = false;
    }
  }
  
  /**
   * Show placement indicators (ghost mesh and grid selector)
   * Called when mouse re-enters the 3D view area
   */
  private showPlacementIndicators(): void {
    // Only show if not during a drag (drag handles visibility differently)
    if (!this.isDragging) {
      if (this.ghostMesh) {
        this.ghostMesh.visible = true;
      }
      if (this.gridSelector) {
        this.gridSelector.visible = true;
      }
    }
    // Drag preview items will be updated on next move
    // Paste ghosts will be updated on next move
    // Instanced preview will be updated on next move
  }
  
  /**
   * Set rotation control change callback
   */
  setOnRotationControlChange(callback: (enableRotation: boolean) => void): void {
    this.onRotationControlChange = callback;
  }

  /**
   * Start placing an asset
   */
  startPlacement(asset: AssetMetadata, orientation: Orientation = Orientation.NORTH): void {
    this.cancelPlacement(); // Clear any existing placement
    
    this.isPlacing = true;
    this.activeAsset = asset;
    this.activeOrientation = orientation;
    // Initialize rotation from orientation to ensure consistency
    this.activeRotation = this.getRotationFromOrientation(orientation);
    
    // Determine placement mode based on asset category
    this.placementMode = this.getPlacementMode(asset.category);
    
    // Create ghost mesh
    this.createGhostMesh();
    
    // Create grid selector
    this.createGridSelector();
    
    // NOTE: Event listeners are managed by InputCoordinator, not added here.
    // BluDesignEngine registers us with InputCoordinator which routes events when placement is active.
  }

  /**
   * Determine placement mode based on asset category
   */
  private getPlacementMode(category: AssetCategory): PlacementMode {
    // Building: rectangle drag
    if (category === 'building') {
      return 'building';
    }
    // Ground assets: rectangle fill
    if (['grass', 'pavement', 'gravel', 'floor'].includes(category)) {
      return 'rectangle';
    }
    // Walls, fences, and interior walls: path-based drag painting
    if (['wall', 'fence', 'interior_wall'].includes(category)) {
      return 'path';
    }
    // Smart assets: straight line
    if (['storage_unit', 'gate', 'elevator', 'access_control'].includes(category)) {
      return 'line';
    }
    // Default: single placement
    return 'single';
  }

  /**
   * Start paste preview mode
   */
  startPastePreview(objects: PlacedObject[]): void {
    this.cancelPlacement(); // Clear any existing placement
    
    if (objects.length === 0) return;
    
    this.isPlacing = true;
    this.placementMode = 'paste';
    this.pasteObjects = objects;
    
    // Calculate relative positions from first object
    const anchor = objects[0];
    this.pasteAnchorPosition = { x: anchor.position.x, z: anchor.position.z };
    
    this.pasteRelativePositions.clear();
    objects.forEach(obj => {
      this.pasteRelativePositions.set(obj.id, {
        x: obj.position.x - this.pasteAnchorPosition!.x,
        z: obj.position.z - this.pasteAnchorPosition!.z,
      });
    });
    
    // Create ghost meshes for all objects
    this.createPasteGhosts();
    
    // NOTE: Event listeners are managed by InputCoordinator, not added here.
  }

/**
   * Create ghost meshes for paste preview
   */
  private createPasteGhosts(): void {
    this.pasteGhostMeshes.forEach(mesh => this.scene.remove(mesh));
    this.pasteGhostMeshes.clear();

    this.pasteObjects.forEach(obj => {
      if (!obj.assetMetadata) return;

      const ghostMesh = AssetFactory.createAssetMesh(obj.assetMetadata);
      ghostMesh.userData.isGhost = true;
      ghostMesh.userData.pasteObjectId = obj.id;
      // Store internal offsets
      ghostMesh.userData.internalXOffset = ghostMesh.position.x;
      ghostMesh.userData.internalYOffset = ghostMesh.position.y;
      ghostMesh.userData.internalZOffset = ghostMesh.position.z;
      // Store the object's rotation and exactMeshPos for preview positioning
      ghostMesh.userData.objectRotation = obj.rotation;
      ghostMesh.userData.hasExactMeshPos = !!obj.exactMeshPos;

      // Apply rotation to ghost
      if (obj.rotation !== undefined) {
        ghostMesh.rotation.y = obj.rotation;
      } else {
        ghostMesh.rotation.y = this.getRotationFromOrientation(obj.orientation);
      }

      // Make it semi-transparent
      ghostMesh.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            mat.transparent = true;
            mat.opacity = 0.5;
            mat.depthWrite = false;
          });
        }
      });
      
      this.pasteGhostMeshes.set(obj.id, ghostMesh);
      this.scene.add(ghostMesh);
    });
  }

  /**
   * Update paste preview positions and validation
   */
  private updatePastePreview(anchorGridPos: GridPosition): void {
    if (!this.pasteAnchorPosition) return;
    
    let allValid = true;
    const gridSize = this.gridSystem.getGridSize();
    
    this.pasteObjects.forEach(obj => {
      const relPos = this.pasteRelativePositions.get(obj.id);
      if (!relPos || !obj.assetMetadata) return;
      
      const objGridPos: GridPosition = {
        x: anchorGridPos.x + relPos.x,
        z: anchorGridPos.z + relPos.z,
        y: anchorGridPos.y,
      };
      
      // Check if valid
      const isValid = !this.gridSystem.isOccupied(
        objGridPos,
        obj.assetMetadata.gridUnits,
        obj.assetMetadata.canStack ?? false,
        obj.assetMetadata.category
      );
      
      if (!isValid) allValid = false;
      
      // Update ghost mesh position
      const ghostMesh = this.pasteGhostMeshes.get(obj.id);
      if (ghostMesh) {
        const internalXOffset = ghostMesh.userData.internalXOffset ?? 0;
        const internalYOffset = ghostMesh.userData.internalYOffset ?? 0;
        const internalZOffset = ghostMesh.userData.internalZOffset ?? 0;
        
        // Calculate position based on whether object has exactMeshPos
        if (obj.exactMeshPos && this.pasteAnchorPosition) {
          // For objects with exactMeshPos, calculate the delta from the anchor
          // and apply it to get the new exact position
          const anchorWorldX = this.pasteAnchorPosition.x;
          const anchorWorldZ = this.pasteAnchorPosition.z;
          const gridDeltaX = anchorGridPos.x - anchorWorldX;
          const gridDeltaZ = anchorGridPos.z - anchorWorldZ;
          
          // The new exact position is the original + the grid delta
          const newExactX = obj.exactMeshPos.x + gridDeltaX;
          const newExactZ = obj.exactMeshPos.z + gridDeltaZ;
          
          ghostMesh.position.set(
            newExactX,
            this.currentFloorY + internalYOffset,
            newExactZ
          );
        } else {
          // Grid-based positioning
          const worldPos = this.gridSystem.gridToWorld(objGridPos);
          
          // Swap grid units for 90° and 270° rotations
          const isRotated90 = obj.orientation === Orientation.EAST || 
                              obj.orientation === Orientation.WEST;
          const effectiveWidth = isRotated90 
            ? obj.assetMetadata.gridUnits.z * gridSize 
            : obj.assetMetadata.gridUnits.x * gridSize;
          const effectiveDepth = isRotated90 
            ? obj.assetMetadata.gridUnits.x * gridSize 
            : obj.assetMetadata.gridUnits.z * gridSize;
          
          ghostMesh.position.set(
            worldPos.x + effectiveWidth / 2 + internalXOffset,
            this.currentFloorY + internalYOffset,
            worldPos.z + effectiveDepth / 2 + internalZOffset
          );
        }
        
        // Apply color tint based on validity
        this.applyPasteGhostTint(ghostMesh, isValid ? 'valid' : 'invalid');
      }
    });
    
    this.isValidPlacement = allValid;
    this.onPlacementChange(anchorGridPos, allValid);
  }

  /**
   * Apply color tint to paste ghost
   */
  private applyPasteGhostTint(mesh: THREE.Object3D, state: 'valid' | 'invalid'): void {
    const tintColor = state === 'valid' ? new THREE.Color(0x33ff33) : new THREE.Color(0xff3333);
    
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.copy(tintColor);
        child.material.emissiveIntensity = 0.3;
      }
    });
  }

  /**
   * Clear paste preview
   */
  private clearPastePreview(): void {
    this.pasteGhostMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.pasteGhostMeshes.clear();
    this.pasteObjects = [];
    this.pasteRelativePositions.clear();
    this.pasteAnchorPosition = null;
  }

  /**
   * Cancel current placement
   */
  cancelPlacement(): void {
    if (!this.isPlacing) return;
    
    this.isPlacing = false;
    this.activeAsset = null;
    this.currentGridPosition = null;
    this.isValidPlacement = false;
    
    // Clear drag state
    this.clearDragPreview();
    this.isDragging = false;
    this.isAltDragging = false;
    this.altDragStartWorld = null;
    this.dragStartPosition = null;
    this.mouseDownPosition = null;
    
    // Clear paste preview
    this.clearPastePreview();
    
    // Remove visual elements
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
      this.ghostMeshInternalXOffset = 0;
      this.ghostMeshInternalYOffset = 0;
      this.ghostMeshInternalZOffset = 0;
    }
    
    if (this.gridSelector) {
      this.scene.remove(this.gridSelector);
      this.gridSelector = null;
    }
    
    // NOTE: Event listeners are managed by InputCoordinator, nothing to remove here.
    
    // Notify change
    this.onPlacementChange(null, false);
  }

  /**
   * Clear drag preview items
   */
  private clearDragPreview(): void {
    // Clear individual preview items (used for path/line modes)
    for (const item of this.dragPreviewItems) {
      this.scene.remove(item.ghostMesh);
      // Dispose geometry and materials
      item.ghostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => mat?.dispose());
        }
      });
    }
    this.dragPreviewItems = [];
    
    // Clear instanced preview (used for rectangle mode)
    this.clearInstancedPreview();
  }
  
  /**
   * Clear only the instanced mesh preview (rectangle mode optimization)
   */
  private clearInstancedPreview(): void {
    if (this.instancedPreview) {
      this.scene.remove(this.instancedPreview);
      this.instancedPreview.geometry.dispose();
      (this.instancedPreview.material as THREE.Material).dispose();
      this.instancedPreview = null;
    }
    
    if (this.instancedPreviewOutline) {
      this.scene.remove(this.instancedPreviewOutline);
      this.instancedPreviewOutline.geometry.dispose();
      (this.instancedPreviewOutline.material as THREE.Material).dispose();
      this.instancedPreviewOutline = null;
    }
    
    this.lastRectangleBounds = null;
    this.rectanglePreviewPositions = [];
  }

  /**
   * Update active orientation
   */
  setOrientation(orientation: Orientation): void {
    this.activeOrientation = orientation;
    // Sync activeRotation with orientation
    this.activeRotation = this.getRotationFromOrientation(orientation);
    if (this.isPlacing) {
      // Update ghost mesh rotation
      if (this.ghostMesh) {
        this.ghostMesh.rotation.y = this.activeRotation;
      }
      
      // Update grid selector size for rotated assets
      this.updateGridSelectorSize();
    }
  }

  /**
   * Set arbitrary rotation angle in radians
   * This overrides the orientation-based rotation
   */
  setRotation(rotation: number): void {
    this.activeRotation = rotation;
    // Update orientation to nearest 90-degree value for compatibility
    const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (normalized < Math.PI / 4 || normalized >= 7 * Math.PI / 4) {
      this.activeOrientation = Orientation.NORTH;
    } else if (normalized < 3 * Math.PI / 4) {
      this.activeOrientation = Orientation.EAST;
    } else if (normalized < 5 * Math.PI / 4) {
      this.activeOrientation = Orientation.SOUTH;
    } else {
      this.activeOrientation = Orientation.WEST;
    }
    
    if (this.isPlacing && this.ghostMesh) {
      this.ghostMesh.rotation.y = rotation;
    }
  }

  /**
   * Get current rotation in radians
   */
  getRotation(): number {
    return this.activeRotation;
  }

  /**
   * Set Alt key state for angled placement mode
   */
  setAltKeyPressed(pressed: boolean): void {
    this.altKeyPressed = pressed;
    
    // If releasing Alt while in angled drag, we stay in angled mode until mouse up
    // This gives a smooth UX - you can press Alt, start dragging, release Alt
  }

  /**
   * Check if Alt key is currently pressed
   */
  isAltKeyDown(): boolean {
    return this.altKeyPressed;
  }

  /**
   * Set the current floor Y position and floor level for multi-floor placement
   */
  setFloorY(y: number, floorLevel: number = 0): void {
    this.currentFloorY = y;
    this.currentFloor = floorLevel;
    
    // Update ghost mesh and grid selector positions if active
    if (this.ghostMesh) {
      this.ghostMesh.position.y = y + this.ghostMeshInternalYOffset + 0.01;
    }
    if (this.gridSelector) {
      this.gridSelector.position.y = y + 0.01;
    }
    
    // Update ground plane to be at the current floor Y
    this.groundPlane.constant = -y;
  }

  /**
   * Get the current floor Y position
   */
  getFloorY(): number {
    return this.currentFloorY;
  }

  /**
   * Get the current floor level
   */
  getCurrentFloor(): number {
    return this.currentFloor;
  }

  /**
   * Set callback for getting rotation of hovered asset
   * This allows PlacementManager to match rotation when hovering over assets
   */
  setHoveredAssetRotationCallback(callback: ((worldPos: THREE.Vector3) => number | null) | undefined): void {
    this.onGetHoveredAssetRotation = callback;
  }

  /**
   * Update grid selector size based on current orientation
   */
  private updateGridSelectorSize(): void {
    if (!this.activeAsset || !this.gridSelector) return;
    
    const gridSize = this.gridSystem.getGridSize();
    const isRotated90 = this.activeOrientation === Orientation.EAST || 
                        this.activeOrientation === Orientation.WEST;
    
    // Swap width/depth for 90° rotations
    const width = isRotated90 
      ? this.activeAsset.gridUnits.z * gridSize 
      : this.activeAsset.gridUnits.x * gridSize;
    const depth = isRotated90 
      ? this.activeAsset.gridUnits.x * gridSize 
      : this.activeAsset.gridUnits.z * gridSize;
    
    // Update the plane geometry by recreating it
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    
    this.gridSelector.geometry.dispose();
    this.gridSelector.geometry = geometry;
  }

  /**
   * Check if currently placing
   */
  isActive(): boolean {
    return this.isPlacing;
  }

  /**
   * Get the active asset being placed
   */
  getActiveAsset(): AssetMetadata | null {
    return this.activeAsset;
  }

  /**
   * Create ghost mesh for preview
   */
  private createGhostMesh(): void {
    if (!this.activeAsset) return;
    
    const mesh = AssetFactory.createGhostMesh(this.activeAsset);
    if (mesh) {
      mesh.rotation.y = this.getRotationFromOrientation(this.activeOrientation);
      mesh.userData.isGhost = true;
      mesh.userData.selectable = false;
      
      // Store the internal offsets from CustomAssetLoader
      // These represent how the model is positioned in its local space:
      // - Y offset: grounding (bottom at y=0) + positionOffset.y
      // - X/Z offset: centering (center at origin) + positionOffset.x/z
      // We need to preserve these when positioning the ghost mesh
      this.ghostMeshInternalYOffset = mesh.position.y;
      this.ghostMeshInternalXOffset = mesh.position.x;
      this.ghostMeshInternalZOffset = mesh.position.z;
      
      this.ghostMesh = mesh;
      this.scene.add(this.ghostMesh);
    }
  }

  /**
   * Create grid selector visual
   */
  private createGridSelector(): void {
    if (!this.activeAsset) return;
    
    const gridSize = this.gridSystem.getGridSize();
    const width = this.activeAsset.gridUnits.x * gridSize;
    const depth = this.activeAsset.gridUnits.z * gridSize;
    
    // Create a plane with outline
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    
    this.gridSelector = new THREE.Mesh(geometry, material);
    this.gridSelector.position.y = this.currentFloorY + 0.01; // Slightly above current floor
    this.gridSelector.userData.isSelector = true;
    this.gridSelector.userData.selectable = false;
    
    this.scene.add(this.gridSelector);
  }

  /**
   * Handle mouse move
   */
  private onMouseMove(e: MouseEvent): void {
    if (!this.isPlacing) return;
    
    // Check if mouse is over the 3D view container
    const rect = this.container.getBoundingClientRect();
    const isOverContainer = 
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    
    // Check if mouse is over UI elements (floating panels, buttons, etc.)
    const isOverUI = this.isMouseOverUI(e);
    
    // Hide placement indicators when mouse is outside 3D view OR over UI
    if (!isOverContainer || isOverUI) {
      this.hidePlacementIndicators();
      this.isMouseOver3DView = false;
      return;
    }
    
    // Show indicators again when mouse re-enters 3D view (not over UI)
    if (!this.isMouseOver3DView) {
      this.isMouseOver3DView = true;
      this.showPlacementIndicators();
    }
    
    // Handle paste preview mode
    if (this.placementMode === 'paste') {
      this.handlePasteMouseMove(e);
      return;
    }
    
    if (!this.activeAsset) return;
    
    // Check if we should start dragging (mouse has moved beyond threshold)
    if (this.mouseDownPosition && !this.isDragging) {
      const dx = e.clientX - this.mouseDownPosition.x;
      const dy = e.clientY - this.mouseDownPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > this.dragThreshold) {
        this.isDragging = true;
      }
    }
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to ground plane
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint);
    
    if (intersectPoint) {
      // Snap to grid for both ghost and selector
      const snappedPos = this.gridSystem.snapToGrid(intersectPoint);
      const gridPos = this.gridSystem.worldToGrid(new THREE.Vector3(snappedPos.x, 0, snappedPos.z));
      
      // Store current position
      this.currentGridPosition = gridPos;
      
      // Handle drag preview if dragging
      if (this.isDragging && this.dragStartPosition && this.altDragStartWorld) {
        // Check Alt key state dynamically - use both internal state AND event.altKey
        // to ensure we catch alt even if there's timing issues with state updates
        const wantsAngledPlacement = this.altKeyPressed || e.altKey;
        
        // Switch to angled mode if Alt pressed
        if (wantsAngledPlacement && !this.isAltDragging) {
          // Use the ORIGINAL drag start position (preserved from mouse down)
          // This ensures the drag origin stays consistent when switching modes
          this.isAltDragging = true;
          // Clear existing drag preview items
          this.clearDragPreview();
        }
        // Switch back to normal mode if Alt released
        else if (!wantsAngledPlacement && this.isAltDragging) {
          this.isAltDragging = false;
          // Clear existing drag preview items
          this.clearDragPreview();
        }
        
        // Check if this is an Alt+drag for angled line placement
        if (this.isAltDragging) {
          // Always use the original drag start position
          this.updateAngledDragPreview(this.altDragStartWorld, intersectPoint);
        } else {
          this.updateDragPreview(this.dragStartPosition, gridPos);
        }
        // Hide single ghost during drag
        if (this.ghostMesh) {
          this.ghostMesh.visible = false;
        }
        if (this.gridSelector) {
          this.gridSelector.visible = false;
        }
      } else {
        // Single placement preview
        this.isValidPlacement = this.checkPlacementValid(gridPos);
        
        // Check for hover-based rotation matching
        if (this.onGetHoveredAssetRotation) {
          const hoveredRotation = this.onGetHoveredAssetRotation(intersectPoint);
          if (hoveredRotation !== null) {
            // Match the rotation of the hovered asset
            this.setRotation(hoveredRotation);
            if (this.ghostMesh) {
              this.ghostMesh.rotation.y = hoveredRotation;
            }
          }
        }
        
        // Update grid selector position
        this.updateGridSelector(gridPos, this.isValidPlacement);
        
        // Update ghost position to match grid selector (snapped to grid)
        if (this.ghostMesh && this.activeAsset) {
          const worldPos = this.gridSystem.gridToWorld(gridPos);
          const gridSize = this.gridSystem.getGridSize();
          
          // Use grid footprint size for positioning (aligns with grid selector)
          const isRotated90 = this.activeOrientation === Orientation.EAST || 
                              this.activeOrientation === Orientation.WEST;
          const gridFootprintWidth = isRotated90 
            ? this.activeAsset.gridUnits.z * gridSize 
            : this.activeAsset.gridUnits.x * gridSize;
          const gridFootprintDepth = isRotated90 
            ? this.activeAsset.gridUnits.x * gridSize 
            : this.activeAsset.gridUnits.z * gridSize;
          
          // Position ghost at center of grid footprint
          // The ghost mesh has internal offsets from CustomAssetLoader that center it
          // We add those offsets to maintain proper centering at the target position
          const targetCenterX = worldPos.x + gridFootprintWidth / 2;
          const targetCenterZ = worldPos.z + gridFootprintDepth / 2;
          
          this.ghostMesh.position.set(
            targetCenterX + this.ghostMeshInternalXOffset,
            this.currentFloorY + this.ghostMeshInternalYOffset + 0.01,
            targetCenterZ + this.ghostMeshInternalZOffset
          );
          this.ghostMesh.visible = true;
        }
        
        if (this.gridSelector) {
          this.gridSelector.visible = true;
        }
      }
      
      // Notify change
      this.onPlacementChange(gridPos, this.isValidPlacement);
    }
  }

  /**
   * Update grid selector position and color
   */
  private updateGridSelector(gridPos: GridPosition, isValid: boolean): void {
    if (!this.activeAsset || !this.gridSelector) return;
    
    const worldPos = this.gridSystem.gridToWorld(gridPos);
    const gridSize = this.gridSystem.getGridSize();
    
    // Account for rotation when calculating offsets
    const isRotated90 = this.activeOrientation === Orientation.EAST || 
                        this.activeOrientation === Orientation.WEST;
    const effectiveWidth = isRotated90 
      ? this.activeAsset.gridUnits.z * gridSize 
      : this.activeAsset.gridUnits.x * gridSize;
    const effectiveDepth = isRotated90 
      ? this.activeAsset.gridUnits.x * gridSize 
      : this.activeAsset.gridUnits.z * gridSize;
    
    // Adjust for asset size (center the selector)
    const offsetX = effectiveWidth / 2;
    const offsetZ = effectiveDepth / 2;
    
    this.gridSelector.position.set(
      worldPos.x + offsetX,
      this.currentFloorY + 0.01,
      worldPos.z + offsetZ
    );
    
    // Update color based on validity
    const material = this.gridSelector.material as THREE.MeshBasicMaterial;
    material.color.setHex(isValid ? 0x00ff00 : 0xff0000);
  }

  /**
   * Update drag preview based on start and end positions
   */
  private updateDragPreview(start: GridPosition, end: GridPosition): void {
    if (!this.activeAsset) return;
    
    // Use optimized preview for rectangle mode (ground tiles)
    if (this.placementMode === 'rectangle') {
      this.updateRectanglePreviewOptimized(start, end);
      return;
    }
    
    // For building mode, just show the outline
    if (this.placementMode === 'building') {
      this.updateBuildingPreview(start, end);
      return;
    }
    
    // For non-rectangle modes, clear and recreate individual previews
    this.clearDragPreview();
    
    // Get positions based on placement mode
    let items: { position: GridPosition; orientation: Orientation }[];
    
    switch (this.placementMode) {
      case 'path':
        items = this.getPathPositions(start, end);
        break;
      case 'line':
        items = this.getLinePositions(start, end).map(pos => ({
          position: pos,
          orientation: this.activeOrientation
        }));
        break;
      default:
        items = [{ position: end, orientation: this.activeOrientation }];
    }
    
    // Create preview items (limited for performance)
    const maxItems = 50; // Limit individual meshes for path/line modes
    const itemsToRender = items.slice(0, maxItems);
    
    for (const item of itemsToRender) {
      const pos = item.position;
      const orientation = item.orientation;
      
      const isValid = this.checkPlacementValid(pos);
      const ghostMesh = AssetFactory.createGhostMesh(this.activeAsset);
      
      if (ghostMesh) {
        // Capture internal offsets from model (centering + grounding + positionOffset)
        const internalXOffset = ghostMesh.position.x;
        const internalYOffset = ghostMesh.position.y;
        const internalZOffset = ghostMesh.position.z;
        
        // Position the ghost
        const worldPos = this.gridSystem.gridToWorld(pos);
        const gridSize = this.gridSystem.getGridSize();
        
        const isRotated90 = orientation === Orientation.EAST || 
                            orientation === Orientation.WEST;
        const effectiveWidth = isRotated90 
          ? this.activeAsset.gridUnits.z * gridSize 
          : this.activeAsset.gridUnits.x * gridSize;
        const effectiveDepth = isRotated90 
          ? this.activeAsset.gridUnits.x * gridSize 
          : this.activeAsset.gridUnits.z * gridSize;
        
        // Target center of grid footprint, plus internal offsets to maintain proper centering
        const targetCenterX = worldPos.x + effectiveWidth / 2;
        const targetCenterZ = worldPos.z + effectiveDepth / 2;
        
        ghostMesh.position.set(
          targetCenterX + internalXOffset,
          this.currentFloorY + internalYOffset + 0.01,
          targetCenterZ + internalZOffset
        );
        ghostMesh.rotation.y = this.getRotationFromOrientation(orientation);
        
        // Tint red if invalid
        if (!isValid) {
          ghostMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
                  mat.color.setHex(0xff4444);
                }
              });
            }
          });
        }
        
        ghostMesh.userData.isGhost = true;
        ghostMesh.userData.selectable = false;
        
        this.scene.add(ghostMesh);
        this.dragPreviewItems.push({ gridPos: pos, ghostMesh, isValid, orientation });
      }
    }
  }

  /**
   * Update preview for Alt+drag angled line placement
   * Uses world coordinates and arbitrary angles
   */
  private updateAngledDragPreview(startWorld: THREE.Vector3, endWorld: THREE.Vector3): void {
    if (!this.activeAsset) return;
    
    // Clear existing previews
    this.clearDragPreview();
    
    // Get angled line positions
    const positions = this.getAngledLinePositions(startWorld, endWorld);
    
    // Limit for performance
    const maxItems = 50;
    const itemsToRender = positions.slice(0, maxItems);
    
for (const item of itemsToRender) {
      const ghostMesh = AssetFactory.createGhostMesh(this.activeAsset);

      if (ghostMesh) {
        // Capture internal offsets from model (these are pre-rotation centering offsets)
        const internalXOffset = ghostMesh.position.x;
        const internalYOffset = ghostMesh.position.y;
        const internalZOffset = ghostMesh.position.z;

        // Rotate the internal offset by the mesh rotation
        // This ensures centering works correctly for rotated objects
        const cos = Math.cos(item.rotation);
        const sin = Math.sin(item.rotation);
        const rotatedXOffset = internalXOffset * cos - internalZOffset * sin;
        const rotatedZOffset = internalXOffset * sin + internalZOffset * cos;

        // Position ghost at final position
        ghostMesh.position.set(
          item.worldPos.x + rotatedXOffset,
          this.currentFloorY + internalYOffset + 0.01,
          item.worldPos.z + rotatedZOffset
        );

        // Apply the rotation
        ghostMesh.rotation.y = item.rotation;
        
        // For angled placement, we skip validity checking (non-grid-aligned)
        ghostMesh.userData.isGhost = true;
        ghostMesh.userData.selectable = false;
        
        this.scene.add(ghostMesh);
        
        // Convert to approximate grid position for storage
        const gridPos = this.gridSystem.worldToGrid(item.worldPos);
        
        // Store with the EXACT mesh position from the ghost - guaranteed match
        const previewItem: PreviewItem & { 
          finalMeshX?: number; 
          finalMeshZ?: number; 
          rotation?: number;
          internalYOffset?: number;
        } = {
          gridPos,
          ghostMesh,
          isValid: true,
          orientation: this.activeOrientation,
        };
        // Store the ACTUAL ghost mesh position - not calculated values
        (previewItem as any).finalMeshX = ghostMesh.position.x;
        (previewItem as any).finalMeshZ = ghostMesh.position.z;
        (previewItem as any).rotation = item.rotation;
        (previewItem as any).internalYOffset = internalYOffset;
        
        this.dragPreviewItems.push(previewItem);
      }
    }
  }
  
  /**
   * Optimized rectangle preview using InstancedMesh for ground tiles
   * Much more performant than individual meshes for large areas
   */
  private updateRectanglePreviewOptimized(start: GridPosition, end: GridPosition): void {
    if (!this.activeAsset) return;
    
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    
    // Check if bounds have changed - skip update if same
    if (this.lastRectangleBounds &&
        this.lastRectangleBounds.minX === minX &&
        this.lastRectangleBounds.maxX === maxX &&
        this.lastRectangleBounds.minZ === minZ &&
        this.lastRectangleBounds.maxZ === maxZ) {
      return; // No change, skip expensive update
    }
    
    // Clear previous instanced preview
    this.clearInstancedPreview();
    
    // Store new bounds
    this.lastRectangleBounds = { minX, maxX, minZ, maxZ };
    
    const gridSize = this.gridSystem.getGridSize();
    const tileWidth = this.activeAsset.gridUnits.x * gridSize;
    const tileDepth = this.activeAsset.gridUnits.z * gridSize;
    
    // Calculate total tiles
    const tilesX = maxX - minX + 1;
    const tilesZ = maxZ - minZ + 1;
    const totalTiles = tilesX * tilesZ;
    
    // Store positions for later placement
    this.rectanglePreviewPositions = [];
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        this.rectanglePreviewPositions.push({ x, z, y: 0 });
      }
    }
    
    // Create bounding outline (always show this)
    this.createRectangleOutline(minX, maxX, minZ, maxZ, gridSize);
    
    // For large areas, show a simple filled plane instead of individual tiles
    if (totalTiles > MAX_INSTANCED_TILES) {
      this.createSimpleFillPreview(minX, maxX, minZ, maxZ, gridSize);
      return;
    }
    
    // Create instanced mesh for smaller areas
    const geometry = new THREE.PlaneGeometry(tileWidth * 0.95, tileDepth * 0.95);
    geometry.rotateX(-Math.PI / 2);
    
    // Determine color based on asset type
    const baseColor = this.getAssetPreviewColor(this.activeAsset.category);
    const material = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    
    this.instancedPreview = new THREE.InstancedMesh(geometry, material, totalTiles);
    this.instancedPreview.userData.isGhost = true;
    this.instancedPreview.userData.selectable = false;
    
    // Set up instance matrices
    const matrix = new THREE.Matrix4();
    let index = 0;
    
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const worldPos = this.gridSystem.gridToWorld({ x, z, y: 0 });
        
        matrix.setPosition(
          worldPos.x + tileWidth / 2,
          0.02, // Slightly above ground
          worldPos.z + tileDepth / 2
        );
        
        this.instancedPreview.setMatrixAt(index, matrix);
        index++;
      }
    }
    
    this.instancedPreview.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedPreview);
  }
  
  /**
   * Create a bounding outline for rectangle preview
   */
  private createRectangleOutline(minX: number, maxX: number, minZ: number, maxZ: number, gridSize: number): void {
    void gridSize;
    const startWorld = this.gridSystem.gridToWorld({ x: minX, z: minZ, y: 0 });
    const endWorld = this.gridSystem.gridToWorld({ x: maxX + 1, z: maxZ + 1, y: 0 });
    
    const width = endWorld.x - startWorld.x;
    const depth = endWorld.z - startWorld.z;
    const centerX = startWorld.x + width / 2;
    const centerZ = startWorld.z + depth / 2;
    
    // Create outline geometry
    const points = [
      new THREE.Vector3(-width / 2, 0, -depth / 2),
      new THREE.Vector3(width / 2, 0, -depth / 2),
      new THREE.Vector3(width / 2, 0, depth / 2),
      new THREE.Vector3(-width / 2, 0, depth / 2),
      new THREE.Vector3(-width / 2, 0, -depth / 2),
    ];
    
    // Geometry created for potential future use
    void new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ff00, 
      linewidth: 2,
    });
    
    this.instancedPreviewOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.1, depth)),
      material
    );
    this.instancedPreviewOutline.position.set(centerX, this.currentFloorY + 0.05, centerZ);
    this.instancedPreviewOutline.userData.isGhost = true;
    this.instancedPreviewOutline.userData.selectable = false;
    
    this.scene.add(this.instancedPreviewOutline);
  }
  
  /**
   * Update building preview - shows outline and semi-transparent fill
   */
  private updateBuildingPreview(start: GridPosition, end: GridPosition): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    
    // Check if bounds have changed
    if (this.lastRectangleBounds &&
        this.lastRectangleBounds.minX === minX &&
        this.lastRectangleBounds.maxX === maxX &&
        this.lastRectangleBounds.minZ === minZ &&
        this.lastRectangleBounds.maxZ === maxZ) {
      return; // No change, skip update
    }
    
    // Clear previous preview
    this.clearInstancedPreview();
    
    // Store new bounds
    this.lastRectangleBounds = { minX, maxX, minZ, maxZ };
    
    const gridSize = this.gridSystem.getGridSize();
    const startWorld = this.gridSystem.gridToWorld({ x: minX, z: minZ, y: 0 });
    const endWorld = this.gridSystem.gridToWorld({ x: maxX + 1, z: maxZ + 1, y: 0 });
    
    const width = endWorld.x - startWorld.x;
    const depth = endWorld.z - startWorld.z;
    const centerX = startWorld.x + width / 2;
    const centerZ = startWorld.z + depth / 2;
    
    // Create filled plane for building footprint
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    
    const fillMesh = new THREE.Mesh(geometry, material);
    fillMesh.position.set(centerX, this.currentFloorY + 0.015, centerZ);
    fillMesh.userData.isGhost = true;
    fillMesh.userData.selectable = false;
    
    this.instancedPreview = fillMesh as unknown as THREE.InstancedMesh;
    this.scene.add(fillMesh);
    
    // Create outline
    this.createRectangleOutline(minX, maxX, minZ, maxZ, gridSize);
  }
  
  /**
   * Create a simple filled plane for large area previews
   * Used when there are too many tiles for individual previews
   */
  private createSimpleFillPreview(minX: number, maxX: number, minZ: number, maxZ: number, gridSize: number): void {
    void gridSize;
    const startWorld = this.gridSystem.gridToWorld({ x: minX, z: minZ, y: 0 });
    const endWorld = this.gridSystem.gridToWorld({ x: maxX + 1, z: maxZ + 1, y: 0 });
    
    const width = endWorld.x - startWorld.x;
    const depth = endWorld.z - startWorld.z;
    const centerX = startWorld.x + width / 2;
    const centerZ = startWorld.z + depth / 2;
    
    // Create filled plane geometry
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    
    // Get color based on asset type
    const baseColor = this.activeAsset ? this.getAssetPreviewColor(this.activeAsset.category) : 0x48bb78;
    
    const material = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    
    // Store as instanced preview (we'll dispose it the same way)
    const fillMesh = new THREE.Mesh(geometry, material);
    fillMesh.position.set(centerX, this.currentFloorY + 0.015, centerZ);
    fillMesh.userData.isGhost = true;
    fillMesh.userData.selectable = false;
    
    // Use a group to hold the fill mesh (easier cleanup)
    this.instancedPreview = fillMesh as unknown as THREE.InstancedMesh;
    this.scene.add(fillMesh);
  }
  
  /**
   * Get preview color based on asset category
   */
  private getAssetPreviewColor(category: AssetCategory): number {
    switch (category) {
      case 'grass':
        return 0x48bb78;
      case 'pavement':
        return 0x6b7280;
      case 'gravel':
        return 0x718096;
      case 'floor':
        return 0xa0aec0;
      default:
        return 0x00ff00;
    }
  }


  /**
   * Get positions along a path (walls/fences/interior walls) using Bresenham's line algorithm
   * Returns positions with calculated orientations based on path direction
   * For interior walls, snaps start/end points to nearby building walls
   */
  private getPathPositions(start: GridPosition, end: GridPosition): { position: GridPosition; orientation: Orientation }[] {
    const result: { position: GridPosition; orientation: Orientation }[] = [];
    
    // For interior walls, snap endpoints to nearby building walls
    let effectiveStart = start;
    let effectiveEnd = end;
    if (this.activeAsset?.category === 'interior_wall') {
      effectiveStart = this.snapToNearbyWall(start);
      effectiveEnd = this.snapToNearbyWall(end);
    }
    
    let x0 = effectiveStart.x;
    let z0 = effectiveStart.z;
    const x1 = effectiveEnd.x;
    const z1 = effectiveEnd.z;
    
    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    
    // Determine primary direction for orientation
    // If path is more horizontal (dx > dz), walls should be vertical (NORTH/SOUTH)
    // If path is more vertical (dz > dx), walls should be horizontal (EAST/WEST)
    const isHorizontalPath = dx >= dz;
    const baseOrientation = isHorizontalPath ? Orientation.NORTH : Orientation.EAST;
    
    let reachedEnd = false;
    while (!reachedEnd) {
      result.push({ 
        position: { x: x0, z: z0, y: 0 },
        orientation: baseOrientation
      });
      
      reachedEnd = x0 === x1 && z0 === z1;
      if (reachedEnd) break;
      
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }
    
    return result;
  }

  /**
   * Get positions for straight line only (smart assets)
   * Steps by the asset's grid units to ensure proper spacing with no overlap
   * Takes into account asset rotation when determining spacing
   */
  private getLinePositions(start: GridPosition, end: GridPosition): GridPosition[] {
    if (!this.activeAsset) return [end];
    
    const positions: GridPosition[] = [];
    
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const absDx = Math.abs(dx);
    const absDz = Math.abs(dz);
    
    // Get the step size based on asset grid units
    // Account for rotation - when rotated 90 degrees (EAST/WEST), swap width and depth
    const isRotated90 = this.activeOrientation === Orientation.EAST || 
                        this.activeOrientation === Orientation.WEST;
    
    // Effective dimensions considering rotation
    const effectiveXSize = isRotated90 ? this.activeAsset.gridUnits.z : this.activeAsset.gridUnits.x;
    const effectiveZSize = isRotated90 ? this.activeAsset.gridUnits.x : this.activeAsset.gridUnits.z;
    
    // Determine if line is more horizontal or vertical
    if (absDx >= absDz) {
      // Horizontal line - step by effective X size
      const direction = dx >= 0 ? 1 : -1;
      const z = start.z;
      
      // Calculate how many units can fit
      const totalDistance = absDx;
      const numUnits = Math.floor(totalDistance / effectiveXSize) + 1;
      
      for (let i = 0; i < numUnits; i++) {
        const x = start.x + (i * effectiveXSize * direction);
        // Make sure we don't go past the end position
        if (direction > 0 ? x <= end.x : x >= end.x) {
          positions.push({ x, z, y: 0 });
        }
      }
    } else {
      // Vertical line - step by effective Z size
      const direction = dz >= 0 ? 1 : -1;
      const x = start.x;
      
      // Calculate how many units can fit
      const totalDistance = absDz;
      const numUnits = Math.floor(totalDistance / effectiveZSize) + 1;
      
      for (let i = 0; i < numUnits; i++) {
        const z = start.z + (i * effectiveZSize * direction);
        // Make sure we don't go past the end position
        if (direction > 0 ? z <= end.z : z >= end.z) {
          positions.push({ x, z, y: 0 });
        }
      }
    }
    
    // Ensure at least the start position is included
    if (positions.length === 0) {
      positions.push({ x: start.x, z: start.z, y: 0 });
    }
    
    return positions;
  }

  /**
   * Get positions for angled line placement (Alt+drag)
   * Returns world-space positions along an arbitrary angle, not locked to grid axes
   * 
   * For storage containers/lockers:
   * - Assets rotate to face PERPENDICULAR to the drag line (outward from the row)
   * - This creates natural rows where lockers face outward from the aisle
   * - Spacing is based on asset width (side-by-side along the line)
   */
private getAngledLinePositions(
    startWorld: THREE.Vector3,
    endWorld: THREE.Vector3
  ): { worldPos: THREE.Vector3; rotation: number }[] {
    if (!this.activeAsset) return [];

    const positions: { worldPos: THREE.Vector3; rotation: number }[] = [];

    // Calculate direction and distance of drag line
    const dx = endWorld.x - startWorld.x;
    const dz = endWorld.z - startWorld.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.001) {
      // No movement, just return start position with current rotation
      return [{ worldPos: startWorld.clone(), rotation: this.activeRotation }];
    }

    // Calculate the drag line angle (from +Z axis, clockwise positive)
    const lineAngle = Math.atan2(dx, dz);

    // Calculate both perpendicular directions
    const perp1 = lineAngle + Math.PI / 2;
    const perp2 = lineAngle - Math.PI / 2;

    // Choose the perpendicular direction closest to the current activeRotation
    // This prevents "flipping" when entering angled mode
    const normalizeAngle = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const activeNorm = normalizeAngle(this.activeRotation);
    const perp1Norm = normalizeAngle(perp1);
    const perp2Norm = normalizeAngle(perp2);
    
    const diff1 = Math.min(
      Math.abs(activeNorm - perp1Norm),
      2 * Math.PI - Math.abs(activeNorm - perp1Norm)
    );
    const diff2 = Math.min(
      Math.abs(activeNorm - perp2Norm),
      2 * Math.PI - Math.abs(activeNorm - perp2Norm)
    );
    
    const perpendicularRotation = diff1 <= diff2 ? perp1 : perp2;

    // Normalize direction for stepping along the line
    const dirX = dx / distance;
    const dirZ = dz / distance;

    // Get asset dimensions in world units
    const gridSize = this.gridSystem.getGridSize();
    const assetWidth = this.activeAsset.gridUnits.x * gridSize;  // X dimension (side-to-side when facing north)

    // Since assets face perpendicular to the line, we step by their WIDTH
    // (they're placed side-by-side along the drag direction)
    const stepSize = assetWidth;

    // Calculate number of steps (ensure at least 1)
    const numSteps = Math.max(1, Math.floor(distance / stepSize) + 1);

    for (let i = 0; i < numSteps; i++) {
      const dist = i * stepSize;
      if (dist > distance + 0.01) break; // Small tolerance

      const worldPos = new THREE.Vector3(
        startWorld.x + dirX * dist,
        startWorld.y,
        startWorld.z + dirZ * dist
      );

      // All assets face perpendicular to the drag line (closest to current orientation)
      positions.push({ worldPos, rotation: perpendicularRotation });
    }

    // Ensure at least the start position is included
    if (positions.length === 0) {
      positions.push({ worldPos: startWorld.clone(), rotation: perpendicularRotation });
    }

    return positions;
  }

  /**
   * Handle mouse down - start potential drag
   */
  private onMouseDown(e: MouseEvent): void {
    if (!this.isPlacing || !this.activeAsset || e.button !== 0) return;
    
    // InputCoordinator handles event routing - no need to stop propagation
    
    // First, ensure we have the current position by doing a raycast
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint);
    
    if (intersectPoint) {
      const snappedPos = this.gridSystem.snapToGrid(intersectPoint);
      const gridPos = this.gridSystem.worldToGrid(new THREE.Vector3(snappedPos.x, 0, snappedPos.z));
      
      this.currentGridPosition = gridPos;
      this.isValidPlacement = this.checkPlacementValid(gridPos);
      
      // Store mouse position and grid position for potential drag
      this.mouseDownPosition = { x: e.clientX, y: e.clientY };
      this.dragStartPosition = { ...gridPos };
      
      // Store world position for Alt+drag angled placement
      this.altDragStartWorld = intersectPoint.clone();
      
      // Check if Alt is held for angled line mode
      if (this.altKeyPressed || e.altKey) {
        this.isAltDragging = true;
      }
    }
  }

  /**
   * Handle paste mouse move
   */
  private handlePasteMouseMove(e: MouseEvent): void {
    // Update mouse coordinates
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to ground plane
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint);
    
    if (intersectPoint) {
      // Snap to grid
      const snappedPos = this.gridSystem.snapToGrid(intersectPoint);
      const gridPos = this.gridSystem.worldToGrid(new THREE.Vector3(snappedPos.x, 0, snappedPos.z));
      gridPos.y = this.currentFloorY;
      
      this.currentGridPosition = gridPos;
      this.updatePastePreview(gridPos);
    }
  }

  /**
   * Handle mouse up - place asset(s) or finish drag
   */
  private onMouseUp(e: MouseEvent): void {
    if (!this.isPlacing || e.button !== 0) return;
    
    // Handle paste mode
    if (this.placementMode === 'paste') {
      if (this.currentGridPosition && this.isValidPlacement) {
        this.finishPastePlacement();
      }
      return;
    }
    
    if (!this.activeAsset) return;
    
    // Only process if we had a mouse down (mouseDownPosition is set)
    if (!this.mouseDownPosition) return;
    
if (this.isDragging && this.dragStartPosition && this.currentGridPosition) {
      // Finish drag placement
      if (this.isAltDragging) {
        this.finishAngledDragPlacement();
      } else {
        this.finishDragPlacement();
      }
    } else if (this.currentGridPosition && this.isValidPlacement) {
      // Single click placement (only if we didn't start dragging)
      this.placeSingleAsset();
    }

    // Reset drag state
    this.isDragging = false;
    this.isAltDragging = false;
    this.altDragStartWorld = null;
    this.dragStartPosition = null;
    this.mouseDownPosition = null;
    this.clearDragPreview();
  }

/**
   * Finish paste placement - place all objects
   */
  private finishPastePlacement(): void {
    if (!this.currentGridPosition || !this.isValidPlacement || !this.pasteAnchorPosition) return;

    const objectsToPlace: PlacedObject[] = [];
    
    // Calculate the grid delta from original anchor to current position
    const gridDeltaX = this.currentGridPosition.x - this.pasteAnchorPosition.x;
    const gridDeltaZ = this.currentGridPosition.z - this.pasteAnchorPosition.z;

    this.pasteObjects.forEach(obj => {
      const relPos = this.pasteRelativePositions.get(obj.id);
      if (!relPos || !obj.assetMetadata) return;

      const newGridPos: GridPosition = {
        x: this.currentGridPosition!.x + relPos.x,
        z: this.currentGridPosition!.z + relPos.z,
        y: this.currentFloorY,
      };

      // Calculate new exactMeshPos if object has one
      let newExactMeshPos: { x: number; z: number } | undefined;
      if (obj.exactMeshPos) {
        newExactMeshPos = {
          x: obj.exactMeshPos.x + gridDeltaX,
          z: obj.exactMeshPos.z + gridDeltaZ,
        };
      }

      const newObject: PlacedObject = {
        ...obj,
        id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        position: newGridPos,
        floor: this.currentFloor,
        // Preserve rotation
        rotation: obj.rotation,
        // Update exactMeshPos with the offset
        exactMeshPos: newExactMeshPos,
      };

      objectsToPlace.push(newObject);
    });

    // Place all objects via batch callback
    if (this.onBatchPlaced && objectsToPlace.length > 0) {
      this.onBatchPlaced(objectsToPlace);
    }

    // Clear paste preview
    this.clearPastePreview();

    // Keep paste mode active for multiple pastes
    // User can press Escape to exit
  }

  /**
   * Place a single asset at current position
   */
  private placeSingleAsset(): void {
    if (!this.activeAsset || !this.currentGridPosition || !this.isValidPlacement) return;
    
    const placedObject: PlacedObject = {
      id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      assetId: this.activeAsset.id,
      assetMetadata: this.activeAsset,
      position: this.currentGridPosition,
      orientation: this.activeOrientation,
      canStack: this.activeAsset.category === 'wall' || this.activeAsset.category === 'fence',
      floor: this.currentFloor,
      createdAt: new Date(),
      updatedAt: new Date(),
      properties: {},
    };
    
    // If this is a wall-attached asset (door/window), add the wall attachment info and create opening
    if ((this.activeAsset.category === 'door' || this.activeAsset.category === 'window') && 
        this.wallSnappedPlacement?.isSnapped) {
      placedObject.wallAttachment = {
        wallId: this.wallSnappedPlacement.wall.id,
        position: 0.5, // Default to center
      };
      
      // Create wall opening ONLY for windows (doors keep the wall intact)
      if (this.buildingManager && this.activeAsset.category === 'window') {
        const widthAlongWall =
          this.wallSnappedPlacement.orientation === Orientation.NORTH || this.wallSnappedPlacement.orientation === Orientation.SOUTH
            ? this.activeAsset.gridUnits.z
            : this.activeAsset.gridUnits.x;
        const opening = {
          id: `opening-${placedObject.id}`,
          type: 'window' as const,
          objectId: placedObject.id,
          position: 0.5, // Center of wall segment
          width: Math.max(1, widthAlongWall),
        };
        this.buildingManager.addWallOpening(this.wallSnappedPlacement.wall.id, opening);
      }
    }
    
    this.onAssetPlaced(placedObject);
    
    // Clear wall snap state after placement
    this.wallSnappedPlacement = null;
  }

  /**
   * Finish drag placement - place all valid items as a single undo action
   */
  private finishDragPlacement(): void {
    if (!this.activeAsset) return;
    
    // For building mode, create a building footprint
    if (this.placementMode === 'building' && this.dragStartPosition && this.currentGridPosition) {
      const footprint = {
        minX: Math.min(this.dragStartPosition.x, this.currentGridPosition.x),
        maxX: Math.max(this.dragStartPosition.x, this.currentGridPosition.x),
        minZ: Math.min(this.dragStartPosition.z, this.currentGridPosition.z),
        maxZ: Math.max(this.dragStartPosition.z, this.currentGridPosition.z),
      };
      
      if (this.onBuildingPlaced) {
        this.onBuildingPlaced(footprint);
      }
      return;
    }
    
    // For rectangle mode, use the stored positions (optimized path)
    if (this.placementMode === 'rectangle' && this.rectanglePreviewPositions.length > 0) {
      this.placeRectangleItems();
      return;
    }
    
    // For path/line modes, collect all valid items and place as batch
    const objectsToPlace: PlacedObject[] = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < this.dragPreviewItems.length; i++) {
      const item = this.dragPreviewItems[i];
      if (item.isValid) {
        const placedObject: PlacedObject = {
          id: `asset-${timestamp}-${Math.random().toString(36).substr(2, 9)}-${i}`,
          assetId: this.activeAsset.id,
          assetMetadata: this.activeAsset,
          position: item.gridPos,
          orientation: item.orientation ?? this.activeOrientation,
          canStack: this.activeAsset.category === 'wall' || this.activeAsset.category === 'fence',
          floor: this.currentFloor,
          createdAt: new Date(),
          updatedAt: new Date(),
          properties: {},
        };
        
        objectsToPlace.push(placedObject);
      }
    }
    
    // Place all objects as a batch (single undo action)
    if (objectsToPlace.length > 0) {
      if (this.onBatchPlaced) {
        this.onBatchPlaced(objectsToPlace);
      } else {
        // Fallback to individual placement if batch callback not set
        objectsToPlace.forEach(obj => this.onAssetPlaced(obj));
      }
    }
  }

/**
   * Finish angled drag placement - place all items with arbitrary rotation
   * Uses the exact mesh positions from the ghost preview - no recalculation
   */
  private finishAngledDragPlacement(): void {
    if (!this.activeAsset) return;

    const objectsToPlace: PlacedObject[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < this.dragPreviewItems.length; i++) {
      const item = this.dragPreviewItems[i] as PreviewItem & { 
        finalMeshX?: number; 
        finalMeshZ?: number; 
        rotation?: number;
        internalYOffset?: number;
      };

      const rotation = item.rotation ?? this.activeRotation;

      // Calculate orientation from rotation
      const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let orientation: Orientation;
      if (normalized < Math.PI / 4 || normalized >= 7 * Math.PI / 4) {
        orientation = Orientation.NORTH;
      } else if (normalized < 3 * Math.PI / 4) {
        orientation = Orientation.EAST;
      } else if (normalized < 5 * Math.PI / 4) {
        orientation = Orientation.SOUTH;
      } else {
        orientation = Orientation.WEST;
      }

      // Use grid position for collision tracking
      const gridPos = { ...item.gridPos, y: this.currentFloorY };

      // Store exact mesh position - this IS the final position, no calculation needed
      let exactMeshPos: { x: number; z: number } | undefined = undefined;
      if (item.finalMeshX !== undefined && item.finalMeshZ !== undefined) {
        exactMeshPos = { x: item.finalMeshX, z: item.finalMeshZ };
      }

      const placedObject: PlacedObject = {
        id: `asset-${timestamp}-${Math.random().toString(36).substr(2, 9)}-${i}`,
        assetId: this.activeAsset.id,
        assetMetadata: this.activeAsset,
        position: gridPos,
        orientation,
        rotation,
        exactMeshPos, // Store EXACT mesh position - ghost position directly
        canStack: this.activeAsset.category === 'wall' || this.activeAsset.category === 'fence',
        floor: this.currentFloor,
        createdAt: new Date(),
        updatedAt: new Date(),
        properties: {},
      };

      objectsToPlace.push(placedObject);
    }

    // Place all objects as a batch
    if (objectsToPlace.length > 0) {
      if (this.onBatchPlaced) {
        this.onBatchPlaced(objectsToPlace);
      } else {
        objectsToPlace.forEach(obj => this.onAssetPlaced(obj));
      }
    }
  }
  
  /**
   * Place all rectangle items (optimized batch placement)
   * All items are placed as a single undo action
   */
  private placeRectangleItems(): void {
    if (!this.activeAsset) return;
    
    // Collect all valid placements
    const objectsToPlace: PlacedObject[] = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < this.rectanglePreviewPositions.length; i++) {
      const pos = this.rectanglePreviewPositions[i];
      
      // Check if placement is valid
      if (this.checkPlacementValid(pos)) {
        const placedObject: PlacedObject = {
          id: `asset-${timestamp}-${Math.random().toString(36).substr(2, 9)}-${i}`,
          assetId: this.activeAsset.id,
          assetMetadata: this.activeAsset,
          position: pos,
          orientation: this.activeOrientation,
          canStack: false, // Ground tiles don't stack
          floor: this.currentFloor,
          createdAt: new Date(),
          updatedAt: new Date(),
          properties: {},
        };
        
        objectsToPlace.push(placedObject);
      }
    }
    
    // Place all objects as a batch (single undo action)
    if (objectsToPlace.length > 0) {
      if (this.onBatchPlaced) {
        this.onBatchPlaced(objectsToPlace);
      } else {
        // Fallback to individual placement if batch callback not set
        objectsToPlace.forEach(obj => this.onAssetPlaced(obj));
      }
    }
  }

  /**
   * Handle right-click to delete object under cursor
   */
  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    
    if (!this.isPlacing || !this.onDeleteRequest) return;
    
    // Update mouse coordinates
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to find object under cursor
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Get all meshes that are not ghosts or selectors
    const objects: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && 
          !child.userData.isGhost && 
          !child.userData.isSelector &&
          child.userData.selectable !== false) {
        objects.push(child);
      }
    });
    
    const intersects = this.raycaster.intersectObjects(objects, false);
    
    if (intersects.length > 0) {
      // Find the object ID from userData or parent group
      let targetObject: THREE.Object3D | null = intersects[0].object;
      
      // Walk up to find the actual placed object (has userData.id)
      while (targetObject && !targetObject.userData.id) {
        targetObject = targetObject.parent;
      }
      
      // Also check the mesh itself and its immediate parent for id
      const objectId = targetObject?.userData.id || 
                       intersects[0].object.userData.id ||
                       intersects[0].object.parent?.userData.id;
      
      if (objectId) {
        this.onDeleteRequest(objectId);
      }
    }
  }

  /**
   * Check if placement is valid at given grid position
   * Validates: grid occupancy on current floor, building wall crossing,
   * and the rule that non-ground-floor objects must be inside a building
   * Special handling for doors/windows which must be placed on walls
   */
  private checkPlacementValid(gridPos: GridPosition): boolean {
    if (!this.activeAsset) return false;
    
    const canStack = this.activeAsset.category === 'wall' || 
                     this.activeAsset.category === 'fence';
    
    // Special handling for doors and windows - must be placed against a building wall
    if (this.activeAsset.category === 'door' || this.activeAsset.category === 'window') {
      return this.checkWallAttachedPlacementValid(gridPos);
    }
    
    // Account for rotation when checking occupancy
    const isRotated90 = this.activeOrientation === Orientation.EAST || 
                        this.activeOrientation === Orientation.WEST;
    const size = {
      x: isRotated90 ? this.activeAsset.gridUnits.z : this.activeAsset.gridUnits.x,
      z: isRotated90 ? this.activeAsset.gridUnits.x : this.activeAsset.gridUnits.z,
    };
    
    // Ground materials (grass, pavement, gravel) cannot be placed on building floor tiles
    const isGroundMaterial = 
      this.activeAsset.category === 'pavement' ||
      this.activeAsset.category === 'grass' ||
      this.activeAsset.category === 'gravel';
    
    if (isGroundMaterial && this.buildingManager) {
      // Check all cells the ground tile would occupy
      for (let dx = 0; dx < size.x; dx++) {
        for (let dz = 0; dz < size.z; dz++) {
          const checkX = gridPos.x + dx;
          const checkZ = gridPos.z + dz;
          // If any cell is part of a building, placement is invalid
          if (this.buildingManager.getBuildingAtCell(checkX, checkZ)) {
            return false;
          }
        }
      }
    }
    
    // Check grid occupancy on the current floor only
    if (this.gridSystem.isOccupied(gridPos, size, canStack, this.activeAsset.category, this.currentFloor)) {
      return false;
    }
    
    // Ground/floor tiles and walls/fences can be placed regardless of building walls
    // They paint "under" or "are" walls, so no crossing check needed
    const skipWallCrossing = 
      this.activeAsset.category === 'floor' ||
      this.activeAsset.category === 'pavement' ||
      this.activeAsset.category === 'grass' ||
      this.activeAsset.category === 'gravel' ||
      this.activeAsset.category === 'wall' ||
      this.activeAsset.category === 'fence';
    
    // Check for building wall crossing (objects can be flush but not cross walls)
    if (!skipWallCrossing && this.checkWallCrossing(gridPos, size)) {
      return false;
    }
    
    // NEW RULE: Non-ground floor objects must be placed inside a building
    // Exceptions: building extensions, stairwell (part of building structure)
    // Note: windows and doors already return early (wall-attached check above)
    if (this.currentFloor !== 0 && this.buildingManager) {
      const category = this.activeAsset.category;
      const isException = 
        category === AssetCategory.BUILDING || // Building extensions
        category === AssetCategory.STAIRWELL;  // Part of building structure
      
      if (!isException) {
        // Check if ALL cells of this object are inside a building
        for (let dx = 0; dx < size.x; dx++) {
          for (let dz = 0; dz < size.z; dz++) {
            const cellX = gridPos.x + dx;
            const cellZ = gridPos.z + dz;
            if (!this.buildingManager.getBuildingAtCell(cellX, cellZ)) {
              return false; // At least one cell is outside a building
            }
          }
        }
      }
    }
    
    return true;
  }

  /**
   * Special validation for wall-attached assets (doors, windows)
   * Must be placed against a building wall and auto-orients to the wall direction
   */
  private checkWallAttachedPlacementValid(gridPos: GridPosition): boolean {
    if (!this.buildingManager) {
      // No building manager, allow placement anywhere (fallback)
      this.wallSnappedPlacement = null;
      return true;
    }
    
    // Find if there's a wall at this position
    const wallInfo = this.buildingManager.findWallAtPosition(gridPos, this.currentFloor);
    
    if (!wallInfo) {
      // No wall found - doors and windows MUST be on walls
      this.wallSnappedPlacement = null;
      return false;
    }
    
    // Convert wall orientation to asset orientation
    const assetOrientation = this.wallOrientationToAssetOrientation(wallInfo.orientation);
    
    // Store the wall snap info for automatic orientation
    this.wallSnappedPlacement = {
      wall: wallInfo.wall,
      orientation: assetOrientation,
      isSnapped: true,
    };
    
    // Auto-set the orientation
    this.activeOrientation = assetOrientation;
    
    // Update ghost mesh rotation if it exists
    if (this.ghostMesh) {
      this.ghostMesh.rotation.y = this.getRotationFromOrientation(assetOrientation);
    }
    
    // Check if wall has space (no overlapping openings)
    if (this.activeAsset) {
      const canPlace = this.buildingManager.canPlaceOnWall(
        this.activeAsset, 
        wallInfo.wall, 
        0.5 // Default to center of wall segment
      );
      
      if (!canPlace) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Convert wall orientation to appropriate asset orientation (for doors, windows, etc.)
   */
  private wallOrientationToAssetOrientation(wallOrientation: 'north' | 'south' | 'east' | 'west'): Orientation {
    switch (wallOrientation) {
      case 'north': return Orientation.NORTH;
      case 'south': return Orientation.SOUTH;
      case 'east': return Orientation.EAST;
      case 'west': return Orientation.WEST;
    }
  }

  /**
   * Snap a grid position to a nearby building wall if close enough
   * Used for interior walls to connect to building perimeter
   */
  private snapToNearbyWall(gridPos: GridPosition): GridPosition {
    if (!this.buildingManager) return gridPos;
    
    const snapDistance = 0.5; // Snap if within half a grid cell
    
    // Find all walls on the current floor
    const walls: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.userData.isBuildingWall && 
          (child.userData.floor === this.currentFloor || child.userData.floor === undefined)) {
        walls.push(child);
      }
    });
    
    if (walls.length === 0) return gridPos;
    
    const gridSize = this.gridSystem.getGridSize();
    const worldX = gridPos.x * gridSize + gridSize / 2;
    const worldZ = gridPos.z * gridSize + gridSize / 2;
    
    let closestDist = snapDistance * gridSize;
    let snappedPos = gridPos;
    
    for (const wall of walls) {
      const wallBounds = new THREE.Box3().setFromObject(wall);
      const wallCenterX = (wallBounds.min.x + wallBounds.max.x) / 2;
      const wallCenterZ = (wallBounds.min.z + wallBounds.max.z) / 2;
      
      // Check distance to wall center
      const dist = Math.sqrt(
        Math.pow(worldX - wallCenterX, 2) + 
        Math.pow(worldZ - wallCenterZ, 2)
      );
      
      if (dist < closestDist) {
        closestDist = dist;
        // Snap to the wall's grid position
        snappedPos = {
          x: Math.floor(wallCenterX / gridSize),
          z: Math.floor(wallCenterZ / gridSize),
          y: gridPos.y
        };
      }
    }
    
    return snappedPos;
  }
  
  /**
   * Check if an object would cross a building wall
   * Returns true if the object crosses a wall (invalid placement)
   */
  private checkWallCrossing(gridPos: GridPosition, size: { x: number; z: number }): boolean {
    // Get all building walls on the current floor from the scene
    const walls: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.userData.isBuildingWall && 
          (child.userData.floor === this.currentFloor || child.userData.floor === undefined)) {
        walls.push(child);
      }
    });
    
    if (walls.length === 0) return false;
    
    const gridSize = this.gridSystem.getGridSize();
    
    // Get the world-space bounds of the object being placed
    const objectMinX = gridPos.x * gridSize;
    const objectMaxX = (gridPos.x + size.x) * gridSize;
    const objectMinZ = gridPos.z * gridSize;
    const objectMaxZ = (gridPos.z + size.z) * gridSize;
    
    // Check against each wall
    for (const wall of walls) {
      const wallData = wall.userData;
      const wallOrientation = wallData.wallOrientation || 'north-south';
      
      // Get wall bounds
      const wallBounds = new THREE.Box3().setFromObject(wall);
      
      // For north-south walls (extend along Z axis, thin in X)
      if (wallOrientation === 'north-south') {
        const wallCenterX = (wallBounds.min.x + wallBounds.max.x) / 2;
        // Object crosses if it spans across the wall's X position (not just touches)
        if (objectMinX < wallCenterX - 0.01 && objectMaxX > wallCenterX + 0.01) {
          // Check if they overlap in Z
          if (objectMaxZ > wallBounds.min.z && objectMinZ < wallBounds.max.z) {
            return true; // Crossing detected
          }
        }
      }
      
      // For east-west walls (extend along X axis, thin in Z)
      if (wallOrientation === 'east-west') {
        const wallCenterZ = (wallBounds.min.z + wallBounds.max.z) / 2;
        // Object crosses if it spans across the wall's Z position (not just touches)
        if (objectMinZ < wallCenterZ - 0.01 && objectMaxZ > wallCenterZ + 0.01) {
          // Check if they overlap in X
          if (objectMaxX > wallBounds.min.x && objectMinX < wallBounds.max.x) {
            return true; // Crossing detected
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Get rotation from orientation
   */
  private getRotationFromOrientation(orientation: Orientation): number {
    switch (orientation) {
      case Orientation.NORTH:
        return 0;
      case Orientation.EAST:
        return Math.PI / 2;
      case Orientation.SOUTH:
        return Math.PI;
      case Orientation.WEST:
        return -Math.PI / 2;
      default:
        return 0;
    }
  }

  /**
   * Update camera reference
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Set the BuildingManager reference (required for smart door/window placement)
   */
  setBuildingManager(buildingManager: BuildingManager): void {
    this.buildingManager = buildingManager;
  }

  /**
   * Confirm placement - place asset at current position (for keyboard shortcut)
   */
  confirmPlacement(): boolean {
    if (!this.isPlacing || !this.activeAsset || !this.currentGridPosition) {
      return false;
    }
    
    if (this.isValidPlacement) {
      this.placeSingleAsset();
      return true;
    }
    
    return false;
  }

  /**
   * Handle key down - enable camera rotation on Ctrl press, cancel paste on Escape
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isPlacing) return;
    
    // Escape cancels paste mode
    if (e.key === 'Escape' && this.placementMode === 'paste') {
      this.cancelPlacement();
      return;
    }
    
    if (e.key === 'Control' || e.key === 'Meta') {
      // Ctrl (or Cmd on Mac) pressed - enable camera rotation
      if (this.onRotationControlChange) {
        this.onRotationControlChange(true);
      }
    }
  }

  /**
   * Handle key up - disable camera rotation on Ctrl release
   */
  private onKeyUp(e: KeyboardEvent): void {
    if (!this.isPlacing) return;
    
    if (e.key === 'Control' || e.key === 'Meta') {
      // Ctrl (or Cmd on Mac) released - disable camera rotation
      if (this.onRotationControlChange) {
        this.onRotationControlChange(false);
      }
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.cancelPlacement();
  }
}

