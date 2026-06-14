/**
 * Translate Gizmo
 * 
 * A flat 2D translation gizmo for moving selected objects on the X/Z plane.
 * Grid-locked movement with visual feedback.
 */

import * as THREE from 'three';
import { GridSystem } from './GridSystem';

export type GizmoAxis = 'x' | 'z' | 'xz' | null;

export interface TranslateGizmoCallbacks {
  onDragStart: (axis: GizmoAxis) => void;
  onDrag: (deltaX: number, deltaZ: number, axis: GizmoAxis) => void;
  onDragEnd: (axis: GizmoAxis) => void;
  /** Called when gizmo hover state changes (to disable other interactions) */
  onHoverChange?: (isHovered: boolean) => void;
}

export class TranslateGizmo {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private gridSystem: GridSystem;
  private callbacks: TranslateGizmoCallbacks;
  
  // Gizmo components
  private gizmoGroup: THREE.Group | null = null;
  private xArrow: THREE.Mesh | null = null;
  private zArrow: THREE.Mesh | null = null;
  private centerHandle: THREE.Mesh | null = null;
  
  // State
  private isVisible: boolean = false;
  private isDragging: boolean = false;
  private dragAxis: GizmoAxis = null;
  private dragStartGridPosition: { x: number; z: number } | null = null;
  private currentGridPosition: { x: number; z: number } | null = null;
  /** Gizmo world XZ at drag start — translation uses plane-hit delta from this pivot. */
  private dragStartWorldXZ: { x: number; z: number } | null = null;
  /** Ray–plane hit at mousedown; avoids a jump when the click is off the gizmo center. */
  private dragStartPlaneHitXZ: { x: number; z: number } | null = null;
  
  // Raycasting
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private dragPlane: THREE.Plane;
  
  // Appearance - 30% larger for better visibility and easier interaction
  private readonly arrowLength = 5.85;       // 4.5 * 1.3
  private readonly arrowWidth = 0.585;       // 0.45 * 1.3
  private readonly arrowHeadLength = 1.56;   // 1.2 * 1.3
  private readonly arrowHeadWidth = 1.17;    // 0.9 * 1.3
  private readonly centerHandleSize = 1.5;   // Larger square for free movement (was 0.75)
  private readonly hoverScale = 1.15;
  
  // Colors
  private readonly xColor = new THREE.Color(0xff3333); // Red
  private readonly zColor = new THREE.Color(0x3333ff); // Blue
  private readonly centerColor = new THREE.Color(0xffff33); // Yellow
  private readonly hoverColor = new THREE.Color(0xffffff); // White
  
  // Hover state
  private hoveredPart: 'x' | 'z' | 'center' | null = null;
  
  // Event handlers
  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement,
    gridSystem: GridSystem,
    callbacks: TranslateGizmoCallbacks
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.gridSystem = gridSystem;
    this.callbacks = callbacks;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    // Bind event handlers
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseUp = this.onMouseUp.bind(this);
    
    this.createGizmo();
  }

  /**
   * Create the gizmo meshes
   */
  private createGizmo(): void {
    this.gizmoGroup = new THREE.Group();
    this.gizmoGroup.userData.isGizmo = true;
    this.gizmoGroup.userData.selectable = false;
    this.gizmoGroup.renderOrder = 9999; // Render on top of everything
    
    // X-axis arrow (red, points right/east)
    this.xArrow = this.createArrow(this.xColor, new THREE.Vector3(1, 0, 0));
    this.xArrow.userData.gizmoAxis = 'x';
    this.gizmoGroup.add(this.xArrow);
    
    // Z-axis arrow (blue, points forward/north)
    this.zArrow = this.createArrow(this.zColor, new THREE.Vector3(0, 0, 1));
    this.zArrow.userData.gizmoAxis = 'z';
    this.gizmoGroup.add(this.zArrow);
    
    // Center handle for free XZ movement
    this.centerHandle = this.createCenterHandle();
    this.centerHandle.userData.gizmoAxis = 'xz';
    this.gizmoGroup.add(this.centerHandle);
    
    this.gizmoGroup.visible = false;
    this.scene.add(this.gizmoGroup);
  }

  /**
   * Create an arrow mesh along a direction
   */
  private createArrow(color: THREE.Color, direction: THREE.Vector3): THREE.Mesh {
    const group = new THREE.Group();
    
    // Create material - renders on top of everything
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.5,
      roughness: 0.3,
      depthTest: false, // Render on top of everything
      depthWrite: false,
    });
    
    // Arrow shaft
    const shaftGeometry = new THREE.CylinderGeometry(
      this.arrowWidth / 2,
      this.arrowWidth / 2,
      this.arrowLength,
      8
    );
    const shaft = new THREE.Mesh(shaftGeometry, material);
    
    // Rotate and position shaft to point in direction
    if (direction.x !== 0) {
      shaft.rotation.z = -Math.PI / 2;
      shaft.position.set(this.arrowLength / 2, 0, 0);
    } else if (direction.z !== 0) {
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, 0, this.arrowLength / 2);
    }
    
    group.add(shaft);
    
    // Arrow head (cone)
    const headGeometry = new THREE.ConeGeometry(
      this.arrowHeadWidth / 2,
      this.arrowHeadLength,
      8
    );
    const head = new THREE.Mesh(headGeometry, material);
    
    // Position and rotate head
    if (direction.x !== 0) {
      head.rotation.z = -Math.PI / 2;
      head.position.set(this.arrowLength + this.arrowHeadLength / 2, 0, 0);
    } else if (direction.z !== 0) {
      head.rotation.x = Math.PI / 2;
      head.position.set(0, 0, this.arrowLength + this.arrowHeadLength / 2);
    }
    
    group.add(head);
    
    // Set render order for all meshes - ensure they render on top
    shaft.renderOrder = 9999;
    head.renderOrder = 9999;
    
    // Create a wrapper mesh to return (Three.js Mesh, not Group)
    // We use a simple geometry as the base and add children
    const wrapperGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    wrapperGeometry.translate(0, 0, 0);
    const wrapperMaterial = new THREE.MeshStandardMaterial({ 
      visible: false,
      depthTest: false,
      depthWrite: false,
    });
    const wrapper = new THREE.Mesh(wrapperGeometry, wrapperMaterial);
    wrapper.renderOrder = 9999;
    
    // Add shaft and head as children
    wrapper.add(shaft);
    wrapper.add(head);
    
    return wrapper;
  }

  /**
   * Create center handle for free XZ movement
   */
  private createCenterHandle(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(
      this.centerHandleSize,
      this.centerHandleSize * 0.3,
      this.centerHandleSize
    );
    const material = new THREE.MeshStandardMaterial({
      color: this.centerColor,
      metalness: 0.5,
      roughness: 0.3,
      depthTest: false, // Render on top of everything
      depthWrite: false,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = this.centerHandleSize * 0.15; // Lift slightly off ground
    mesh.renderOrder = 9999; // Render on top
    
    return mesh;
  }

  /**
   * Show gizmo at a world XZ position (pivot from mesh-derived or gridToWorld — not raw grid indices alone).
   */
  show(worldXZ: { x: number; z: number }, floorY: number = 0): void {
    if (!this.gizmoGroup) return;

    this.gizmoGroup.position.set(
      worldXZ.x,
      floorY + 0.05,
      worldXZ.z
    );
    
    const alignment = this.gridSystem.getGridAlignment();
    this.gizmoGroup.rotation.set(0, alignment ? alignment.yaw : 0, 0);
    
    // Ensure all children render on top
    this.ensureRenderOnTop(this.gizmoGroup);
    
    this.gizmoGroup.visible = true;
    this.isVisible = true;
    
    // Add event listeners with capture phase for highest priority
    this.container.addEventListener('mousemove', this.handleMouseMove, { capture: true });
    this.container.addEventListener('mousedown', this.handleMouseDown, { capture: true });
    this.container.addEventListener('mouseup', this.handleMouseUp, { capture: true });
  }
  
  /**
   * Recursively ensure all gizmo children render on top
   */
  private ensureRenderOnTop(obj: THREE.Object3D): void {
    obj.renderOrder = 9999;
    obj.traverse((child) => {
      child.renderOrder = 9999;
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.MeshStandardMaterial || 
            child.material instanceof THREE.MeshBasicMaterial) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
        }
      } else if (child instanceof THREE.Line) {
        if (child.material instanceof THREE.LineBasicMaterial) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
        }
      }
    });
  }

  /**
   * Hide gizmo
   */
  hide(): void {
    if (!this.gizmoGroup) return;
    
    this.gizmoGroup.visible = false;
    this.isVisible = false;
    this.hoveredPart = null;
    
    // Remove event listeners (must match capture option from addEventListener)
    this.container.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
    this.container.removeEventListener('mousedown', this.handleMouseDown, { capture: true });
    this.container.removeEventListener('mouseup', this.handleMouseUp, { capture: true });
  }

  /**
   * Move gizmo to a world XZ pivot (same frame as {@link show}).
   */
  setPosition(worldXZ: { x: number; z: number }, floorY: number = 0): void {
    if (!this.gizmoGroup || !this.isVisible) return;

    this.gizmoGroup.position.set(
      worldXZ.x,
      floorY + 0.05,
      worldXZ.z
    );

    const alignment = this.gridSystem.getGridAlignment();
    this.gizmoGroup.rotation.set(0, alignment ? alignment.yaw : 0, 0);
  }

  /**
   * Move gizmo using continuous grid indices (e.g. building move preview).
   */
  setPositionFromGrid(gridPosition: { x: number; z: number }, floorY: number = 0): void {
    if (!this.gizmoGroup || !this.isVisible) return;

    const worldPos = this.gridSystem.gridToWorld({ x: gridPosition.x, z: gridPosition.z, y: 0 });

    this.gizmoGroup.position.set(
      worldPos.x,
      floorY + 0.05,
      worldPos.z
    );

    const alignment = this.gridSystem.getGridAlignment();
    this.gizmoGroup.rotation.set(0, alignment ? alignment.yaw : 0, 0);
  }

  /**
   * Check if gizmo is visible
   */
  isShown(): boolean {
    return this.isVisible;
  }

  /**
   * Check if gizmo is currently being dragged
   */
  isDraggingGizmo(): boolean {
    return this.isDragging;
  }

  /**
   * Check if gizmo is currently hovered (for input priority)
   */
  isHovered(): boolean {
    return this.hoveredPart !== null;
  }

  /**
   * Handle mouse move - check for hover and drag
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.isVisible || !this.gizmoGroup) return;
    
    // Calculate mouse position
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.isDragging && this.dragAxis) {
      // Handle drag - consume event to prevent other handlers
      event.stopPropagation();
      event.preventDefault();
      this.handleDrag();
    } else {
      // Check for hover
      this.updateHoverState();
      // If hovering over gizmo, consume event
      if (this.hoveredPart !== null) {
        event.stopPropagation();
      }
    }
  }

  /**
   * Handle mouse down - start drag
   */
  private onMouseDown(event: MouseEvent): void {
    if (!this.isVisible || event.button !== 0) return;
    
    // Check if clicking on gizmo
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    if (this.gizmoGroup) {
      const intersects = this.raycaster.intersectObjects(this.gizmoGroup.children, true);
      
      if (intersects.length > 0) {
        // Find which part was clicked
        let clickedPart: GizmoAxis = null;
        for (const intersect of intersects) {
          let obj: THREE.Object3D | null = intersect.object;
          while (obj && obj !== this.gizmoGroup) {
            if (obj.userData.gizmoAxis) {
              clickedPart = obj.userData.gizmoAxis;
              break;
            }
            obj = obj.parent;
          }
          if (clickedPart) break;
        }
        
        if (clickedPart) {
          // Consume event to prevent other handlers from processing
          event.stopPropagation();
          event.preventDefault();
          
          // Start drag
          this.isDragging = true;
          this.dragAxis = clickedPart;
          
          this.dragStartWorldXZ = {
            x: this.gizmoGroup.position.x,
            z: this.gizmoGroup.position.z,
          };
          this.dragPlane.constant = -this.gizmoGroup.position.y;
          const startHit = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(this.dragPlane, startHit)) {
            this.dragStartPlaneHitXZ = { x: startHit.x, z: startHit.z };
          } else {
            this.dragStartPlaneHitXZ = { ...this.dragStartWorldXZ };
          }

          const gridPos = this.gridSystem.worldToGrid(
            new THREE.Vector3(this.dragStartWorldXZ.x, 0, this.dragStartWorldXZ.z)
          );
          this.dragStartGridPosition = { x: gridPos.x, z: gridPos.z };
          this.currentGridPosition = { ...this.dragStartGridPosition };
          
          this.callbacks.onDragStart(clickedPart);
          
          // Dim other axes
          this.updateDragVisuals();
        }
      }
    }
  }

  /**
   * Handle mouse up - end drag
   */
  private onMouseUp(event: MouseEvent): void {
    if (!this.isDragging || event.button !== 0) return;
    
    // Consume event to prevent other handlers from processing
    event.stopPropagation();
    event.preventDefault();
    
    const axis = this.dragAxis;
    this.isDragging = false;
    this.dragAxis = null;
    this.dragStartGridPosition = null;
    this.currentGridPosition = null;
    this.dragStartWorldXZ = null;
    this.dragStartPlaneHitXZ = null;
    
    // Restore normal visuals
    this.updateDragVisuals();
    
    if (axis) {
      this.callbacks.onDragEnd(axis);
    }
  }

  /**
   * Handle drag movement
   * Emits INCREMENTAL deltas (change since last callback, not cumulative from start)
   * Gizmo follows mouse smoothly while objects snap to grid
   */
  private handleDrag(): void {
    if (
      !this.isDragging ||
      !this.dragAxis ||
      !this.gizmoGroup ||
      !this.currentGridPosition ||
      !this.dragStartWorldXZ ||
      !this.dragStartPlaneHitXZ
    ) {
      return;
    }
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    this.dragPlane.constant = -this.gizmoGroup.position.y;
    
    const intersectPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
      const alignment = this.gridSystem.getGridAlignment();
      const baseX = this.dragStartWorldXZ.x;
      const baseZ = this.dragStartWorldXZ.z;
      const deltaX = intersectPoint.x - this.dragStartPlaneHitXZ.x;
      const deltaZ = intersectPoint.z - this.dragStartPlaneHitXZ.z;
      
      let smoothX = baseX + deltaX;
      let smoothZ = baseZ + deltaZ;
      
      if (this.dragAxis === 'x' || this.dragAxis === 'z') {
        if (alignment) {
          const yaw = alignment.yaw;
          const c = Math.cos(yaw);
          const s = Math.sin(yaw);
          // Grid U axis in world: (cos, -sin); V axis: (sin, cos)  [Three.js Y-rotation convention]
          if (this.dragAxis === 'x') {
            const projU = deltaX * c - deltaZ * s;
            smoothX = baseX + projU * c;
            smoothZ = baseZ - projU * s;
          } else {
            const projV = deltaX * s + deltaZ * c;
            smoothX = baseX + projV * s;
            smoothZ = baseZ + projV * c;
          }
        } else {
          if (this.dragAxis === 'x') {
            smoothZ = baseZ;
          } else {
            smoothX = baseX;
          }
        }
      }
      
      this.gizmoGroup.position.x = smoothX;
      this.gizmoGroup.position.z = smoothZ;
      
      const gridPos = this.gridSystem.worldToGrid(
        new THREE.Vector3(smoothX, 0, smoothZ)
      );
      
      let newGridX = gridPos.x;
      let newGridZ = gridPos.z;
      
      if (this.dragAxis === 'x') {
        newGridZ = this.currentGridPosition.z;
      } else if (this.dragAxis === 'z') {
        newGridX = this.currentGridPosition.x;
      }
      
      if (newGridX !== this.currentGridPosition.x || 
          newGridZ !== this.currentGridPosition.z) {
        
        const deltaX = newGridX - this.currentGridPosition.x;
        const deltaZ = newGridZ - this.currentGridPosition.z;
        
        this.currentGridPosition = { x: newGridX, z: newGridZ };
        
        this.callbacks.onDrag(deltaX, deltaZ, this.dragAxis);
      }
    }
  }

  /**
   * Update hover state
   */
  private updateHoverState(): void {
    if (!this.gizmoGroup || this.isDragging) return;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.gizmoGroup.children, true);
    
    let newHovered: 'x' | 'z' | 'center' | null = null;
    
    if (intersects.length > 0) {
      // Find which part is hovered
      for (const intersect of intersects) {
        let obj: THREE.Object3D | null = intersect.object;
        while (obj && obj !== this.gizmoGroup) {
          if (obj.userData.gizmoAxis) {
            newHovered = obj.userData.gizmoAxis;
            break;
          }
          obj = obj.parent;
        }
        if (newHovered) break;
      }
    }
    
    // Update hover visuals if changed
    if (newHovered !== this.hoveredPart) {
      const wasHovered = this.hoveredPart !== null;
      this.hoveredPart = newHovered;
      this.updateHoverVisuals();
      
      // Notify hover change for input priority
      const isNowHovered = this.hoveredPart !== null;
      if (wasHovered !== isNowHovered) {
        this.callbacks.onHoverChange?.(isNowHovered);
      }
    }
  }

  /**
   * Update hover visuals
   */
  private updateHoverVisuals(): void {
    if (!this.xArrow || !this.zArrow || !this.centerHandle) return;
    
    // Reset scales
    this.xArrow.scale.setScalar(this.hoveredPart === 'x' ? this.hoverScale : 1);
    this.zArrow.scale.setScalar(this.hoveredPart === 'z' ? this.hoverScale : 1);
    this.centerHandle.scale.setScalar(this.hoveredPart === 'center' ? this.hoverScale : 1);
    
    // Update materials for hover effect
    this.updateArrowMaterial(this.xArrow, this.xColor, this.hoveredPart === 'x');
    this.updateArrowMaterial(this.zArrow, this.zColor, this.hoveredPart === 'z');
    this.updateArrowMaterial(this.centerHandle, this.centerColor, this.hoveredPart === 'center');
  }

  /**
   * Update drag visuals
   */
  private updateDragVisuals(): void {
    if (!this.xArrow || !this.zArrow || !this.centerHandle) return;
    
    if (this.isDragging) {
      // Dim non-active axes
      const xOpacity = this.dragAxis === 'x' || this.dragAxis === 'xz' ? 1.0 : 0.3;
      const zOpacity = this.dragAxis === 'z' || this.dragAxis === 'xz' ? 1.0 : 0.3;
      const centerOpacity = this.dragAxis === 'xz' ? 1.0 : 0.3;
      
      this.setMeshOpacity(this.xArrow, xOpacity);
      this.setMeshOpacity(this.zArrow, zOpacity);
      this.setMeshOpacity(this.centerHandle, centerOpacity);
    } else {
      // Restore full opacity
      this.setMeshOpacity(this.xArrow, 1.0);
      this.setMeshOpacity(this.zArrow, 1.0);
      this.setMeshOpacity(this.centerHandle, 1.0);
    }
  }

  /**
   * Update arrow material color
   */
  private updateArrowMaterial(mesh: THREE.Mesh, baseColor: THREE.Color, isHovered: boolean): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // Ensure depth settings are maintained
        child.material.depthTest = false;
        child.material.depthWrite = false;
        // Ensure render order is set
        child.renderOrder = 9999;
        
        if (isHovered) {
          child.material.color.copy(this.hoverColor);
          child.material.emissive.copy(baseColor);
          child.material.emissiveIntensity = 0.5;
        } else {
          child.material.color.copy(baseColor);
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      }
    });
  }

  /**
   * Set mesh opacity
   */
  private setMeshOpacity(mesh: THREE.Mesh, opacity: number): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // Ensure depth settings are maintained
        child.material.depthTest = false;
        child.material.depthWrite = false;
        // Ensure render order is set
        child.renderOrder = 9999;
        
        child.material.transparent = opacity < 1.0;
        child.material.opacity = opacity;
        child.material.needsUpdate = true;
      }
    });
  }

  /**
   * Update gizmo (call in render loop if needed)
   */
  update(): void {
    // Could add billboard behavior here if needed
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.hide();
    
    if (this.gizmoGroup) {
      this.scene.remove(this.gizmoGroup);
      
      this.gizmoGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      
      this.gizmoGroup = null;
    }
    
    this.xArrow = null;
    this.zArrow = null;
    this.centerHandle = null;
  }
}

